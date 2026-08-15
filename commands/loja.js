import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { gerarLoja, tempoRestanteLoja, ITENS_CATALOGO, RARIDADE } from '../systems/economy.js';
import { buyFromShop } from '../database/database.js';

export const lojaCommand = new SlashCommandBuilder()
    .setName('loja')
    .setDescription('Loja rotativa da Kaori');

export const comprarCommand = new SlashCommandBuilder()
    .setName('comprar')
    .setDescription('Compra um item da loja atual')
    .addStringOption(o =>
        o.setName('item')
            .setDescription('ID do item (ex: cafe, ursinho, ticket)')
            .setRequired(true)
    );

export async function executeLoja(interaction) {
    const shop = gerarLoja();

    if (!shop.items || shop.items.length === 0) {
        return interaction.reply({ content: 'A loja está vazia. Tente mais tarde.', ephemeral: true });
    }

    const linhas = shop.items.map(i => {
        const r = RARIDADE[i.raridade] || RARIDADE.comum;
        return `${r.emoji} ${i.nome}\nEstoque: \`${i.estoque}/${i.max}\` · **${i.preco.toLocaleString('pt-BR')}** coins · *${r.nome}*`;
    });

    const embed = new EmbedBuilder()
        .setColor(0xff4d6d)
        .setTitle('🛍️ Loja da Kaori')
        .setDescription(linhas.join('\n\n'))
        .addFields({
            name: 'Como comprar',
            value: '`/comprar item:cafe` (use o id: cafe, chocolate, ticket, ursinho...)'
        })
        .setFooter({ text: `🔄 Próxima atualização: ${tempoRestanteLoja()}` });

    await interaction.reply({ embeds: [embed] });
}

export async function executeComprar(interaction) {
    const itemId = interaction.options.getString('item').toLowerCase().trim();
    const result = buyFromShop(interaction.user.id, itemId);

    if (!result.ok) {
        return interaction.reply({ content: result.msg, ephemeral: true });
    }

    const r = RARIDADE[result.item.raridade] || RARIDADE.comum;

    const embed = new EmbedBuilder()
        .setColor(r.cor)
        .setTitle('✅ Compra realizada')
        .setDescription(
            `<@${interaction.user.id}> comprou **${result.item.nome}** ${r.emoji}\n` +
            `Raridade: **${r.nome}**\n\n` +
            `"Tome. Não venha me agradecer."`
        );

    await interaction.reply({ embeds: [embed] });
}