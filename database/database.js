import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');
const dbPath = path.join(dataDir, 'kaori.json');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function load() {
    if (!fs.existsSync(dbPath)) {
        const initial = {
            users: {},
            inventory: {},
            achievements: {},
            action_counts: {},
            shop: { items: [], nextReset: 0 }
        };
        fs.writeFileSync(dbPath, JSON.stringify(initial, null, 2));
        return initial;
    }
    return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

function save(data) {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

let db = load();

export function getUser(userId) {
    if (!db.users[userId]) {
        db.users[userId] = {
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
            temporada: 1
        };
        save(db);
    }
    return db.users[userId];
}

export function updateUser(userId, data) {
    const user = getUser(userId);
    Object.assign(user, data);
    save(db);
}

export function addCoins(userId, amount) {
    const user = getUser(userId);
    user.coins = Math.max(0, user.coins + amount);
    save(db);
    return user.coins;
}

export function removeCoins(userId, amount) {
    const user = getUser(userId);
    if (user.coins < amount) return false;
    user.coins -= amount;
    save(db);
    return true;
}

export function addXP(userId, amount) {
    const user = getUser(userId);
    let xp = user.xp + amount;
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

    user.xp = xp;
    user.level = level;
    save(db);
    return { leveledUp, level, xp, levelsGained, oldLevel };
}

export function incrementAction(userId, action) {
    if (!db.action_counts[userId]) db.action_counts[userId] = {};
    db.action_counts[userId][action] = (db.action_counts[userId][action] || 0) + 1;
    save(db);
    return db.action_counts[userId][action];
}

export function getActionCount(userId, action) {
    return db.action_counts[userId]?.[action] || 0;
}

export function getInventory(userId) {
    const inv = db.inventory[userId] || {};
    return Object.entries(inv)
        .filter(([, q]) => q > 0)
        .map(([item, quantidade]) => ({ item, quantidade }));
}

export function addItem(userId, item, quantidade = 1) {
    if (!db.inventory[userId]) db.inventory[userId] = {};
    db.inventory[userId][item] = (db.inventory[userId][item] || 0) + quantidade;
    save(db);
}

export function removeItem(userId, item, quantidade = 1) {
    if (!db.inventory[userId] || !db.inventory[userId][item] || db.inventory[userId][item] < quantidade) {
        return false;
    }
    db.inventory[userId][item] -= quantidade;
    if (db.inventory[userId][item] <= 0) delete db.inventory[userId][item];
    save(db);
    return true;
}

export function getTopCoins(limit = 10) {
    return Object.values(db.users).sort((a, b) => b.coins - a.coins).slice(0, limit);
}

export function getTopLevel(limit = 10) {
    return Object.values(db.users).sort((a, b) => b.level - a.level || b.xp - a.xp).slice(0, limit);
}

export function unlockAchievement(userId, id) {
    if (!db.achievements[userId]) db.achievements[userId] = {};
    if (db.achievements[userId][id]) return false;
    db.achievements[userId][id] = new Date().toISOString();
    save(db);
    return true;
}

export function getAchievements(userId) {
    const ach = db.achievements[userId] || {};
    return Object.keys(ach).map(id => ({ achievement_id: id, unlocked_at: ach[id] }));
}

export function getShop() {
    return db.shop || { items: [], nextReset: 0 };
}

export function setShop(shopData) {
    db.shop = shopData;
    save(db);
}

export function buyFromShop(userId, itemId) {
    const shop = getShop();
    const slot = shop.items.find(i => i.id === itemId);
    if (!slot || slot.estoque <= 0) return { ok: false, msg: 'Item esgotado ou não está na loja agora.' };

    const user = getUser(userId);
    if (user.coins < slot.preco) return { ok: false, msg: `Você precisa de **${slot.preco}** coins. Tem **${user.coins}**.` };

    removeCoins(userId, slot.preco);
    slot.estoque -= 1;
    addItem(userId, itemId, 1);
    setShop(shop);

    return { ok: true, item: slot };
}