import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import {
    ensureAlliedSchema,
    getWelcomeConfig,
    updateWelcomeConfig,
    WELCOME_DEFAULTS
} from './alliedDb.js';
import { processMemberJoinInvite } from './alliedInviteLogger.js';

const CARMINE = 0x8b1a1a;

function parseColor(hex, fallback = CARMINE) {
    if (!hex || typeof hex !== 'string') return fallback;
    let h = hex.trim().replace(/^#/, '');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return fallback;
    return parseInt(h, 16);
}

function safe(v, fallback = '—') {
    if (v == null || v === '') return fallback;
    return String(v);
}

/**
 * Substitui variáveis dinâmicas. Nunca deixa undefined/null visível.
 */
export function applyVars(template, ctx) {
    if (!template) return '';
    const map = {
        '{user}': ctx.userMention || '—',
        '{username}': safe(ctx.username),
        '{displayname}': safe(ctx.displayname || ctx.username),
        '{userid}': safe(ctx.userid),
        '{server}': safe(ctx.server),
        '{membercount}': safe(ctx.membercount, '0'),
        '{createdat}': safe(ctx.createdat),
        '{joinedat}': safe(ctx.joinedat),
        '{inviter}': safe(ctx.inviter, 'desconhecido'),
        '{invitecode}': safe(ctx.invitecode, '—'),
        '{inviteurl}': safe(ctx.inviteurl, '—'),
        '{invites}': safe(ctx.invites, '0')
    };
    let out = String(template);
    for (const [k, v] of Object.entries(map)) {
        out = out.split(k).join(v);
    }
    // remove placeholders residuais {algo}
    out = out.replace(/\{[a-z_]+\}/gi, '—');
    return out.slice(0, 4096);
}

function buildContext(member, inviteInfo = {}) {
    const guild = member.guild;
    const user = member.user;
    const inviterId = inviteInfo.inviter_id;
    const code = inviteInfo.invite_code;

    return {
        userMention: `<@${user.id}>`,
        username: user.username,
        displayname: member.displayName || user.username,
        userid: user.id,
        server: guild.name,
        membercount: String(guild.memberCount ?? '—'),
        createdat: `<t:${Math.floor(user.createdTimestamp / 1000)}:D>`,
        joinedat: `<t:${Math.floor((member.joinedTimestamp || Date.now()) / 1000)}:F>`,
        inviter: inviterId ? `<@${inviterId}>` : 'desconhecido',
        invitecode: code || '—',
        inviteurl: code ? `https://discord.gg/${code}` : '—',
        invites: inviteInfo.inviter_joins != null ? String(inviteInfo.inviter_joins) : '0'
    };
}

function buildButtons(buttons) {
    if (!Array.isArray(buttons) || !buttons.length) return [];
    const rows = [];
    let row = new ActionRowBuilder();
    let count = 0;
    for (const b of buttons.slice(0, 25)) {
        if (!b?.label || !b?.url) continue;
        try {
            const url = new URL(b.url);
            if (!['http:', 'https:', 'discord:'].includes(url.protocol)) continue;
        } catch {
            continue;
        }
        if (count > 0 && count % 5 === 0) {
            rows.push(row);
            row = new ActionRowBuilder();
        }
        row.addComponents(
            new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel(String(b.label).slice(0, 80))
                .setURL(b.url)
        );
        count++;
    }
    if (row.components.length) rows.push(row);
    return rows;
}

export function buildWelcomeEmbed(config, member, ctx, { preview = false } = {}) {
    const embed = new EmbedBuilder().setColor(parseColor(config.color));

    const title = applyVars(config.title, ctx).slice(0, 256);
    const description = applyVars(config.description, ctx).slice(0, 4096);
    if (title) embed.setTitle(title);
    if (description) embed.setDescription(description);

    if (config.author_text) {
        embed.setAuthor({
            name: applyVars(config.author_text, ctx).slice(0, 256),
            iconURL: config.author_icon_url || undefined
        });
    }

    if (config.show_avatar !== false && config.thumbnail_mode === 'avatar') {
        embed.setThumbnail(member.user.displayAvatarURL({ size: 256 }));
    } else if (config.thumbnail_url) {
        embed.setThumbnail(config.thumbnail_url);
    }

    if (config.image_url) embed.setImage(config.image_url);

    const fields = Array.isArray(config.fields) ? config.fields : [];
    for (const f of fields.slice(0, 25)) {
        if (!f?.name || !f?.value) continue;
        embed.addFields({
            name: applyVars(f.name, ctx).slice(0, 256),
            value: applyVars(f.value, ctx).slice(0, 1024),
            inline: Boolean(f.inline)
        });
    }

    if (config.show_createdat) {
        embed.addFields({
            name: 'Conta',
            value: ctx.createdat,
            inline: true
        });
    }
    if (config.show_membercount) {
        embed.addFields({
            name: 'Membros',
            value: ctx.membercount,
            inline: true
        });
    }
    if (config.show_invite) {
        embed.addFields({
            name: 'Convite',
            value:
                ctx.invitecode !== '—'
                    ? `\`${ctx.invitecode}\` · ${ctx.inviter}`
                    : ctx.inviter,
            inline: true
        });
    }

    if (config.footer_text) {
        embed.setFooter({
            text: applyVars(config.footer_text, ctx).slice(0, 2048),
            iconURL: config.footer_icon_url || undefined
        });
    }
    if (config.show_timestamp) embed.setTimestamp();

    if (preview) {
        embed.setFooter({
            text: `${config.footer_text ? applyVars(config.footer_text, ctx) + ' · ' : ''}PREVIEW`
        });
    }

    return embed;
}

export function buildDmEmbed(config, member, ctx) {
    const embed = new EmbedBuilder()
        .setColor(parseColor(config.dm_color || config.color))
        .setTitle(applyVars(config.dm_title, ctx).slice(0, 256))
        .setDescription(applyVars(config.dm_description, ctx).slice(0, 4096));

    if (config.dm_thumbnail_url) embed.setThumbnail(config.dm_thumbnail_url);
    else embed.setThumbnail(member.user.displayAvatarURL({ size: 128 }));

    if (config.dm_image_url) embed.setImage(config.dm_image_url);
    if (config.dm_footer_text) {
        embed.setFooter({ text: applyVars(config.dm_footer_text, ctx).slice(0, 2048) });
    }
    embed.setTimestamp();
    return embed;
}

export async function initAlliedWelcomer() {
    await ensureAlliedSchema();
    console.log('✅ Allied Welcomer pronto.');
}

/**
 * Fluxo completo de entrada: invite resolve + DB + welcome + DM.
 * Não duplica com base apenas em memória — recordMemberJoin sempre grava histórico.
 */
export async function handleMemberJoin(member) {
    if (!member?.guild || member.user?.bot) return;

    let inviteInfo = {
        inviter_id: null,
        invite_code: null,
        invite_uses: null,
        attribution: 'unknown',
        inviter_joins: 0
    };

    try {
        const { resolved, joinRow } = await processMemberJoinInvite(member);
        inviteInfo = {
            inviter_id: resolved.inviter_id,
            invite_code: resolved.invite_code,
            invite_uses: resolved.invite_uses,
            attribution: resolved.attribution,
            inviter_joins: 0
        };
        if (resolved.inviter_id && resolved.attribution === 'confirmed') {
            const { getInviterStats } = await import('./alliedInviteLogger.js');
            const st = await getInviterStats(member.guild.id, resolved.inviter_id);
            inviteInfo.inviter_joins = st.joins;
        }
        void joinRow;
    } catch (e) {
        console.error('[AlliedWelcome] invite pipeline:', e.message);
    }

    const config = await getWelcomeConfig(member.guild.id);
    if (!config.enabled) return;

    const ctx = buildContext(member, inviteInfo);
    const embed = buildWelcomeEmbed(config, member, ctx);
    const components = buildButtons(config.buttons);

    if (config.channel_id) {
        try {
            const ch = await member.guild.channels.fetch(config.channel_id).catch(() => null);
            if (ch?.isTextBased()) {
                const content = config.mention_user ? `${member}` : undefined;
                await ch.send({
                    content,
                    embeds: [embed],
                    components,
                    allowedMentions: config.mention_user
                        ? { users: [member.id] }
                        : { parse: [] }
                });
            } else {
                console.warn('[AlliedWelcome] canal inválido:', config.channel_id);
            }
        } catch (e) {
            console.error('[AlliedWelcome] send public:', e.message);
        }
    }

    if (config.dm_enabled) {
        try {
            const dmEmbed = buildDmEmbed(config, member, ctx);
            const dmComponents = buildButtons(config.dm_buttons);
            await member.send({
                embeds: [dmEmbed],
                components: dmComponents
            });
        } catch (e) {
            // DM bloqueada — não é fatal
            console.log(
                `[AlliedWelcome] DM não entregue a ${member.id}: ${e.message}`
            );
        }
    }
}

export async function sendWelcomePreview(interaction, target = 'channel') {
    const config = await getWelcomeConfig(interaction.guildId);
    const member = interaction.member;
    const ctx = buildContext(member, {
        inviter_id: interaction.user.id,
        invite_code: 'preview',
        inviter_joins: 0,
        attribution: 'confirmed'
    });

    if (target === 'dm') {
        try {
            const dmEmbed = buildDmEmbed(config, member, ctx);
            const dmComponents = buildButtons(config.dm_buttons);
            await interaction.user.send({ embeds: [dmEmbed], components: dmComponents });
            return { ok: true, msg: 'Prévia da DM enviada na sua mensagem privada.' };
        } catch (e) {
            return {
                ok: false,
                msg: `Não foi possível enviar a DM: ${e.message}`
            };
        }
    }

    const embed = buildWelcomeEmbed(config, member, ctx, { preview: true });
    const components = buildButtons(config.buttons);
    return {
        ok: true,
        payload: {
            content: config.mention_user ? `${member} *(preview)*` : undefined,
            embeds: [embed],
            components,
            ephemeral: true
        }
    };
}

export {
    getWelcomeConfig,
    updateWelcomeConfig,
    WELCOME_DEFAULTS,
    buildButtons,
    CARMINE
};
