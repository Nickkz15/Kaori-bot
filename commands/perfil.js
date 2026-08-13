import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const perfilCommand = new SlashCommandBuilder()
    .setName('perfil')
    .setDescription('Mostra o perfil caótico de alguém')
    .addUserOption(o => o.setName('usuario').setDescription('De quem?').setRequired(false));

function gerarAtributos(userId) {
    // Determinístico a partir do ID
    const seed = BigInt(userId);
    const rand = (n) => Number((seed * BigInt(n + 17) * 2654435761n) % 101n);

    return {
        caos: rand(1),
        sorte: rand(2),
        charme: rand(3),
        inteligencia: rand(4),
        energia: rand(5)
    };
}

function barra(valor) {
    const cheios = Math.round(valor / 10);
    return '█'.repeat(cheios) + '░'.repeat(10 - cheios);
}

function diagnostico(attrs) {
    if (attrs.caos >= 80) return 'Você definitivamente é um problema.';
    if (attrs.energia >= 90) return 'Você tem energia demais. Isso é perigoso.';
    if (attrs.sorte <= 20) return 'Sua sorte é um crime.';
    if (attrs.charme >= 85) return 'Ok... você tem um certo charme irritante.';
    return 'Mais um membro comum. Que decepção.';
}

export async function executePerfil(interaction) {
    const user = interaction.options.getUser('usuario') || interaction.user;
    const attrs = gerarAtributos(user.id);

    const embed = new EmbedBuilder()
        .setColor(0xff4d6d)
        .setTitle(`PERFIL DE ${user.username.toUpperCase()}`)
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .setDescription(
            `**Caos**       ${barra(attrs.caos)} ${attrs.caos}\n` +
            `**Sorte**      ${barra(attrs.sorte)} ${attrs.sorte}\n` +
            `**Charme**     ${barra(attrs.charme)} ${attrs.charme}\n` +
            `**Inteligência** ${barra(attrs.inteligencia)} ${attrs.inteligencia}\n` +
            `**Energia**    ${barra(attrs.energia)} ${attrs.energia}\n\n` +
            `**Diagnóstico da Kaori:**\n"${diagnostico(attrs)}"`
        )
        .setFooter({ text: 'Atributos fixos por ID • zero Gemini' });

    await interaction.reply({ embeds: [embed] });
}