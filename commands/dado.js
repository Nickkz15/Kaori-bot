import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const dadoCommand = new SlashCommandBuilder()
    .setName('dado')
    .setDescription('Rola dados')
    .addIntegerOption(o => o.setName('lados').setDescription('Quantos lados? (padrão 6)').setMinValue(2).setMaxValue(1000))
    .addIntegerOption(o => o.setName('quantidade').setDescription('Quantos dados? (padrão 1)').setMinValue(1).setMaxValue(20));

export const moedaCommand = new SlashCommandBuilder()
    .setName('moeda')
    .setDescription('Joga uma moeda (cara ou coroa)');

const frasesDado = [
    'Nada mal. Eu esperava menos.',
    'Aceitável.',
    'Hm. Surpreendente.',
    'Você tem sorte demais hoje.',
    'Isso foi medíocre.'
];

export async function executeDado(interaction) {
    const lados = interaction.options.getInteger('lados') || 6;
    const qtd = interaction.options.getInteger('quantidade') || 1;

    const resultados = [];
    let total = 0;
    for (let i = 0; i < qtd; i++) {
        const r = Math.floor(Math.random() * lados) + 1;
        resultados.push(r);
        total += r;
    }

    const frase = frasesDado[Math.floor(Math.random() * frasesDado.length)];

    const embed = new EmbedBuilder()
        .setColor(0xff4d6d)
        .setDescription(
            `🎲 <@${interaction.user.id}> jogou **${qtd}d${lados}**\n\n` +
            `**Resultados:** ${resultados.join(' • ')}\n` +
            `**Total:** ${total}\n\n` +
            `"${frase}"`
        );

    await interaction.reply({ embeds: [embed] });
}

export async function executeMoeda(interaction) {
    const lado = Math.random() < 0.5 ? 'Cara' : 'Coroa';
    await interaction.reply(`🪙 <@${interaction.user.id}> jogou a moeda...\n\n**${lado}!**\n\n"Típico."`);
}