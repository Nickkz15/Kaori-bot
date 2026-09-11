import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { iniciarEvento, listarEventosDisponiveis } from '../systems/events.js';

export const eventoCommand = new SlashCommandBuilder()
    .setName('evento')
    .setDescription('Participa de um evento com a Kaori (consome tíquete)')
    .addUserOption(o => o.setName('com').setDescription('Com quem? (opcional)').setRequired(false))
    .addStringOption(o =>
        o.setName('ticket')
            .setDescription('Tipo de tíquete')
            .addChoices(
                { name: 'Tíquete normal', value: 'ticket' },
                { name: 'Tíquete dourado', value: 'ticket_dourado' }
            )
    );

export async function executeEvento(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
        return interaction.reply({ content: 'Este comando só funciona em servidores.', ephemeral: true });
    }

    const alvo = interaction.options.getUser('com') || interaction.user;
    const ticketTipo = interaction.options.getString('ticket') || 'ticket';

    const result = await iniciarEvento(guildId, interaction.user.id, alvo.id, ticketTipo);

    if (!result.ok) {
        return interaction.reply({ content: result.msg, ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setColor(0xff4d6d)
        .setTitle(result.evento.nome)
        .setDescription(
            `${result.frase}\n\n` +
            `Diversão: **${result.diversao}%**\n` +
            `Bônus: **+${result.bonusCoins}** coins\n\n` +
            `❤️ Carinho ${result.novo.carinho} · ✨ Afinidade ${result.novo.afinidade}`
        )
        .setFooter({ text: 'Kaori • Eventos' });

    await interaction.reply({ embeds: [embed] });

    try {
        const { progressoMissao } = await import('../systems/missions.js');
        const completadas = await progressoMissao(guildId, interaction.user.id, 'evento', 1);
        if (completadas.length > 0) {
            await interaction.followUp({
                content: `📋 Missão completa!\n${completadas.map(m => `✅ **${m.nome}**`).join('\n')}`,
                ephemeral: true
            });
        }
    } catch {}
}
