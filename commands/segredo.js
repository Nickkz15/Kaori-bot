import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { usarChave } from '../systems/secretGifts.js';
import { getUser } from '../database/database.js';

export const segredoCommand = new SlashCommandBuilder()
    .setName('segredo')
    .setDescription('Usa uma chave secreta ou revela status secreto');

export async function executeSegredo(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
        return interaction.reply({ content: 'Este comando só funciona em servidores.', ephemeral: true });
    }

    const result = await usarChave(guildId, interaction.user.id);

    if (!result.ok) {
        const user = await getUser(guildId, interaction.user.id);
        return interaction.reply({
            content:
                result.msg +
                `\n\nPresentes secretos recebidos: **${user.presentes_secretos || 0}**\n` +
                `Afinidade necessária para mais surpresas: ~30+`,
            ephemeral: true
        });
    }

    const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle('🔑 Chave usada')
        .setDescription(
            `<@${interaction.user.id}> abriu algo secreto...\n\n` +
            `Recompensa: ${result.recompensa}\n\n` +
            `"Não diga que eu te dei isso."`
        );

    await interaction.reply({ embeds: [embed] });
}
