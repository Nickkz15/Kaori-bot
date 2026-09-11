import { getUser, updateUser } from '../database/database.js';

const ACOES = {
    conversar: {
        nome: '☕ Conversar',
        efeito: { afinidade: 3, confianca: 2, humor: 2 },
        frases: ['"O que foi?"', '"Fala logo."', '"Hm. Continua."', '"Você fala demais, mas... tá bom."']
    },
    jogar: {
        nome: '🎮 Jogar',
        efeito: { afinidade: 4, energia: -5, humor: 5 },
        frases: ['"Você vai perder."', '"Tá. Uma partida."', '"Não chore quando eu ganhar."']
    },
    provocar: {
        nome: '😈 Provocar',
        efeito: { carinho: -2, humor: 6, confianca: 1 },
        frases: ['"Engraçadinho."', '"Você está me testando."', '"Tch. Idiota."', '"...Ok, essa foi boa."']
    },
    elogiar: {
        nome: '💌 Elogiar',
        efeito: { carinho: 5, afinidade: 3 },
        frases: {
            baixo: '"E-ei. Não precisa disso."',
            medio: '"...Obrigada. Eu acho."',
            alto: '"Você fala isso como se fosse fácil."'
        }
    },
    despedir: {
        nome: '🌙 Despedir-se',
        efeito: { carinho: 2, humor: -3 },
        frases: ['"Tchau."', '"Até."', '"Não demora pra voltar... não que eu me importe."']
    },
    abracar: {
        nome: '🤗 Abraçar (virtual)',
        efeito: { carinho: 6, afinidade: 4, confianca: 2 },
        frases: {
            baixo: '"H-hey! Avisa antes."',
            medio: '"...Tá. Só dessa vez."',
            alto: '"Fica mais um pouco."'
        }
    }
};

const SECRETO = {
    id: 'segredo_kaori',
    nome: '🔮 Segredo',
    requisito: { afinidade: 90, carinho: 85 },
    efeito: { afinidade: 5, carinho: 5, confianca: 5 },
    frase: '"...Você descobriu. Não conte pra ninguém. Isso é só nosso."'
};

export async function listarAcoes(guildId, userId) {
    const user = await getUser(guildId, userId);
    const lista = { ...ACOES };
    if (user.afinidade >= SECRETO.requisito.afinidade && user.carinho >= SECRETO.requisito.carinho) {
        lista.segredo = {
            nome: SECRETO.nome,
            efeito: SECRETO.efeito,
            frases: [SECRETO.frase]
        };
    }
    return lista;
}

export async function interagir(guildId, userId, acaoId) {
    const user = await getUser(guildId, userId);
    const agora = Date.now();
    const ultimo = user.last_interagir ? Number(user.last_interagir) : 0;

    if (agora - ultimo < 3 * 60 * 1000) {
        const s = Math.ceil((3 * 60 * 1000 - (agora - ultimo)) / 1000);
        return { ok: false, msg: `Espere mais **${s}s** antes de interagir de novo.` };
    }

    const acoes = await listarAcoes(guildId, userId);
    const acao = acoes[acaoId];
    if (!acao) return { ok: false, msg: 'Essa ação não existe ou ainda não está disponível.' };

    const efeito = acao.efeito || {};
    const novo = {
        carinho: Math.min(100, Math.max(0, user.carinho + (efeito.carinho || 0))),
        confianca: Math.min(100, Math.max(0, user.confianca + (efeito.confianca || 0))),
        afinidade: Math.min(100, Math.max(0, user.afinidade + (efeito.afinidade || 0))),
        humor: Math.min(100, Math.max(0, (user.humor || 50) + (efeito.humor || 0))),
        energia: Math.min(100, Math.max(0, (user.energia || 70) + (efeito.energia || 0))),
        last_interagir: String(agora)
    };

    await updateUser(guildId, userId, novo);

    let frase;
    if (typeof acao.frases === 'object' && !Array.isArray(acao.frases)) {
        const media = (novo.carinho + novo.afinidade) / 2;
        if (media >= 70) frase = acao.frases.alto;
        else if (media >= 40) frase = acao.frases.medio;
        else frase = acao.frases.baixo;
    } else if (Array.isArray(acao.frases)) {
        frase = acao.frases[Math.floor(Math.random() * acao.frases.length)];
    } else {
        frase = '"Hm."';
    }

    return { ok: true, acao, frase, novo, efeito };
}
