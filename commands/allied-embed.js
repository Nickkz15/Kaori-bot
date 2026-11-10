import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder
} from 'discord.js';
import { buildEmbedMessagePayload, parseEmbedJson } from '../systems/alliedEmbed.js';

function isAdmin(interaction) {
    return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) === true;
}

function readOptional(interaction, key) {
    const value = interaction.options.getString(key);
    return value === null ? undefined : value;
}

export const alliedEmbedCommand = new SlashCommandBuilder()
    .setName('allied-embed')
    .setDescription('Cria embeds personalizadas para os canais da Allied')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sc) =>
        sc.setName('enviar')
            .setDescription('Monta e envia um embed usando opções individuais')
            .addChannelOption((o) => o.setName('canal').setDescription('Canal de destino').setRequired(true).addChannelTypes(ChannelType.GuildText))
            .addStringOption((o) => o.setName('texto').setDescription('Texto fora do embed').setMaxLength(2000))
            .addStringOption((o) => o.setName('titulo').setDescription('Título').setMaxLength(256))
            .addStringOption((o) => o.setName('descricao').setDescription('Descrição').setMaxLength(4096))
            .addStringOption((o) => o.setName('cor').setDescription('Cor hex, exemplo #8B1A1A').setMaxLength(7))
            .addStringOption((o) => o.setName('url').setDescription('Link associado ao título').setMaxLength(500))
            .addStringOption((o) => o.setName('autor').setDescription('Nome do autor').setMaxLength(256))
            .addStringOption((o) => o.setName('autor_url').setDescription('Link do autor').setMaxLength(500))
            .addStringOption((o) => o.setName('autor_icone').setDescription('URL do ícone do autor').setMaxLength(500))
            .addStringOption((o) => o.setName('miniatura').setDescription('URL da miniatura').setMaxLength(500))
            .addStringOption((o) => o.setName('imagem_gif').setDescription('URL da imagem ou GIF').setMaxLength(500))
            .addStringOption((o) => o.setName('rodape').setDescription('Texto do rodapé').setMaxLength(2048))
            .addStringOption((o) => o.setName('rodape_icone').setDescription('URL do ícone do rodapé').setMaxLength(500))
            .addBooleanOption((o) => o.setName('data_hora').setDescription('Adicionar timestamp'))
            .addStringOption((o) => o.setName('fields_json').setDescription('Array JSON de fields (máx. 25)').setMaxLength(4000))
            .addStringOption((o) => o.setName('botoes_json').setDescription('Array JSON de botões com label, url e emoji').setMaxLength(4000))
    )
    .addSubcommand((sc) =>
        sc.setName('json')
            .setDescription('Envia um payload JSON completo, no formato documentado')
            .addChannelOption((o) => o.setName('canal').setDescription('Canal de destino').setRequired(true).addChannelTypes(ChannelType.GuildText))
            .addStringOption((o) => o.setName('payload').setDescription('JSON com content, embed(s) e buttons').setRequired(true).setMaxLength(6000))
    )
    .addSubcommand((sc) =>
        sc.setName('preview')
            .setDescription('Pré-visualiza um payload JSON sem publicar no canal')
            .addStringOption((o) => o.setName('payload').setDescription('JSON com content, embed(s) e buttons').setRequired(true).setMaxLength(6000))
    );

export async function executeAlliedEmbed(interaction) {
    if (!interaction.guildId || !interaction.guild) {
        return interaction.reply({ content: 'Este comando só pode ser usado dentro de um servidor.', ephemeral: true });
    }
    if (!isAdmin(interaction)) {
        return interaction.reply({ content: 'Você precisa da permissão **Gerenciar Servidor** para publicar embeds.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    let payload;

    try {
        if (sub === 'enviar') {
            const fieldsRaw = readOptional(interaction, 'fields_json');
            const buttonsRaw = readOptional(interaction, 'botoes_json');
            const fields = fieldsRaw ? JSON.parse(fieldsRaw) : undefined;
            const buttons = buttonsRaw ? JSON.parse(buttonsRaw) : [];
            const authorName = readOptional(interaction, 'autor');
            const author = authorName ? {
                name: authorName,
                url: readOptional(interaction, 'autor_url'),
                icon_url: readOptional(interaction, 'autor_icone')
            } : undefined;
            const footerText = readOptional(interaction, 'rodape');
            const footer = footerText ? { text: footerText, icon_url: readOptional(interaction, 'rodape_icone') } : undefined;
            const image = readOptional(interaction, 'imagem_gif');
            const thumbnail = readOptional(interaction, 'miniatura');
            const embed = {
                title: readOptional(interaction, 'titulo'),
                description: readOptional(interaction, 'descricao'),
                color: readOptional(interaction, 'cor'),
                url: readOptional(interaction, 'url'),
                author,
                footer,
                image: image ? { url: image } : undefined,
                thumbnail: thumbnail ? { url: thumbnail } : undefined,
                timestamp: interaction.options.getBoolean('data_hora') || undefined,
                fields
            };
            const content = readOptional(interaction, 'texto');
            const hasEmbedContent = Object.entries(embed).some(([key, value]) => {
                if (key === 'author' || key === 'footer' || key === 'image' || key === 'thumbnail') return Boolean(value);
                if (key === 'fields') return Array.isArray(value) && value.length > 0;
                return value !== undefined && value !== null && value !== false && value !== '';
            });
            payload = buildEmbedMessagePayload({ content, embed: hasEmbedContent ? embed : undefined, buttons });
        } else {
            const raw = interaction.options.getString('payload', true);
            payload = parseEmbedJson(raw);
        }
    } catch (error) {
        return interaction.reply({ content: `Não consegui montar o embed: ${error.message}`, ephemeral: true });
    }

    if (sub === 'preview') {
        return interaction.reply({ ...payload, ephemeral: true });
    }

    const channel = interaction.options.getChannel('canal', true);
    await interaction.deferReply({ ephemeral: true });
    try {
        const sent = await channel.send(payload);
        const summary = new EmbedBuilder()
            .setColor(0x8b1a1a)
            .setDescription(`Embed publicado em ${channel}.`)
            .addFields({ name: 'Mensagem', value: `[Abrir mensagem](${sent.url})` })
            .setTimestamp();
        return interaction.editReply({ embeds: [summary] });
    } catch (error) {
        console.error('[AlliedEmbed] send:', error);
        return interaction.editReply({ content: `Falha ao enviar o embed. Verifique se a Kaori pode visualizar e enviar mensagens em ${channel}. (${String(error.message).slice(0, 180)})` });
    }
}
