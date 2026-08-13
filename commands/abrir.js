import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { addCoins, addXP, addItem, getUser, updateUser } from '../database/database.js';

const COOLDOWN = 12 * 60 * 60 * 1000; // 12 horas

export const abrirCommand = new SlashCommandBuilder()
    .setName('abrir')
    .setDescription('Abre uma caixa misteriosa (quando disponível)');

export async function executeAbrir(interaction) {
    const user = getUser(interaction.user.id);
    const agora = Date.now();
    const ultimo = user.last_box ? Number(user.last_box) : 0;

    if (agora - ultimo < COOLDOWN) {
        const h = Math.ceil((COOLDOWN - (agora - ultimo)) / 3600000);
        return interaction.reply({
            content: `A caixa ainda não reapareceu.\nTente novamente em **${h} hora(s)**.`,
            ephemeral: true
        });
    }

    // Sorteio
    const roll = Math.random();
    let resultado = '';
    let cor = 0xff4d6d;

    if (roll < 0.45) {
        const coins = 40 + Math.floor(Math.random() * 80);
        addCoins(interaction.user.id, coins);
        resultado = `Você encontrou **${coins}** Kaori Coins.`;
    } else if (roll < 0.70) {
        const xp = 20 + Math.floor(Math.random() * 40);
        addXP(interaction.user.id, xp);
        resultado = `Você ganhou **${xp} XP**.`;
    } else if (roll < 0.88) {
        addItem(interaction.user.id, 'cafe', 1);
        resultado = `Você ganhou um **☕ Café da Kaori**!`;
    } else if (roll < 0.97) {
        const coins = 300 + Math.floor(Math.random() * 200);
        addCoins(interaction.user.id, coins);
        resultado = `**Sorte grande!** +${coins} coins.`;
        cor = 0x57f287;
    } else {
        resultado = `A caixa estava vazia.\n"Típico."`;
        cor = 0x99aab5;
    }

    updateUser(interaction.user.id, { last_box: String(agora) });

    const embed = new EmbedBuilder()
        .setColor(cor)
        .setTitle('📦 Caixa Misteriosa')
        .setDescription(`<@${interaction.user.id}> abriu a caixa...\n\n${resultado}`)
        .setFooter({ text: 'Próxima caixa em 12 horas' });

    await interaction.reply({ embeds: [embed] });
}