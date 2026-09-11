import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { interagir, listarAcoes } from '../systems/interaction.js';

export const interagirCommand = new SlashCommandBuilder()
    .setName('interagir')
    .setDescription('Interage com a Kaori')
    .addStringOption(o =>
        o.setName('acao')
            .setDescription('Tipo de interação')
            .setRequired(true)
            .addChoices(
                { name: 'Conversar', value: 'conversar' },
                { name: 'Jogar', value: 'jogar' },
                { name: 'Provocar', value: 'provocar' },
                { name: 'Elogiar', value: 'elogiar' },
                { name: 'Despedir-se', value: 'despedir' },
                { name: 'Abraçar', value: 'abracar' },
                { name: 'Segredo', value: 'segredo' }
            )
    );

export async function executeInteragir(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
        return interaction.reply({ content: 'Este comando só funciona em servidores.', ephemeral: true });
    }

    const acaoId = interaction.options.getString('acao');
    const result = await interagir(guildId, interaction.user.id, acaoId);

    if (!result.ok) {
        return interaction.reply({ content: result.msg, ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setColor(0xff4d6d)
        .setTitle(result.acao.nome)
        .setDescription(
            `${result.frase}\n\n` +
            `❤️ ${result.novo.carinho} · 🤝 ${result.novo.confianca} · ✨ ${result.novo.afinidade}`
        );

    await interaction.reply({ embeds: [embed] });

    try {
        const { progressoMissao } = await import('../systems/missions.js');
        const completadas = await progressoMissao(guildId, interaction.user.id, 'interagir', 1);
        if (completadas.length > 0) {
            await interaction.followUp({
                content: `📋 Missão completa!\n${completadas.map(m => `✅ **${m.nome}**`).join('\n')}`,
                ephemeral: true
            });
        }
    } catch {}
}
