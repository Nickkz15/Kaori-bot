import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getTopCoins, getTopLevel } from '../database/database.js';

export const rankCommand = new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Mostra os rankings do servidor')
    .addStringOption(o =>
        o.setName('tipo')
            .setDescription('Qual ranking?')
            .addChoices(
                { name: 'Coins', value: 'coins' },
                { name: 'Nível', value: 'level' }
            )
    );

export async function executeRank(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
        return interaction.reply({ content: 'Este comando só funciona em servidores.', ephemeral: true });
    }

    const tipo = interaction.options.getString('tipo') || 'coins';

    let lista;
    let titulo;

    if (tipo === 'level') {
        lista = await getTopLevel(guildId, 10);
        titulo = '🏆 Ranking de Nível';
    } else {
        lista = await getTopCoins(guildId, 10);
        titulo = '💰 Ranking de Kaori Coins';
    }

    if (lista.length === 0) {
        return interaction.reply({ content: 'Ainda não tem ninguém no ranking.', ephemeral: true });
    }

    const linhas = lista.map((u, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**${i + 1}.**`;
        if (tipo === 'level') {
            return `${medal} <@${u.user_id}> — Nível **${u.level}** (${u.xp} XP)`;
        }
        return `${medal} <@${u.user_id}> — **${u.coins.toLocaleString('pt-BR')}** coins`;
    });

    const embed = new EmbedBuilder()
        .setColor(0xff4d6d)
        .setTitle(titulo)
        .setDescription(linhas.join('\n'))
        .setFooter({ text: 'Kaori • Ranking local' })
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}
