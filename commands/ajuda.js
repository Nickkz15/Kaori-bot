import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const ajudaCommand = new SlashCommandBuilder()
    .setName('ajuda')
    .setDescription('Lista os comandos da Kaori');

export async function executeAjuda(interaction) {
    const embed = new EmbedBuilder()
        .setColor(0xff4d6d)
        .setTitle('📖 Comandos da Kaori')
        .setDescription(
            '**Economia**\n' +
            '`/saldo` `/trabalhar` `/diario` `/pagar` `/rank`\n' +
            '`/loja` `/comprar` `/inventario` `/usar` `/presente`\n\n' +
            '**Relacionamento**\n' +
            '`/perfil` `/relacionamento` `/interagir` `/evento`\n' +
            '`/resetar-perfil`\n\n' +
            '**Progresso**\n' +
            '`/missao` `/conquistas` `/colecao` `/segredo`\n\n' +
            '**Diversão**\n' +
            '`/kaori` `/ship` `/dado` `/moeda` `/sorte` `/abrir`\n\n' +
            '*"Não precisa decorar tudo de uma vez."*'
        )
        .setFooter({ text: 'Kaori • Allied' });

    await interaction.reply({ embeds: [embed] });
}