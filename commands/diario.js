import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { dailyReward } from '../systems/economy.js';

export const diarioCommand = new SlashCommandBuilder()
    .setName('diario')
    .setDescription('Recebe sua recompensa diária da Kaori');

export async function executeDiario(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
        return interaction.reply({ content: 'Este comando só funciona em servidores.', ephemeral: true });
    }

    const result = await dailyReward(guildId, interaction.user.id);

    if (!result.ok) {
        return interaction.reply({ content: result.msg, ephemeral: true });
    }

    let extra = '';
    if (result.streak >= 3) {
        extra += `\n🔥 **Streak: ${result.streak} dias** (${Math.round((result.multiplicador - 1) * 100)}% de bônus)`;
    }

    const embed = new EmbedBuilder()
        .setColor(0xff4d6d)
        .setTitle('📅 Diário da Kaori')
        .setDescription(
            `<@${interaction.user.id}> recebeu **${result.recompensa}** Kaori Coins!` +
            extra +
            `\n\nNovo saldo: **${result.novoSaldo.toLocaleString('pt-BR')}**\n\n` +
            `"Tome. Não gaste tudo de uma vez."`
        )
        .setFooter({ text: 'Volte amanhã • Allied' });

    await interaction.reply({ embeds: [embed] });

    if (result.xpResult?.leveledUp) {
        try {
            const { enviarLevelUp } = await import('../systems/notifications.js');
            await enviarLevelUp(interaction, result.xpResult.level, result.xpResult.levelsGained);
        } catch {}
    }

    try {
        const { progressoMissao } = await import('../systems/missions.js');
        const completadas = await progressoMissao(guildId, interaction.user.id, 'diario', 1);
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
