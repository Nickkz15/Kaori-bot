import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getRelacionamento } from '../systems/relationship.js';

function barra(valor) {
    const cheios = Math.round(valor / 10);
    return '█'.repeat(cheios) + '░'.repeat(10 - cheios) + ` ${valor}/100`;
}

export const relacionamentoCommand = new SlashCommandBuilder()
    .setName('relacionamento')
    .setDescription('Mostra seu relacionamento com a Kaori');

export async function executeRelacionamento(interaction) {
    const rel = getRelacionamento(interaction.user.id);

    const embed = new EmbedBuilder()
        .setColor(rel.cor)
        .setTitle(`💕 Relacionamento com a Kaori`)
        .setDescription(
            `**Status:** ${rel.status}\n\n` +
            `**Carinho**     ${barra(rel.carinho)}\n` +
            `**Confiança**   ${barra(rel.confianca)}\n` +
            `**Afinidade**   ${barra(rel.afinidade)}\n\n` +
            `*${rel.frase}*`
        )
        .setFooter({ text: 'Ações /kaori alteram esses valores' });

    await interaction.reply({ embeds: [embed] });
}