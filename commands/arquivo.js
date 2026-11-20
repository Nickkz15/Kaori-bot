import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder
} from 'discord.js';
import {
    getMessageArchiveStatus,
    isMessageArchiveOwner,
    publishMessageArchiveNotice,
    setMessageArchiveEnabled,
    searchMessageArchive,
    getMessageArchiveHistory,
    getArchivedAttachment
} from '../systems/messageArchive.js';

const EVENT_LABELS = {
    created: 'Mensagem capturada',
    edited: 'Mensagem editada',
    deleted: 'Mensagem excluída',
    bulk_deleted: 'Exclusão em massa'
};

const TYPE_CHOICES = [
    { name: 'Todos os eventos', value: 'all' },
    { name: 'Mensagens enviadas', value: 'created' },
    { name: 'Mensagens editadas', value: 'edited' },
    { name: 'Mensagens excluídas', value: 'deleted' },
    { name: 'Exclusões em massa', value: 'bulk_deleted' }
];

export const messageArchiveCommand = new SlashCommandBuilder()
    .setName('arquivo')
    .setDescription('Acessa o arquivo privado e criptografado de mensagens da Allied')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub
        .setName('status')
        .setDescription('Mostra a disponibilidade e a configuração do arquivo')
    )
    .addSubcommand((sub) => sub
        .setName('aviso')
        .setDescription('Publica o aviso de transparência antes de ativar o arquivamento')
        .addChannelOption((option) => option
            .setName('canal')
            .setDescription('Canal público onde o aviso será publicado')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) => sub
        .setName('ativar')
        .setDescription('Ativa ou pausa a captura de novas mensagens')
        .addBooleanOption((option) => option
            .setName('ligado')
            .setDescription('True = ativado; False = pausado')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) => sub
        .setName('recentes')
        .setDescription('Mostra eventos arquivados recentemente')
        .addIntegerOption((option) => option
            .setName('dias')
            .setDescription('Período de busca (1 a 90 dias)')
            .setMinValue(1)
            .setMaxValue(90)
        )
        .addIntegerOption((option) => option
            .setName('limite')
            .setDescription('Quantidade de resultados (1 a 10)')
            .setMinValue(1)
            .setMaxValue(10)
        )
    )
    .addSubcommand((sub) => sub
        .setName('buscar')
        .setDescription('Pesquisa conteúdo, autor, canal ou tipo de evento')
        .addStringOption((option) => option
            .setName('termo')
            .setDescription('Palavra ou trecho do conteúdo')
            .setMaxLength(100)
        )
        .addUserOption((option) => option
            .setName('usuario')
            .setDescription('Filtra pelo autor da mensagem')
        )
        .addChannelOption((option) => option
            .setName('canal')
            .setDescription('Filtra por canal')
            .addChannelTypes(
                ChannelType.GuildText,
                ChannelType.GuildAnnouncement,
                ChannelType.PublicThread,
                ChannelType.PrivateThread,
                ChannelType.AnnouncementThread
            )
        )
        .addIntegerOption((option) => option
            .setName('dias')
            .setDescription('Período de busca (1 a 90 dias)')
            .setMinValue(1)
            .setMaxValue(90)
        )
        .addStringOption((option) => option
            .setName('tipo')
            .setDescription('Tipo de evento')
            .addChoices(...TYPE_CHOICES)
        )
        .addIntegerOption((option) => option
            .setName('limite')
            .setDescription('Quantidade de resultados (1 a 10)')
            .setMinValue(1)
            .setMaxValue(10)
        )
    )
    .addSubcommand((sub) => sub
        .setName('mensagem')
        .setDescription('Mostra o histórico de uma mensagem pelo ID')
        .addStringOption((option) => option
            .setName('id')
            .setDescription('ID da mensagem do Discord')
            .setRequired(true)
            .setMinLength(17)
            .setMaxLength(20)
        )
    );

function truncate(value, max = 900) {
    const text = String(value ?? '').trim() || 'Sem conteúdo textual disponível.';
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function safeTimestamp(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Horário indisponível' : date.toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'medium',
        timeZone: 'America/Sao_Paulo'
    });
}

