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
import { buildWelcomeAttachment } from './alliedWelcomeCard.js';

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

export function applyVars(template, ctx) {
    if (!template) return '';
    const map = {
        '{user}': ctx.userMention || '—',
        '{username}': safe(ctx.username),
        '{displayname}': safe(ctx.displayname || ctx.username),
        '{userid}': safe(ctx.userid),
        '{server}': safe(ctx.server),
        '{membercount}': safe(ctx.membercount, '0'),
        '{memberCount}': safe(ctx.membercount, '0'),
        '{createdat}': safe(ctx.createdat),
        '{joinedat}': safe(ctx.joinedat),
        '{inviter}': safe(ctx.inviter, 'desconhecido'),
        '{invitecode}': safe(ctx.invitecode, '—'),
        '{inviteurl}': safe(ctx.inviteurl, '—'),
        '{invites}': safe(ctx.invites, '0'),
        '{rulesChannel}': ctx.rulesChannel || '—',
        '{introductionsChannel}': ctx.introChannel || '—',
        '{introChannel}': ctx.introChannel || '—'
    };
    let out = String(template);
    for (const [k, v] of Object.entries(map)) {
        out = out.split(k).join(v);
    }
    out = out.replace(/\{[a-zA-Z_]+\}/g, '—');
    return out.slice(0, 2000);
}

