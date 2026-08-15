import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getInventory } from '../database/database.js';
import { ITENS_CATALOGO, RARIDADE } from '../systems/economy.js';

export const inventarioCommand = new SlashCommandBuilder()
    .setName('inventario')
    .setDescription('Mostra seus itens');

export async function executeInventario(interaction) {
    const inv = getInventory(interaction.user.id);

    if (inv.length === 0) {
        return interaction.reply({ content: 'Seu inventário está vazio.\n"Surpreendente."', ephemeral: true });
    }

    const linhas = inv.map(({ item, quantidade }) => {
        const info = ITENS_CATALOGO[item];
        const r = info ? RARIDADE[info.raridade] : null;
        const nome = info ? info.nome : item;
        const emojiR = r ? r.emoji : '⚪';
        return `${emojiR} ${nome} × **${quantidade}**`;
    });

    const embed = new EmbedBuilder()
        .setColor(0xff4d6d)
        .setTitle('🎒 Inventário')
        .setDescription(linhas.join('\n'))
        .setFooter({ text: '/usar item:id  ·  /evento (tíquetes)' });

    await interaction.reply({ embeds: [embed] });
}