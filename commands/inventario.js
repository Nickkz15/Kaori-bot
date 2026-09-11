import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getInventory } from '../database/database.js';
import { ITENS_CATALOGO, RARIDADE } from '../systems/economy.js';

export const inventarioCommand = new SlashCommandBuilder()
    .setName('inventario')
    .setDescription('Mostra seus itens')
    .addUserOption(o => o.setName('usuario').setDescription('De quem?').setRequired(false));

export async function executeInventario(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
        return interaction.reply({ content: 'Este comando só funciona em servidores.', ephemeral: true });
    }

    const user = interaction.options.getUser('usuario') || interaction.user;
    const inv = await getInventory(guildId, user.id);

    if (inv.length === 0) {
        return interaction.reply({
            content: `<@${user.id}> não tem nenhum item.`,
            ephemeral: true
        });
    }

    const linhas = inv.map(({ item, quantidade }) => {
        const cat = ITENS_CATALOGO[item];
        const nome = cat?.nome || item;
        const r = RARIDADE[cat?.raridade] || RARIDADE.comum;
        return `${r.emoji} **${nome}** ×${quantidade}`;
    });

    const embed = new EmbedBuilder()
        .setColor(0xff4d6d)
        .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
        .setTitle('🎒 Inventário')
        .setDescription(linhas.join('\n'))
        .setFooter({ text: `${inv.length} tipo(s) de item` });

    await interaction.reply({ embeds: [embed] });
}
