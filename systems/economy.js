import { getUser, updateUser, addCoins, removeCoins, addXP, getShop, setShop } from '../database/database.js';

export const RARIDADE = {
    comum:    { nome: 'Comum',    cor: 0x95a5a6, emoji: '⚪' },
    incomum:  { nome: 'Incomum',  cor: 0x2ecc71, emoji: '🟢' },
    raro:     { nome: 'Raro',     cor: 0x3498db, emoji: '🔵' },
    epico:    { nome: 'Épico',    cor: 0x9b59b6, emoji: '🟣' },
    lendario: { nome: 'Lendário', cor: 0xf1c40f, emoji: '🟡' },
    mitico:   { nome: 'Mítico',   cor: 0xe74c3c, emoji: '🔴' }
};

export const ITENS_CATALOGO = {
    // ===== COMUM =====
    cafe: {
        id: 'cafe', nome: '☕ Café', preco: 400, maxEstoque: 10, raridade: 'comum', chance: 85,
        tipo: 'consumivel',
        efeito: { energia: 8, humor: 3 },
        frases: ['"Toma. Não fica esperando elogio."', '"Café. Simples."', '"Bebe antes que esfrie."']
    },
    chocolate: {
        id: 'chocolate', nome: '🍫 Chocolate', preco: 700, maxEstoque: 6, raridade: 'comum', chance: 75,
        tipo: 'presente',
        efeito: { carinho: 5, afinidade: 2 },
        frases: ['"Doce demais."', '"Hm. Aceitável."', '"Não se acostume."']
    },
    bala: {
        id: 'bala', nome: '🍬 Bala', preco: 250, maxEstoque: 12, raridade: 'comum', chance: 90,
        tipo: 'presente',
        efeito: { carinho: 2, humor: 4 },
        frases: ['"Sério? Uma bala?"', '"...Obrigada. Eu acho."']
    },

    // ===== INCOMUM =====
    flor: {
        id: 'flor', nome: '🌹 Rosa', preco: 2200, maxEstoque: 3, raridade: 'incomum', chance: 45,
        tipo: 'presente',
        efeito: { carinho: 10, afinidade: 6, confianca: 3 },
        frases: ['"Você realmente comprou isso pra mim...?"', '"Não fica se achando."', '"...Bonita."']
    },
    cartinha: {
        id: 'cartinha', nome: '💌 Cartinha', preco: 1500, maxEstoque: 4, raridade: 'incomum', chance: 55,
        tipo: 'carta',
        efeito: { carinho: 8, afinidade: 5 },
        frases: {
            baixo: '"Você escreveu isso pra mim? ...Não esperava."',
            medio: '"Você está ficando perigosamente sentimental."',
            alto: '"Eu vou guardar isso. Mas se contar pra alguém, eu nego."'
        }
    },
    pelucia: {
        id: 'pelucia', nome: '🐰 Pelúcia', preco: 2800, maxEstoque: 2, raridade: 'incomum', chance: 40,
        tipo: 'presente',
        efeito: { carinho: 12, afinidade: 7 },
        frases: ['"Fofo... não diga que eu disse isso."', '"Você tem um gosto estranho."']
    },

    // ===== RARO =====
    ursinho: {
        id: 'ursinho', nome: '🧸 Ursinho', preco: 5500, maxEstoque: 1, raridade: 'raro', chance: 28,
        tipo: 'presente',
        efeito: { carinho: 15, confianca: 5, afinidade: 8 },
        frases: ['"Você realmente comprou isso pra mim...? Hm. Não fica se achando por causa disso."']
    },
    ticket: {
        id: 'ticket', nome: '🎟️ Tíquete de Evento', preco: 2000, maxEstoque: 8, raridade: 'raro', chance: 38,
        tipo: 'ticket',
        efeito: {},
        frases: ['"Guarde bem. Não vai querer desperdiçar."']
    },
    livro: {
        id: 'livro', nome: '📖 Livro da Kaori', preco: 3200, maxEstoque: 2, raridade: 'raro', chance: 30,
        tipo: 'presente',
        efeito: { confianca: 10, afinidade: 6, humor: 5 },
        frases: ['"Você leu isso...? Interessante."', '"Não esperava esse tipo de presente."']
    },

    // ===== ÉPICO =====
    colar: {
        id: 'colar', nome: '📿 Colar da Kaori', preco: 9000, maxEstoque: 1, raridade: 'epico', chance: 15,
        tipo: 'presente',
        efeito: { carinho: 18, confianca: 12, afinidade: 14 },
        frases: ['"Isso é... pessoal demais."', '"Eu vou usar. Mas não comente."']
    },
    ticket_dourado: {
        id: 'ticket_dourado', nome: '🎫 Tíquete Dourado', preco: 7500, maxEstoque: 2, raridade: 'epico', chance: 12,
        tipo: 'ticket_especial',
        efeito: {},
        frases: ['"Esse abre coisas melhores. Não desperdice."']
    },

    // ===== LENDÁRIO =====
    rosa_negra: {
        id: 'rosa_negra', nome: '🖤 Rosa Negra', preco: 14000, maxEstoque: 1, raridade: 'lendario', chance: 7,
        tipo: 'presente',
        efeito: { carinho: 25, confianca: 15, afinidade: 20, humor: 10 },
        frases: ['"Kaori ficou alguns segundos olhando para ela antes de aceitar."', '"...Obrigada. Não diga nada."']
    },
    anel: {
        id: 'anel', nome: '💍 Anel da Promessa', preco: 18000, maxEstoque: 1, raridade: 'lendario', chance: 5,
        tipo: 'presente',
        efeito: { carinho: 30, confianca: 20, afinidade: 25 },
        frases: ['"...Você tem noção do que está fazendo?"', '"Eu aceito. Mas se for brincadeira, eu nunca mais falo com você."']
    },

    // ===== MÍTICO =====
    coracao_kaori: {
        id: 'coracao_kaori', nome: '💖 Coração da Kaori', preco: 35000, maxEstoque: 1, raridade: 'mitico', chance: 2,
        tipo: 'presente',
        efeito: { carinho: 40, confianca: 30, afinidade: 35, humor: 20 },
        frases: ['"...Isso não deveria existir."', '"Você conseguiu algo que quase ninguém consegue. Não estrague."']
    },

    // ===== EASTER EGGS =====
    gato_preto: {
        id: 'gato_preto', nome: '🐈‍⬛ Gato Preto', preco: 7777, maxEstoque: 1, raridade: 'mitico', chance: 1,
        tipo: 'presente',
        efeito: { carinho: 15, afinidade: 15, humor: 20 },
        frases: ['"Ele apareceu do nada. Igual você."', '"Não pergunte de onde veio."']
    },
    carta_secreta: {
        id: 'carta_secreta', nome: '🕊️ Carta Secreta', preco: 9999, maxEstoque: 1, raridade: 'mitico', chance: 1,
        tipo: 'carta',
        efeito: { confianca: 25, afinidade: 20 },
        frases: {
            baixo: '"Como você conseguiu isso?"',
            medio: '"Essa carta não deveria existir."',
            alto: '"Agora você sabe demais. Não me decepcione."'
        }
    }
};
const RESET_MS = 2 * 60 * 60 * 1000;

