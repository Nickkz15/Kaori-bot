import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { listarMissoes } from '../systems/missions.js';

export const missaoCommand = new SlashCommandBuilder()
    .setName('missao')
    .setDescription('Mostra suas missões diárias e semanais');

export async function executeMissao(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
        return interaction.reply({ content: 'Este comando só funciona em servidores.', ephemeral: true });
    }

    const data = await listarMissoes(guildId, interaction.user.id);

    const fmt = (m, progresso) => {
        if (!m) return 'Nenhuma';
        const p = progresso[m.id] || 0;
        return `**${m.nome}**\n${m.desc}\nProgresso: \`${p}/${m.meta}\``;
    };

    const embed = new EmbedBuilder()
        .setColor(0xff4d6d)
        .setTitle('📋 Missões')
        .addFields(
            { name: 'Diária', value: fmt(data.diaria, data.progresso) },
            { name: 'Semanal', value: fmt(data.semanal, data.progresso) }
        )
        .setFooter({ text: 'Missões resetam automaticamente' });

    await interaction.reply({ embeds: [embed] });
}
