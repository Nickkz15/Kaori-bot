import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    EmbedBuilder,
    LabelBuilder,
    ModalBuilder,
    PermissionFlagsBits,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import { pool } from '../database/database.js';
import { GUILD_ID } from '../config/kaori.js';

const CARMINE = 0x8b1a1a;
const REVIEWABLE_STATUSES = ['open', 'waiting_info'];
const CLOSABLE_STATUSES = ['creating', 'open', 'waiting_info'];
const admissionConfigCache = new Map();

export const ADMISSION_TYPES = Object.freeze({
    entry: 'Entrada na gangue',
    partnership: 'Parceria',
    war: 'Guerra'
});

export const DEFAULT_QUESTIONS = Object.freeze({
    entry: [
        { id: 'display_name', label: 'Como devemos te chamar?', placeholder: 'Seu apelido ou nome de preferência', style: 'short', required: true, max_length: 60 },
        { id: 'invited_by', label: 'Quem te convidou?', placeholder: 'Nome ou ID do membro; se ninguém convidou, diga isso', style: 'short', required: true, max_length: 100 },
        { id: 'activity', label: 'Você costuma ser ativo?', placeholder: 'Conte sua disponibilidade e frequência', style: 'short', required: true, max_length: 180 },
        { id: 'games', label: 'Quais jogos ou atividades pratica?', placeholder: 'Ex.: Roblox, PvP, eventos, música...', style: 'short', required: true, max_length: 180 },
        { id: 'motivation', label: 'Por que deseja entrar na Allied?', placeholder: 'Fale um pouco sobre seu interesse', style: 'paragraph', required: true, max_length: 800 }
    ],
    partnership: [
        { id: 'server_name', label: 'Qual é o nome da comunidade?', placeholder: 'Nome do servidor ou projeto', style: 'short', required: true, max_length: 100 },
        { id: 'representative', label: 'Como devemos te chamar?', placeholder: 'Seu nome e cargo na comunidade', style: 'short', required: true, max_length: 100 },
        { id: 'server_link', label: 'Qual é o convite ou site?', placeholder: 'https://discord.gg/... ou site oficial', style: 'short', required: true, max_length: 200 },
        { id: 'community_size', label: 'Quantos membros ativos vocês têm?', placeholder: 'Número aproximado e atividade', style: 'short', required: true, max_length: 120 },
        { id: 'proposal', label: 'Qual parceria deseja propor?', placeholder: 'Explique a proposta e o que cada lado oferece', style: 'paragraph', required: true, max_length: 800 }
    ],
    war: [
        { id: 'organization', label: 'Qual clã ou organização está envolvido?', placeholder: 'Nome da organização', style: 'short', required: true, max_length: 100 },
        { id: 'representative', label: 'Como devemos te chamar?', placeholder: 'Seu nome e posição', style: 'short', required: true, max_length: 100 },
        { id: 'reason', label: 'Qual é o motivo do contato?', placeholder: 'Descreva objetivamente o contexto', style: 'paragraph', required: true, max_length: 800 },
        { id: 'evidence', label: 'Existem provas ou registros?', placeholder: 'Links de prints, vídeos ou mensagens (se houver)', style: 'paragraph', required: false, max_length: 800 },
        { id: 'expectation', label: 'O que espera da Allied?', placeholder: 'Explique o objetivo do contato', style: 'paragraph', required: true, max_length: 600 }
    ]
});

export const ADMISSION_DEFAULTS = Object.freeze({
    enabled: false,
    panel_channel_id: '1528324046985494649',
    panel_message_id: null,
    ticket_category_id: null,
    log_channel_id: null,
    member_role_id: '1524393369835671663',
    pending_role_id: null,
    staff_role_ids: [],
    panel_content: 'A Allied é construída por pessoas que escolhem participar, contribuir e respeitar a organização do clã. Selecione abaixo o tipo de contato para iniciar seu atendimento.',
    panel_title: 'ALLIED | ADMISSÃO',
    panel_description: 'Um clã de Gakuran voltado para organização, disciplina e trabalho em equipe.\n\n• Divisões operacionais e setores especializados;\n• Espaço para jogadores competitivos e membros sociais;\n• Atividades, eventos e projetos coletivos.\n\nEscolha uma opção abaixo. A equipe analisará cada solicitação antes de liberar o acesso completo.',
    panel_color: '#8B1A1A',
    panel_author: 'ALLIED',
    panel_author_icon_url: null,
    panel_thumbnail_url: null,
    panel_image_url: null,
    panel_footer_text: 'ALLIED · Organização, disciplina e união',
    panel_footer_icon_url: null,
    panel_timestamp: false,
    panel_fields: [],
    form_questions: DEFAULT_QUESTIONS
});

