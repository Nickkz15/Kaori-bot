import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { transferir } from '../systems/economy.js';

export const pagarCommand = new SlashCommandBuilder()
    .setName('pagar')
    .setDescription('Transfere Kaori Coins para outra pessoa')
    .addUserOption(o => o.setName('usuario').setDescription('Para quem?').setRequired(true))
    .addIntegerOption(o => o.setName('quantidade').setDescription('Quantas coins?').setRequired(true).setMinValue(1));

export async function executePagar(interaction) {
    const alvo = interaction.options.getUser('usuario');
    const quantidade = interaction.options.getInteger('quantidade');

    if (alvo.bot) {
        return interaction.reply({ content: 'Não dá para pagar bots.', ephemeral: true });
    }

    const result = transferir(interaction.user.id, alvo.id, quantidade);

    if (!result.ok) {
        return interaction.reply({ content: result.msg, ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setColor(0xff4d6d)
        .setDescription(
            `<@${interaction.user.id}> pagou **${quantidade.toLocaleString('pt-BR')}** Kaori Coins para <@${alvo.id}>.\n\n` +
            `"Que generoso... ou desesperado."`
        );

    await interaction.reply({ embeds: [embed] });
}