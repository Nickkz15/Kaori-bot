import {
    SlashCommandBuilder,
    AttachmentBuilder
} from 'discord.js';
import {
    submitConfession,
    buildConfessModal,
    canUserConfess
} from '../systems/confess.js';

export const confessCommand = new SlashCommandBuilder()
    .setName('confess')
    .setDescription('Envia uma confissão anônima')
    .addStringOption(o =>
        o.setName('confession')
            .setDescription('Texto da confissão')
            .setRequired(false)
            .setMaxLength(2000)
    )
    .addStringOption(o =>
        o.setName('color')
            .setDescription('Cor da embed (hex ou nome, ex: #ff0000, red)')
            .setRequired(false)
    )
    .addAttachmentOption(o =>
        o.setName('image')
            .setDescription('Imagem opcional')
            .setRequired(false)
    );

export async function executeConfess(interaction) {
    if (!interaction.guildId) {
        return interaction.reply({ content: 'Este comando só funciona em servidores.', ephemeral: true });
    }

    const confession = interaction.options.getString('confession');
    const color = interaction.options.getString('color');
    const image = interaction.options.getAttachment('image');

    // Sem texto -> modal
    if (!confession) {
        const check = await canUserConfess(interaction.guildId, interaction.user, interaction.user.createdAt);
        if (!check.ok) {
            return interaction.reply({ content: check.msg, ephemeral: true });
        }
        const modal = buildConfessModal('confess_modal');
        return interaction.showModal(modal);
    }

    await interaction.deferReply({ ephemeral: true });

    const result = await submitConfession({
        guild: interaction.guild,
        user: interaction.user,
        content: confession,
        colorInput: color,
        imageAttachment: image,
        source: 'command',
        client: interaction.client
    });

    if (!result.ok) {
        return interaction.editReply({ content: result.msg });
    }

    return interaction.editReply({ content: `✨ ${result.msg}` });
}

export async function handleConfessModal(interaction) {
    const content = interaction.fields.getTextInputValue('confession_content');
    let color = null;
    try {
        color = interaction.fields.getTextInputValue('confession_color') || null;
    } catch {
        color = null;
    }

    await interaction.deferReply({ ephemeral: true });

    // Discord modals não suportam upload de arquivo.
    // Fluxo: publica texto agora; se attachments habilitados, avisa que pode usar /confess com image.
    const result = await submitConfession({
        guild: interaction.guild,
        user: interaction.user,
        content,
        colorInput: color || undefined,
        imageAttachment: null,
        source: 'modal',
        client: interaction.client
    });

    if (!result.ok) {
        return interaction.editReply({ content: result.msg });
    }

    return interaction.editReply({
        content:
            `✨ ${result.msg}\n` +
            `-# Quer mandar com imagem? Use \`/confess\` com o anexo.`
    });
}

export async function handleConfessButton(interaction) {
    if (!interaction.guildId) {
        return interaction.reply({ content: 'Só em servidores.', ephemeral: true });
    }
    const check = await canUserConfess(interaction.guildId, interaction.user, interaction.user.createdAt);
    if (!check.ok) {
        return interaction.reply({ content: check.msg, ephemeral: true });
    }
    return interaction.showModal(buildConfessModal('confess_modal'));
}
