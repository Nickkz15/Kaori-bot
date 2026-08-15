import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getInventory, getUser } from '../database/database.js';
import { ITENS_CATALOGO, RARIDADE } from '../systems/economy.js';

export const colecaoCommand = new SlashCommandBuilder()
    .setName('colecao')
    .setDescription('Mostra sua coleção de itens descobertos');

export async function executeColecao(interaction) {
    const inv = getInventory(interaction.user.id);
    const user = getUser(interaction.user.id);
    const descobertos = new Set(inv.map(i => i.item));

    // Itens que já usou/ganhou ficam "descobertos" mesmo com 0
    if (!user.colecao) user.colecao = [];
    for (const id of descobertos) {
        if (!user.colecao.includes(id)) user.colecao.push(id);
    }

    const total = Object.keys(ITENS_CATALOGO).length;
    const linhas = Object.values(ITENS_CATALOGO).map(item => {
        const tem = user.colecao.includes(item.id) || descobertos.has(item.id);
        const r = RARIDADE[item.raridade];
        const qtd = inv.find(i => i.item === item.id)?.quantidade || 0;
        return tem
            ? `${r.emoji} ${item.nome} ${qtd > 0 ? `×${qtd}` : '✓'}`
            : `⬛ ??? *(${r.nome})*`;
    });

    const embed = new EmbedBuilder()
        .setColor(0xff4d6d)
        .setTitle('📚 Coleção da Kaori')
        .setDescription(linhas.join('\n'))
        .setFooter({ text: `Descobertos: ${user.colecao.length + [...descobertos].filter(i => !user.colecao.includes(i)).length}/${total}` });

    await interaction.reply({ embeds: [embed] });
}