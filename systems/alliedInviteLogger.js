import {
    EmbedBuilder,
    PermissionFlagsBits
} from 'discord.js';
import {
    ensureAlliedSchema,
    getInviteConfig,
    updateInviteConfig,
    recordMemberJoin,
    recordMemberLeave,
    getInviterStats,
    getInviteRanking,
    getGuildInviteTotals,
    getMemberJoinHistory,
    upsertInviteSnapshots,
    deleteInviteSnapshot
} from './alliedDb.js';

/** @type {Map<string, Map<string, {uses:number, inviterId:string|null, maxUses:number|null, temporary:boolean}>>} */
const inviteCache = new Map();
/** @type {Map<string, Promise<void>>} */
const guildLocks = new Map();

const CARMINE = 0x8b1a1a;
const DARK = 0x0d0d0d;

function withGuildLock(guildId, fn) {
    const prev = guildLocks.get(guildId) || Promise.resolve();
    const next = prev.then(fn, fn).finally(() => {
        if (guildLocks.get(guildId) === next) guildLocks.delete(guildId);
    });
    guildLocks.set(guildId, next);
    return next;
}

function snapshotFromCollection(collection) {
    const map = new Map();
    for (const inv of collection.values()) {
        map.set(inv.code, {
            uses: inv.uses ?? 0,
            inviterId: inv.inviter?.id || null,
            maxUses: inv.maxUses ?? null,
            temporary: Boolean(inv.temporary)
        });
    }
    return map;
}

export async function syncGuildInvites(guild) {
    if (!guild?.id) return false;
    try {
        if (!guild.members.me?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
            console.warn(`[AlliedInvites] Sem ManageGuild em ${guild.id} — convites não sincronizados.`);
            return false;
        }
        const invites = await guild.invites.fetch();
        const snap = snapshotFromCollection(invites);
        // Baseline vanity (se existir) para não atribuir no primeiro join após boot
        try {
            const vanity = await guild.fetchVanityData().catch(() => null);
            if (vanity?.code) {
                snap.set('__vanity__', {
                    uses: vanity.uses ?? 0,
                    inviterId: null,
                    maxUses: null,
                    temporary: false
                });
            }
        } catch { /* ignore */ }

        inviteCache.set(guild.id, snap);
        await upsertInviteSnapshots(
            guild.id,
            [...snap.entries()].map(([code, v]) => ({
                code,
                inviterId: v.inviterId,
                uses: v.uses,
                maxUses: v.maxUses,
                temporary: v.temporary
            }))
        );
        return true;
    } catch (err) {
        console.error(`[AlliedInvites] sync falhou (${guild.id}):`, err.message);
        return false;
    }
}

export async function initAlliedInviteLogger(client) {
    await ensureAlliedSchema();
    for (const guild of client.guilds.cache.values()) {
        await syncGuildInvites(guild);
    }
    console.log('✅ Allied InviteLogger pronto.');
}

/**
 * Detecta convite usado comparando cache vs estado atual.
 * Retorna attribution: confirmed | ambiguous | unknown | vanity
 */
export async function resolveInviteUsed(guild) {
    return withGuildLock(guild.id, async () => {
        const before = inviteCache.get(guild.id) || new Map();
        let afterCol;
        try {
            if (!guild.members.me?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
                return {
                    attribution: 'unknown',
                    invite_code: null,
                    inviter_id: null,
                    invite_uses: null,
                    reason: 'missing_manage_guild'
                };
            }
            afterCol = await guild.invites.fetch();
        } catch (err) {
            console.error('[AlliedInvites] fetch invites:', err.message);
            return {
                attribution: 'unknown',
                invite_code: null,
                inviter_id: null,
                invite_uses: null,
                reason: 'fetch_failed'
            };
        }

        const after = snapshotFromCollection(afterCol);
        const increased = [];

        for (const [code, data] of after.entries()) {
            const prev = before.get(code);
            const prevUses = prev ? prev.uses : 0;
            if (data.uses > prevUses) {
                increased.push({
                    code,
                    inviter_id: data.inviterId,
                    invite_uses: data.uses,
                    delta: data.uses - prevUses
                });
            }
        }

        // Convite de uso único consumido (sumiu do cache)
        for (const [code, data] of before.entries()) {
            if (!after.has(code) && (data.maxUses === 1 || data.uses + 1 >= (data.maxUses || Infinity))) {
                // possível one-use consumido
                if (!increased.find((x) => x.code === code)) {
                    increased.push({
                        code,
                        inviter_id: data.inviterId,
                        invite_uses: (data.uses || 0) + 1,
                        delta: 1,
                        consumed: true
                    });
                }
            }
        }

        inviteCache.set(guild.id, after);
        await upsertInviteSnapshots(
            guild.id,
            [...after.entries()].map(([code, v]) => ({
                code,
                inviterId: v.inviterId,
                uses: v.uses,
                maxUses: v.maxUses,
                temporary: v.temporary
            }))
        ).catch(() => {});

        if (increased.length === 1 && increased[0].delta === 1) {
            return {
                attribution: 'confirmed',
                invite_code: increased[0].code,
                inviter_id: increased[0].inviter_id,
                invite_uses: increased[0].invite_uses,
                reason: increased[0].consumed ? 'one_use_consumed' : 'uses_increment'
            };
        }

        if (increased.length > 1) {
            return {
                attribution: 'ambiguous',
                invite_code: null,
                inviter_id: null,
                invite_uses: null,
                reason: 'multiple_increments',
                candidates: increased
            };
        }

        // Vanity: só se o contador de uses da vanity aumentou (não assumir sem evidência)
        try {
            const vanity = await guild.fetchVanityData().catch(() => null);
            if (vanity?.code) {
                const vKey = '__vanity__';
                const prevV = before.get(vKey);
                const prevUses = prevV ? prevV.uses : null;
                const curUses = vanity.uses ?? 0;
                // Atualiza cache vanity
                after.set(vKey, {
                    uses: curUses,
                    inviterId: null,
                    maxUses: null,
                    temporary: false
                });
                inviteCache.set(guild.id, after);

                if (prevUses != null && curUses > prevUses && increased.length === 0) {
                    return {
                        attribution: 'vanity',
                        invite_code: vanity.code,
                        inviter_id: null,
                        invite_uses: curUses,
                        reason: 'vanity_uses_increment'
                    };
                }
                // Primeira sync / sem baseline: não atribuir vanity sem delta
            }
        } catch {
            /* vanity indisponível */
        }

        return {
            attribution: 'unknown',
            invite_code: null,
            inviter_id: null,
            invite_uses: null,
            reason: 'no_delta'
        };
    });
}