function eventContent(record) {
    const current = record.snapshot?.content;
    const before = record.beforeSnapshot?.content;
    const body = record.eventType === 'edited'
        ? '**Antes:** ' + truncate(before, 350) + '\n**Depois:** ' + truncate(current, 350)
        : truncate(current ?? before, 750);
    const attachments = record.snapshot?.attachments || record.beforeSnapshot?.attachments || [];
    if (!attachments.length) return body;
    const summary = attachments.slice(0, 5).map((item) => {
        const state = item.archived ? 'salvo no arquivo' : 'não copiado: ' + (item.skippedReason || 'indisponível');
        return (item.filename || 'anexo') + ' (' + state + ')';
    }).join('; ');
    return body + '\n**Anexos:** ' + truncate(summary, 260);
}

function buildSearchEmbed(result, options) {
    const embed = new EmbedBuilder()
        .setColor(0x8b1a1a)
        .setTitle('✦ ARQUIVO PRIVADO · RESULTADOS')
        .setDescription(
            'Resultados dos últimos **' + options.days + ' dias**. ' +
            'Foram examinados **' + result.scanned + '** registros' +
            (result.truncated ? ' (limite de varredura atingido).' : '.')
        )
        .setFooter({ text: 'Acesso restrito · Conteúdo criptografado no armazenamento externo' })
        .setTimestamp();

    for (const item of result.records) {
        const record = item.record;
        const snapshot = record.snapshot || record.beforeSnapshot || {};
        const label = EVENT_LABELS[record.eventType] || record.eventType;
        const author = snapshot.author?.username
            ? snapshot.author.username + ' (' + (record.authorId || 'ID indisponível') + ')'
            : 'Autor: ' + (record.authorId || 'não identificado');
        const channel = snapshot.channelName
            ? '#' + snapshot.channelName
            : 'Canal ' + (record.channelId || 'não identificado');
        embed.addFields({
            name: label + ' · ' + safeTimestamp(record.capturedAt),
            value: '**Autor:** ' + truncate(author, 160) +
                '\n**Canal:** ' + truncate(channel, 100) +
                '\n**ID da mensagem:** ' + record.messageId +
                '\n' + eventContent(record),
            inline: false
        });
    }

    if (!result.records.length) {
        embed.addFields({ name: 'Nenhum resultado', value: 'Não encontrei registros com esses filtros no período escolhido.' });
    }
    return embed;
}

function buildHistoryEmbed(history, messageId) {
    const embed = new EmbedBuilder()
        .setColor(0x8b1a1a)
        .setTitle('✦ HISTÓRICO DA MENSAGEM')
        .setDescription('ID: ' + messageId)
        .setFooter({ text: 'Histórico privado · Até 20 eventos mais recentes' })
        .setTimestamp();

    for (const item of history.slice(-10)) {
        const record = item.record;
        embed.addFields({
            name: (EVENT_LABELS[record.eventType] || record.eventType) + ' · ' + safeTimestamp(record.capturedAt),
            value: eventContent(record),
            inline: false
        });
    }
    if (!history.length) {
        embed.addFields({ name: 'Registro não encontrado', value: 'Não há histórico indexado para esse ID. Verifique se a captura estava ativa quando a mensagem existia.' });
    }
    return embed;
}

function formatStatus(status) {
    const lines = [
        '**Armazenamento:** ' + status.storage,
        '**Estado:** ' + (status.enabled ? 'Ativo' : 'Pausado'),
        '**Disponível:** ' + (status.ready ? 'Sim' : 'Não'),
        '**Criptografia:** ' + (status.encrypted ? 'AES-256-GCM ativa' : 'Indisponível'),
        '**Retenção configurada:** ' + status.retentionDays + ' dias',
        '**Responsável definido:** ' + (status.ownerConfigured ? 'Sim' : 'Não'),
        '**Aviso público:** ' + (status.noticeChannelId ? '<#' + status.noticeChannelId + '>' : 'Ainda não publicado')
    ];
    if (status.missing?.length) lines.push('\n**Configuração pendente:** ' + status.missing.join(', '));
    return lines.join('\n');
}

