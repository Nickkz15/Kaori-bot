import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');
const dbPath = path.join(dataDir, 'allied.json');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function defaultDb() {
    return {
        welcome_config: {},
        invite_config: {},
        invite_stats: {},
        member_joins: [],
        invite_snapshots: {},
        join_seq: 1
    };
}

function load() {
    if (!fs.existsSync(dbPath)) {
        const initial = defaultDb();
        fs.writeFileSync(dbPath, JSON.stringify(initial, null, 2));
        return initial;
    }
    try {
        const raw = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        return { ...defaultDb(), ...raw };
    } catch {
        return defaultDb();
    }
}

function save(data) {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

let db = load();

export const WELCOME_DEFAULTS = {
    enabled: false,
    channel_id: null,
    title: 'BEM-VINDO À ALLIED',
    description:
        'Sua entrada é apenas o começo.\n\n{user}, a **Allied** é construída pelas pessoas que escolhem estar presentes.\n\nMembros: **{membercount}**',
    color: '#8B1A1A',
    thumbnail_mode: 'avatar',
    thumbnail_url: null,
    image_url: null,
    author_text: 'Allied',
    author_icon_url: null,
    footer_text: 'Allied · Organização',
    footer_icon_url: null,
    show_timestamp: true,
    mention_user: true,
    show_avatar: true,
    show_membercount: true,
    show_createdat: true,
    show_invite: true,
    fields: [],
    buttons: [],
    dm_enabled: false,
    dm_title: 'BEM-VINDO À ALLIED',
    dm_description:
        'Sua entrada é apenas o começo.\n\nConheça a comunidade, explore os canais e encontre seu espaço. A Allied é construída pelas pessoas que escolhem estar presentes, contribuir e fazer parte da história.\n\nComece pelas informações importantes e não tenha receio de puxar conversa.\n\n**Agora, sua história com a Allied começa.**',
    dm_color: '#8B1A1A',
    dm_thumbnail_url: null,
    dm_image_url: null,
    dm_footer_text: 'Allied',
    dm_buttons: []
};

export const INVITE_DEFAULTS = {
    enabled: false,
    log_joins: true,
    log_leaves: true,
    log_invite_create: false,
    log_invite_delete: false,
    join_channel_id: null,
    leave_channel_id: null,
    invite_create_channel_id: null,
    invite_delete_channel_id: null,
    alert_channel_id: null
};

/** No-op for principal Kaori (JSON). Kept so init calls stay the same. */
export async function ensureAlliedSchema() {
    db = load();
    if (!db.welcome_config) db.welcome_config = {};
    if (!db.invite_config) db.invite_config = {};
    if (!db.invite_stats) db.invite_stats = {};
    if (!Array.isArray(db.member_joins)) db.member_joins = [];
    if (!db.invite_snapshots) db.invite_snapshots = {};
    if (!db.join_seq) db.join_seq = 1;
    save(db);
}

export async function getWelcomeConfig(guildId) {
    db = load();
    if (!db.welcome_config[guildId]) {
        db.welcome_config[guildId] = { ...WELCOME_DEFAULTS };
        save(db);
    }
    return { guild_id: guildId, ...WELCOME_DEFAULTS, ...db.welcome_config[guildId] };
}

export async function updateWelcomeConfig(guildId, patch) {
    const cur = await getWelcomeConfig(guildId);
    const next = { ...cur, ...patch };
    delete next.guild_id;
    db.welcome_config[guildId] = next;
    save(db);
    return getWelcomeConfig(guildId);
}

export async function getInviteConfig(guildId) {
    db = load();
    if (!db.invite_config[guildId]) {
        db.invite_config[guildId] = { ...INVITE_DEFAULTS };
        save(db);
    }
    return { guild_id: guildId, ...INVITE_DEFAULTS, ...db.invite_config[guildId] };
}

export async function updateInviteConfig(guildId, patch) {
    const cur = await getInviteConfig(guildId);
    const next = { ...cur, ...patch };
    delete next.guild_id;
    db.invite_config[guildId] = next;
    save(db);
    return getInviteConfig(guildId);
}

/**
 * Idempotente: se já existe join aberto (left_at null) para o mesmo user no guild
 * nos últimos 2 minutos, reutiliza o registro e NÃO incrementa stats de novo.
 */
export async function recordMemberJoin(data) {
    db = load();
    const now = Date.now();
    const existing = db.member_joins.find(
        (j) =>
            j.guild_id === data.guild_id &&
            j.user_id === data.user_id &&
            !j.left_at &&
            now - new Date(j.joined_at).getTime() < 2 * 60 * 1000
    );
    if (existing) {
        return existing;
    }

    const row = {
        id: db.join_seq++,
        guild_id: data.guild_id,
        user_id: data.user_id,
        joined_at: (data.joined_at || new Date()).toISOString?.() || new Date().toISOString(),
        left_at: null,
        inviter_id: data.inviter_id || null,
        invite_code: data.invite_code || null,
        invite_uses: data.invite_uses ?? null,
        attribution: data.attribution || 'unknown',
        account_created_at: data.account_created_at
            ? new Date(data.account_created_at).toISOString()
            : null
    };
    db.member_joins.push(row);

    if (data.inviter_id && data.attribution === 'confirmed') {
        const key = `${data.guild_id}:${data.inviter_id}`;
        if (!db.invite_stats[key]) {
            db.invite_stats[key] = {
                guild_id: data.guild_id,
                inviter_id: data.inviter_id,
                joins: 0,
                leaves: 0
            };
        }
        db.invite_stats[key].joins += 1;
    }

    save(db);
    return row;
}

export async function recordMemberLeave(guildId, userId) {
    db = load();
    const open = [...db.member_joins]
        .reverse()
        .find((j) => j.guild_id === guildId && j.user_id === userId && !j.left_at);
    if (!open) return null;

    open.left_at = new Date().toISOString();
    if (open.inviter_id && open.attribution === 'confirmed') {
        const key = `${guildId}:${open.inviter_id}`;
        if (!db.invite_stats[key]) {
            db.invite_stats[key] = {
                guild_id: guildId,
                inviter_id: open.inviter_id,
                joins: 0,
                leaves: 0
            };
        }
        db.invite_stats[key].leaves += 1;
    }
    save(db);
    return open;
}

export async function getInviterStats(guildId, inviterId) {
    db = load();
    const key = `${guildId}:${inviterId}`;
    return (
        db.invite_stats[key] || {
            guild_id: guildId,
            inviter_id: inviterId,
            joins: 0,
            leaves: 0
        }
    );
}

export async function getInviteRanking(guildId, limit = 10) {
    db = load();
    return Object.values(db.invite_stats)
        .filter((s) => s.guild_id === guildId && s.joins > 0)
        .sort((a, b) => b.joins - a.joins || a.leaves - b.leaves)
        .slice(0, limit);
}

export async function getGuildInviteTotals(guildId) {
    db = load();
    const joins = db.member_joins.filter((j) => j.guild_id === guildId);
    return {
        total_joins: joins.length,
        total_leaves: joins.filter((j) => j.left_at).length,
        unknown_or_ambiguous: joins.filter((j) =>
            ['unknown', 'ambiguous'].includes(j.attribution)
        ).length
    };
}

export async function getMemberJoinHistory(guildId, userId, limit = 10) {
    db = load();
    return db.member_joins
        .filter((j) => j.guild_id === guildId && j.user_id === userId)
        .sort((a, b) => new Date(b.joined_at) - new Date(a.joined_at))
        .slice(0, limit);
}

export async function upsertInviteSnapshots(guildId, invites) {
    db = load();
    if (!db.invite_snapshots[guildId]) db.invite_snapshots[guildId] = {};
    for (const inv of invites) {
        db.invite_snapshots[guildId][inv.code] = {
            code: inv.code,
            inviter_id: inv.inviterId || null,
            uses: inv.uses ?? 0,
            max_uses: inv.maxUses ?? null,
            temporary: Boolean(inv.temporary),
            updated_at: new Date().toISOString()
        };
    }
    save(db);
}

export async function deleteInviteSnapshot(guildId, code) {
    db = load();
    if (db.invite_snapshots[guildId]) {
        delete db.invite_snapshots[guildId][code];
        save(db);
    }
}
