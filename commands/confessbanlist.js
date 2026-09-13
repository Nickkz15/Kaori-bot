import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { listConfessBans } from '../systems/confessDb.js';

export const confessbanlistCommand = new SlashCommandBuilder()
    .setName('confessbanlist')
    .setDescription('Lista membros banidos do sistema Confess')
    .addIntegerOption(o =>
        o.setName('pagina').setDescription('Página').setMinValue(1).setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function executeConfessbanlist(interaction) {
    if (!interaction.guildId) {
        return interaction.reply({ content: 'Só em servidores.', ephemeral: true });
    }

    const page = interaction.options.getInteger('pagina') || 1;
    const perPage = 10;
    const offset = (page - 1) * perPage;
    const { rows, total } = await listConfessBans(interaction.guildId, perPage, offset);

    if (total === 0) {
        return interaction.reply({ content: 'Nenhum usuário banido do Confess.', ephemeral: true });
    }

    const pages = Math.max(1, Math.ceil(total / perPage));
    const lines = rows.map((r, i) => {
        const n = offset + i + 1;
        const reason = r.reason ? ` — ${r.reason}` : '';
        const ts = r.created_at ? `<t:${Math.floor(new Date(r.created_at).getTime() / 1000)}:d>` : '—';
        return `**${n}.** <@${r.user_id}> (\`${r.user_id}\`)\nAdmin: <@${r.banned_by}> · ${ts}${reason}`;
    });

    const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('Confess Ban List')
        .setDescription(lines.join('\n\n'))
        .setFooter({ text: `Página ${page}/${pages} · Total: ${total}` })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
}
