import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getInventory, removeItem } from '../database/database.js';
import { ITENS_CATALOGO, RARIDADE } from '../systems/economy.js';
import { usarItem } from '../systems/items.js';

export const presenteCommand = new SlashCommandBuilder()
    .setName('presente')
    .setDescription('Entrega um presente para a Kaori')
    .addStringOption(o =>
        o.setName('item')
            .setDescription('ID do item de presente')
            .setRequired(true)
    );

export async function executePresente(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
        return interaction.reply({ content: 'Este comando só funciona em servidores.', ephemeral: true });
    }

    const itemId = interaction.options.getString('item').toLowerCase().trim();
    const item = ITENS_CATALOGO[itemId];

    if (!item || (item.tipo !== 'presente' && item.tipo !== 'carta')) {
        return interaction.reply({
            content: 'Esse item não é um presente válido. Use itens como chocolate, flor, ursinho...',
            ephemeral: true
        });
    }

    const result = await usarItem(guildId, interaction.user.id, itemId);

    if (!result.ok) {
        return interaction.reply({ content: result.msg, ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setColor(result.raridade?.cor || 0xff4d6d)
        .setTitle('🎁 Presente entregue')
        .setDescription(
            `<@${interaction.user.id}> deu **${result.item.nome}** para a Kaori.\n\n` +
            `${result.frase}` +
            (result.especial ? `\n\n*${result.especial}*` : '')
        );

    await interaction.reply({ embeds: [embed] });

    try {
        const { progressoMissao } = await import('../systems/missions.js');
        const completadas = await progressoMissao(guildId, interaction.user.id, 'presente', 1);
        if (completadas.length > 0) {
            await interaction.followUp({
                content: `📋 Missão completa!\n${completadas.map(m => `✅ **${m.nome}**`).join('\n')}`,
                ephemeral: true
            });
        }
    } catch {}
}
