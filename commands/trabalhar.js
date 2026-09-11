import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { work } from '../systems/economy.js';

export const trabalharCommand = new SlashCommandBuilder()
    .setName('trabalhar')
    .setDescription('Trabalha para a Kaori e ganha coins + XP');

export async function executeTrabalhar(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
        return interaction.reply({ content: 'Este comando só funciona em servidores.', ephemeral: true });
    }

    const result = await work(guildId, interaction.user.id);

    if (!result.ok) {
        return interaction.reply({ content: result.msg, ephemeral: true });
    }

    let levelUpText = '';
    if (result.xpResult?.leveledUp) {
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
        .setFooter({ text: 'Cooldown de 45 minutos' });

    await interaction.reply({ embeds: [embed] });

    if (result.xpResult?.leveledUp) {
        try {
            const { enviarLevelUp } = await import('../systems/notifications.js');
            await enviarLevelUp(interaction, result.xpResult.level, result.xpResult.levelsGained);
        } catch {}
    }

    try {
        const { progressoMissao } = await import('../systems/missions.js');
        const completadas = await progressoMissao(guildId, interaction.user.id, 'trabalhar', 1);
        if (completadas.length > 0) {
            await interaction.followUp({
                content: `📋 Missão completa!\n${completadas.map(m => `✅ **${m.nome}**`).join('\n')}`,
                ephemeral: true
            });
        }
    } catch {}

    try {
        const { tentarPresenteSecreto } = await import('../systems/secretGifts.js');
        const secreto = await tentarPresenteSecreto(guildId, interaction.user.id);
        if (secreto) {
            await interaction.followUp({
                embeds: [{
                    color: 0x9b59b6,
                    title: '🎁 Presente Secreto',
                    description: `Kaori deixou algo pra você...\n\n**${secreto.item.nome}**\n${secreto.frase}`
                }],
                ephemeral: true
            });
        }
    } catch {}
}
