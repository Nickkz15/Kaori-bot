import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { iniciarEvento } from '../systems/events.js';
import { getInventory } from '../database/database.js';

export const eventoCommand = new SlashCommandBuilder()
    .setName('evento')
    .setDescription('Usa um tíquete para iniciar um evento com a Kaori')
    .addUserOption(o =>
        o.setName('usuario').setDescription('Com quem? (opcional)').setRequired(false)
    )
    .addStringOption(o =>
        o.setName('ticket')
            .setDescription('Tipo de tíquete')
            .addChoices(
                { name: '🎟️ Tíquete Normal', value: 'ticket' },
                { name: '🎫 Tíquete Dourado', value: 'ticket_dourado' }
            )
    );

export async function executeEvento(interaction) {
    const alvo = interaction.options.getUser('usuario') || interaction.user;
    const ticketTipo = interaction.options.getString('ticket') || 'ticket';

    const inv = getInventory(interaction.user.id);
    const qtd = inv.find(i => i.item === ticketTipo)?.quantidade || 0;

    if (qtd < 1) {
        return interaction.reply({
            content: `Você não tem ${ticketTipo === 'ticket_dourado' ? '🎫 Tíquete Dourado' : '🎟️ Tíquete de Evento'}.\nCompre na \`/loja\`.`,
            ephemeral: true
        });
    }

    const result = iniciarEvento(interaction.user.id, alvo.id, ticketTipo);

    if (!result.ok) {
        return interaction.reply({ content: result.msg, ephemeral: true });
    }

    const efeitos = [];
    if (result.recompensa.carinho) efeitos.push(`❤️ +${result.recompensa.carinho}`);
    if (result.recompensa.confianca) efeitos.push(`🤝 +${result.recompensa.confianca}`);
    if (result.recompensa.afinidade) efeitos.push(`✨ +${result.recompensa.afinidade}`);

    const embed = new EmbedBuilder()
        .setColor(result.evento.especial ? 0xf1c40f : 0xff4d6d)
        .setTitle(result.evento.nome)
        .setDescription(
            `Kaori convidou <@${alvo.id}>.\n\n` +
            `${result.frase}\n\n` +
            `**Diversão:** ${result.diversao}%\n` +
            (efeitos.length ? efeitos.join(' · ') + '\n' : '') +
            `💰 +${result.bonusCoins} coins`
        )
        .setFooter({ text: result.evento.especial ? 'Evento especial' : 'Evento comum' });

    await interaction.reply({ embeds: [embed] });

    try {
        const { progressoMissao } = await import('../systems/missions.js');
        const completadas = progressoMissao(interaction.user.id, 'evento', 1);
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