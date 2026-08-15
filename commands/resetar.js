import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getUser, updateUser, removeCoins } from '../database/database.js';

export const resetarCommand = new SlashCommandBuilder()
    .setName('resetar-perfil')
    .setDescription('Reinicia carinho/confiança/afinidade por 8.000 coins (novo começo)');

export async function executeResetar(interaction) {
    const user = getUser(interaction.user.id);

    if (user.coins < 8000) {
        return interaction.reply({
            content: `Você precisa de **8.000** coins. Tem **${user.coins}**.`,
            ephemeral: true
        });
    }

    removeCoins(interaction.user.id, 8000);

    // Bônus aleatório do "novo começo"
    const roll = Math.random() * 100;
    let bonusTexto = 'Kaori parece indiferente.';
    let bonus = {};

    if (roll < 5) {
        bonusTexto = '✦ **CONEXÃO EXCEPCIONAL** — algo especial nasceu.';
        bonus = { carinho: 10, confianca: 10, afinidade: 10, humor: 20 };
    } else if (roll < 15) {
        bonusTexto = 'Kaori parece especialmente receptiva.';
        bonus = { carinho: 5, afinidade: 5, humor: 10 };
    } else if (roll < 35) {
        bonusTexto = 'Kaori parece mais receptiva que o normal.';
        bonus = { afinidade: 3, humor: 5 };
    } else if (roll < 60) {
        bonusTexto = 'Kaori parece curiosa.';
        bonus = { humor: 5 };
    }

    updateUser(interaction.user.id, {
        carinho: bonus.carinho || 0,
        confianca: bonus.confianca || 0,
        afinidade: bonus.afinidade || 0,
        humor: 50 + (bonus.humor || 0),
        temporada: (user.temporada || 1) + 1
    });

    const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle('💫 Novo Começo')
        .setDescription(
            `Seus vínculos com a Kaori foram reiniciados.\n\n` +
            `**Temporada ${(user.temporada || 1) + 1}**\n\n` +
            `${bonusTexto}\n\n` +
            `"...Do zero. Não estrague de novo."`
        );

    await interaction.reply({ embeds: [embed] });
}