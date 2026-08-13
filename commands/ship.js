import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const shipCommand = new SlashCommandBuilder()
    .setName('ship')
    .setDescription('Descobre a compatibilidade entre duas pessoas (sempre o mesmo resultado)')
    .addUserOption(o => o.setName('usuario1').setDescription('Primeira pessoa').setRequired(true))
    .addUserOption(o => o.setName('usuario2').setDescription('Segunda pessoa').setRequired(true));

function calcularShip(id1, id2) {
    const a = BigInt(id1);
    const b = BigInt(id2);
    const menor = a < b ? a : b;
    const maior = a < b ? b : a;
    const hash = (menor * 31n + maior) % 101n;
    return Number(hash);
}

function fraseKaori(porcentagem) {
    if (porcentagem === 100) return 'CASAMENTO. AGORA.';
    if (porcentagem >= 81) return 'Vocês estão escondendo alguma coisa?';
    if (porcentagem >= 61) return 'Interessante...';
    if (porcentagem >= 41) return 'Hmm... existe alguma coisa aí.';
    if (porcentagem >= 21) return 'Talvez numa realidade alternativa.';
    return 'Nem tentando muito.';
}

export async function executeShip(interaction) {
    const user1 = interaction.options.getUser('usuario1');
    const user2 = interaction.options.getUser('usuario2');

    if (user1.id === user2.id) {
        return interaction.reply({
            content: 'Você não pode shippar a mesma pessoa consigo mesma, idiota.',
            ephemeral: true
        });
    }

    const porcentagem = calcularShip(user1.id, user2.id);
    const frase = fraseKaori(porcentagem);

    const embed = new EmbedBuilder()
        .setColor(0xff4d6d)
        .setTitle('💕 Ship da Kaori')
        .setDescription(
            `**${user1.username}** × **${user2.username}**\n\n` +
            `Compatibilidade: **${porcentagem}%**\n\n` +
            `"${frase}"`
        )
        .setFooter({ text: 'Sempre o mesmo resultado • zero IA' });

    // Responde o comando principal primeiro
    await interaction.reply({ embeds: [embed] });

    // Integração com conquistas (depois da resposta)
    try {
        const { incrementAction } = await import('../database/database.js');
        incrementAction(interaction.user.id, 'ship');

        const { checkAndUnlock } = await import('../systems/achievements.js');
        const novas = checkAndUnlock(interaction.user.id, { action: 'ship' });

        if (novas.length > 0) {
            const { enviarConquista } = await import('../systems/notifications.js');
            await enviarConquista(interaction, novas);
        }
    } catch (error) {
        console.error('Erro ao processar conquista do /ship:', error.message);
    }
}