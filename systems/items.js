import { getUser, updateUser, removeItem, getInventory } from '../database/database.js';
import { ITENS_CATALOGO, RARIDADE } from './economy.js';

export function usarItem(userId, itemId) {
    const item = ITENS_CATALOGO[itemId];
    if (!item) return { ok: false, msg: 'Esse item não existe.' };

    if (item.tipo === 'ticket' || item.tipo === 'ticket_especial') {
        return { ok: false, msg: 'Tíquetes se usam com `/evento`. Não com `/usar`.' };
    }

    const inv = getInventory(userId);
    const possui = inv.find(i => i.item === itemId);
    if (!possui || possui.quantidade < 1) {
        return { ok: false, msg: 'Você não tem esse item.' };
    }

    removeItem(userId, itemId, 1);

    const user = getUser(userId);
    const efeito = item.efeito || {};

    const novo = {
        carinho: Math.min(100, Math.max(0, user.carinho + (efeito.carinho || 0))),
        confianca: Math.min(100, Math.max(0, user.confianca + (efeito.confianca || 0))),
        afinidade: Math.min(100, Math.max(0, user.afinidade + (efeito.afinidade || 0))),
        humor: Math.min(100, Math.max(0, (user.humor || 50) + (efeito.humor || 0))),
        energia: Math.min(100, Math.max(0, (user.energia || 70) + (efeito.energia || 0)))
    };

    const extras = {};
    if (itemId === 'cartinha') extras.cartinhas = (user.cartinhas || 0) + 1;
    if (item.tipo === 'presente') extras.presentes = (user.presentes || 0) + 1;

    updateUser(userId, { ...novo, ...extras });

    let frase;
    if (itemId === 'cartinha' && typeof item.frases === 'object') {
        const media = (novo.carinho + novo.afinidade) / 2;
        if (media >= 70) frase = item.frases.alto;
        else if (media >= 40) frase = item.frases.medio;
        else frase = item.frases.baixo;
    } else if (Array.isArray(item.frases)) {
        frase = item.frases[Math.floor(Math.random() * item.frases.length)];
    } else {
        frase = '"Hm."';
    }

    // Chance de reação especial em itens raros+
    let especial = null;
    const roll = Math.random() * 100;
    if (item.raridade === 'lendario' && roll < 25) {
        especial = 'Kaori pareceu genuinamente emocionada por um segundo.';
    } else if (item.raridade === 'mitico' && roll < 40) {
        especial = '✦ Algo mudou entre vocês. A Kaori não vai esquecer isso.';
    } else if (item.raridade === 'epico' && roll < 15) {
        especial = 'Ela guardou o item com mais cuidado do que o normal.';
    }

    return {
        ok: true,
        item,
        frase,
        efeito,
        novo,
        especial,
        raridade: RARIDADE[item.raridade]
    };
}