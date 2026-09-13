import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { unbanConfessUser, getConfessConfig } from '../systems/confessDb.js';

export const confessunbanCommand = new SlashCommandBuilder()
    .setName('confessunban')
    .setDescription('Remove o banimento do sistema Confess')
    .addUserOption(o => o.setName('user').setDescription('Usuário').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function executeConfessunban(interaction) {
    if (!interaction.guildId) {
        return interaction.reply({ content: 'Só em servidores.', ephemeral: true });
    }

    const user = interaction.options.getUser('user', true);
    const removed = await unbanConfessUser(interaction.guildId, user.id);

    if (!removed) {
        return interaction.reply({ content: 'Esse usuário não estava banido do Confess.', ephemeral: true });
    }

    await interaction.reply({
        embeds: [
            new EmbedBuilder()
                .setColor(0x57f287)
                .setDescription(`**${user.tag}** foi desbanido do sistema Confess.`)
                .setTimestamp()
        ],
        ephemeral: true
    });

    try {
        const config = await getConfessConfig(interaction.guildId);
        if (config.logs_channel_id) {
            const logCh = await interaction.guild.channels.fetch(config.logs_channel_id).catch(() => null);
            if (logCh?.isTextBased()) {
                await logCh.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x57f287)
                            .setTitle('Confess Unban')
                            .addFields(
                                { name: 'Usuário', value: `${user} (\`${user.id}\`)` },
                                { name: 'Admin', value: `${interaction.user}` }
                            )
                            .setTimestamp()
                    ],
                    allowedMentions: { parse: [] }
                });
            }
        }
    } catch (e) {
        console.error('confessunban log:', e.message);
    }
}
