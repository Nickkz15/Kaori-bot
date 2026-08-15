import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getInventory, removeItem, addItem, getUser, updateUser } from '../database/database.js';
import { ITENS_CATALOGO, RARIDADE } from '../systems/economy.js';
import { progressoMissao } from '../systems/missions.js';

export const presenteCommand = new SlashCommandBuilder()
    .setName('presente')
    .setDescription('Presenteia outro usuário com um item')
    .addUserOption(o => o.setName('usuario').setDescription('Para quem?').setRequired(true))
    .addStringOption(o => o.setName('item').setDescription('ID do item').setRequired(true));

export async function executePresente(interaction) {
    const alvo = interaction.options.getUser('usuario');
    const itemId = interaction.options.getString('item').toLowerCase().trim();

    if (alvo.bot) return interaction.reply({ content: 'Não dá pra presentear bots.', ephemeral: true });
    if (alvo.id === interaction.user.id) return interaction.reply({ content: 'Presenteie outra pessoa.', ephemeral: true });

    const item = ITENS_CATALOGO[itemId];
    if (!item) return interaction.reply({ content: 'Item inválido.', ephemeral: true });

    const inv = getInventory(interaction.user.id);
    if (!inv.find(i => i.item === itemId && i.quantidade > 0)) {
        return interaction.reply({ content: 'Você não tem esse item.', ephemeral: true });
    }

    removeItem(interaction.user.id, itemId, 1);
    addItem(alvo.id, itemId, 1);

    // Pequeno bônus de reputação social
    const user = getUser(interaction.user.id);
    updateUser(interaction.user.id, { presentes: (user.presentes || 0) + 1 });
    progressoMissao(interaction.user.id, 'presente', 1);

    const r = RARIDADE[item.raridade];
    const embed = new EmbedBuilder()
        .setColor(r.cor)
        .setDescription(
            `<@${interaction.user.id}> presenteou <@${alvo.id}> com **${item.nome}** ${r.emoji}\n\n` +
            `"Que generoso... ou interessado."`
        );

    await interaction.reply({ embeds: [embed] });
}