import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const sorteCommand = new SlashCommandBuilder()
    .setName('sorte')
    .setDescription('Consulta sua sorte')
    .addStringOption(o =>
        o.setName('tipo')
            .setDescription('Tipo de sorte')
            .addChoices(
                { name: 'Geral', value: 'geral' },
                { name: 'Amor', value: 'amor' },
                { name: 'Dinheiro', value: 'dinheiro' },
                { name: 'Estudos', value: 'estudos' },
                { name: 'Hoje', value: 'hoje' }
            )
    );

function fraseSorte(tipo, valor) {
    if (tipo === 'amor') {
        if (valor >= 80) return 'Não estraga tudo dessa vez.';
        if (valor >= 50) return 'Tem chance... se você não for idiota.';
        return 'Melhor ficar sozinho hoje.';
    }
    if (tipo === 'dinheiro') {
        if (valor >= 70) return 'Hoje o universo te deve alguma coisa.';
        return 'Não gaste o que você não tem.';
    }
    // genéricas
    if (valor >= 80) return 'Você está com sorte demais. Suspeito.';
    if (valor >= 50) return 'Mais ou menos. Não comemore.';
    return 'Hoje não é o seu dia.';
}

export async function executeSorte(interaction) {
    const tipo = interaction.options.getString('tipo') || 'geral';
    // Determinístico por dia + usuário + tipo (muda todo dia)
    const hoje = new Date().toISOString().slice(0, 10);
    const seed = BigInt(interaction.user.id) + BigInt(hoje.replace(/-/g, '')) + BigInt(tipo.length * 17);
    const valor = Number(seed % 101n);

    const embed = new EmbedBuilder()
        .setColor(0xff4d6d)
        .setTitle(`🍀 Sorte — ${tipo.toUpperCase()}`)
        .setDescription(
            `**${valor}%**\n\n` +
            `"${fraseSorte(tipo, valor)}"`
        )
        .setFooter({ text: 'Muda todo dia • Allied' });

    await interaction.reply({ embeds: [embed] });
}