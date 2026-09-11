import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { updateUser } from '../database/database.js';

function gerarAtributosAleatorios() {
    const rand = () => Math.floor(Math.random() * 101);
    return {
        caos: rand(),
        sorte: rand(),
        charme: rand(),
        inteligencia: rand(),
        energia: rand()
    };
}

function barra(valor, max = 100) {
    const cheios = Math.round((valor / max) * 10);
    return '█'.repeat(cheios) + '░'.repeat(10 - cheios) + ` ${valor}/${max}`;
}

export const resetarCommand = new SlashCommandBuilder()
    .setName('resetar-perfil')
    .setDescription('Reseta as estatísticas do perfil (Caos, Sorte, Charme, Inteligência, Energia)');

export async function executeResetar(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
        return interaction.reply({ content: 'Este comando só funciona em servidores.', ephemeral: true });
    }

    const novos = gerarAtributosAleatorios();

    await updateUser(guildId, interaction.user.id, {
        atributos: novos
    });

    const embed = new EmbedBuilder()
        .setColor(0xff4d6d)
        .setTitle('🔄 Perfil resetado')
        .setDescription(
            `<@${interaction.user.id}> regenerou as estatísticas do perfil.\n\n` +
            `**Novos atributos**\n` +
            `Caos         ${barra(novos.caos)}\n` +
            `Sorte        ${barra(novos.sorte)}\n` +
            `Charme       ${barra(novos.charme)}\n` +
            `Inteligência ${barra(novos.inteligencia)}\n` +
            `Energia      ${barra(novos.energia)}\n\n` +
            `"Pronto. Agora você é outra pessoa... quase."`
        )
        .setFooter({ text: 'Relacionamento com a Kaori não foi alterado' });

    await interaction.reply({ embeds: [embed] });
}