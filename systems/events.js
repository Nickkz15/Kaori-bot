import { getUser, updateUser, removeItem, getInventory, addCoins, addXP } from '../database/database.js';

const EVENTOS = [
    {
        id: 'cinema',
        nome: '🎬 Cinema',
        minAfinidade: 20,
        frases: {
            baixo: '"Cinema? Com você? ...Talvez outra hora."',
            medio: '"Tá. Mas você paga a pipoca."',
            alto: '"Escolhe o filme. Eu escolho o lugar."'
        },
        recompensa: { afinidade: 8, carinho: 5, confianca: 3 }
    },
    {
        id: 'cafeteria',
        nome: '☕ Cafeteria',
        minAfinidade: 10,
        frases: {
            baixo: '"Só se você não ficar falando demais."',
            medio: '"Café. Não estraga."',
            alto: '"Eu já sei o que você vai pedir."'
        },
        recompensa: { afinidade: 6, carinho: 4, humor: 8 }
    },
    {
        id: 'fliperama',
        nome: '🎮 Fliperama',
        minAfinidade: 25,
        frases: {
            baixo: '"Você vai perder."',
            medio: '"Tá. Mas se eu ganhar, você deve um favor."',
            alto: '"Preparado para perder de novo?"'
        },
        recompensa: { afinidade: 7, confianca: 5, energia: -5 }
    },
    {
        id: 'parque',
        nome: '🎡 Parque',
        minAfinidade: 35,
        frases: {
            baixo: '"Parque? Sério?"',
            medio: '"...Tá. Mas sem foto."',
            alto: '"Eu gosto da roda-gigante. Não comente."'
        },
        recompensa: { afinidade: 10, carinho: 8, confianca: 4 }
    },
    {
        id: 'chuva',
        nome: '🌧️ Passeio na Chuva',
        minAfinidade: 50,
        frases: {
            baixo: '"Está chovendo. E daí?"',
            medio: '"Você é estranho. Vamos."',
            alto: '"Só dessa vez. E você segura o guarda-chuva."'
        },
        recompensa: { afinidade: 14, carinho: 12, confianca: 8 }
    },
    {
        id: 'biblioteca',
        nome: '📚 Biblioteca',
        minAfinidade: 15,
        frases: {
            baixo: '"Silêncio. Ou eu te jogo pra fora."',
            medio: '"Escolhe um livro. Eu escolho outro."',
            alto: '"Eu já separei um pra você."'
        },
        recompensa: { afinidade: 5, confianca: 7, humor: 3 }
    },
    {
        id: 'declaracao',
        nome: '💫 Declaração Especial',
        minAfinidade: 75,
        especial: true,
        frases: {
            baixo: '"Ainda não."',
            medio: '"...Você tem certeza?"',
            alto: '"Eu também... sentia falta disso."'
        },
        recompensa: { afinidade: 20, carinho: 18, confianca: 15, humor: 15 }
    },
    {
        id: 'show',
        nome: '🎤 Show Particular',
        minAfinidade: 60,
        especial: true,
        frases: {
            baixo: '"Eu não canto pra qualquer um."',
            medio: '"Uma música. Só uma."',
            alto: '"Fecha os olhos. E não conte pra ninguém."'
        },
        recompensa: { afinidade: 16, carinho: 14, confianca: 10 }
    }
];

export function listarEventosDisponiveis(userId) {
    const user = getUser(guildId, userId);
    return EVENTOS.filter(e => user.afinidade >= e.minAfinidade);
}

export function iniciarEvento(userId, alvoId, ticketTipo = 'ticket') {
    const inv = getInventory(userId);
    const temTicket = inv.find(i => i.item === ticketTipo && i.quantidade > 0);
    if (!temTicket) {
        return { ok: false, msg: ticketTipo === 'ticket_dourado'
            ? 'Você precisa de um 🎫 Tíquete Dourado.'
            : 'Você precisa de um 🎟️ Tíquete de Evento.\nCompre na `/loja`.' };
    }

    const user = getUser(guildId, userId);
    let pool = EVENTOS.filter(e => user.afinidade >= e.minAfinidade);

    // Tíquete dourado favorece eventos especiais
    if (ticketTipo === 'ticket_dourado') {
        const especiais = pool.filter(e => e.especial);
        if (especiais.length > 0 && Math.random() < 0.6) {
            pool = especiais;
        }
    }

    if (pool.length === 0) {
        return { ok: false, msg: 'Sua afinidade ainda é baixa demais para eventos.\nAumente com presentes e interações.' };
    }

    removeItem(userId, ticketTipo, 1);

    const evento = pool[Math.floor(Math.random() * pool.length)];
    const media = (user.carinho + user.afinidade) / 2;

    let nivelFrase = 'baixo';
    if (media >= 70) nivelFrase = 'alto';
    else if (media >= 40) nivelFrase = 'medio';

    const frase = evento.frases[nivelFrase];

    // Resultado de diversão (50-100)
    const diversao = 50 + Math.floor(Math.random() * 51);

    const recompensa = evento.recompensa;
    const novo = {
        carinho: Math.min(100, user.carinho + (recompensa.carinho || 0)),
        confianca: Math.min(100, user.confianca + (recompensa.confianca || 0)),
        afinidade: Math.min(100, user.afinidade + (recompensa.afinidade || 0)),
        humor: Math.min(100, (user.humor || 50) + (recompensa.humor || 0)),
        energia: Math.min(100, Math.max(0, (user.energia || 70) + (recompensa.energia || 0))),
        eventos: (user.eventos || 0) + 1
    };

    updateUser(guildId, userId, novo);

    // Pequeno bônus de coins/XP
    const bonusCoins = 100 + Math.floor(diversao * 3);
    addCoins(guildId, userId, bonusCoins);
    addXP(guildId, userId, 10 + Math.floor(diversao / 10));

    return {
        ok: true,
        evento,
        frase,
        diversao,
        recompensa,
        bonusCoins,
        alvoId,
        novo
    };
}