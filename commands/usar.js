import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { usarItem } from '../systems/items.js';

export const usarCommand = new SlashCommandBuilder()
    .setName('usar')
    .setDescription('Usa um item do inventário')
    .addStringOption(o =>
        o.setName('item')
            .setDescription('ID do item (ex: cafe, chocolate, flor)')
            .setRequired(true)
    );

export async function executeUsar(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
        return interaction.reply({ content: 'Este comando só funciona em servidores.', ephemeral: true });
    }

    const itemId = interaction.options.getString('item').toLowerCase().trim();
    const result = await usarItem(guildId, interaction.user.id, itemId);

    if (!result.ok) {
        return interaction.reply({ content: result.msg, ephemeral: true });
    }

    let desc =
        `<@${interaction.user.id}> usou **${result.item.nome}**\n\n` +
        `${result.frase}`;

    if (result.especial) {
        desc += `\n\n*${result.especial}*`;
    }

    const embed = new EmbedBuilder()
        .setColor(result.raridade?.cor || 0xff4d6d)
        .setTitle('✨ Item usado')
        .setDescription(desc)
        .setFooter({ text: `Raridade: ${result.raridade?.nome || '?'}` });

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

    try {
        const { tentarPresenteSecreto } = await import('../systems/secretGifts.js');
        const secreto = await tentarPresenteSecreto(guildId, interaction.user.id);
        if (secreto) {
            await interaction.followUp({
                embeds: [{
                    color: 0x9b59b6,
                    title: '🎁 Presente Secreto',
                    description: `Kaori deixou algo pra você...\n\n**${secreto.item.nome}**\n${secreto.frase}`
                }],
                ephemeral: true
            });
        }
    } catch {}
}
