import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});

pool.on('error', (err) => {
    console.error('PostgreSQL pool error:', err.message);
});

function defaultUser(guildId, userId) {
    return {
        guild_id: guildId,
        user_id: userId,
        coins: 0,
        xp: 0,
        level: 1,
        daily: null,
        last_work: null,
        carinho: 0,
        confianca: 0,
        afinidade: 0,
        humor: 50,
        energia: 70,
        last_box: null,
        daily_streak: 0,
        last_daily_date: null,
        presentes: 0,
        eventos: 0,
        cartinhas: 0,
        temporada: 1,
        presentes_secretos: 0,
        missoes: null,
        atributos: null
    };
}

function mapUser(row) {
    if (!row) return null;
    return {
        guild_id: row.guild_id,
        user_id: row.user_id,
        coins: Number(row.coins) || 0,
        xp: Number(row.xp) || 0,
        level: Number(row.level) || 1,
        daily: row.daily,
        last_work: row.last_work,
        carinho: Number(row.carinho) || 0,
        confianca: Number(row.confianca) || 0,
        afinidade: Number(row.afinidade) || 0,
        humor: Number(row.humor) ?? 50,
        energia: Number(row.energia) ?? 70,
        last_box: row.last_box,
        daily_streak: Number(row.daily_streak) || 0,
        last_daily_date: row.last_daily_date,
        presentes: Number(row.presentes) || 0,
        eventos: Number(row.eventos) || 0,
        cartinhas: Number(row.cartinhas) || 0,
        temporada: Number(row.temporada) || 1,
        presentes_secretos: Number(row.presentes_secretos) || 0,
        missoes: row.missoes || null,
        atributos: row.atributos || null
    };
}