const CONFIG_COLUMNS = new Set([
    'enabled', 'panel_channel_id', 'panel_message_id', 'ticket_category_id', 'log_channel_id',
    'member_role_id', 'pending_role_id', 'staff_role_ids', 'panel_content', 'panel_title',
    'panel_description', 'panel_color', 'panel_author', 'panel_author_icon_url',
    'panel_thumbnail_url', 'panel_image_url', 'panel_footer_text', 'panel_footer_icon_url',
    'panel_timestamp', 'panel_fields', 'form_questions'
]);

function cleanText(value, maxLength, fallback = '') {
    return String(value ?? fallback).trim().slice(0, maxLength);
}

function validHttpUrl(value, { nullable = true } = {}) {
    if (value == null || value === '') return nullable ? null : undefined;
    try {
        const url = new URL(String(value));
        if (!['https:', 'http:'].includes(url.protocol)) return undefined;
        return url.href;
    } catch {
        return undefined;
    }
}

export function parseAdmissionColor(value, fallback = CARMINE) {
    if (typeof value !== 'string') return fallback;
    const match = value.trim().match(/^#?([0-9a-f]{6})$/i);
    return match ? Number.parseInt(match[1], 16) : fallback;
}

export function validateAdmissionQuestions(input) {
    if (!Array.isArray(input) || input.length < 1 || input.length > 5) {
        throw new Error('Cada formulário precisa ter entre 1 e 5 perguntas.');
    }

    const ids = new Set();
    return input.map((raw, index) => {
        const id = cleanText(raw?.id, 40);
        const label = cleanText(raw?.label, 45);
        const style = raw?.style === 'paragraph' ? 'paragraph' : 'short';
        const maxLength = Number(raw?.max_length ?? (style === 'paragraph' ? 800 : 180));

        if (!/^[a-z][a-z0-9_]*$/i.test(id)) {
            throw new Error(`ID inválido na pergunta ${index + 1}. Use letras, números e _.`);
        }
        if (ids.has(id)) throw new Error(`ID duplicado no formulário: ${id}.`);
        ids.add(id);
        if (!label) throw new Error(`A pergunta ${index + 1} precisa de um título.`);
        if (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > 4000) {
            throw new Error(`Limite inválido na pergunta ${index + 1}. Use de 1 a 4000 caracteres.`);
        }

        return {
            id,
            label,
            placeholder: cleanText(raw?.placeholder, 100),
            description: cleanText(raw?.description, 100),
            style,
            required: raw?.required !== false,
            max_length: maxLength
        };
    });
}

export async function ensureAdmissionSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS allied_admission_config (
            guild_id TEXT PRIMARY KEY,
            enabled BOOLEAN NOT NULL DEFAULT FALSE,
            panel_channel_id TEXT,
            panel_message_id TEXT,
            ticket_category_id TEXT,
            log_channel_id TEXT,
            member_role_id TEXT,
            pending_role_id TEXT,
            staff_role_ids TEXT[] NOT NULL DEFAULT '{}',
            panel_content TEXT NOT NULL DEFAULT '',
            panel_title TEXT NOT NULL DEFAULT 'ALLIED | ADMISSÃO',
            panel_description TEXT NOT NULL DEFAULT '',
            panel_color TEXT NOT NULL DEFAULT '#8B1A1A',
            panel_author TEXT,
            panel_author_icon_url TEXT,
            panel_thumbnail_url TEXT,
            panel_image_url TEXT,
            panel_footer_text TEXT,
            panel_footer_icon_url TEXT,
            panel_timestamp BOOLEAN NOT NULL DEFAULT FALSE,
            panel_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
            form_questions JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE allied_admission_config ADD COLUMN IF NOT EXISTS panel_fields JSONB NOT NULL DEFAULT '[]'::jsonb;

        CREATE TABLE IF NOT EXISTS allied_admission_applications (
            id BIGSERIAL PRIMARY KEY,
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            application_type TEXT NOT NULL CHECK (application_type IN ('entry', 'partnership', 'war')),
            display_name TEXT,
            answers JSONB NOT NULL DEFAULT '{}'::jsonb,
            status TEXT NOT NULL DEFAULT 'creating',
            channel_id TEXT,
            message_id TEXT,
            reviewer_id TEXT,
            review_note TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            reviewed_at TIMESTAMPTZ
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_allied_admission_one_active_per_user
            ON allied_admission_applications (guild_id, user_id)
            WHERE status IN ('creating', 'open', 'waiting_info');
        CREATE UNIQUE INDEX IF NOT EXISTS idx_allied_admission_one_active_per_user_v2
            ON allied_admission_applications (guild_id, user_id)
            WHERE status IN ('creating', 'open', 'waiting_info', 'reviewing');
        UPDATE allied_admission_applications
            SET status = 'open', reviewer_id = NULL, updated_at = NOW()
            WHERE status = 'reviewing';
        CREATE INDEX IF NOT EXISTS idx_allied_admission_queue
            ON allied_admission_applications (guild_id, status, created_at DESC);
    `);
}

async function readAdmissionConfig(guildId) {
    if (!guildId) throw new Error('guildId é obrigatório.');
    await pool.query(
        `INSERT INTO allied_admission_config (guild_id, panel_channel_id, member_role_id, panel_content, panel_title, panel_description, panel_color, panel_author, panel_footer_text, form_questions)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
         ON CONFLICT (guild_id) DO NOTHING`,
        [
            guildId,
            ADMISSION_DEFAULTS.panel_channel_id,
            ADMISSION_DEFAULTS.member_role_id,
            ADMISSION_DEFAULTS.panel_content,
            ADMISSION_DEFAULTS.panel_title,
            ADMISSION_DEFAULTS.panel_description,
            ADMISSION_DEFAULTS.panel_color,
            ADMISSION_DEFAULTS.panel_author,
            ADMISSION_DEFAULTS.panel_footer_text,
            JSON.stringify(DEFAULT_QUESTIONS)
        ]
    );
    const result = await pool.query(
        'SELECT * FROM allied_admission_config WHERE guild_id = $1',
        [guildId]
    );
    const row = result.rows[0] || {};
    const config = {
        ...ADMISSION_DEFAULTS,
        ...row,
        staff_role_ids: Array.isArray(row.staff_role_ids) ? row.staff_role_ids : [],
        form_questions: {
            ...DEFAULT_QUESTIONS,
            ...(row.form_questions && typeof row.form_questions === 'object' ? row.form_questions : {})
        }
    };
    admissionConfigCache.set(guildId, config);
    return config;
}

export async function getAdmissionConfig(guildId, { refresh = false } = {}) {
    if (!guildId) throw new Error('guildId é obrigatório.');
    if (!refresh && admissionConfigCache.has(guildId)) return admissionConfigCache.get(guildId);
    return readAdmissionConfig(guildId);
}

export async function updateAdmissionConfig(guildId, patch) {
    await getAdmissionConfig(guildId);
    const entries = Object.entries(patch).filter(([key]) => CONFIG_COLUMNS.has(key));
    if (!entries.length) return getAdmissionConfig(guildId);

    const sets = [];
    const values = [guildId];
    let index = 2;
    const jsonbColumns = new Set(['form_questions', 'panel_fields']);
    for (const [key, value] of entries) {
        const isJsonb = jsonbColumns.has(key);
        sets.push(`${key} = $${index}${isJsonb ? '::jsonb' : ''}`);
        values.push(isJsonb ? JSON.stringify(value) : value);
        index++;
    }
    sets.push('updated_at = NOW()');
    await pool.query(
        `UPDATE allied_admission_config SET ${sets.join(', ')} WHERE guild_id = $1`,
        values
    );
    return readAdmissionConfig(guildId);
}

function buildQuestionModal(kind, questions) {
    const title = `ALLIED · ${ADMISSION_TYPES[kind]}`.slice(0, 45);
    const modal = new ModalBuilder()
        .setCustomId(`admission:submit:${kind}`)
        .setTitle(title);

    for (const question of validateAdmissionQuestions(questions)) {
        const input = new TextInputBuilder()
            .setCustomId(`answer_${question.id}`)
            .setStyle(question.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
            .setRequired(question.required)
            .setMaxLength(question.max_length);
        if (question.placeholder) input.setPlaceholder(question.placeholder);
        const label = new LabelBuilder()
            .setLabel(question.label)
            .setTextInputComponent(input);
        if (question.description) label.setDescription(question.description);
        modal.addLabelComponents(label);
    }
    return modal;
}

export function buildAdmissionPanelPayload(config) {
    const embed = new EmbedBuilder()
        .setColor(parseAdmissionColor(config.panel_color))
        .setTitle(cleanText(config.panel_title, 256, ADMISSION_DEFAULTS.panel_title) || ADMISSION_DEFAULTS.panel_title);

    if (config.panel_description) embed.setDescription(cleanText(config.panel_description, 4096));
    if (config.panel_author) {
        const author = { name: cleanText(config.panel_author, 256) };
        const icon = validHttpUrl(config.panel_author_icon_url);
        if (icon) author.iconURL = icon;
        embed.setAuthor(author);
    }
    const thumbnail = validHttpUrl(config.panel_thumbnail_url);
    const image = validHttpUrl(config.panel_image_url);
    if (thumbnail) embed.setThumbnail(thumbnail);
    if (image) embed.setImage(image);
    if (config.panel_footer_text) {
        const footer = { text: cleanText(config.panel_footer_text, 2048) };
        const icon = validHttpUrl(config.panel_footer_icon_url);
        if (icon) footer.iconURL = icon;
        embed.setFooter(footer);
    }
    if (Array.isArray(config.panel_fields) && config.panel_fields.length) {
        const fields = config.panel_fields.slice(0, 25).map((field) => ({
            name: cleanText(field?.name, 256, 'Informação'),
            value: cleanText(field?.value, 1024, '—'),
            inline: field?.inline === true
        }));
        embed.addFields(fields);
    }
    const panelJson = embed.toJSON();
    const panelCharacterCount = [panelJson.title || '', panelJson.description || '', panelJson.author?.name || '', panelJson.footer?.text || '', ...(panelJson.fields || []).flatMap((field) => [field.name, field.value])].join('').length;
    if (panelCharacterCount > 6000) throw new Error('O painel excede o limite total de 6000 caracteres dos embeds do Discord.');
    if (config.panel_timestamp) embed.setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('admission:form:entry')
            .setLabel('Entrar na Gangue')
            .setEmoji('⚔️')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('admission:form:partnership')
            .setLabel('Parceria')
            .setEmoji('🤝')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('admission:form:war')
            .setLabel('Guerra')
            .setEmoji('⚔️')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('division-ticket:open')
            .setLabel('Entrar em uma divisão')
            .setEmoji('✦')
            .setStyle(ButtonStyle.Primary)
    );

    return {
        content: cleanText(config.panel_content, 2000) || undefined,
        embeds: [embed],
        components: [row],
        allowedMentions: { parse: [] }
    };
}

export async function publishAdmissionPanel(guild, config = null) {
    if (!guild) throw new Error('Servidor não encontrado.');
    const current = config || await getAdmissionConfig(guild.id);
    const channelId = current.panel_channel_id;
    if (!channelId) throw new Error('Configure o canal do painel antes de publicar.');

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased() || !channel.send) {
        throw new Error('O canal do painel não existe ou não é um canal de texto.');
    }

    const payload = buildAdmissionPanelPayload(current);
    let message = null;
    if (current.panel_message_id) {
        message = await channel.messages.fetch(current.panel_message_id).catch(() => null);
    }
    if (message) {
        await message.edit(payload);
    } else {
        message = await channel.send(payload);
    }
    await updateAdmissionConfig(guild.id, {
        panel_channel_id: channel.id,
        panel_message_id: message.id
    });
    return { channel, message };
}

function slug(value) {
    return String(value || 'membro')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 35) || 'membro';
}

function truncate(value, max = 1024) {
    const text = String(value ?? '').trim();
    if (!text) return '—';
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function canReview(member, config) {
    if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
    return (config.staff_role_ids || []).some((roleId) => member.roles?.cache?.has(roleId));
}

function buildApplicationCard(application, kind, answers, config) {
    const embed = new EmbedBuilder()
        .setColor(CARMINE)
        .setTitle(`${ADMISSION_TYPES[kind]} · #${application.id}`)
        .setDescription(`**Candidato:** <@${application.user_id}>\n**Status:** Em análise\n\nA equipe deve revisar as respostas antes de conceder o cargo de membro.`)
        .setTimestamp(new Date(application.created_at || Date.now()));

    const questions = config.form_questions?.[kind] || DEFAULT_QUESTIONS[kind];
    for (const question of questions) {
        embed.addFields({
            name: truncate(question.label, 256),
            value: truncate(answers[question.id], 1024),
            inline: false
        });
    }
    embed.setFooter({ text: 'ALLIED · Admission System | A aprovação é manual' });

    const primaryAction = kind === 'entry'
        ? new ButtonBuilder()
            .setCustomId(`admission:approve:${application.id}`)
            .setLabel('Aprovar e liberar cargo')
            .setStyle(ButtonStyle.Success)
        : new ButtonBuilder()
            .setCustomId(`admission:resolve:${application.id}`)
            .setLabel(kind === 'partnership' ? 'Confirmar parceria' : 'Registrar resolução')
            .setStyle(ButtonStyle.Success);

    const actions = new ActionRowBuilder().addComponents(
        primaryAction,
        new ButtonBuilder()
            .setCustomId(`admission:reject:${application.id}`)
            .setLabel('Recusar')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`admission:info:${application.id}`)
            .setLabel('Solicitar esclarecimento')
            .setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [actions] };
}

async function getApplication(id, guildId) {
    const result = await pool.query(
        'SELECT * FROM allied_admission_applications WHERE id = $1 AND guild_id = $2',
        [id, guildId]
    );
    return result.rows[0] || null;
}

async function claimApplicationForReview(id, guildId, reviewerId) {
    const result = await pool.query(
        `UPDATE allied_admission_applications
         SET status = 'reviewing', reviewer_id = $3, updated_at = NOW()
         WHERE id = $1 AND guild_id = $2 AND status = ANY($4::text[])
         RETURNING *`,
        [id, guildId, reviewerId, REVIEWABLE_STATUSES]
    );
    return result.rows[0] || null;
}

async function setApplicationStatus(id, guildId, status, reviewerId = null, reviewNote = null) {
    return pool.query(
        `UPDATE allied_admission_applications
         SET status = $3, reviewer_id = COALESCE($4, reviewer_id), review_note = COALESCE($5, review_note),
             reviewed_at = CASE WHEN $3 IN ('approved', 'rejected', 'accepted', 'closed') THEN NOW() ELSE reviewed_at END,
             updated_at = NOW()
         WHERE id = $1 AND guild_id = $2`,
        [id, guildId, status, reviewerId, reviewNote]
    );
}

async function closeApplicationIfOpen(id, guildId, reviewerId) {
    const result = await pool.query(
        `UPDATE allied_admission_applications
         SET status='closed', reviewer_id=COALESCE($3, reviewer_id), reviewed_at=NOW(), updated_at=NOW()
         WHERE id=$1 AND guild_id=$2 AND status = ANY($4::text[])
         RETURNING id`,
        [id, guildId, reviewerId, CLOSABLE_STATUSES]
    );
    return result.rowCount > 0;
}

async function createPrivateTicket(interaction, member, kind, answers, config) {
    const guild = interaction.guild;
    const user = interaction.user;
    const displayName = member.displayName || user.globalName || user.username;

    const created = await pool.query(
        `INSERT INTO allied_admission_applications
            (guild_id, user_id, application_type, display_name, answers, status)
         VALUES ($1, $2, $3, $4, $5::jsonb, 'creating')
         RETURNING *`,
        [guild.id, user.id, kind, displayName, JSON.stringify(answers)]
    );
    const application = created.rows[0];

    let ticket = null;
    try {
        const overwrites = [
            {
                id: guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
            },
            {
                id: user.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks]
            },
            {
                id: interaction.client.user.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks]
            }
        ];

        const validStaffRoles = [];
        for (const roleId of [...new Set(config.staff_role_ids || [])]) {
            if (!roleId || roleId === guild.roles.everyone.id) continue;
            const role = await guild.roles.fetch(roleId).catch(() => null);
            if (!role) continue;
            validStaffRoles.push(role.id);
            overwrites.push({
                id: role.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages]
            });
        }

        let parent = null;
        if (config.ticket_category_id) {
            parent = await guild.channels.fetch(config.ticket_category_id).catch(() => null);
            if (!parent || parent.type !== ChannelType.GuildCategory) {
                throw new Error('A categoria configurada para os tíquetes não existe ou não é uma categoria.');
            }
        }

        ticket = await guild.channels.create({
            name: `admissao-${kind}-${application.id}-${slug(displayName)}`.slice(0, 95),
            type: ChannelType.GuildText,
            parent: parent?.id || undefined,
            topic: `ALLIED_ADMISSION:${application.id}:${user.id}:${kind}`,
            permissionOverwrites: overwrites,
            reason: `Solicitação de ${ADMISSION_TYPES[kind]} por ${user.tag}`
        });

        const card = buildApplicationCard(application, kind, answers, config);
        const staffMentions = validStaffRoles.map((id) => `<@&${id}>`).join(' ');
        const message = await ticket.send({
            content: `<@${user.id}> ${staffMentions}`.trim(),
            ...card,
            allowedMentions: { users: [user.id], roles: validStaffRoles, parse: [] }
        });

        await pool.query(
            `UPDATE allied_admission_applications
             SET status = 'open', channel_id = $2, message_id = $3, updated_at = NOW()
             WHERE id = $1`,
            [application.id, ticket.id, message.id]
        );

        // Cargo provisório é opcional e deve ter permissões mínimas configuradas no servidor.
        // Nunca é o cargo final de membro da Allied.
        if (kind === 'entry' && config.pending_role_id && config.pending_role_id !== config.member_role_id && !member.roles.cache.has(config.pending_role_id)) {
            const pendingRole = await guild.roles.fetch(config.pending_role_id).catch(() => null);
            if (pendingRole) {
                await member.roles.add(pendingRole, 'Solicitação de admissão enviada; acesso provisório limitado').catch((roleError) => {
                    console.warn('[AlliedAdmission] pending role not assigned:', roleError.message);
                });
            }
        }

        if (config.log_channel_id) {
            const logChannel = await guild.channels.fetch(config.log_channel_id).catch(() => null);
            if (logChannel?.isTextBased()) {
                await logChannel.send({
                    content: `Nova solicitação **${ADMISSION_TYPES[kind]}** · #${application.id} · <@${user.id}> · ${ticket}`,
                    allowedMentions: { users: [], roles: [], parse: [] }
                }).catch(() => {});
            }
        }

        return ticket;
    } catch (error) {
        await pool.query(
            `UPDATE allied_admission_applications SET status = 'failed', updated_at = NOW() WHERE id = $1`,
            [application.id]
        ).catch(() => {});
        if (ticket) await ticket.delete('Falha ao finalizar a solicitação').catch(() => {});
        throw error;
    }
}