function buildContext(member, inviteInfo = {}, config = {}) {
    const guild = member.guild;
    const user = member.user;
    return {
        userMention: `<@${user.id}>`,
        username: user.username,
        displayname: member.displayName || user.username,
        userid: user.id,
        server: guild.name,
        membercount: String(guild.memberCount ?? '—'),
        createdat: `<t:${Math.floor(user.createdTimestamp / 1000)}:D>`,
        joinedat: `<t:${Math.floor((member.joinedTimestamp || Date.now()) / 1000)}:F>`,
        inviter: inviteInfo.inviter_id ? `<@${inviteInfo.inviter_id}>` : 'desconhecido',
        invitecode: inviteInfo.invite_code || '—',
        inviteurl: inviteInfo.invite_code
            ? `https://discord.gg/${inviteInfo.invite_code}`
            : '—',
        invites:
            inviteInfo.inviter_joins != null ? String(inviteInfo.inviter_joins) : '0',
        rulesChannel: config.rules_channel_id
            ? `<#${config.rules_channel_id}>`
            : '—',
        introChannel: config.intro_channel_id
            ? `<#${config.intro_channel_id}>`
            : '—'
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
            if (!['http:', 'https:'].includes(url.protocol)) continue;
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

/** CTAs a partir de canais configurados + cta_buttons */
function buildCtaComponents(config) {
    const buttons = [];
    if (config.rules_channel_id) {
        // Link buttons need full URL — use discord channel link if we have guild id in runtime
    }
    const custom = Array.isArray(config.cta_buttons) ? config.cta_buttons : [];
    const merged = [...custom];
    // Prefer explicit link buttons from config.buttons (legacy) + cta
    return buildButtons([...(config.buttons || []), ...merged]);
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

    if (config.show_createdat) {
        embed.addFields({ name: 'Conta', value: ctx.createdat, inline: true });
    }
    if (config.show_membercount) {
        embed.addFields({ name: 'Membros', value: ctx.membercount, inline: true });
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

    const tips = [];
    if (ctx.rulesChannel && ctx.rulesChannel !== '—') {
        tips.push(`Regras: ${ctx.rulesChannel}`);
    }
    if (ctx.introChannel && ctx.introChannel !== '—') {
        tips.push(`Apresentação: ${ctx.introChannel}`);
    }
    if (tips.length) {
        embed.addFields({ name: 'Por onde começar', value: tips.join('\n') });
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
            text: `${config.footer_text ? applyVars(config.footer_text, ctx) + ' · ' : ''}PREVIEW · não salvo`
        });
    }
    return embed;
}

export async function initAlliedWelcomer() {
    await ensureAlliedSchema();
    console.log('✅ Allied Welcomer 2.0 pronto.');
}

/**
 * Gera cartão + mensagem. Fallback embed se canvas falhar.
 */
export async function buildWelcomePayload(member, config, inviteInfo = {}, { preview = false } = {}) {
    const ctx = buildContext(member, inviteInfo, config);
    const contentRaw =
        config.message_content ||
        (config.mention_user ? '{user}' : '');
    const content = applyVars(contentRaw, ctx) || undefined;

    const components = buildCtaComponents(config);
    let files = [];
    let embeds = [];

    if (config.use_generated_card !== false) {
        try {
            const attachment = await buildWelcomeAttachment({
                config,
                displayName: member.displayName || member.user.username,
                username: member.user.username,
                avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 256 }),
                memberCount: member.guild.memberCount,
                serverName: member.guild.name
            });
            files = [attachment];
            // Embed leve abaixo do cartão
            const light = new EmbedBuilder()
                .setColor(parseColor(config.color))
                .setDescription(
                    applyVars(
                        config.description ||
                            'É bom ter você aqui. Explore os canais e encontre seu espaço.',
                        ctx
                    ).slice(0, 1000)
                );
            if (preview) light.setFooter({ text: 'PREVIEW · Allied Welcomer 2.0' });
            else if (config.footer_text) {
                light.setFooter({ text: applyVars(config.footer_text, ctx).slice(0, 200) });
            }
            embeds = [light];
        } catch (e) {
            console.error('[AlliedWelcome] card render failed:', e.message);
            embeds = [buildWelcomeEmbed(config, member, ctx, { preview })];
        }
    } else {
        embeds = [buildWelcomeEmbed(config, member, ctx, { preview })];
    }

    return {
        content: content || undefined,
        embeds,
        files,
        components,
        allowedMentions: config.mention_user
            ? { users: [member.id] }
            : { parse: [] }
    };
}

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
        const { resolved } = await processMemberJoinInvite(member);
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
    } catch (e) {
        console.error('[AlliedWelcome] invite pipeline:', e.message);
    }

    const config = await getWelcomeConfig(member.guild.id);
    if (!config.enabled) return;

    if (config.channel_id) {
        try {
            const ch = await member.guild.channels.fetch(config.channel_id).catch(() => null);
            if (ch?.isTextBased()) {
                const payload = await buildWelcomePayload(member, config, inviteInfo);
                await ch.send(payload);
            }
        } catch (e) {
            console.error('[AlliedWelcome] send public:', e.message);
        }
    }

    if (config.dm_enabled) {
        try {
            const ctx = buildContext(member, inviteInfo, config);
            const dmEmbed = new EmbedBuilder()
                .setColor(parseColor(config.dm_color || config.color))
                .setTitle(applyVars(config.dm_title, ctx).slice(0, 256))
                .setDescription(applyVars(config.dm_description, ctx).slice(0, 4096))
                .setTimestamp();
            if (config.dm_footer_text) {
                dmEmbed.setFooter({ text: applyVars(config.dm_footer_text, ctx) });
            }
            await member.send({
                embeds: [dmEmbed],
                components: buildButtons(config.dm_buttons)
            });
        } catch (e) {
            console.log(`[AlliedWelcome] DM não entregue a ${member.id}: ${e.message}`);
        }
    }
}

export async function sendWelcomePreview(interaction, target = 'channel') {
    const config = await getWelcomeConfig(interaction.guildId);
    const member = interaction.member;
    const inviteInfo = {
        inviter_id: interaction.user.id,
        invite_code: 'preview',
        inviter_joins: 0,
        attribution: 'confirmed'
    };

    if (target === 'dm') {
        try {
            const ctx = buildContext(member, inviteInfo, config);
            const dmEmbed = new EmbedBuilder()
                .setColor(parseColor(config.dm_color || config.color))
                .setTitle(applyVars(config.dm_title, ctx).slice(0, 256))
                .setDescription(applyVars(config.dm_description, ctx).slice(0, 4096));
            await interaction.user.send({ embeds: [dmEmbed] });
            return { ok: true, msg: 'Prévia da DM enviada.' };
        } catch (e) {
            return { ok: false, msg: `DM falhou: ${e.message}` };
        }
    }

    const payload = await buildWelcomePayload(member, config, inviteInfo, {
        preview: true
    });
    return {
        ok: true,
        payload: {
            ...payload,
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
