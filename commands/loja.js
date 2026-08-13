import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { ITENS_LOJA } from '../systems/economy.js';
import { getUser, removeCoins, addItem } from '../database/database.js';

export const lojaCommand = new SlashCommandBuilder()
    .setName('loja')
    .setDescription('Mostra a loja da Kaori');

export const comprarCommand = new SlashCommandBuilder()
    .setName('comprar')
    .setDescription('Compra um item da loja')
    .addStringOption(o =>
        o.setName('item')
            .setDescription('Qual item?')
            .setRequired(true)
            .addChoices(
                ...Object.values(ITENS_LOJA).map(item => ({
                    name: `${item.emoji} ${item.nome} (${item.preco} coins)`,
                    value: item.id
                }))
            )
    );

export async function executeLoja(interaction) {
    const linhas = Object.values(ITENS_LOJA).map(item =>
        `${item.emoji} **${item.nome}** — \`${item.preco}\` coins\n*${item.descricao}*`
    );

    const embed = new EmbedBuilder()
        .setColor(0xff4d6d)
        .setTitle('🛍️ Loja da Kaori')
        .setDescription(linhas.join('\n\n'))
        .setFooter({ text: 'Use /comprar item:nome para comprar' });

    await interaction.reply({ embeds: [embed] });
}

export async function executeComprar(interaction) {
    const itemId = interaction.options.getString('item');
    const item = ITENS_LOJA[itemId];

    if (!item) {
        return interaction.reply({ content: 'Esse item não existe.', ephemeral: true });
    }

    const user = getUser(interaction.user.id);

    if (user.coins < item.preco) {
        return interaction.reply({
            content: `Você precisa de **${item.preco}** coins.\nVocê tem apenas **${user.coins}**.`,
            ephemeral: true
        });
    }

    removeCoins(interaction.user.id, item.preco);
    addItem(interaction.user.id, itemId, 1);

    const embed = new EmbedBuilder()
        .setColor(0xff4d6d)
        .setTitle('✅ Compra realizada')
        .setDescription(
            `<@${interaction.user.id}> comprou **${item.nome}**!\n\n` +
            `"Tome. Não venha me agradecer."`
        );

    await interaction.reply({ embeds: [embed] });
}