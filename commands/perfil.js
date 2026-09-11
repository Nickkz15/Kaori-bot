import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getUser, getInventory } from '../database/database.js';

function gerarAtributos(userId) {
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

function resolverAtributos(userId, data) {
    if (
        data?.atributos &&
        typeof data.atributos === 'object' &&
        Number.isFinite(data.atributos.caos)
    ) {
        return {
            caos: Number(data.atributos.caos) || 0,
            sorte: Number(data.atributos.sorte) || 0,
            charme: Number(data.atributos.charme) || 0,
            inteligencia: Number(data.atributos.inteligencia) || 0,
            energia: Number(data.atributos.energia) || 0
        };
    }
    return gerarAtributos(userId);
}

function barra(valor, max = 100) {
    const cheios = Math.round((valor / max) * 10);
    return '█'.repeat(cheios) + '░'.repeat(10 - cheios) + ` ${valor}/${max}`;
}

function diagnostico(attrs) {
    if (attrs.caos >= 80) return 'Você definitivamente é um problema.';
    if (attrs.energia >= 90) return 'Você tem energia demais. Isso é perigoso.';
    if (attrs.sorte <= 20) return 'Sua sorte é um crime.';
    if (attrs.charme >= 85) return 'Ok... você tem um certo charme irritante.';
    return 'Mais um membro comum. Que decepção.';
}

export const perfilCommand = new SlashCommandBuilder()
    .setName('perfil')
    .setDescription('Perfil completo — atributos + relacionamento com a Kaori')
    .addUserOption(o => o.setName('usuario').setDescription('De quem?').setRequired(false));

export async function executePerfil(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
        return interaction.reply({ content: 'Este comando só funciona em servidores.', ephemeral: true });
    }

    const user = interaction.options.getUser('usuario') || interaction.user;
    const data = await getUser(guildId, user.id);
    const attrs = resolverAtributos(user.id, data);
    const inv = await getInventory(guildId, user.id);

    const media = Math.round(((data.carinho || 0) + (data.confianca || 0) + (data.afinidade || 0)) / 3);
    let status = 'Estranho';
    if (media >= 90) status = 'Muito Próximo';
    else if (media >= 75) status = 'Próximo';
    else if (media >= 55) status = 'Amigável';
    else if (media >= 35) status = 'Conhecido';
    else if (media >= 15) status = 'Distante';

    const embed = new EmbedBuilder()
        .setColor(0xff4d6d)
        .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
        .setTitle(`PERFIL DE ${user.username.toUpperCase()}`)
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .setDescription(
            `**Atributos**\n` +
            `Caos         ${barra(attrs.caos)}\n` +
            `Sorte        ${barra(attrs.sorte)}\n` +
            `Charme       ${barra(attrs.charme)}\n` +
            `Inteligência ${barra(attrs.inteligencia)}\n` +
            `Energia      ${barra(attrs.energia)}\n\n` +
            `*${diagnostico(attrs)}*\n\n` +
            `**Com a Kaori** · ${status}\n` +
            `❤️ Carinho     ${barra(data.carinho || 0)}\n` +
            `🤝 Confiança   ${barra(data.confianca || 0)}\n` +
            `✨ Afinidade   ${barra(data.afinidade || 0)}\n` +
            `🎭 Humor       ${barra(data.humor || 50)}\n\n` +
            `💰 **${(data.coins || 0).toLocaleString('pt-BR')}** coins · ⭐ Nv **${data.level || 1}**\n` +
            `🎁 ${data.presentes || 0} presentes · 🎟️ ${data.eventos || 0} eventos · 🔮 ${data.presentes_secretos || 0} secretos\n` +
            `🎒 ${inv.length} itens · Temporada ${data.temporada || 1}`
        )
        .setFooter({
            text: data.atributos
                ? 'Atributos resetados · Relacionamento dinâmico'
                : 'Atributos fixos por ID · Relacionamento dinâmico'
        })
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}