export async function handleInviteCreate(invite) {
    const guild = invite.guild;
    if (!guild) return;
    const map = inviteCache.get(guild.id) || new Map();
    map.set(invite.code, {
        uses: invite.uses ?? 0,
        inviterId: invite.inviter?.id || null,
        maxUses: invite.maxUses ?? null,
        temporary: Boolean(invite.temporary)
    });
    inviteCache.set(guild.id, map);
    await upsertInviteSnapshots(guild.id, [
        {
            code: invite.code,
            inviterId: invite.inviter?.id || null,
            uses: invite.uses ?? 0,
            maxUses: invite.maxUses ?? null,
            temporary: Boolean(invite.temporary)
        }
    ]).catch(() => {});

    const cfg = await getInviteConfig(guild.id);
    if (!cfg.enabled || !cfg.log_invite_create || !cfg.invite_create_channel_id) return;
    try {
        const ch = await guild.channels.fetch(cfg.invite_create_channel_id).catch(() => null);
        if (!ch?.isTextBased()) return;
        const embed = new EmbedBuilder()
            .setColor(CARMINE)
            .setTitle('Convite criado')
            .setDescription(
                `Código: \`${invite.code}\`\n` +
                    `Autor: ${invite.inviter ? `${invite.inviter} (\`${invite.inviter.id}\`)` : 'desconhecido'}\n` +
                    `Máx. usos: ${invite.maxUses || '∞'} · Temporário: ${invite.temporary ? 'sim' : 'não'}`
            )
            .setTimestamp();
        await ch.send({ embeds: [embed], allowedMentions: { parse: [] } });
    } catch (e) {
        console.error('[AlliedInvites] log create:', e.message);
    }
}

export async function handleInviteDelete(invite) {
    const guild = invite.guild;
    if (!guild) return;
    const map = inviteCache.get(guild.id);
    if (map) {
        map.delete(invite.code);
        inviteCache.set(guild.id, map);
    }
    await deleteInviteSnapshot(guild.id, invite.code).catch(() => {});

    const cfg = await getInviteConfig(guild.id);
    if (!cfg.enabled || !cfg.log_invite_delete || !cfg.invite_delete_channel_id) return;
    try {
        const ch = await guild.channels.fetch(cfg.invite_delete_channel_id).catch(() => null);
        if (!ch?.isTextBased()) return;
        const embed = new EmbedBuilder()
            .setColor(DARK)
            .setTitle('Convite removido')
            .setDescription(`Código: \`${invite.code || '—'}\``)
            .setTimestamp();
        await ch.send({ embeds: [embed], allowedMentions: { parse: [] } });
    } catch (e) {
        console.error('[AlliedInvites] log delete:', e.message);
    }
}

