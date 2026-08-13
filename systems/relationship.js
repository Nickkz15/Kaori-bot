import { getUser, updateUser } from '../database/database.js';

const MODIFICADORES = {
    hug:     { carinho: +3, confianca: +1, afinidade: +2 },
    pat:     { carinho: +2, confianca: +1, afinidade: +1 },
    cuddle:  { carinho: +4, confianca: +2, afinidade: +3 },
    kiss:    { carinho: +5, confianca: +2, afinidade: +4 },
    highfive:{ carinho: +1, confianca: +3, afinidade: +1 },
    slap:    { carinho: -3, confianca: -2, afinidade: -1 },
    bonk:    { carinho: -1, confianca: -1, afinidade:  0 },
    poke:    { carinho: +1, confianca:  0, afinidade: +1 },
    bite:    { carinho: +2, confianca: -1, afinidade: +2 },
    tickle:  { carinho: +2, confianca: +1, afinidade: +1 }
};

export function aplicarAcaoRelacionamento(userId, acao) {
    const mods = MODIFICADORES[acao];
    if (!mods) return null;

    const user = getUser(userId);

    const novo = {
        carinho: Math.max(0, Math.min(100, user.carinho + (mods.carinho || 0))),
        confianca: Math.max(0, Math.min(100, user.confianca + (mods.confianca || 0))),
        afinidade: Math.max(0, Math.min(100, user.afinidade + (mods.afinidade || 0)))
    };

    updateUser(userId, novo);
    return novo;
}

export function getRelacionamento(userId) {
    const user = getUser(userId);
    const media = Math.round((user.carinho + user.confianca + user.afinidade) / 3);

    let status = 'Estranho';
    let cor = 0x99aab5;
    let frase = 'Você ainda é só mais um nome na lista.';

    if (media >= 90) {
        status = 'Muito Próximo';
        cor = 0xff4d6d;
        frase = 'Hm... você realmente não é tão insuportável quanto eu imaginava.';
    } else if (media >= 75) {
        status = 'Próximo';
        cor = 0xff6b81;
        frase = 'Você está começando a me agradar. Não se acostume.';
    } else if (media >= 55) {
        status = 'Amigável';
        cor = 0xf8a5c2;
        frase = 'Aceitável. Continua assim.';
    } else if (media >= 35) {
        status = 'Conhecido';
        cor = 0xfeca57;
        frase = 'Eu já te vi por aí. E daí?';
    } else if (media >= 15) {
        status = 'Distante';
        cor = 0x54a0ff;
        frase = 'Quem é você mesmo?';
    }

    return {
        carinho: user.carinho,
        confianca: user.confianca,
        afinidade: user.afinidade,
        media,
        status,
        cor,
        frase
    };
}