import { pool } from '../database/database.js';

export async function ensureConfessSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS confess_configs (
            guild_id TEXT PRIMARY KEY,
            confession_channel_id TEXT,
            logs_channel_id TEXT,
            poll_channel_id TEXT,
            confession_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            attachments_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            polls_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            button_enabled BOOLEAN NOT NULL DEFAULT FALSE,
            word_filter_enabled BOOLEAN NOT NULL DEFAULT FALSE,
            cooldown_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            cooldown_seconds INTEGER NOT NULL DEFAULT 60,
            min_account_age_enabled BOOLEAN NOT NULL DEFAULT FALSE,
            min_account_age_days INTEGER NOT NULL DEFAULT 0,
            default_color TEXT NOT NULL DEFAULT '#5865F2',
            confession_title TEXT NOT NULL DEFAULT 'Confissão Anônima',
            confession_author TEXT NOT NULL DEFAULT 'Anonymous',
            confession_footer TEXT NOT NULL DEFAULT '',
            confession_button_text TEXT NOT NULL DEFAULT 'Enviar uma confissão',
            poll_button_text TEXT NOT NULL DEFAULT 'Votar',
            success_message TEXT NOT NULL DEFAULT 'Pronto! Sua confissão foi enviada de forma anônima. ✨',
            banned_words JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS confess_counters (
            guild_id TEXT PRIMARY KEY,
            last_number INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS confess_bans (
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            banned_by TEXT NOT NULL,
            reason TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (guild_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS confessions (
            id BIGSERIAL PRIMARY KEY,
            guild_id TEXT NOT NULL,
            confession_number INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            content TEXT NOT NULL,
            color TEXT,
            image_url TEXT,
            source TEXT NOT NULL DEFAULT 'command',
            public_channel_id TEXT,
            public_message_id TEXT,
            public_message_url TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (guild_id, confession_number)
        );

        CREATE TABLE IF NOT EXISTS confess_polls (
            id BIGSERIAL PRIMARY KEY,
            guild_id TEXT NOT NULL,
            creator_id TEXT NOT NULL,
            question TEXT NOT NULL,
            options JSONB NOT NULL,
            public_message_id TEXT,
            channel_id TEXT,
            status TEXT NOT NULL DEFAULT 'open',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            closed_at TIMESTAMPTZ
        );

        CREATE TABLE IF NOT EXISTS confess_poll_votes (
            poll_id BIGINT NOT NULL REFERENCES confess_polls(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL,
            option_index INTEGER NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (poll_id, user_id)
        );

        CREATE INDEX IF NOT EXISTS idx_confessions_guild ON confessions (guild_id, confession_number DESC);
        CREATE INDEX IF NOT EXISTS idx_confessions_user ON confessions (guild_id, user_id);
        CREATE INDEX IF NOT EXISTS idx_confess_bans_guild ON confess_bans (guild_id);
        CREATE INDEX IF NOT EXISTS idx_confess_polls_guild ON confess_polls (guild_id, status);
        CREATE INDEX IF NOT EXISTS idx_confess_poll_votes_poll ON confess_poll_votes (poll_id);
    `);
}

const DEFAULT_CONFIG = {
    confession_channel_id: null,
    logs_channel_id: null,
    poll_channel_id: null,
    confession_enabled: true,
    attachments_enabled: true,
    polls_enabled: true,
    button_enabled: false,
    word_filter_enabled: false,
    cooldown_enabled: true,
    cooldown_seconds: 60,
    min_account_age_enabled: false,
    min_account_age_days: 0,
    default_color: '#5865F2',
    confession_title: 'Confissão Anônima',
    confession_author: 'Anonymous',
    confession_footer: '',
    confession_button_text: 'Enviar uma confissão',
    poll_button_text: 'Votar',
    success_message: 'Pronto! Sua confissão foi enviada de forma anônima. ✨',
    banned_words: []
};

export async function getConfessConfig(guildId) {
    const res = await pool.query('SELECT * FROM confess_configs WHERE guild_id = $1', [guildId]);
    if (res.rows[0]) {
        const row = res.rows[0];
        return {
            ...DEFAULT_CONFIG,
            ...row,
            banned_words: Array.isArray(row.banned_words) ? row.banned_words : []
        };
    }
    await pool.query(
        `INSERT INTO confess_configs (guild_id) VALUES ($1) ON CONFLICT (guild_id) DO NOTHING`,
        [guildId]
    );
    return { guild_id: guildId, ...DEFAULT_CONFIG };
}

export async function updateConfessConfig(guildId, patch) {
    await getConfessConfig(guildId);
    const allowed = [
        'confession_channel_id', 'logs_channel_id', 'poll_channel_id',
        'confession_enabled', 'attachments_enabled', 'polls_enabled', 'button_enabled',
        'word_filter_enabled', 'cooldown_enabled', 'cooldown_seconds',
        'min_account_age_enabled', 'min_account_age_days', 'default_color',
        'confession_title', 'confession_author', 'confession_footer',
        'confession_button_text', 'poll_button_text', 'success_message', 'banned_words'
    ];
    const sets = [];
    const values = [guildId];
    let i = 2;
    for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(patch, key)) {
            sets.push(`${key} = $${i}`);
            values.push(key === 'banned_words' ? JSON.stringify(patch[key]) : patch[key]);
            i++;
        }
    }
    if (sets.length === 0) return getConfessConfig(guildId);
    sets.push('updated_at = NOW()');
    await pool.query(
        `UPDATE confess_configs SET ${sets.join(', ')} WHERE guild_id = $1`,
        values
    );
    return getConfessConfig(guildId);
}

export async function nextConfessionNumber(guildId) {
    const res = await pool.query(
        `INSERT INTO confess_counters (guild_id, last_number)
         VALUES ($1, 1)
         ON CONFLICT (guild_id)
         DO UPDATE SET last_number = confess_counters.last_number + 1
         RETURNING last_number`,
        [guildId]
    );
    return Number(res.rows[0].last_number);
}

export async function insertConfession(row) {
    const res = await pool.query(
        `INSERT INTO confessions (
            guild_id, confession_number, user_id, content, color, image_url,
            source, public_channel_id, public_message_id, public_message_url
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING *`,
        [
            row.guild_id, row.confession_number, row.user_id, row.content,
            row.color || null, row.image_url || null, row.source || 'command',
            row.public_channel_id || null, row.public_message_id || null,
            row.public_message_url || null
        ]
    );
    return res.rows[0];
}

export async function updateConfessionPublic(id, data) {
    await pool.query(
        `UPDATE confessions SET
            public_channel_id = $2,
            public_message_id = $3,
            public_message_url = $4
         WHERE id = $1`,
        [id, data.public_channel_id, data.public_message_id, data.public_message_url]
    );
}

export async function isConfessBanned(guildId, userId) {
    const res = await pool.query(
        'SELECT 1 FROM confess_bans WHERE guild_id = $1 AND user_id = $2',
        [guildId, userId]
    );
    return Boolean(res.rows[0]);
}

export async function banConfessUser(guildId, userId, bannedBy, reason = null) {
    await pool.query(
        `INSERT INTO confess_bans (guild_id, user_id, banned_by, reason)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (guild_id, user_id)
         DO UPDATE SET banned_by = $3, reason = $4, created_at = NOW()`,
        [guildId, userId, bannedBy, reason]
    );
}

export async function unbanConfessUser(guildId, userId) {
    const res = await pool.query(
        'DELETE FROM confess_bans WHERE guild_id = $1 AND user_id = $2 RETURNING user_id',
        [guildId, userId]
    );
    return Boolean(res.rows[0]);
}

export async function listConfessBans(guildId, limit = 20, offset = 0) {
    const res = await pool.query(
        `SELECT * FROM confess_bans WHERE guild_id = $1
         ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [guildId, limit, offset]
    );
    const count = await pool.query(
        'SELECT COUNT(*)::int AS total FROM confess_bans WHERE guild_id = $1',
        [guildId]
    );
    return { rows: res.rows, total: count.rows[0].total };
}

export async function getLastConfessionTime(guildId, userId) {
    const res = await pool.query(
        `SELECT created_at FROM confessions
         WHERE guild_id = $1 AND user_id = $2
         ORDER BY created_at DESC LIMIT 1`,
        [guildId, userId]
    );
    return res.rows[0]?.created_at || null;
}

export async function createPoll(row) {
    const res = await pool.query(
        `INSERT INTO confess_polls (guild_id, creator_id, question, options, channel_id, public_message_id, status)
         VALUES ($1,$2,$3,$4::jsonb,$5,$6,'open') RETURNING *`,
        [row.guild_id, row.creator_id, row.question, JSON.stringify(row.options), row.channel_id || null, row.public_message_id || null]
    );
    return res.rows[0];
}

export async function getPoll(pollId) {
    const res = await pool.query('SELECT * FROM confess_polls WHERE id = $1', [pollId]);
    return res.rows[0] || null;
}

export async function updatePollMessage(pollId, messageId, channelId) {
    await pool.query(
        'UPDATE confess_polls SET public_message_id = $2, channel_id = $3 WHERE id = $1',
        [pollId, messageId, channelId]
    );
}

export async function castPollVote(pollId, userId, optionIndex) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const poll = await client.query('SELECT * FROM confess_polls WHERE id = $1 FOR UPDATE', [pollId]);
        if (!poll.rows[0]) {
            await client.query('ROLLBACK');
            return { ok: false, msg: 'Enquete não encontrada.' };
        }
        if (poll.rows[0].status !== 'open') {
            await client.query('ROLLBACK');
            return { ok: false, msg: 'Esta enquete está encerrada.' };
        }
        const options = poll.rows[0].options;
        if (optionIndex < 0 || optionIndex >= options.length) {
            await client.query('ROLLBACK');
            return { ok: false, msg: 'Opção inválida.' };
        }
        await client.query(
            `INSERT INTO confess_poll_votes (poll_id, user_id, option_index)
             VALUES ($1, $2, $3)
             ON CONFLICT (poll_id, user_id)
             DO UPDATE SET option_index = $3, created_at = NOW()`,
            [pollId, userId, optionIndex]
        );
        const votes = await client.query(
            'SELECT option_index, COUNT(*)::int AS c FROM confess_poll_votes WHERE poll_id = $1 GROUP BY option_index',
            [pollId]
        );
        await client.query('COMMIT');
        const counts = options.map((_, i) => 0);
        for (const v of votes.rows) counts[v.option_index] = v.c;
        return { ok: true, counts, options, question: poll.rows[0].question };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

export async function getPollCounts(pollId) {
    const poll = await getPoll(pollId);
    if (!poll) return null;
    const votes = await pool.query(
        'SELECT option_index, COUNT(*)::int AS c FROM confess_poll_votes WHERE poll_id = $1 GROUP BY option_index',
        [pollId]
    );
    const options = poll.options;
    const counts = options.map((_, i) => 0);
    for (const v of votes.rows) counts[v.option_index] = v.c;
    return { poll, counts };
}