export async function handleAdmissionModal(interaction) {
    const kind = interaction.customId.split(':')[2];
    if (!Object.hasOwn(ADMISSION_TYPES, kind)) {
        return interaction.reply({ content: 'Tipo de solicitação inválido.', ephemeral: true });
    }
    if (!interaction.guild || !interaction.guildId) {
        return interaction.reply({ content: 'Este formulário só funciona dentro da Allied.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const config = await getAdmissionConfig(interaction.guildId);
    if (!config.enabled) {
        return interaction.editReply({ content: 'O sistema de admissão está temporariamente fechado.' });
    }

    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) return interaction.editReply({ content: 'Não consegui localizar seu perfil dentro do servidor.' });
    if (kind === 'entry') {
        const memberRole = config.member_role_id
            ? await interaction.guild.roles.fetch(config.member_role_id).catch(() => null)
            : null;
        if (!memberRole || memberRole.id === interaction.guild.roles.everyone.id) {
            return interaction.editReply({ content: 'O cargo final da Allied não está configurado corretamente. Avise a equipe.' });
        }
        if (member.roles.cache.has(memberRole.id)) {
            return interaction.editReply({ content: 'Você já possui o cargo de membro da Allied.' });
        }
    }

    const questions = validateAdmissionQuestions(config.form_questions?.[kind] || DEFAULT_QUESTIONS[kind]);
    const answers = {};
    for (const question of questions) {
        const value = interaction.fields.getTextInputValue(`answer_${question.id}`).trim();
        if (question.required && !value) {
            return interaction.editReply({ content: `Preencha a pergunta **${question.label}**.` });
        }
        answers[question.id] = value;
    }

    try {
        const ticket = await createPrivateTicket(interaction, member, kind, answers, config);
        return interaction.editReply({
            content: `Sua solicitação foi registrada. A equipe continuará o atendimento em ${ticket}. O acesso completo só será liberado após aprovação.`
        });
    } catch (error) {
        if (error?.code === '23505') {
            return interaction.editReply({ content: 'Você já possui uma solicitação em andamento. Termine ou encerre o atendimento atual antes de abrir outra.' });
        }
        console.error('[AlliedAdmission] create ticket:', error);
        return interaction.editReply({ content: `Não consegui abrir seu atendimento: ${truncate(error.message, 250)}. Avise a equipe da Allied.` });
    }
}

async function removePendingRole(guild, userId, config, reason) {
    if (!config.pending_role_id || config.pending_role_id === config.member_role_id) return false;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member?.roles.cache.has(config.pending_role_id)) return false;
    try {
        await member.roles.remove(config.pending_role_id, reason);
        return true;
    } catch (error) {
        console.warn('[AlliedAdmission] pending role removal failed:', error.message);
        return false;
    }
}

async function handleReviewAction(interaction, action, id) {
    await interaction.deferReply({ ephemeral: true });
    const config = await getAdmissionConfig(interaction.guildId);
    const actingMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!actingMember || !canReview(actingMember, config)) {
        return interaction.editReply({ content: 'Somente a equipe autorizada pode revisar solicitações.' });
    }

    let application = await getApplication(id, interaction.guildId);
    if (!application) return interaction.editReply({ content: 'Solicitação não encontrada.' });
    if (!REVIEWABLE_STATUSES.includes(application.status)) {
        const statusMessage = application.status === 'reviewing'
            ? 'Esta solicitação já está sendo analisada por outra pessoa da equipe.'
            : `Esta solicitação já está **${application.status}**.`;
        return interaction.editReply({ content: statusMessage });
    }

    const ticket = await interaction.guild.channels.fetch(application.channel_id).catch(() => null);
    if (!ticket?.isTextBased()) {
        return interaction.editReply({ content: 'Canal de atendimento não encontrado.' });
    }

    const previousStatus = application.status;
    application = await claimApplicationForReview(id, interaction.guildId, interaction.user.id);
    if (!application) {
        return interaction.editReply({ content: 'Outra pessoa da equipe começou a analisar esta solicitação. Atualize o atendimento.' });
    }

    if (action === 'approve') {
        if (application.application_type !== 'entry') {
            await setApplicationStatus(id, interaction.guildId, previousStatus).catch(() => {});
            return interaction.editReply({ content: 'Somente solicitações de entrada podem conceder o cargo de membro.' });
        }
        if (!config.member_role_id) {
            await setApplicationStatus(id, interaction.guildId, previousStatus).catch(() => {});
            return interaction.editReply({ content: 'Configure o cargo final com `/allied-admission configurar` antes de aprovar.' });
        }
        const role = await interaction.guild.roles.fetch(config.member_role_id).catch(() => null);
        if (!role || role.id === interaction.guild.roles.everyone.id || role.managed) {
            await setApplicationStatus(id, interaction.guildId, previousStatus).catch(() => {});
            return interaction.editReply({ content: 'O cargo final configurado não existe mais ou não pode ser atribuído.' });
        }
        const botMember = interaction.guild.members.me || await interaction.guild.members.fetch(interaction.client.user.id).catch(() => null);
        if (!botMember?.permissions?.has(PermissionFlagsBits.ManageRoles) || botMember.roles.highest.position <= role.position) {
            await setApplicationStatus(id, interaction.guildId, previousStatus).catch(() => {});
            return interaction.editReply({ content: 'A Kaori precisa de Gerenciar Cargos e ter seu cargo mais alto acima do cargo final de membro.' });
        }
        const member = await interaction.guild.members.fetch(application.user_id).catch(() => null);
        if (!member) {
            await setApplicationStatus(id, interaction.guildId, 'cancelled', interaction.user.id, 'Candidato não está mais no servidor.');
            return interaction.editReply({ content: 'O candidato saiu do servidor; a solicitação foi cancelada.' });
        }

        let roleWasAdded = false;
        try {
            if (!member.roles.cache.has(role.id)) {
                await member.roles.add(role, `Admissão Allied aprovada por ${interaction.user.tag}`);
                roleWasAdded = true;
            }
            await setApplicationStatus(id, interaction.guildId, 'approved', interaction.user.id);
            if (config.pending_role_id && config.pending_role_id !== role.id && member.roles.cache.has(config.pending_role_id)) {
                await member.roles.remove(config.pending_role_id, 'Admissão Allied aprovada').catch((removeError) => {
                    console.warn('[AlliedAdmission] pending role not removed:', removeError.message);
                });
            }
            await ticket.send({ content: `A solicitação foi **aprovada** por ${interaction.user}. O cargo ${role} foi concedido.`, allowedMentions: { users: [], roles: [role.id], parse: [] } }).catch((sendError) => console.error('[AlliedAdmission] approval notice:', sendError));
            await interaction.message.edit({ components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`admission:close:${id}`).setLabel('Encerrar atendimento').setStyle(ButtonStyle.Secondary)
            )] }).catch(() => {});
            await member.send(`Sua entrada na Allied foi aprovada. Bem-vindo(a)!`).catch(() => {});
            return interaction.editReply({ content: `Aprovação concluída. ${member} recebeu ${role}.` });
        } catch (error) {
            if (roleWasAdded) {
                await member.roles.remove(role, 'Reversão: não foi possível registrar a aprovação no PostgreSQL').catch((rollbackError) => {
                    console.error('[AlliedAdmission] role rollback failed:', rollbackError.message);
                });
            }
            await setApplicationStatus(id, interaction.guildId, previousStatus).catch((statusError) => {
                console.error('[AlliedAdmission] failed to release review claim:', statusError.message);
            });
            console.error('[AlliedAdmission] approve:', error);
            return interaction.editReply({ content: `Não consegui concluir a aprovação. Confira a hierarquia de cargos, Gerenciar Cargos do bot e a conexão com o PostgreSQL. (${truncate(error.message, 180)})` });
        }
    }

    if (action === 'reject') {
        await setApplicationStatus(id, interaction.guildId, 'rejected', interaction.user.id);
        if (application.application_type === 'entry') {
            await removePendingRole(interaction.guild, application.user_id, config, 'Solicitação de admissão recusada');
        }
        await ticket.send({ content: `A solicitação foi **recusada** por ${interaction.user}. Caso tenha dúvidas, entre em contato com a equipe.` }).catch((sendError) => console.error('[AlliedAdmission] rejection notice:', sendError));
        await interaction.message.edit({ components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`admission:close:${id}`).setLabel('Encerrar atendimento').setStyle(ButtonStyle.Secondary)
        )] }).catch(() => {});
        const user = await interaction.client.users.fetch(application.user_id).catch(() => null);
        await user?.send('Sua solicitação para a Allied não foi aprovada neste momento. Consulte a equipe caso precise de esclarecimentos.').catch(() => {});
        return interaction.editReply({ content: 'Solicitação recusada e decisão registrada.' });
    }

    if (action === 'resolve') {
        if (application.application_type === 'entry') {
            await setApplicationStatus(id, interaction.guildId, previousStatus).catch(() => {});
            return interaction.editReply({ content: 'Solicitações de entrada precisam da ação específica de aprovação.' });
        }
        await setApplicationStatus(id, interaction.guildId, 'accepted', interaction.user.id);
        const label = application.application_type === 'partnership' ? 'parceria confirmada' : 'contato de guerra/resolução registrado';
        await ticket.send({
            content: `A equipe marcou esta solicitação como **${label}**. Nenhum cargo de membro foi concedido por esta ação.`
        }).catch((sendError) => console.error('[AlliedAdmission] resolution notice:', sendError));
        await interaction.message.edit({ components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`admission:close:${id}`).setLabel('Encerrar atendimento').setStyle(ButtonStyle.Secondary)
        )] }).catch(() => {});
        return interaction.editReply({ content: 'Solicitação registrada como concluída. Nenhum cargo foi alterado.' });
    }

    if (action === 'info') {
        await setApplicationStatus(id, interaction.guildId, 'waiting_info', interaction.user.id);
        await ticket.send({ content: `<@${application.user_id}> a equipe precisa de mais informações para continuar sua análise. Responda neste canal, por favor.`, allowedMentions: { users: [application.user_id], parse: [] } }).catch((sendError) => console.error('[AlliedAdmission] info request notice:', sendError));
        return interaction.editReply({ content: 'Pedido de esclarecimento enviado ao candidato.' });
    }

    await setApplicationStatus(id, interaction.guildId, previousStatus).catch(() => {});
    return interaction.editReply({ content: 'Ação de revisão desconhecida.' });
}

