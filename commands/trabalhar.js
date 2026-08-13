import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { work } from '../systems/economy.js';

export const trabalharCommand = new SlashCommandBuilder()
    .setName('trabalhar')
    .setDescription('Trabalha para a Kaori e ganha coins + XP');

export async function executeTrabalhar(interaction) {
    const result = work(interaction.user.id);

    if (!result.ok) {
        return interaction.reply({ content: result.msg, ephemeral: true });
    }

    let levelUpText = '';
    if (result.xpResult.leveledUp) {
        levelUpText = `\n\n🎉 **LEVEL UP!** Nível **${result.xpResult.level}** alcançado!`;
    }

    const embed = new EmbedBuilder()
        .setColor(0xff4d6d)
        .setTitle('💼 Trabalho')
        .setDescription(
            `<@${interaction.user.id}> foi **${result.trabalho}**.\n\n` +
            `Ganhou **${result.ganho}** Kaori Coins` +
            levelUpText +
            `\n\n"Não fique esperando elogio."`
        )
        .setFooter({ text: 'Cooldown de 25 minutos' });

        await interaction.reply({ embeds: [embed] });

if (result.xpResult?.leveledUp) {
    const { enviarLevelUp } = await import('../systems/notifications.js');
    await enviarLevelUp(interaction, result.xpResult.level, result.xpResult.levelsGained);
}

    await interaction.reply({ embeds: [embed] });
}