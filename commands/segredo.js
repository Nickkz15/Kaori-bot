import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { usarChave, PRESENTES_SECRETOS } from '../systems/secretGifts.js';
import { getInventory, getUser } from '../database/database.js';

export const segredoCommand = new SlashCommandBuilder()
    .setName('segredo')
    .setDescription('Algo que a Kaori não admite que existe')
    .addSubcommand(sc =>
        sc.setName('chave')
            .setDescription('Usa a Chave Misteriosa (se tiver)')
    )
    .addSubcommand(sc =>
        sc.setName('colecao')
            .setDescription('Mostra presentes secretos que você ganhou')
    );

export async function executeSegredo(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'chave') {
        const result = usarChave(interaction.user.id);
        if (!result.ok) {
            return interaction.reply({ content: result.msg, ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setColor(0x9b59b6)
            .setTitle('🔑 A chave girou...')
            .setDescription(
                `${result.frase}\n\n` +
                `Você recebeu: ${result.recompensa}`
            );

        return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'colecao') {
        const inv = getInventory(interaction.user.id);
        const user = getUser(interaction.user.id);
        const secretos = Object.keys(PRESENTES_SECRETOS);

        const linhas = secretos.map(id => {
            const info = PRESENTES_SECRETOS[id];
            const qtd = inv.find(i => i.item === id)?.quantidade || 0;
            return qtd > 0
                ? `✨ ${info.nome} × **${qtd}**`
                : `⬛ ???`;
        });

        const embed = new EmbedBuilder()
            .setColor(0x9b59b6)
            .setTitle('🎁 Presentes Secretos da Kaori')
            .setDescription(linhas.join('\n'))
            .setFooter({
                text: `Recebidos: ${user.presentes_secretos || 0} · "Eu nunca te dei nada."`
            });

        return interaction.reply({ embeds: [embed] });
    }
}