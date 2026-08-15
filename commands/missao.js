import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { listarMissoes } from '../systems/missions.js';

export const missaoCommand = new SlashCommandBuilder()
    .setName('missao')
    .setDescription('Mostra suas missões diárias e semanais');

export async function executeMissao(interaction) {
    const { diaria, semanal, progresso } = listarMissoes(interaction.user.id);

    const fmt = (m) => {
        if (!m) return 'Nenhuma';
        const p = progresso[m.id] || 0;
        const bar = '█'.repeat(Math.min(10, Math.floor((p / m.meta) * 10))) + '░'.repeat(10 - Math.min(10, Math.floor((p / m.meta) * 10)));
        const rec = [];
        if (m.recompensa.coins) rec.push(`💰 ${m.recompensa.coins}`);
        if (m.recompensa.xp) rec.push(`✨ ${m.recompensa.xp} XP`);
        if (m.recompensa.item) rec.push(`🎁 ${m.recompensa.item}`);
        return `**${m.nome}**\n${m.desc}\n\`${bar}\` ${p}/${m.meta}\nRecompensa: ${rec.join(' · ')}`;
    };

    const embed = new EmbedBuilder()
        .setColor(0xff4d6d)
        .setTitle('📋 Missões')
        .addFields(
            { name: '📅 Diária', value: fmt(diaria) },
            { name: '📆 Semanal', value: fmt(semanal) }
        )
        .setFooter({ text: 'Missões resetam automaticamente' });

    await interaction.reply({ embeds: [embed] });
}