import { getUser, updateUser, addCoins, addXP, addItem } from '../database/database.js';

const MISSOES_DIARIAS = [
    { id: 'trabalhar_3', nome: 'Ajudante da Kaori', desc: 'Trabalhe 3 vezes', tipo: 'trabalhar', meta: 3, recompensa: { coins: 1250, xp: 40 } },
    { id: 'presente_1', nome: 'Pequeno gesto', desc: 'Entregue 1 presente (/usar)', tipo: 'presente', meta: 1, recompensa: { coins: 400, xp: 25 } },
    { id: 'evento_1', nome: 'Companhia', desc: 'Participe de 1 evento', tipo: 'evento', meta: 1, recompensa: { coins: 600, xp: 30, item: 'ticket' } },
    { id: 'diario', nome: 'Rotina', desc: 'Pegue o diário', tipo: 'diario', meta: 1, recompensa: { coins: 450, xp: 20 } },
    { id: 'interagir_2', nome: 'Conversa', desc: 'Use /interagir 2 vezes', tipo: 'interagir', meta: 2, recompensa: { coins: 350, xp: 25 } }
];

const MISSOES_SEMANAIS = [
    { id: 'eventos_5', nome: 'Rotina a dois', desc: 'Faça 5 eventos', tipo: 'evento', meta: 5, recompensa: { coins: 3500, item: 'ticket_dourado' } },
    { id: 'presentes_5', nome: 'Generoso', desc: 'Entregue 5 presentes', tipo: 'presente', meta: 5, recompensa: { coins: 3000, xp: 80 } },
    { id: 'trabalhar_15', nome: 'Dedicação', desc: 'Trabalhe 15 vezes', tipo: 'trabalhar', meta: 15, recompensa: { coins: 4000, xp: 100 } }
];

async function getMissaoState(guildId, userId) {
    const user = await getUser(guildId, userId);
    if (!user.missoes) {
        const missoes = { diaria: null, semanal: null, progresso: {}, resetDiario: null, resetSemanal: null };
        await updateUser(guildId, userId, { missoes });
        return missoes;
    }
    return user.missoes;
}

function semanaId() {
    const d = new Date();
    const onejan = new Date(d.getFullYear(), 0, 1);
    return `${d.getFullYear()}-W${Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7)}`;
}

export async function garantirMissoes(guildId, userId) {
    const hoje = new Date().toISOString().slice(0, 10);
    const sem = semanaId();
    const state = await getMissaoState(guildId, userId);

    if (state.resetDiario !== hoje) {
        const m = MISSOES_DIARIAS[Math.floor(Math.random() * MISSOES_DIARIAS.length)];
        state.diaria = m.id;
        state.progresso[m.id] = 0;
        state.resetDiario = hoje;
    }
    if (state.resetSemanal !== sem) {
        const m = MISSOES_SEMANAIS[Math.floor(Math.random() * MISSOES_SEMANAIS.length)];
        state.semanal = m.id;
        state.progresso[m.id] = 0;
        state.resetSemanal = sem;
    }
    await updateUser(guildId, userId, { missoes: state });
    return state;
}

export async function progressoMissao(guildId, userId, tipo, quantidade = 1) {
    const state = await garantirMissoes(guildId, userId);
    const todas = [...MISSOES_DIARIAS, ...MISSOES_SEMANAIS];
    const completadas = [];

    for (const m of todas) {
        if (m.tipo !== tipo) continue;
        if (state.diaria !== m.id && state.semanal !== m.id) continue;
        if ((state.progresso[m.id] || 0) >= m.meta) continue;

        state.progresso[m.id] = (state.progresso[m.id] || 0) + quantidade;
        if (state.progresso[m.id] >= m.meta) {
            if (m.recompensa.coins) await addCoins(guildId, userId, m.recompensa.coins);
            if (m.recompensa.xp) await addXP(guildId, userId, m.recompensa.xp);
            if (m.recompensa.item) await addItem(guildId, userId, m.recompensa.item, 1);
            completadas.push(m);
        }
    }
    await updateUser(guildId, userId, { missoes: state });
    return completadas;
}

export async function listarMissoes(guildId, userId) {
    const state = await garantirMissoes(guildId, userId);
    const find = id => [...MISSOES_DIARIAS, ...MISSOES_SEMANAIS].find(m => m.id === id);
    return {
        diaria: find(state.diaria),
        semanal: find(state.semanal),
        progresso: state.progresso
    };
}
