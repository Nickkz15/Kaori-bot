import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getAchievements } from '../database/database.js';
import { ACHIEVEMENTS } from '../systems/achievements.js';

export const conquistasCommand = new SlashCommandBuilder()
    .setName('conquistas')
    .setDescription('Mostra suas conquistas')
    .addUserOption(o => o.setName('usuario').setDescription('De quem?').setRequired(false));

export async function executeConquistas(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
        return interaction.reply({ content: 'Este comando só funciona em servidores.', ephemeral: true });
    }

    const user = interaction.options.getUser('usuario') || interaction.user;
    const unlocked = await getAchievements(guildId, user.id);
    const unlockedIds = new Set(unlocked.map(a => a.achievement_id));

    const linhas = Object.values(ACHIEVEMENTS).map(a => {
        const ok = unlockedIds.has(a.id);
        return `${ok ? a.emoji : '🔒'} **${a.nome}** — ${a.descricao}`;
    });

    const embed = new EmbedBuilder()
        .setColor(0xffd700)
        .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
        .setTitle('🏅 Conquistas')
        .setDescription(linhas.join('\n'))
        .setFooter({ text: `${unlocked.length}/${Object.keys(ACHIEVEMENTS).length} desbloqueadas` });

    await interaction.reply({ embeds: [embed] });
}