export async function executeMessageArchive(interaction) {
    if (!interaction.guildId || !interaction.guild) {
        return interaction.reply({ content: 'Este comando só pode ser usado no servidor configurado.', ephemeral: true });
    }
    if (!isMessageArchiveOwner(interaction.user.id, interaction.guildId)) {
        return interaction.reply({ content: 'Este arquivo é privado e somente a conta autorizada pode acessá-lo.', ephemeral: true });
    }

    const subcommand = interaction.options.getSubcommand();
    try {
        if (subcommand === 'status') {
            const status = getMessageArchiveStatus();
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(status.ready ? 0x8b1a1a : 0x747f8d)
                    .setTitle('✦ KAORI · ARQUIVO PRIVADO')
                    .setDescription(formatStatus(status))],
                ephemeral: true
            });
        }

        if (subcommand === 'aviso') {
            await interaction.deferReply({ ephemeral: true });
            const channel = interaction.options.getChannel('canal', true);
            await publishMessageArchiveNotice(channel);
            return interaction.editReply({
                content: 'Aviso de transparência publicado em ' + channel + '. O arquivo continua pausado até você ativá-lo.',
                allowedMentions: { parse: [] }
            });
        }

        if (subcommand === 'ativar') {
            await interaction.deferReply({ ephemeral: true });
            const enabled = interaction.options.getBoolean('ligado', true);
            await setMessageArchiveEnabled(enabled, interaction.guild);
            return interaction.editReply({
                content: enabled
                    ? 'Arquivo privado ativado. Novas mensagens e eventos serão arquivados no R2, com retenção de 90 dias.'
                    : 'Captura pausada. Os registros já arquivados permanecem disponíveis até o fim da retenção.',
                allowedMentions: { parse: [] }
            });
        }

        if (subcommand === 'recentes' || subcommand === 'buscar') {
            await interaction.deferReply({ ephemeral: true });
            const days = interaction.options.getInteger('dias') ?? (subcommand === 'recentes' ? 1 : 7);
            const result = await searchMessageArchive({
                days: days,
                limit: interaction.options.getInteger('limite') ?? 10,
                term: interaction.options.getString('termo'),
                authorId: interaction.options.getUser('usuario')?.id,
                channelId: interaction.options.getChannel('canal')?.id,
                eventType: subcommand === 'recentes'
                    ? 'all'
                    : (interaction.options.getString('tipo') || 'all')
            });
            return interaction.editReply({
                embeds: [buildSearchEmbed(result, { days: days })],
                allowedMentions: { parse: [] }
            });
        }

        if (subcommand === 'mensagem') {
            await interaction.deferReply({ ephemeral: true });
            const messageId = interaction.options.getString('id', true);
            const history = await getMessageArchiveHistory(messageId);
            const latestRecord = history.at(-1)?.record;
            const archivedAttachments = (latestRecord?.snapshot?.attachments || [])
                .filter((item) => item.archived && item.storageKey)
                .slice(0, 10);
            const files = [];
            let totalBytes = 0;
            for (const item of archivedAttachments) {
                const expectedSize = Number(item.size) || 0;
                if (expectedSize > 10 * 1024 * 1024 || totalBytes + expectedSize > 20 * 1024 * 1024) continue;
                try {
                    const attachment = await getArchivedAttachment(item.storageKey);
                    if (totalBytes + attachment.length > 20 * 1024 * 1024) continue;
                    totalBytes += attachment.length;
                    files.push({ attachment: attachment, name: truncate(item.filename || 'anexo-' + (files.length + 1), 100) });
                } catch (error) {
                    console.error('[MessageArchiveCommand] falha ao recuperar anexo:', error.message);
                }
            }
            return interaction.editReply({
                embeds: [buildHistoryEmbed(history, messageId)],
                files: files,
                allowedMentions: { parse: [] }
            });
        }
    } catch (error) {
        console.error('[MessageArchiveCommand] erro:', error);
        const response = 'Não consegui concluir essa operação: ' + truncate(error.message || 'erro desconhecido', 300);
        if (interaction.deferred || interaction.replied) {
            return interaction.editReply({ content: response, allowedMentions: { parse: [] } }).catch(() => {});
        }
        return interaction.reply({ content: response, ephemeral: true, allowedMentions: { parse: [] } });
    }
}
