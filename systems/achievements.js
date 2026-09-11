import { getActionCount, getUser, unlockAchievement, getAchievements } from '../database/database.js';

export const ACHIEVEMENTS = {
    primeiro_abraco: {
        id: 'primeiro_abraco',
        nome: 'Primeiro Abraço',
        descricao: 'Abraçou alguém pela primeira vez.',
        emoji: '🤗'
    },
    problematico: {
        id: 'problematico',
        nome: 'Problemático',
        descricao: 'Usou /kaori slap 25 vezes.',
        emoji: '😈'
    },
    carinhoso: {
        id: 'carinhoso',
        nome: 'Carinhoso',
        descricao: 'Usou /kaori hug 50 vezes.',
        emoji: '💖'
    },
    casamenteiro: {
        id: 'casamenteiro',
        nome: 'Casamenteiro',
        descricao: 'Usou /ship 50 vezes.',
        emoji: '💍'
    },
    favorito: {
        id: 'favorito',
        nome: 'Favorito da Kaori',
        descricao: 'Atingiu 80 de afinidade com a Kaori.',
        emoji: '⭐'
    },
    veterano: {
        id: 'veterano',
        nome: 'Veterano',
        descricao: 'Alcançou o nível 30.',
        emoji: '🏆'
    },
    rico: {
        id: 'rico',
        nome: 'Rico',
        descricao: 'Acumulou 10.000 Kaori Coins.',
        emoji: '💰'
    },
    colecionador: {
        id: 'colecionador',
        nome: 'Colecionador',
        descricao: 'Comprou todos os itens da loja pelo menos uma vez.',
        emoji: '🛍️'
    }
};

// Re-exporta para outros arquivos poderem usar
export { unlockAchievement, getAchievements };

export function checkAndUnlock(userId, context = {}) {
    const unlocked = [];
    const action = context.action;

    // ----- Conquistas baseadas em ações -----
    if (action === 'hug') {
        const count = getActionCount(guildId, userId, 'hug');
        if (count === 1 && unlockAchievement(userId, 'primeiro_abraco')) {
            unlocked.push('primeiro_abraco');
        }
        if (count >= 50 && unlockAchievement(userId, 'carinhoso')) {
            unlocked.push('carinhoso');
        }
    }

    if (action === 'slap') {
        const count = getActionCount(guildId, userId, 'slap');
        if (count >= 25 && unlockAchievement(userId, 'problematico')) {
            unlocked.push('problematico');
        }
    }

    if (action === 'ship') {
        const count = getActionCount(guildId, userId, 'ship');
        if (count >= 50 && unlockAchievement(userId, 'casamenteiro')) {
            unlocked.push('casamenteiro');
        }
    }

    // ----- Conquistas baseadas em status do usuário -----
    const user = getUser(guildId, userId);

    if (user.afinidade >= 80 && unlockAchievement(userId, 'favorito')) {
        unlocked.push('favorito');
    }

    if (user.level >= 30 && unlockAchievement(userId, 'veterano')) {
        unlocked.push('veterano');
    }

    if (user.coins >= 10000 && unlockAchievement(userId, 'rico')) {
        unlocked.push('rico');
    }

    return unlocked;
}