export async function initDatabase() {
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL não definida. Configure a variável de ambiente DATABASE_URL com a connection string do PostgreSQL.');
    }

    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                coins INTEGER NOT NULL DEFAULT 0,
                xp INTEGER NOT NULL DEFAULT 0,
                level INTEGER NOT NULL DEFAULT 1,
                daily TEXT,
                last_work TEXT,
                carinho INTEGER NOT NULL DEFAULT 0,
                confianca INTEGER NOT NULL DEFAULT 0,
                afinidade INTEGER NOT NULL DEFAULT 0,
                humor INTEGER NOT NULL DEFAULT 50,
                energia INTEGER NOT NULL DEFAULT 70,
                last_box TEXT,
                daily_streak INTEGER NOT NULL DEFAULT 0,
                last_daily_date TEXT,
                presentes INTEGER NOT NULL DEFAULT 0,
                eventos INTEGER NOT NULL DEFAULT 0,
                cartinhas INTEGER NOT NULL DEFAULT 0,
                temporada INTEGER NOT NULL DEFAULT 1,
                presentes_secretos INTEGER NOT NULL DEFAULT 0,
                missoes JSONB,
                atributos JSONB,
                PRIMARY KEY (guild_id, user_id)
            );

            ALTER TABLE users ADD COLUMN IF NOT EXISTS atributos JSONB;

            CREATE TABLE IF NOT EXISTS inventory (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                item TEXT NOT NULL,
                quantidade INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (guild_id, user_id, item)
            );

            CREATE TABLE IF NOT EXISTS achievements (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                achievement_id TEXT NOT NULL,
                unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (guild_id, user_id, achievement_id)
            );

            CREATE TABLE IF NOT EXISTS action_counts (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                action TEXT NOT NULL,
                count INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (guild_id, user_id, action)
            );

            CREATE TABLE IF NOT EXISTS shops (
                guild_id TEXT PRIMARY KEY,
                items JSONB NOT NULL DEFAULT '[]'::jsonb,
                next_reset BIGINT NOT NULL DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_users_guild_coins ON users (guild_id, coins DESC);
            CREATE INDEX IF NOT EXISTS idx_users_guild_level ON users (guild_id, level DESC, xp DESC);
        `);
        console.log('✅ PostgreSQL inicializado e tabelas garantidas.');
    } finally {
        client.release();
    }
}

export async function getUser(guildId, userId) {
    if (!guildId || !userId) throw new Error('guildId e userId são obrigatórios em getUser.');

    const existing = await pool.query(
        'SELECT * FROM users WHERE guild_id = $1 AND user_id = $2',
        [guildId, userId]
    );

    if (existing.rows[0]) return mapUser(existing.rows[0]);

    const defaults = defaultUser(guildId, userId);
    await pool.query(
        `INSERT INTO users (
            guild_id, user_id, coins, xp, level, daily, last_work,
            carinho, confianca, afinidade, humor, energia, last_box,
            daily_streak, last_daily_date, presentes, eventos, cartinhas,
            temporada, presentes_secretos, missoes, atributos
        ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
        ) ON CONFLICT (guild_id, user_id) DO NOTHING`,
        [
            defaults.guild_id, defaults.user_id, defaults.coins, defaults.xp, defaults.level,
            defaults.daily, defaults.last_work, defaults.carinho, defaults.confianca,
            defaults.afinidade, defaults.humor, defaults.energia, defaults.last_box,
            defaults.daily_streak, defaults.last_daily_date, defaults.presentes,
            defaults.eventos, defaults.cartinhas, defaults.temporada,
            defaults.presentes_secretos, defaults.missoes, defaults.atributos
        ]
    );

    const created = await pool.query(
        'SELECT * FROM users WHERE guild_id = $1 AND user_id = $2',
        [guildId, userId]
    );
    return mapUser(created.rows[0]);
}

export async function updateUser(guildId, userId, data) {
    if (!guildId || !userId) throw new Error('guildId e userId são obrigatórios em updateUser.');

    await getUser(guildId, userId);

    const allowed = [
        'coins', 'xp', 'level', 'daily', 'last_work', 'carinho', 'confianca',
        'afinidade', 'humor', 'energia', 'last_box', 'daily_streak', 'last_daily_date',
        'presentes', 'eventos', 'cartinhas', 'temporada', 'presentes_secretos', 'missoes',
        'atributos'
    ];

    const sets = [];
    const values = [guildId, userId];
    let i = 3;

    for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
            sets.push(`${key} = $${i}`);
            values.push(
                key === 'missoes' || key === 'atributos'
                    ? JSON.stringify(data[key])
                    : data[key]
            );
            i++;
        }
    }

    if (sets.length === 0) return getUser(guildId, userId);

    await pool.query(
        `UPDATE users SET ${sets.join(', ')} WHERE guild_id = $1 AND user_id = $2`,
        values
    );

    return getUser(guildId, userId);
}

export async function addCoins(guildId, userId, amount) {
    const user = await getUser(guildId, userId);
    const coins = Math.max(0, user.coins + Number(amount));
    await updateUser(guildId, userId, { coins });
    return coins;
}

export async function removeCoins(guildId, userId, amount) {
    const user = await getUser(guildId, userId);
    if (user.coins < amount) return false;
    await updateUser(guildId, userId, { coins: user.coins - amount });
    return true;
}

export async function addXP(guildId, userId, amount) {
    const user = await getUser(guildId, userId);
    let xp = user.xp + Number(amount);
    let level = user.level;
    let leveledUp = false;
    let levelsGained = 0;
    const oldLevel = user.level;

    while (xp >= level * 100) {
        xp -= level * 100;
        level++;
        leveledUp = true;
        levelsGained++;
    }

    await updateUser(guildId, userId, { xp, level });
    return { leveledUp, level, xp, levelsGained, oldLevel };
}

export async function incrementAction(guildId, userId, action) {
    if (!guildId || !userId) throw new Error('guildId e userId são obrigatórios em incrementAction.');

    await pool.query(
        `INSERT INTO action_counts (guild_id, user_id, action, count)
         VALUES ($1, $2, $3, 1)
         ON CONFLICT (guild_id, user_id, action)
         DO UPDATE SET count = action_counts.count + 1`,
        [guildId, userId, action]
    );

    const res = await pool.query(
        'SELECT count FROM action_counts WHERE guild_id = $1 AND user_id = $2 AND action = $3',
        [guildId, userId, action]
    );
    return Number(res.rows[0]?.count) || 0;
}

export async function getActionCount(guildId, userId, action) {
    const res = await pool.query(
        'SELECT count FROM action_counts WHERE guild_id = $1 AND user_id = $2 AND action = $3',
        [guildId, userId, action]
    );
    return Number(res.rows[0]?.count) || 0;
}

export async function getInventory(guildId, userId) {
    const res = await pool.query(
        'SELECT item, quantidade FROM inventory WHERE guild_id = $1 AND user_id = $2 AND quantidade > 0',
        [guildId, userId]
    );
    return res.rows.map(r => ({ item: r.item, quantidade: Number(r.quantidade) }));
}

export async function addItem(guildId, userId, item, quantidade = 1) {
    await pool.query(
        `INSERT INTO inventory (guild_id, user_id, item, quantidade)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (guild_id, user_id, item)
         DO UPDATE SET quantidade = inventory.quantidade + $4`,
        [guildId, userId, item, quantidade]
    );
}

export async function removeItem(guildId, userId, item, quantidade = 1) {
    const res = await pool.query(
        'SELECT quantidade FROM inventory WHERE guild_id = $1 AND user_id = $2 AND item = $3',
        [guildId, userId, item]
    );
    const atual = Number(res.rows[0]?.quantidade) || 0;
    if (atual < quantidade) return false;

    const novo = atual - quantidade;
    if (novo <= 0) {
        await pool.query(
            'DELETE FROM inventory WHERE guild_id = $1 AND user_id = $2 AND item = $3',
            [guildId, userId, item]
        );
    } else {
        await pool.query(
            'UPDATE inventory SET quantidade = $4 WHERE guild_id = $1 AND user_id = $2 AND item = $3',
            [guildId, userId, item, novo]
        );
    }
    return true;
}

export async function getTopCoins(guildId, limit = 10) {
    const res = await pool.query(
        'SELECT user_id, coins, xp, level FROM users WHERE guild_id = $1 ORDER BY coins DESC LIMIT $2',
        [guildId, limit]
    );
    return res.rows.map(r => ({
        user_id: r.user_id,
        coins: Number(r.coins),
        xp: Number(r.xp),
        level: Number(r.level)
    }));
}

export async function getTopLevel(guildId, limit = 10) {
    const res = await pool.query(
        'SELECT user_id, coins, xp, level FROM users WHERE guild_id = $1 ORDER BY level DESC, xp DESC LIMIT $2',
        [guildId, limit]
    );
    return res.rows.map(r => ({
        user_id: r.user_id,
        coins: Number(r.coins),
        xp: Number(r.xp),
        level: Number(r.level)
    }));
}

export async function unlockAchievement(guildId, userId, id) {
    const existing = await pool.query(
        'SELECT 1 FROM achievements WHERE guild_id = $1 AND user_id = $2 AND achievement_id = $3',
        [guildId, userId, id]
    );
    if (existing.rows[0]) return false;

    await pool.query(
        `INSERT INTO achievements (guild_id, user_id, achievement_id, unlocked_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT DO NOTHING`,
        [guildId, userId, id]
    );
    return true;
}

export async function getAchievements(guildId, userId) {
    const res = await pool.query(
        'SELECT achievement_id, unlocked_at FROM achievements WHERE guild_id = $1 AND user_id = $2',
        [guildId, userId]
    );
    return res.rows.map(r => ({
        achievement_id: r.achievement_id,
        unlocked_at: r.unlocked_at
    }));
}

export async function getShop(guildId) {
    const res = await pool.query(
        'SELECT items, next_reset FROM shops WHERE guild_id = $1',
        [guildId]
    );
    if (!res.rows[0]) return { items: [], nextReset: 0 };
    return {
        items: res.rows[0].items || [],
        nextReset: Number(res.rows[0].next_reset) || 0
    };
}

export async function setShop(guildId, shopData) {
    await pool.query(
        `INSERT INTO shops (guild_id, items, next_reset)
         VALUES ($1, $2::jsonb, $3)
         ON CONFLICT (guild_id)
         DO UPDATE SET items = $2::jsonb, next_reset = $3`,
        [guildId, JSON.stringify(shopData.items || []), shopData.nextReset || 0]
    );
}

export async function buyFromShop(guildId, userId, itemId) {
    const shop = await getShop(guildId);
    const slot = shop.items.find(i => i.id === itemId);
    if (!slot || slot.estoque <= 0) {
        return { ok: false, msg: 'Item esgotado ou não está na loja agora.' };
    }

    const user = await getUser(guildId, userId);
    if (user.coins < slot.preco) {
        return { ok: false, msg: `Você precisa de **${slot.preco}** coins. Tem **${user.coins}**.` };
    }

    const removed = await removeCoins(guildId, userId, slot.preco);
    if (!removed) {
        return { ok: false, msg: `Você precisa de **${slot.preco}** coins. Tem **${user.coins}**.` };
    }

    slot.estoque -= 1;
    await addItem(guildId, userId, itemId, 1);
    await setShop(guildId, shop);

    return { ok: true, item: slot };
}

export async function closePool() {
    await pool.end();
}

export { pool };