export async function processMemberJoinInvite(member) {
    const guild = member.guild;
    const cfg = await getInviteConfig(guild.id);
    const resolved = await resolveInviteUsed(guild);

    const joinRow = await recordMemberJoin({
        guild_id: guild.id,
        user_id: member.id,
        joined_at: member.joinedAt || new Date(),
        inviter_id: resolved.inviter_id,
        invite_code: resolved.invite_code,
        invite_uses: resolved.invite_uses,
        attribution: resolved.attribution,
        account_created_at: member.user.createdAt
    });

    if (cfg.enabled && cfg.log_joins && cfg.join_channel_id) {
        try {
            const ch = await guild.channels.fetch(cfg.join_channel_id).catch(() => null);
            if (ch?.isTextBased()) {
                let inviterLine = '—';
                if (resolved.attribution === 'confirmed' && resolved.inviter_id) {
                    const stats = await getInviterStats(guild.id, resolved.inviter_id);
                    inviterLine = `<@${resolved.inviter_id}> · **${stats.joins}** entradas atribuídas`;
                } else if (resolved.attribution === 'vanity') {
                    inviterLine = `Vanity \`discord.gg/${resolved.invite_code}\``;
                } else if (resolved.attribution === 'ambiguous') {
                    inviterLine = 'Ambíguo (vários convites alteraram ao mesmo tempo)';
                } else {
                    inviterLine = 'Desconhecida';
                }

                const embed = new EmbedBuilder()
                    .setColor(CARMINE)
                    .setAuthor({
                        name: member.user.tag,
                        iconURL: member.user.displayAvatarURL({ size: 64 })
                    })
                    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
                    .setTitle('Entrada registrada')
                    .addFields(
                        { name: 'Membro', value: `${member} (\`${member.id}\`)`, inline: true },
                        {
                            name: 'Conta criada',
                            value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:D>`,
                            inline: true
                        },
                        {
                            name: 'Entrada',
                            value: `<t:${Math.floor((member.joinedTimestamp || Date.now()) / 1000)}:F>`,
                            inline: true
                        },
                        {
                            name: 'Convite',
                            value: resolved.invite_code ? `\`${resolved.invite_code}\`` : '—',
                            inline: true
                        },
                        {
                            name: 'Usos',
                            value:
                                resolved.invite_uses != null ? String(resolved.invite_uses) : '—',
                            inline: true
                        },
                        {
                            name: 'Atribuição',
                            value: `\`${resolved.attribution}\``,
                            inline: true
                        },
                        { name: 'Origem', value: inviterLine }
                    )
                    .setFooter({ text: `Registro #${joinRow.id} · Allied InviteLogger` })
                    .setTimestamp();

                await ch.send({ embeds: [embed], allowedMentions: { parse: [] } });
            }
        } catch (e) {
            console.error('[AlliedInvites] join log:', e.message);
        }
    }

    return { resolved, joinRow };
}

export async function processMemberLeaveInvite(member) {
    const guild = member.guild;
    const cfg = await getInviteConfig(guild.id);
    const prev = await recordMemberLeave(guild.id, member.id);

    if (cfg.enabled && cfg.log_leaves && cfg.leave_channel_id) {
        try {
            const ch = await guild.channels.fetch(cfg.leave_channel_id).catch(() => null);
            if (ch?.isTextBased()) {
                let stay = '—';
                if (prev?.joined_at) {
                    const ms = Date.now() - new Date(prev.joined_at).getTime();
                    const mins = Math.floor(ms / 60000);
                    if (mins < 60) stay = `${mins} min`;
                    else if (mins < 1440) stay = `${Math.floor(mins / 60)} h`;
                    else stay = `${Math.floor(mins / 1440)} d`;
                }

                const embed = new EmbedBuilder()
                    .setColor(DARK)
                    .setAuthor({
                        name: member.user?.tag || member.id,
                        iconURL: member.user?.displayAvatarURL?.({ size: 64 })
                    })
                    .setTitle('Saída registrada')
                    .addFields(
                        {
                            name: 'Membro',
                            value: `${member.user?.tag || '—'} (\`${member.id}\`)`,
                            inline: true
                        },
                        {
                            name: 'Permanência',
                            value: stay,
                            inline: true
                        },
                        {
                            name: 'Convite na entrada',
                            value: prev?.invite_code ? `\`${prev.invite_code}\`` : '—',
                            inline: true
                        },
                        {
                            name: 'Convidado por',
                            value: prev?.inviter_id ? `<@${prev.inviter_id}>` : '—',
                            inline: true
                        },
                        {
                            name: 'Atribuição',
                            value: prev ? `\`${prev.attribution}\`` : 'sem registro prévio',
                            inline: true
                        }
                    )
                    .setFooter({
                        text: 'Motivo (kick/ban/saída) não é inferido automaticamente · Allied'
                    })
                    .setTimestamp();

                await ch.send({ embeds: [embed], allowedMentions: { parse: [] } });
            }
        } catch (e) {
            console.error('[AlliedInvites] leave log:', e.message);
        }
    }

    return prev;
}

export {
    getInviteConfig,
    updateInviteConfig,
    getInviterStats,
    getInviteRanking,
    getGuildInviteTotals,
    getMemberJoinHistory,
    syncGuildInvites as syncInvites,
    CARMINE
};
