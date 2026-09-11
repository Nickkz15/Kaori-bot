import { getUser, updateUser, addItem, getInventory, removeItem, addCoins } from '../database/database.js';

export const PRESENTES_SECRETOS = {
    bilhete: {
        id: 'bilhete',
        nome: '📝 Bilhete da Kaori',
        raridade: 'raro',
        frases: [
            '"Não pergunte por quê."',
            '"Achei que você ia gostar. Ou não."',
            '"Se perder, eu nego que existiu."'
        ]
    },
    chave: {
        id: 'chave',
        nome: '🔑 Chave Misteriosa',
        raridade: 'epico',
        frases: [
            '"Não sei o que abre. Descubra."',
            '"Guardar bem."'
        ]
    },
    foto: {
        id: 'foto',
        nome: '📷 Polaroid da Kaori',
        raridade: 'lendario',
        frases: [
            '"Apaguei a original. Essa é a única."',
            '"Se mostrar pra alguém, eu finjo que não te conheço."'
        ]
    },
    fita_vermelha: {
        id: 'fita_vermelha',
        nome: '🎀 Fita Vermelha',
        raridade: 'epico',
        frases: [
            '"Minha cor favorita. Não estrague."',
            '"Você notou."'
        ]
    },
    estrelinha: {
        id: 'estrelinha',
        nome: '⭐ Estrelinha',
        raridade: 'incomum',
        frases: [
            '"Só pra não dizer que eu nunca te dei nada."',
            '"Toma. Agora some."'
        ]
    }
};

const CHANCE_BASE = 4;

export function tentarPresenteSecreto(userId) {
    const user = getUser(guildId, userId);

    let chance = CHANCE_BASE;
    if (user.afinidade >= 80) chance += 4;
    else if (user.afinidade >= 50) chance += 2;
    if ((user.humor || 50) >= 70) chance += 2;

    if (Math.random() * 100 > chance) return null;

    const pesos = {
        estrelinha: 40,
        bilhete: 30,
        chave: 15,
        fita_vermelha: 10,
        foto: 5
    };

    const pool = [];
    for (const [id, peso] of Object.entries(pesos)) {
        for (let i = 0; i < peso; i++) pool.push(id);
    }

    const escolhido = pool[Math.floor(Math.random() * pool.length)];
    const presente = PRESENTES_SECRETOS[escolhido];

    addItem(userId, escolhido, 1);
    updateUser(guildId, userId, {
        presentes_secretos: (user.presentes_secretos || 0) + 1
    });

    const frase = presente.frases[Math.floor(Math.random() * presente.frases.length)];

    return { item: presente, frase };
}

/** Usar a Chave Misteriosa — easter egg */
export function usarChave(userId) {
    const inv = getInventory(userId);
    const tem = inv.find(i => i.item === 'chave' && i.quantidade > 0);
    if (!tem) return { ok: false, msg: 'Você não tem a 🔑 Chave Misteriosa.' };

    const user = getUser(guildId, userId);
    if (user.afinidade < 60) {
        return { ok: false, msg: '"Ainda não. Você não está pronto."' };
    }

    removeItem(userId, 'chave', 1);

    // Recompensa especial
    const roll = Math.random() * 100;
    let recompensa;

    if (roll < 40) {
        addCoins(userId, 5000);
        recompensa = '💰 **5.000** Kaori Coins';
    } else if (roll < 70) {
        addItem(userId, 'ticket_dourado', 1);
        recompensa = '🎫 **Tíquete Dourado**';
    } else if (roll < 90) {
        addItem(userId, 'foto', 1);
        recompensa = '📷 **Polaroid da Kaori**';
    } else {
        addItem(userId, 'coracao_kaori', 1);
        recompensa = '💖 **Coração da Kaori** (mítico)';
    }

    return {
        ok: true,
        frase: '"Você realmente usou... Tá. Fica com isso. E não pergunte de novo."',
        recompensa
    };
}