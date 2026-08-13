import { getUser, updateUser, addCoins, removeCoins, addXP, addItem, getInventory } from '../database/database.js';

export const ITENS_LOJA = {
    chocolate: {
        id: 'chocolate',
        nome: '🍫 Chocolate da Kaori',
        preco: 150,
        descricao: 'Doce e meio amargo. Igual a personalidade dela.',
        emoji: '🍫'
    },
    carta: {
        id: 'carta',
        nome: '💌 Carta misteriosa',
        preco: 300,
        descricao: 'Ninguém sabe o que tem escrito. Nem a Kaori.',
        emoji: '💌'
    },
    fita: {
        id: 'fita',
        nome: '🎀 Fita da Kaori',
        preco: 500,
        descricao: 'Item de prestígio. Usar isso te deixa 3% mais estiloso.',
        emoji: '🎀'
    },
    cafe: {
        id: 'cafe',
        nome: '☕ Café da Kaori',
        preco: 80,
        descricao: 'Energia extra (só cosmético por enquanto).',
        emoji: '☕'
    },
    ursinho: {
        id: 'ursinho',
        nome: '🧸 Ursinho da Kaori',
        preco: 1000,
        descricao: 'O item mais fofo e caro do servidor. Ela fingiu que não gostou.',
        emoji: '🧸'
    },
    ticket: {
        id: 'ticket',
        nome: '🎫 Ticket de Evento',
        preco: 250,
        descricao: 'Quem sabe no futuro isso desbloqueia algo especial...',
        emoji: '🎫'
    }
};

export function dailyReward(userId) {
    const user = getUser(userId);
    const hoje = new Date().toISOString().slice(0, 10);
    const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    if (user.daily === hoje) {
        return { ok: false, msg: 'Você já pegou o diário hoje.\nVolta amanhã.' };
    }

    // Calcula streak
    let streak = user.daily_streak || 0;
    if (user.last_daily_date === ontem) {
        streak += 1;
    } else {
        streak = 1; // quebrou a sequência
    }

    // Bônus de streak
    let multiplicador = 1;
    if (streak >= 30) multiplicador = 2.0;
    else if (streak >= 7) multiplicador = 1.5;
    else if (streak >= 3) multiplicador = 1.2;

    const base = 120 + Math.floor(user.level * 8);
    const random = Math.floor(Math.random() * 80);
    const recompensa = Math.floor((base + random) * multiplicador);

    updateUser(userId, {
        coins: user.coins + recompensa,
        daily: hoje,
        daily_streak: streak,
        last_daily_date: hoje
    });

    const xpResult = addXP(userId, 25 + Math.floor(user.level * 2));

    // Recompensas de nível (chamada interna)
    const levelRewards = checkLevelRewards(userId, xpResult);

    return {
        ok: true,
        recompensa,
        streak,
        multiplicador,
        xpResult,
        levelRewards,
        novoSaldo: user.coins + recompensa
    };
}

// Recompensas automáticas de nível
function checkLevelRewards(userId, xpResult) {
    if (!xpResult.leveledUp) return [];

    const rewards = [];
    const niveis = [];

    for (let l = xpResult.oldLevel + 1; l <= xpResult.level; l++) {
        niveis.push(l);

        if (l === 5) {
            addCoins(userId, 500);
            rewards.push('Nível 5 → +500 coins');
        }
        if (l === 10) {
            addCoins(userId, 1000);
            rewards.push('Nível 10 → +1000 coins');
        }
        if (l === 15) {
            addCoins(userId, 1500);
            rewards.push('Nível 15 → +1500 coins');
        }
        if (l === 20) {
            addItem(userId, 'fita', 1);
            rewards.push('Nível 20 → 🎀 Fita da Kaori');
        }
        if (l === 30) {
            addCoins(userId, 5000);
            addItem(userId, 'ursinho', 1);
            rewards.push('Nível 30 → 5000 coins + 🧸 Ursinho');
        }
    }

    return rewards;
}

export function work(userId) {
    const user = getUser(userId);
    const agora = Date.now();
    const ultimo = user.last_work ? Number(user.last_work) : 0;
    const cooldown = 25 * 60 * 1000; // 25 minutos

    if (agora - ultimo < cooldown) {
        const restante = Math.ceil((cooldown - (agora - ultimo)) / 60000);
        return {
            ok: false,
            msg: `Você ainda está cansado.\nEspere mais **${restante} minuto${restante > 1 ? 's' : ''}**.`
        };
    }

    // Ganhos variados com personalidade
    const trabalhos = [
        { nome: 'ajudar a Kaori a organizar arquivos', min: 45, max: 90 },
        { nome: 'ficar de olho no servidor', min: 50, max: 100 },
        { nome: 'limpar o chat de spam', min: 40, max: 85 },
        { nome: 'testar comandos novos', min: 55, max: 110 },
        { nome: 'ficar parado parecendo ocupado', min: 30, max: 70 }
    ];

    const trabalho = trabalhos[Math.floor(Math.random() * trabalhos.length)];
    const ganho = Math.floor(Math.random() * (trabalho.max - trabalho.min + 1)) + trabalho.min;

    // Bônus por level
    const bonus = Math.floor(user.level * 3);
    const total = ganho + bonus;

    updateUser(userId, {
        coins: user.coins + total,
        last_work: String(agora)
    });

    const xpResult = addXP(userId, 12 + Math.floor(user.level * 1.5));

    return {
        ok: true,
        trabalho: trabalho.nome,
        ganho: total,
        xpResult,
        novoSaldo: user.coins + total
    };
}

export function transferir(fromId, toId, quantidade) {
    if (quantidade <= 0) return { ok: false, msg: 'Quantidade inválida.' };
    if (fromId === toId) return { ok: false, msg: 'Você não pode pagar a si mesmo, gênio.' };

    const fromUser = getUser(fromId);
    if (fromUser.coins < quantidade) {
        return { ok: false, msg: `Você só tem **${fromUser.coins}** Kaori Coins.` };
    }

    removeCoins(fromId, quantidade);
    addCoins(toId, quantidade);

    return {
        ok: true,
        quantidade,
        novoSaldo: fromUser.coins - quantidade
    };
}