export function gerarLoja() {
    const agora = Date.now();
    const shop = getShop();

    if (shop.nextReset > agora && shop.items?.length > 0) return shop;

    const novos = [];
    for (const item of Object.values(ITENS_CATALOGO)) {
        if (Math.random() * 100 > item.chance) continue;
        const estoque = Math.max(1, Math.floor(Math.random() * item.maxEstoque) + 1);
        novos.push({
            id: item.id,
            nome: item.nome,
            preco: item.preco,
            estoque,
            max: item.maxEstoque,
            raridade: item.raridade
        });
    }

    if (novos.length < 4) {
        const comuns = Object.values(ITENS_CATALOGO).filter(i => i.raridade === 'comum' || i.raridade === 'incomum');
        for (const item of comuns) {
            if (novos.length >= 5) break;
            if (!novos.find(n => n.id === item.id)) {
                novos.push({
                    id: item.id, nome: item.nome, preco: item.preco,
                    estoque: Math.min(4, item.maxEstoque), max: item.maxEstoque, raridade: item.raridade
                });
            }
        }
    }

    const novaLoja = { items: novos, nextReset: agora + RESET_MS };
    setShop(novaLoja);
    return novaLoja;
}

export function tempoRestanteLoja() {
    const shop = getShop();
    const restante = Math.max(0, (shop.nextReset || 0) - Date.now());
    const h = Math.floor(restante / 3600000);
    const m = Math.floor((restante % 3600000) / 60000);
    return `${h}h ${m}min`;
}

