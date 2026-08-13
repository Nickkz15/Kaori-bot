import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { ACHIEVEMENTS, getAchievements } from '../systems/achievements.js';

export const conquistasCommand = new SlashCommandBuilder()
    .setName('conquistas')
    .setDescription('Mostra suas conquistas')
    .addUserOption(o => o.setName('usuario').setDescription('De outra pessoa').setRequired(false));

export async function executeConquistas(interaction) {
    const user = interaction.options.getUser('usuario') || interaction.user;
    const desbloqueadas = getAchievements(user.id).map(a => a.achievement_id);

    const linhas = Object.values(ACHIEVEMENTS).map(ach => {
        const tem = desbloqueadas.includes(ach.id);
        return `${tem ? '✅' : '🔒'} ${ach.emoji} **${ach.nome}**\n${ach.descricao}`;
    });

    const embed = new EmbedBuilder()
        .setColor(0xff4d6d)
        .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
        .setTitle('🏅 Conquistas')
        .setDescription(linhas.join('\n\n'))
        .setFooter({ text: `${desbloqueadas.length}/${Object.keys(ACHIEVEMENTS).length} desbloqueadas` });

    await interaction.reply({ embeds: [embed] });
}