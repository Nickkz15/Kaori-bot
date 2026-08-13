import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getUser } from '../database/database.js';

export const saldoCommand = new SlashCommandBuilder()
    .setName('saldo')
    .setDescription('Mostra quantas Kaori Coins você tem')
    .addUserOption(o => o.setName('usuario').setDescription('Ver o saldo de outra pessoa').setRequired(false));

export async function executeSaldo(interaction) {
    const user = interaction.options.getUser('usuario') || interaction.user;
    const data = getUser(user.id);

    const embed = new EmbedBuilder()
        .setColor(0xff4d6d)
        .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
        .setTitle('💰 Saldo de Kaori Coins')
        .setDescription(
            `**${data.coins.toLocaleString('pt-BR')}** Kaori Coins\n\n` +
            `Nível: **${data.level}**\n` +
            `XP: **${data.xp}** / **${data.level * 100}**`
        )
        .setFooter({ text: 'Kaori • Economia local' })
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}