export function dailyReward(userId) {
    const user = getUser(guildId, userId);
    const hoje = new Date().toISOString().slice(0, 10);
    const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    if (user.daily === hoje) {
        return { ok: false, msg: 'Você já pegou o diário hoje.\nVolta amanhã.' };
    }

    let streak = user.daily_streak || 0;
    if (user.last_daily_date === ontem) streak += 1;
    else streak = 1;

    let mult = 1;
    if (streak >= 30) mult = 2.0;
    else if (streak >= 7) mult = 1.5;
    else if (streak >= 3) mult = 1.2;

    const base = 600 + Math.floor(user.level * 40);
    const random = Math.floor(Math.random() * 400);
    const recompensa = Math.floor((base + random) * mult);

    updateUser(guildId, userId, {
        coins: user.coins + recompensa,
        daily: hoje,
        daily_streak: streak,
        last_daily_date: hoje
    });

    const xpResult = addXP(userId, 20 + Math.floor(user.level * 2));

    return {
        ok: true,
        recompensa,
        streak,
        multiplicador: mult,
        xpResult,
        novoSaldo: user.coins + recompensa
    };
}

export function work(userId) {
    const user = getUser(guildId, userId);
    const agora = Date.now();
    const ultimo = user.last_work ? Number(user.last_work) : 0;
    const cooldown = 45 * 60 * 1000; // 45 min

    if (agora - ultimo < cooldown) {
        const restante = Math.ceil((cooldown - (agora - ultimo)) / 60000);

        return {
            ok: false,
            msg: `Você ainda está cansado.\nEspere mais **${restante} minuto${restante > 1 ? 's' : ''}**.`
        };
    }

    const trabalhos = [
        { nome: 'organizar arquivos da Kaori', min: 350, max: 400 },
        { nome: 'ficar de olho no servidor', min: 380, max: 450 },
        { nome: 'limpar spam do chat', min: 350, max: 420 },
        { nome: 'testar comandos novos', min: 400, max: 500 }
    ];

    const t = trabalhos[Math.floor(Math.random() * trabalhos.length)];

    const ganho =
        Math.floor(Math.random() * (t.max - t.min + 1)) +
        t.min +
        Math.floor(user.level * 5);

    updateUser(guildId, userId, {
        coins: user.coins + ganho,
        last_work: String(agora)
    });

    const xpResult = addXP(
        userId,
        12 + Math.floor(user.level * 1.5)
    );

    return {
        ok: true,
        trabalho: t.nome,
        ganho,
        xpResult,
        novoSaldo: user.coins + ganho
    };
}

export function transferir(fromId, toId, quantidade) {
    if (quantidade <= 0) return { ok: false, msg: 'Quantidade inválida.' };
    if (fromId === toId) return { ok: false, msg: 'Você não pode pagar a si mesmo.' };
    const fromUser = getUser(guildId, fromId);
    if (fromUser.coins < quantidade) return { ok: false, msg: `Você só tem **${fromUser.coins}** Kaori Coins.` };
    removeCoins(fromId, quantidade);
    addCoins(toId, quantidade);
    return { ok: true, quantidade, novoSaldo: fromUser.coins - quantidade };
}