async function handleCloseAction(interaction, id) {
    await interaction.deferReply({ ephemeral: true });
    const config = await getAdmissionConfig(interaction.guildId);
    const application = await getApplication(id, interaction.guildId);
    if (!application) return interaction.editReply({ content: 'Solicitação não encontrada.' });
    const isOwner = application.user_id === interaction.user.id;
    const actingMember = isOwner ? null : await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!isOwner && (!actingMember || !canReview(actingMember, config))) {
        return interaction.editReply({ content: 'Somente o autor ou a equipe pode encerrar este atendimento.' });
    }
    if (application.status === 'reviewing') {
        return interaction.editReply({ content: 'A equipe está analisando esta solicitação. Aguarde a conclusão antes de encerrar.' });
    }
    if (CLOSABLE_STATUSES.includes(application.status)) {
        const closed = await closeApplicationIfOpen(id, interaction.guildId, interaction.user.id);
        if (!closed) {
            return interaction.editReply({ content: 'A equipe começou a analisar esta solicitação. Aguarde a conclusão antes de encerrar.' });
        }
        if (application.application_type === 'entry') {
            await removePendingRole(interaction.guild, application.user_id, config, 'Atendimento de admissão encerrado');
        }
    }
    await interaction.channel.permissionOverwrites.edit(application.user_id, {
        SendMessages: false,
        AddReactions: false
    }).catch(() => {});
    await interaction.channel.setName(`encerrado-${id}`.slice(0, 95)).catch(() => {});
    await interaction.message.edit({ components: [] }).catch(() => {});
    return interaction.editReply({ content: 'Atendimento encerrado. O histórico foi mantido para consulta da equipe.' });
}

