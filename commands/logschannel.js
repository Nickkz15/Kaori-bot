import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } from 'discord.js';
import { updateConfessConfig, getConfessConfig } from '../systems/confessDb.js';

export const logschannelCommand = new SlashCommandBuilder()
    .setName('logschannel')
    .setDescription('Define o canal de logs administrativos do Confess')
    .addChannelOption(o =>
        o.setName('channel')
            .setDescription('Canal de logs')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function executeLogschannel(interaction) {
    if (!interaction.guildId) {
        return interaction.reply({ content: 'Só em servidores.', ephemeral: true });
    }

    const channel = interaction.options.getChannel('channel', true);
    await updateConfessConfig(interaction.guildId, { logs_channel_id: channel.id });

    await interaction.reply({
        embeds: [
            new EmbedBuilder()
                .setColor(0x5865F2)
                .setDescription(`Canal de logs do Confess definido para ${channel}.`)
        ],
        ephemeral: true
    });
}
