import { pool } from '../database/database.js';

export async function ensureAlliedSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS allied_welcome_config (
            guild_id TEXT PRIMARY KEY,
            enabled BOOLEAN NOT NULL DEFAULT FALSE,
            channel_id TEXT,
            title TEXT NOT NULL DEFAULT 'BEM-VINDO À ALLIED',
            description TEXT NOT NULL DEFAULT 'Sua entrada é apenas o começo.\\n\\n{user}, a **Allied** é construída pelas pessoas que escolhem estar presentes.\\n\\nMembros: **{membercount}**',
            color TEXT NOT NULL DEFAULT '#8B1A1A',
            thumbnail_mode TEXT NOT NULL DEFAULT 'avatar',
            thumbnail_url TEXT,
            image_url TEXT,
            author_text TEXT NOT NULL DEFAULT 'Allied',
            author_icon_url TEXT,
            footer_text TEXT NOT NULL DEFAULT 'Allied · Organização',
            footer_icon_url TEXT,
            show_timestamp BOOLEAN NOT NULL DEFAULT TRUE,
            mention_user BOOLEAN NOT NULL DEFAULT TRUE,
            show_avatar BOOLEAN NOT NULL DEFAULT TRUE,
            show_membercount BOOLEAN NOT NULL DEFAULT TRUE,
            show_createdat BOOLEAN NOT NULL DEFAULT TRUE,
            show_invite BOOLEAN NOT NULL DEFAULT TRUE,
            fields JSONB NOT NULL DEFAULT '[]'::jsonb,
            buttons JSONB NOT NULL DEFAULT '[]'::jsonb,
            dm_enabled BOOLEAN NOT NULL DEFAULT FALSE,
            dm_title TEXT NOT NULL DEFAULT 'BEM-VINDO À ALLIED',
            dm_description TEXT NOT NULL DEFAULT 'Sua entrada é apenas o começo.\\n\\nConheça a comunidade, explore os canais e encontre seu espaço. A Allied é construída pelas pessoas que escolhem estar presentes, contribuir e fazer parte da história.\\n\\nComece pelas informações importantes e não tenha receio de puxar conversa.\\n\\n**Agora, sua história com a Allied começa.**',
            dm_color TEXT NOT NULL DEFAULT '#8B1A1A',
            dm_thumbnail_url TEXT,
            dm_image_url TEXT,
            dm_footer_text TEXT NOT NULL DEFAULT 'Allied',
            dm_buttons JSONB NOT NULL DEFAULT '[]'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS allied_invite_config (
            guild_id TEXT PRIMARY KEY,
            enabled BOOLEAN NOT NULL DEFAULT FALSE,
            log_joins BOOLEAN NOT NULL DEFAULT TRUE,
            log_leaves BOOLEAN NOT NULL DEFAULT TRUE,
            log_invite_create BOOLEAN NOT NULL DEFAULT FALSE,
            log_invite_delete BOOLEAN NOT NULL DEFAULT FALSE,
            join_channel_id TEXT,
            leave_channel_id TEXT,
            invite_create_channel_id TEXT,
            invite_delete_channel_id TEXT,
            alert_channel_id TEXT,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS allied_invite_stats (
            guild_id TEXT NOT NULL,
            inviter_id TEXT NOT NULL,
            joins INTEGER NOT NULL DEFAULT 0,
            leaves INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (guild_id, inviter_id)
        );

        CREATE TABLE IF NOT EXISTS allied_member_joins (
            id BIGSERIAL PRIMARY KEY,
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            left_at TIMESTAMPTZ,
            inviter_id TEXT,
            invite_code TEXT,
            invite_uses INTEGER,
            attribution TEXT NOT NULL DEFAULT 'unknown',
            account_created_at TIMESTAMPTZ,
            UNIQUE (guild_id, user_id, joined_at)
        );

        CREATE INDEX IF NOT EXISTS idx_allied_joins_guild ON allied_member_joins (guild_id, joined_at DESC);
        CREATE INDEX IF NOT EXISTS idx_allied_joins_user ON allied_member_joins (guild_id, user_id);
        CREATE INDEX IF NOT EXISTS idx_allied_joins_inviter ON allied_member_joins (guild_id, inviter_id);
        CREATE INDEX IF NOT EXISTS idx_allied_stats_joins ON allied_invite_stats (guild_id, joins DESC);

        CREATE TABLE IF NOT EXISTS allied_invite_snapshots (
            guild_id TEXT NOT NULL,
            code TEXT NOT NULL,
            inviter_id TEXT,
            uses INTEGER NOT NULL DEFAULT 0,
            max_uses INTEGER,
            temporary BOOLEAN NOT NULL DEFAULT FALSE,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (guild_id, code)
        );

        -- Welcomer 2.0 columns (idempotente)
        ALTER TABLE allied_welcome_config ADD COLUMN IF NOT EXISTS visual_model TEXT NOT NULL DEFAULT 'cinematic';
        ALTER TABLE allied_welcome_config ADD COLUMN IF NOT EXISTS art_enabled BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE allied_welcome_config ADD COLUMN IF NOT EXISTS art_fit TEXT NOT NULL DEFAULT 'cover';
        ALTER TABLE allied_welcome_config ADD COLUMN IF NOT EXISTS art_mime TEXT;
        ALTER TABLE allied_welcome_config ADD COLUMN IF NOT EXISTS art_data BYTEA;
        ALTER TABLE allied_welcome_config ADD COLUMN IF NOT EXISTS art_url TEXT;
        ALTER TABLE allied_welcome_config ADD COLUMN IF NOT EXISTS overlay_opacity REAL NOT NULL DEFAULT 0.45;
        ALTER TABLE allied_welcome_config ADD COLUMN IF NOT EXISTS show_avatar BOOLEAN NOT NULL DEFAULT TRUE;
        ALTER TABLE allied_welcome_config ADD COLUMN IF NOT EXISTS show_name BOOLEAN NOT NULL DEFAULT TRUE;
        ALTER TABLE allied_welcome_config ADD COLUMN IF NOT EXISTS show_brand BOOLEAN NOT NULL DEFAULT TRUE;
        ALTER TABLE allied_welcome_config ADD COLUMN IF NOT EXISTS show_membercount BOOLEAN NOT NULL DEFAULT TRUE;
        ALTER TABLE allied_welcome_config ADD COLUMN IF NOT EXISTS avatar_size INTEGER NOT NULL DEFAULT 140;
        ALTER TABLE allied_welcome_config ADD COLUMN IF NOT EXISTS brand_text TEXT NOT NULL DEFAULT 'ALLIED';
        ALTER TABLE allied_welcome_config ADD COLUMN IF NOT EXISTS card_title TEXT NOT NULL DEFAULT 'Bem-vindo(a)';
        ALTER TABLE allied_welcome_config ADD COLUMN IF NOT EXISTS card_subtitle TEXT NOT NULL DEFAULT 'Sua história na Allied começa agora.';
        ALTER TABLE allied_welcome_config ADD COLUMN IF NOT EXISTS text_primary TEXT NOT NULL DEFAULT '#F5F5F5';
        ALTER TABLE allied_welcome_config ADD COLUMN IF NOT EXISTS text_secondary TEXT NOT NULL DEFAULT '#C8C8C8';
        ALTER TABLE allied_welcome_config ADD COLUMN IF NOT EXISTS accent_color TEXT NOT NULL DEFAULT '#8B1A1A';
        ALTER TABLE allied_welcome_config ADD COLUMN IF NOT EXISTS message_content TEXT NOT NULL DEFAULT '{user} · seja bem-vindo(a) à **{server}**.';
        ALTER TABLE allied_welcome_config ADD COLUMN IF NOT EXISTS rules_channel_id TEXT;
        ALTER TABLE allied_welcome_config ADD COLUMN IF NOT EXISTS intro_channel_id TEXT;
        ALTER TABLE allied_welcome_config ADD COLUMN IF NOT EXISTS leave_channel_id TEXT;
        ALTER TABLE allied_welcome_config ADD COLUMN IF NOT EXISTS leave_enabled BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE allied_welcome_config ADD COLUMN IF NOT EXISTS use_generated_card BOOLEAN NOT NULL DEFAULT TRUE;
        ALTER TABLE allied_welcome_config ADD COLUMN IF NOT EXISTS cta_buttons JSONB NOT NULL DEFAULT '[]'::jsonb;
    `);
}

const WELCOME_DEFAULTS = {
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
        'Sua entrada é apenas o começo.\n\nConheça a comunidade, explore os canais e encontre seu espaço.\n\n**Agora, sua história com a Allied começa.**',
    dm_color: '#8B1A1A',
    dm_thumbnail_url: null,
    dm_image_url: null,
    dm_footer_text: 'Allied',
    dm_buttons: [],
    visual_model: 'cinematic',
    art_enabled: false,
    art_fit: 'cover',
    art_mime: null,
    art_url: null,
    overlay_opacity: 0.45,
    show_name: true,
    show_brand: true,
    avatar_size: 140,
    brand_text: 'ALLIED',
    card_title: 'Bem-vindo(a)',
    card_subtitle: 'Sua história na Allied começa agora.',
    text_primary: '#F5F5F5',
    text_secondary: '#C8C8C8',
    accent_color: '#8B1A1A',
    message_content: '{user} · seja bem-vindo(a) à **{server}**.',
    rules_channel_id: null,
    intro_channel_id: null,
    leave_channel_id: null,
    leave_enabled: false,
    use_generated_card: true,
    cta_buttons: []
};

const INVITE_DEFAULTS = {
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

function mapJson(row, key, fallback) {
    if (!row || row[key] == null) return fallback;
    return row[key];
}

export function normalizeButtons(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    for (const b of list) {
        if (!b || typeof b !== 'object') continue;
        const label = String(b.label || '').trim().slice(0, 80);
        const url = String(b.url || '').trim();
        if (!label || !/^https?:\/\//i.test(url)) continue;
        const key = label + '|' + url;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ label, url });
        if (out.length >= 5) break;
    }
    return out;
}

export async function getWelcomeConfig(guildId) {
    const res = await pool.query('SELECT * FROM allied_welcome_config WHERE guild_id = $1', [guildId]);
    if (!res.rows[0]) {
        await pool.query(
            'INSERT INTO allied_welcome_config (guild_id) VALUES ($1) ON CONFLICT DO NOTHING',
            [guildId]
        );
        return { guild_id: guildId, ...WELCOME_DEFAULTS };
    }
    const r = res.rows[0];
    const art_buffer = r.art_data ? Buffer.from(r.art_data) : null;
    return {
        ...WELCOME_DEFAULTS,
        ...r,
        fields: mapJson(r, 'fields', []),
        buttons: normalizeButtons(mapJson(r, 'buttons', [])),
        dm_buttons: normalizeButtons(mapJson(r, 'dm_buttons', [])),
        cta_buttons: normalizeButtons(mapJson(r, 'cta_buttons', [])),
        art_buffer,
        has_art: Boolean(art_buffer || r.art_url)
    };
}

export async function updateWelcomeConfig(guildId, patch) {
    await getWelcomeConfig(guildId);
    const allowed = new Set([
        ...Object.keys(WELCOME_DEFAULTS),
        'art_data',
        'clear_art'
    ]);
    const sets = [];
    const values = [guildId];
    let i = 2;
    for (const key of Object.keys(patch)) {
        if (!allowed.has(key)) continue;
        if (key === 'clear_art' && patch.clear_art) {
            sets.push('art_data = NULL');
            sets.push('art_mime = NULL');
            sets.push('art_url = NULL');
            sets.push('art_enabled = FALSE');
            continue;
        }
        if (key === 'clear_art') continue;
        if (key === 'art_buffer') continue;
        if (key === 'has_art') continue;
        if (key === 'guild_id') continue;
        sets.push(`${key} = $${i}`);
        const v = patch[key];
        if (key === 'fields' || key === 'buttons' || key === 'dm_buttons' || key === 'cta_buttons') {
            values.push(
                JSON.stringify(
                    key === 'fields' ? (v ?? []) : normalizeButtons(v)
                )
            );
        } else if (key === 'art_data') {
            values.push(v);
        } else {
            values.push(v);
        }
        i++;
    }
    if (!sets.length) return getWelcomeConfig(guildId);
    sets.push('updated_at = NOW()');
    await pool.query(
        `UPDATE allied_welcome_config SET ${sets.join(', ')} WHERE guild_id = $1`,
        values
    );
    return getWelcomeConfig(guildId);
}

export async function setWelcomeArt(guildId, buffer, mime) {
    await getWelcomeConfig(guildId);
    await pool.query(
        `UPDATE allied_welcome_config
         SET art_data = $2, art_mime = $3, art_enabled = TRUE, art_url = NULL, updated_at = NOW()
         WHERE guild_id = $1`,
        [guildId, buffer, mime || 'image/png']
    );
    return getWelcomeConfig(guildId);
}

export async function clearWelcomeArt(guildId) {
    return updateWelcomeConfig(guildId, { clear_art: true });
}

export async function getInviteConfig(guildId) {
    const res = await pool.query('SELECT * FROM allied_invite_config WHERE guild_id = $1', [guildId]);
    if (!res.rows[0]) {
        await pool.query(
            'INSERT INTO allied_invite_config (guild_id) VALUES ($1) ON CONFLICT DO NOTHING',
            [guildId]
        );
        return { guild_id: guildId, ...INVITE_DEFAULTS };
    }
    return { ...INVITE_DEFAULTS, ...res.rows[0] };
}

export async function updateInviteConfig(guildId, patch) {
    await getInviteConfig(guildId);
    const allowed = Object.keys(INVITE_DEFAULTS);
    const sets = [];
    const values = [guildId];
    let i = 2;
    for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(patch, key)) {
            sets.push(`${key} = $${i}`);
            values.push(patch[key]);
            i++;
        }
    }
    if (!sets.length) return getInviteConfig(guildId);
    sets.push('updated_at = NOW()');
    await pool.query(
        `UPDATE allied_invite_config SET ${sets.join(', ')} WHERE guild_id = $1`,
        values
    );
    return getInviteConfig(guildId);
}

export async function recordMemberJoin(data) {
    const res = await pool.query(
        `INSERT INTO allied_member_joins (
            guild_id, user_id, joined_at, inviter_id, invite_code, invite_uses,
            attribution, account_created_at
        ) VALUES ($1,$2,COALESCE($3, NOW()),$4,$5,$6,$7,$8)
        RETURNING *`,
        [
            data.guild_id,
            data.user_id,
            data.joined_at || null,
            data.inviter_id || null,
            data.invite_code || null,
            data.invite_uses ?? null,
            data.attribution || 'unknown',
            data.account_created_at || null
        ]
    );
    if (data.inviter_id && data.attribution === 'confirmed') {
        await pool.query(
            `INSERT INTO allied_invite_stats (guild_id, inviter_id, joins, leaves)
             VALUES ($1, $2, 1, 0)
             ON CONFLICT (guild_id, inviter_id)
             DO UPDATE SET joins = allied_invite_stats.joins + 1`,
            [data.guild_id, data.inviter_id]
        );
    }
    return res.rows[0];
}

export async function recordMemberLeave(guildId, userId) {
    const open = await pool.query(
        `SELECT * FROM allied_member_joins
         WHERE guild_id = $1 AND user_id = $2 AND left_at IS NULL
         ORDER BY joined_at DESC LIMIT 1`,
        [guildId, userId]
    );
    const row = open.rows[0] || null;
    if (row) {
        await pool.query(
            'UPDATE allied_member_joins SET left_at = NOW() WHERE id = $1',
            [row.id]
        );
        if (row.inviter_id && row.attribution === 'confirmed') {
            await pool.query(
                `INSERT INTO allied_invite_stats (guild_id, inviter_id, joins, leaves)
                 VALUES ($1, $2, 0, 1)
                 ON CONFLICT (guild_id, inviter_id)
                 DO UPDATE SET leaves = allied_invite_stats.leaves + 1`,
                [guildId, row.inviter_id]
            );
        }
    }
    return row;
}

export async function getInviterStats(guildId, inviterId) {
    const res = await pool.query(
        'SELECT * FROM allied_invite_stats WHERE guild_id = $1 AND inviter_id = $2',
        [guildId, inviterId]
    );
    return res.rows[0] || { guild_id: guildId, inviter_id: inviterId, joins: 0, leaves: 0 };
}

export async function getInviteRanking(guildId, limit = 10) {
    const res = await pool.query(
        `SELECT inviter_id, joins, leaves
         FROM allied_invite_stats
         WHERE guild_id = $1 AND joins > 0
         ORDER BY joins DESC, leaves ASC
         LIMIT $2`,
        [guildId, limit]
    );
    return res.rows;
}

export async function getGuildInviteTotals(guildId) {
    const joins = await pool.query(
        'SELECT COUNT(*)::int AS c FROM allied_member_joins WHERE guild_id = $1',
        [guildId]
    );
    const leaves = await pool.query(
        'SELECT COUNT(*)::int AS c FROM allied_member_joins WHERE guild_id = $1 AND left_at IS NOT NULL',
        [guildId]
    );
    const unknown = await pool.query(
        `SELECT COUNT(*)::int AS c FROM allied_member_joins
         WHERE guild_id = $1 AND attribution IN ('unknown','ambiguous')`,
        [guildId]
    );
    return {
        total_joins: joins.rows[0].c,
        total_leaves: leaves.rows[0].c,
        unknown_or_ambiguous: unknown.rows[0].c
    };
}

export async function getMemberJoinHistory(guildId, userId, limit = 10) {
    const res = await pool.query(
        `SELECT * FROM allied_member_joins
         WHERE guild_id = $1 AND user_id = $2
         ORDER BY joined_at DESC LIMIT $3`,
        [guildId, userId, limit]
    );
    return res.rows;
}

export async function upsertInviteSnapshots(guildId, invites) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const inv of invites) {
            await client.query(
                `INSERT INTO allied_invite_snapshots (guild_id, code, inviter_id, uses, max_uses, temporary, updated_at)
                 VALUES ($1,$2,$3,$4,$5,$6,NOW())
                 ON CONFLICT (guild_id, code) DO UPDATE SET
                    inviter_id = EXCLUDED.inviter_id,
                    uses = EXCLUDED.uses,
                    max_uses = EXCLUDED.max_uses,
                    temporary = EXCLUDED.temporary,
                    updated_at = NOW()`,
                [
                    guildId,
                    inv.code,
                    inv.inviterId || null,
                    inv.uses ?? 0,
                    inv.maxUses ?? null,
                    Boolean(inv.temporary)
                ]
            );
        }
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

export async function deleteInviteSnapshot(guildId, code) {
    await pool.query(
        'DELETE FROM allied_invite_snapshots WHERE guild_id = $1 AND code = $2',
        [guildId, code]
    );
}

export { WELCOME_DEFAULTS, INVITE_DEFAULTS };
