import { EmbedBuilder } from 'discord.js';
import { ACHIEVEMENTS } from './achievements.js';

/**
 * Envia notificação de Level Up (embed separado e bonito)
 */
export async function enviarLevelUp(interaction, level, levelsGained = 1) {
    const frases = [
        `Parabéns. Você passou tempo demais aqui.`,
        `Nível ${level}... não sei se devo me impressionar.`,
        `Você subiu de nível. Tente não se achar demais.`,
        `Hm. Continuando a evoluir, hein?`,
        `Nível ${level}. Aceitável.`
    ];

    const frase = frases[Math.floor(Math.random() * frases.length)];

    const embed = new EmbedBuilder()
        .setColor(0x57f287) // verde de sucesso
        .setTitle('🎉 LEVEL UP!')
        .setDescription(
            `<@${interaction.user.id}> alcançou o **nível ${level}**!` +
            (levelsGained > 1 ? `\n(+${levelsGained} níveis de uma vez)` : '') +
            `\n\n*"${frase}"*`
        )
        .setThumbnail(interaction.user.displayAvatarURL({ size: 256 }))
        .setFooter({ text: 'Kaori • Sistema de Progresso' })
        .setTimestamp();

    // Envia como follow-up (não sobrescreve a resposta principal)
    try {
        await interaction.followUp({ embeds: [embed] });
    } catch {
        // Se não puder followUp, tenta no canal
        await interaction.channel.send({ embeds: [embed] });
    }
}

/**
 * Envia notificação de Conquista (embed separado)
 */
export async function enviarConquista(interaction, achievementIds = []) {
    if (!achievementIds || achievementIds.length === 0) return;

    for (const id of achievementIds) {
        const ach = ACHIEVEMENTS[id];
        if (!ach) continue;

        const embed = new EmbedBuilder()
            .setColor(0xffd700) // dourado
            .setTitle('🏅 Conquista Desbloqueada!')
            .setDescription(
                `${ach.emoji} **${ach.nome}**\n` +
                `*${ach.descricao}*\n\n` +
                `<@${interaction.user.id}>`
            )
            .setFooter({ text: 'Kaori • Conquistas' })
            .setTimestamp();

        try {
            await interaction.followUp({ embeds: [embed] });
        } catch {
            await interaction.channel.send({ embeds: [embed] });
        }
    }
}

/**
 * Versão combinada (quando sobe de nível E ganha conquista ao mesmo tempo)
 */
export async function enviarProgresso(interaction, { levelUp = null, conquistas = [] } = {}) {
    if (levelUp?.leveledUp) {
        await enviarLevelUp(interaction, levelUp.level, levelUp.levelsGained);
    }

    if (conquistas.length > 0) {
        // Pequeno delay para não ficar spam de embeds
        await new Promise(r => setTimeout(r, 600));
        await enviarConquista(interaction, conquistas);
    }
}