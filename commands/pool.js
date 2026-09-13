import { SlashCommandBuilder } from 'discord.js';
import { createAnonymousPoll } from '../systems/confessPoll.js';

export const poolCommand = new SlashCommandBuilder()
    .setName('pool')
    .setDescription('Cria uma enquete anônima')
    .addStringOption(o =>
        o.setName('pergunta')
            .setDescription('Pergunta da enquete')
            .setRequired(true)
            .setMaxLength(256)
    )
    .addStringOption(o =>
        o.setName('opcoes')
            .setDescription('Opções separadas por ; (mín. 2, máx. 5)')
            .setRequired(true)
            .setMaxLength(500)
    );

export async function executePool(interaction) {
    if (!interaction.guildId) {
        return interaction.reply({ content: 'Só em servidores.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const pergunta = interaction.options.getString('pergunta', true);
    const opcoes = interaction.options.getString('opcoes', true);

    const result = await createAnonymousPoll({
        guild: interaction.guild,
        user: interaction.user,
        question: pergunta,
        options: opcoes
    });

    if (!result.ok) {
        return interaction.editReply({ content: result.msg });
    }

    return interaction.editReply({ content: `${result.msg}\n${result.url || ''}` });
}
