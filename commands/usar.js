import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { usarItem } from '../systems/items.js';

export const usarCommand = new SlashCommandBuilder()
    .setName('usar')
    .setDescription('Usa um item do inventário')
    .addStringOption(o =>
        o.setName('item')
            .setDescription('ID do item (chocolate, cartinha, ursinho...)')
            .setRequired(true)
    );

export async function executeUsar(interaction) {
    const itemId = interaction.options.getString('item').toLowerCase().trim();
    const result = usarItem(interaction.user.id, itemId);

    if (!result.ok) {
        return interaction.reply({ content: result.msg, ephemeral: true });
    }

    const efeitos = [];
    if (result.efeito.carinho) efeitos.push(`❤️ +${result.efeito.carinho}`);
    if (result.efeito.confianca) efeitos.push(`🤝 +${result.efeito.confianca}`);
    if (result.efeito.afinidade) efeitos.push(`✨ +${result.efeito.afinidade}`);
    if (result.efeito.humor) efeitos.push(`🎭 +${result.efeito.humor}`);
    if (result.efeito.energia) efeitos.push(`⚡ +${result.efeito.energia}`);

    const embed = new EmbedBuilder()
        .setColor(result.raridade?.cor || 0xff4d6d)
        .setTitle(`${result.item.nome} ${result.raridade?.emoji || ''}`)
        .setDescription(
            `<@${interaction.user.id}> entregou **${result.item.nome}**.\n\n` +
            `${result.frase}` +
            (result.especial ? `\n\n*${result.especial}*` : '') +
            (efeitos.length ? `\n\n${efeitos.join(' · ')}` : '')
        )
        .setFooter({ text: `Raridade: ${result.raridade?.nome || '?'}` });

    await interaction.reply({ embeds: [embed] });

    try {
        const { progressoMissao } = await import('../systems/missions.js');
        const completadas = progressoMissao(interaction.user.id, 'presente', 1);
        if (completadas.length > 0) {
            await interaction.followUp({
                content: `📋 Missão completa!\n${completadas.map(m => `✅ **${m.nome}**`).join('\n')}`,
                ephemeral: true
            });
        }
    } catch {}

    try {
        const { tentarPresenteSecreto } = await import('../systems/secretGifts.js');
        const secreto = tentarPresenteSecreto(interaction.user.id);
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