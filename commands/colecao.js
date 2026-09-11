import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getInventory } from '../database/database.js';
import { ITENS_CATALOGO, RARIDADE } from '../systems/economy.js';

export const colecaoCommand = new SlashCommandBuilder()
    .setName('colecao')
    .setDescription('Mostra o catálogo de itens e o que você já possui');

export async function executeColecao(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
        return interaction.reply({ content: 'Este comando só funciona em servidores.', ephemeral: true });
    }

    const inv = await getInventory(guildId, interaction.user.id);
    const owned = new Set(inv.map(i => i.item));

    const linhas = Object.values(ITENS_CATALOGO).map(item => {
        const r = RARIDADE[item.raridade] || RARIDADE.comum;
        const mark = owned.has(item.id) ? '✅' : '⬜';
        return `${mark} ${r.emoji} ${item.nome} · *${r.nome}*`;
    });

    const embed = new EmbedBuilder()
        .setColor(0xff4d6d)
        .setTitle('📚 Coleção da Kaori')
        .setDescription(linhas.join('\n'))
        .setFooter({ text: `${owned.size}/${Object.keys(ITENS_CATALOGO).length} coletados` });

    await interaction.reply({ embeds: [embed] });
}
