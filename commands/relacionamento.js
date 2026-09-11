import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getRelacionamento } from '../systems/relationship.js';

export const relacionamentoCommand = new SlashCommandBuilder()
    .setName('relacionamento')
    .setDescription('Mostra seu relacionamento com a Kaori')
    .addUserOption(o => o.setName('usuario').setDescription('De quem?').setRequired(false));

export async function executeRelacionamento(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
        return interaction.reply({ content: 'Este comando só funciona em servidores.', ephemeral: true });
    }

    const user = interaction.options.getUser('usuario') || interaction.user;
    const rel = await getRelacionamento(guildId, user.id);

    const barra = (v) => {
        const cheios = Math.round(v / 10);
        return '█'.repeat(cheios) + '░'.repeat(10 - cheios) + ` ${v}/100`;
    };

    const embed = new EmbedBuilder()
        .setColor(rel.cor)
        .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
        .setTitle(`Relacionamento · ${rel.status}`)
        .setDescription(
            `❤️ Carinho   ${barra(rel.carinho)}\n` +
            `🤝 Confiança ${barra(rel.confianca)}\n` +
            `✨ Afinidade ${barra(rel.afinidade)}\n\n` +
            `*"${rel.frase}"*`
        )
        .setFooter({ text: `Média: ${rel.media}` });

    await interaction.reply({ embeds: [embed] });
}