export async function handleAdmissionButton(interaction) {
    const [namespace, action, value] = interaction.customId.split(':');
    if (namespace !== 'admission') return false;
    if (!interaction.guild || !interaction.guildId) {
        await interaction.reply({ content: 'Este painel só funciona dentro do servidor da Allied.', ephemeral: true });
        return true;
    }

    if (action === 'form') {
        const kind = value;
        if (!Object.hasOwn(ADMISSION_TYPES, kind)) {
            await interaction.reply({ content: 'Opção de admissão inválida.', ephemeral: true });
            return true;
        }
        const config = await getAdmissionConfig(interaction.guildId);
        if (!config.enabled) {
            await interaction.reply({ content: 'A admissão está fechada no momento.', ephemeral: true });
            return true;
        }
        const questions = config.form_questions?.[kind] || DEFAULT_QUESTIONS[kind];
        await interaction.showModal(buildQuestionModal(kind, questions));
        return true;
    }

    if (['approve', 'reject', 'info', 'resolve'].includes(action)) {
        await handleReviewAction(interaction, action, value);
        return true;
    }
    if (action === 'close') {
        await handleCloseAction(interaction, value);
        return true;
    }
    return false;
}

export async function initAlliedAdmission() {
    await ensureAdmissionSchema();
    if (GUILD_ID) await readAdmissionConfig(GUILD_ID);
    console.log('✅ Allied Admission System pronto.');
}
