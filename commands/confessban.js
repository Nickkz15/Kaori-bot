import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { banConfessUser, getConfessConfig } from '../systems/confessDb.js';

export const confessbanCommand = new SlashCommandBuilder()
    .setName('confessban')
    .setDescription('Impede um membro de usar o sistema Confess')
    .addUserOption(o => o.setName('user').setDescription('Usuário').setRequired(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo (opcional)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function executeConfessban(interaction) {
    if (!interaction.guildId) {
        return interaction.reply({ content: 'Só em servidores.', ephemeral: true });
    }

    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('motivo') || null;

    if (user.bot) {
        return interaction.reply({ content: 'Não é possível banir bots do Confess.', ephemeral: true });
    }

    await banConfessUser(interaction.guildId, user.id, interaction.user.id, reason);

    const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setDescription(`**${user.tag}** foi banido do sistema Confess.` + (reason ? `\nMotivo: ${reason}` : ''))
        .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });

    try {
        const config = await getConfessConfig(interaction.guildId);
        if (config.logs_channel_id) {
            const logCh = await interaction.guild.channels.fetch(config.logs_channel_id).catch(() => null);
            if (logCh?.isTextBased()) {
                await logCh.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xed4245)
                            .setTitle('Confess Ban')
                            .addFields(
                                { name: 'Usuário', value: `${user} (\`${user.id}\`)` },
                                { name: 'Admin', value: `${interaction.user} (\`${interaction.user.id}\`)` },
                                { name: 'Motivo', value: reason || '—' }
                            )
                            .setTimestamp()
                    ],
                    allowedMentions: { parse: [] }
                });
            }
        }
    } catch (e) {
        console.error('confessban log:', e.message);
    }
}
