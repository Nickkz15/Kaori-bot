import { getUser, updateUser, addItem, getInventory, removeItem, addCoins } from '../database/database.js';
import { ITENS_CATALOGO } from './economy.js';

const PRESENTES_SECRETOS = [
    { item: 'bala', chance: 40, frase: '"Achei isso no bolso. Pode ficar."' },
    { item: 'cafe', chance: 25, frase: '"Toma. Você parece precisar."' },
    { item: 'chocolate', chance: 15, frase: '"Não se acostume com presentes."' },
    { item: 'cartinha', chance: 10, frase: '"...Eu escrevi isso ontem. Não leia agora."' },
    { item: 'ticket', chance: 7, frase: '"Use bem. Ou não use. Tanto faz."' },
    { item: 'chave', chance: 3, frase: '"Isso abre algo especial. Guarde."' }
];

export async function tentarPresenteSecreto(guildId, userId) {
    const user = await getUser(guildId, userId);

    if ((user.afinidade || 0) < 30) return null;
    if (Math.random() > 0.12) return null;

    const roll = Math.random() * 100;
    let acumulado = 0;
    let escolhido = null;
    let frase = null;

    for (const p of PRESENTES_SECRETOS) {
        acumulado += p.chance;
        if (roll <= acumulado) {
            escolhido = p.item;
            frase = p.frase;
            break;
        }
    }

    if (!escolhido) return null;

    await addItem(guildId, userId, escolhido, 1);
    await updateUser(guildId, userId, {
        presentes_secretos: (user.presentes_secretos || 0) + 1
    });

    const item = ITENS_CATALOGO[escolhido] || { nome: escolhido, id: escolhido };
    return { item, frase };
}

export async function usarChave(guildId, userId) {
    const inv = await getInventory(guildId, userId);
    const chave = inv.find(i => i.item === 'chave' && i.quantidade > 0);
    if (!chave) return { ok: false, msg: 'Você não tem uma chave.' };

    await removeItem(guildId, userId, 'chave', 1);

    const roll = Math.random();
    let recompensa;

    if (roll < 0.4) {
        await addCoins(guildId, userId, 5000);
        recompensa = '**5.000** Kaori Coins';
    } else if (roll < 0.7) {
        await addItem(guildId, userId, 'ticket_dourado', 1);
        recompensa = '🎫 **Tíquete Dourado**';
    } else if (roll < 0.9) {
        await addItem(guildId, userId, 'foto', 1);
        recompensa = '📷 **Foto da Kaori**';
    } else {
        await addItem(guildId, userId, 'coracao_kaori', 1);
        recompensa = '💖 **Coração da Kaori**';
    }

    return { ok: true, recompensa };
}
