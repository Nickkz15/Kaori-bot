import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    EmbedBuilder,
    LabelBuilder,
    ModalBuilder,
    PermissionFlagsBits,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import { pool } from '../database/database.js';
import { GUILD_ID } from '../config/kaori.js';

const CARMINE = 0x8b1a1a;
const ACTIVE_STATUSES = ['creating', 'open', 'waiting_info'];
const divisionConfigCache = new Map();

export const DEFAULT_DIVISION_QUESTIONS = Object.freeze([
    { id: 'display_name', label: 'Como devemos te chamar?', placeholder: 'Seu apelido ou nome de preferência', style: 'short', required: true, max_length: 60 },
    { id: 'activity', label: 'Qual é sua disponibilidade?', placeholder: 'Dias, horários e frequência em que costuma jogar', style: 'short', required: true, max_length: 180 },
    { id: 'experience', label: 'Qual é sua experiência?', placeholder: 'Conte um pouco sobre sua experiência na área', style: 'paragraph', required: true, max_length: 700 },
    { id: 'motivation', label: 'Por que deseja entrar nesta divisão?', placeholder: 'O que espera contribuir e aprender?', style: 'paragraph', required: true, max_length: 700 }
]);

export const DIVISION_TICKET_DEFAULTS = Object.freeze({
    enabled: false,
    panel_channel_id: null,
    panel_message_id: null,
    ticket_category_id: null,
    log_channel_id: null,
    member_role_id: '1524393369835671663',
    staff_role_ids: [],
    panel_title: 'ALLIED | INGRESSO NAS DIVISÕES',
    panel_description: 'Cada divisão tem seu próprio propósito, responsabilidades e estilo de atuação.\n\nEscolha abaixo a divisão que combina com seu perfil e preencha a candidatura. A equipe responsável fará a análise antes de conceder qualquer cargo.',
    panel_content: '✦ ALLIED · DIVISION ADMISSIONS',
    panel_color: '#8B1A1A',
    panel_thumbnail_url: null,
    panel_image_url: null,
    panel_footer_text: 'ALLIED · Organização, disciplina e união'
});

function cleanText(value, maxLength, fallback = '') {
    return String(value ?? fallback).trim().slice(0, maxLength);
}

function validHttpUrl(value) {
    if (!value) return null;
    try {
        const url = new URL(String(value));
        return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch {
        return null;
    }
}

function slug(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-_]+|[-_]+$/g, '')
        .slice(0, 32);
}

function truncate(value, max = 1024) {
    const text = String(value ?? '').trim();
    if (!text) return '—';
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function validateDivisionQuestions(input) {
    if (!Array.isArray(input) || input.length < 1 || input.length > 5) {
        throw new Error('Cada formulário precisa ter entre 1 e 5 perguntas.');
    }
    const ids = new Set();
    return input.map((raw, index) => {
        const id = cleanText(raw?.id, 40);
        const label = cleanText(raw?.label, 45);
        const style = raw?.style === 'paragraph' ? 'paragraph' : 'short';
        const maxLength = Number(raw?.max_length ?? (style === 'paragraph' ? 700 : 180));
        if (!/^[a-z][a-z0-9_]*$/i.test(id)) throw new Error(`ID inválido na pergunta ${index + 1}. Use letras, números e _.`);
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

function normalizeDivision(row) {
    if (!row) return null;
    let questions = row.questions;
    if (typeof questions === 'string') {
        try { questions = JSON.parse(questions); } catch { questions = DEFAULT_DIVISION_QUESTIONS; }
    }
    return {
        ...row,
        reviewer_role_ids: Array.isArray(row.reviewer_role_ids) ? row.reviewer_role_ids : [],
        questions: validateDivisionQuestions(Array.isArray(questions) && questions.length ? questions : DEFAULT_DIVISION_QUESTIONS)
    };
}

export async function ensureDivisionTicketSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS allied_division_ticket_config (
            guild_id TEXT PRIMARY KEY,
            enabled BOOLEAN NOT NULL DEFAULT FALSE,
            panel_channel_id TEXT,
            panel_message_id TEXT,
            ticket_category_id TEXT,
            log_channel_id TEXT,
            member_role_id TEXT,
            staff_role_ids TEXT[] NOT NULL DEFAULT '{}',
            panel_title TEXT NOT NULL DEFAULT 'ALLIED | INGRESSO NAS DIVISÕES',
            panel_description TEXT NOT NULL DEFAULT '',
            panel_content TEXT NOT NULL DEFAULT '',
            panel_color TEXT NOT NULL DEFAULT '#8B1A1A',
            panel_thumbnail_url TEXT,
            panel_image_url TEXT,
            panel_footer_text TEXT,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS allied_divisions (
            guild_id TEXT NOT NULL,
            division_key TEXT NOT NULL,
            name TEXT NOT NULL,
            role_id TEXT NOT NULL,
            emoji TEXT,
            reviewer_role_ids TEXT[] NOT NULL DEFAULT '{}',
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            questions JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (guild_id, division_key)
        );

        ALTER TABLE allied_divisions ADD COLUMN IF NOT EXISTS reviewer_role_ids TEXT[] NOT NULL DEFAULT '{}';

        CREATE TABLE IF NOT EXISTS allied_division_requests (
            id BIGSERIAL PRIMARY KEY,
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            division_key TEXT NOT NULL,
            division_name TEXT NOT NULL,
            division_role_id TEXT NOT NULL,
            reviewer_role_ids TEXT[] NOT NULL DEFAULT '{}',
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

        ALTER TABLE allied_division_requests ADD COLUMN IF NOT EXISTS reviewer_role_ids TEXT[] NOT NULL DEFAULT '{}';

        CREATE UNIQUE INDEX IF NOT EXISTS idx_allied_division_one_active_request
            ON allied_division_requests (guild_id, user_id, division_key)
            WHERE status IN ('creating', 'open', 'waiting_info');
        CREATE INDEX IF NOT EXISTS idx_allied_division_request_queue
            ON allied_division_requests (guild_id, status, created_at DESC);
    `);
}

async function readDivisionTicketConfig(guildId) {
    if (!guildId) throw new Error('guildId é obrigatório.');
    await pool.query(
        `INSERT INTO allied_division_ticket_config
            (guild_id, member_role_id, panel_title, panel_description, panel_content, panel_color, panel_footer_text)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (guild_id) DO NOTHING`,
        [guildId, DIVISION_TICKET_DEFAULTS.member_role_id, DIVISION_TICKET_DEFAULTS.panel_title,
            DIVISION_TICKET_DEFAULTS.panel_description, DIVISION_TICKET_DEFAULTS.panel_content,
            DIVISION_TICKET_DEFAULTS.panel_color, DIVISION_TICKET_DEFAULTS.panel_footer_text]
    );
    const result = await pool.query('SELECT * FROM allied_division_ticket_config WHERE guild_id = $1', [guildId]);
    const row = result.rows[0] || {};
    const config = {
        ...DIVISION_TICKET_DEFAULTS,
        ...row,
        staff_role_ids: Array.isArray(row.staff_role_ids) ? row.staff_role_ids : []
    };
    divisionConfigCache.set(guildId, config);
    return config;
}

export async function getDivisionTicketConfig(guildId, { refresh = false } = {}) {
    if (!refresh && divisionConfigCache.has(guildId)) return divisionConfigCache.get(guildId);
    return readDivisionTicketConfig(guildId);
}

export async function updateDivisionTicketConfig(guildId, patch) {
    await getDivisionTicketConfig(guildId);
    const allowed = new Set(Object.keys(DIVISION_TICKET_DEFAULTS));
    const entries = Object.entries(patch).filter(([key]) => allowed.has(key));
    if (!entries.length) return getDivisionTicketConfig(guildId);
    const sets = [];
    const values = [guildId];
    let n = 2;
    for (const [key, value] of entries) {
        sets.push(`${key} = $${n}`);
        values.push(value);
        n++;
    }
    sets.push('updated_at = NOW()');
    await pool.query(`UPDATE allied_division_ticket_config SET ${sets.join(', ')} WHERE guild_id = $1`, values);
    return readDivisionTicketConfig(guildId);
}

export async function listAlliedDivisions(guildId, { enabledOnly = false } = {}) {
    const result = await pool.query(
        `SELECT * FROM allied_divisions WHERE guild_id = $1 ${enabledOnly ? 'AND enabled = TRUE' : ''} ORDER BY name ASC`,
        [guildId]
    );
    return result.rows.map(normalizeDivision);
}

export async function getAlliedDivision(guildId, key) {
    const result = await pool.query(
        'SELECT * FROM allied_divisions WHERE guild_id = $1 AND division_key = $2',
        [guildId, slug(key)]
    );
    return normalizeDivision(result.rows[0]);
}

export async function upsertAlliedDivision(guildId, { key, name, roleId, emoji = null, reviewerRoleIds = [], questions = DEFAULT_DIVISION_QUESTIONS }) {
    const divisionKey = slug(key);
    const divisionName = cleanText(name, 80);
    if (!divisionKey || !/^[a-z0-9][a-z0-9_-]{0,31}$/.test(divisionKey)) {
        throw new Error('Chave inválida. Use letras minúsculas, números, hífen ou _.');
    }
    if (!divisionName) throw new Error('O nome da divisão é obrigatório.');
    if (!/^\d{17,20}$/.test(String(roleId || ''))) throw new Error('Selecione um cargo válido para a divisão.');
    const normalizedQuestions = validateDivisionQuestions(questions);
    const result = await pool.query(
        `INSERT INTO allied_divisions (guild_id, division_key, name, role_id, emoji, reviewer_role_ids, enabled, questions)
         VALUES ($1,$2,$3,$4,$5,$6,TRUE,$7::jsonb)
         ON CONFLICT (guild_id, division_key) DO UPDATE SET
            name = EXCLUDED.name, role_id = EXCLUDED.role_id, emoji = EXCLUDED.emoji,
            reviewer_role_ids = CASE WHEN cardinality(EXCLUDED.reviewer_role_ids) > 0 THEN EXCLUDED.reviewer_role_ids ELSE allied_divisions.reviewer_role_ids END,
            enabled = TRUE, questions = EXCLUDED.questions, updated_at = NOW()
         RETURNING *`,
        [guildId, divisionKey, divisionName, roleId, emoji ? String(emoji).slice(0, 64) : null, [...new Set(reviewerRoleIds)], JSON.stringify(normalizedQuestions)]
    );
    return normalizeDivision(result.rows[0]);
}

export async function setAlliedDivisionQuestions(guildId, key, questions) {
    const normalized = validateDivisionQuestions(questions);
    const result = await pool.query(
        `UPDATE allied_divisions SET questions = $3::jsonb, updated_at = NOW()
         WHERE guild_id = $1 AND division_key = $2 RETURNING *`,
        [guildId, slug(key), JSON.stringify(normalized)]
    );
    if (!result.rows[0]) throw new Error('Divisão não encontrada.');
    return normalizeDivision(result.rows[0]);
}

export async function setAlliedDivisionEnabled(guildId, key, enabled) {
    const result = await pool.query(
        `UPDATE allied_divisions SET enabled = $3, updated_at = NOW()
         WHERE guild_id = $1 AND division_key = $2 RETURNING *`,
        [guildId, slug(key), Boolean(enabled)]
    );
    if (!result.rows[0]) throw new Error('Divisão não encontrada.');
    return normalizeDivision(result.rows[0]);
}

export async function removeAlliedDivision(guildId, key) {
    const result = await pool.query(
        'DELETE FROM allied_divisions WHERE guild_id = $1 AND division_key = $2 RETURNING division_key',
        [guildId, slug(key)]
    );
    return Boolean(result.rowCount);
}

function buildDivisionModal(division) {
    const modal = new ModalBuilder()
        .setCustomId(`division-ticket:submit:${division.division_key}`)
        .setTitle(`ALLIED · ${division.name}`.slice(0, 45));
    for (const question of validateDivisionQuestions(division.questions)) {
        const input = new TextInputBuilder()
            .setCustomId(`answer_${question.id}`)
            .setStyle(question.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
            .setRequired(question.required)
            .setMaxLength(question.max_length);
        if (question.placeholder) input.setPlaceholder(question.placeholder);
        const label = new LabelBuilder().setLabel(question.label).setTextInputComponent(input);
        if (question.description) label.setDescription(question.description);
        modal.addLabelComponents(label);
    }
    return modal;
}

export function buildDivisionPanelPayload(config, divisions) {
    const embed = new EmbedBuilder()
        .setColor(Number.isFinite(Number.parseInt(String(config.panel_color || '#8B1A1A').replace('#', ''), 16)) ? Number.parseInt(String(config.panel_color || '#8B1A1A').replace('#', ''), 16) : CARMINE)
        .setTitle(cleanText(config.panel_title, 256, DIVISION_TICKET_DEFAULTS.panel_title));
    if (config.panel_description) embed.setDescription(cleanText(config.panel_description, 4096));
    const thumb = validHttpUrl(config.panel_thumbnail_url);
    const image = validHttpUrl(config.panel_image_url);
    if (thumb) embed.setThumbnail(thumb);
    if (image) embed.setImage(image);
    if (config.panel_footer_text) embed.setFooter({ text: cleanText(config.panel_footer_text, 2048) });
    if (divisions.length) {
        embed.addFields({
            name: 'DIVISÕES DISPONÍVEIS',
            value: divisions.slice(0, 25).map((division) => `${division.emoji || '✦'} **${division.name}**`).join('\n'),
            inline: false
        });
    } else {
        embed.addFields({ name: 'INSCRIÇÕES', value: 'Nenhuma divisão está aceitando candidaturas no momento.' });
    }
    const payload = {
        content: cleanText(config.panel_content, 2000) || undefined,
        embeds: [embed],
        allowedMentions: { parse: [] }
    };
    if (divisions.length) {
        const menu = new StringSelectMenuBuilder()
            .setCustomId('division-ticket:select')
            .setPlaceholder('Escolha a divisão que deseja integrar')
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(divisions.slice(0, 25).map((division) => ({
                label: division.name.slice(0, 100),
                value: division.division_key,
                description: `Solicitar ingresso em ${division.name}`.slice(0, 100),
                ...(division.emoji ? { emoji: division.emoji } : {})
            })));
        payload.components = [new ActionRowBuilder().addComponents(menu)];
    }
    return payload;
}

export async function publishDivisionPanel(guild, config = null) {
    if (!guild) throw new Error('Servidor não encontrado.');
    const current = config || await getDivisionTicketConfig(guild.id);
    if (!current.panel_channel_id) throw new Error('Configure o canal do painel primeiro.');
    const channel = await guild.channels.fetch(current.panel_channel_id).catch(() => null);
    if (!channel?.isTextBased() || !channel.send) throw new Error('Canal do painel inválido ou inacessível.');
    const divisions = await listAlliedDivisions(guild.id, { enabledOnly: true });
    if (divisions.length > 25) throw new Error('O Discord permite no máximo 25 opções no seletor de divisões.');
    const payload = buildDivisionPanelPayload(current, divisions);
    let message = current.panel_message_id ? await channel.messages.fetch(current.panel_message_id).catch(() => null) : null;
    if (message) await message.edit(payload);
    else message = await channel.send(payload);
    await updateDivisionTicketConfig(guild.id, { panel_channel_id: channel.id, panel_message_id: message.id });
    return { channel, message, divisions };
}

function canReview(member, config, division = null) {
    if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
    const allowedRoles = [...new Set([...(config.staff_role_ids || []), ...(division?.reviewer_role_ids || [])])];
    return allowedRoles.some((roleId) => member.roles?.cache?.has(roleId));
}


function buildDivisionCloseRow(requestId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`division-ticket:close:${requestId}`)
            .setLabel('Encerrar atendimento')
            .setStyle(ButtonStyle.Secondary)
    );
}

function buildDivisionRequestCard(request, division, answers) {
    const embed = new EmbedBuilder()
        .setColor(CARMINE)
        .setAuthor({ name: 'ALLIED · DIVISION ADMISSIONS' })
        .setTitle(`${division.name} · Candidatura #${request.id}`)
        .setDescription(`**Candidato:** <@${request.user_id}>\n**Divisão:** ${division.emoji || '✦'} ${division.name}\n**Situação:** Aguardando análise da equipe\n\nA concessão do cargo depende da aprovação de um responsável.`)
        .setTimestamp(new Date(request.created_at || Date.now()))
        .setFooter({ text: 'ALLIED · Processo de ingresso em divisão' });
    for (const question of division.questions) {
        embed.addFields({ name: truncate(question.label, 256), value: truncate(answers[question.id], 1024), inline: false });
    }
    const actions = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`division-ticket:approve:${request.id}`).setLabel('Aprovar e atribuir cargo').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`division-ticket:reject:${request.id}`).setLabel('Recusar').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`division-ticket:info:${request.id}`).setLabel('Solicitar esclarecimento').setStyle(ButtonStyle.Secondary)
    );
    const close = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`division-ticket:close:${request.id}`).setLabel('Encerrar atendimento').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [actions, close] };
}

async function createDivisionTicket(interaction, member, division, answers, config) {
    const created = await pool.query(
        `INSERT INTO allied_division_requests
            (guild_id, user_id, division_key, division_name, division_role_id, reviewer_role_ids, display_name, answers, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'creating') RETURNING *`,
        [interaction.guildId, interaction.user.id, division.division_key, division.name, division.role_id,
            division.reviewer_role_ids || [], member.displayName || interaction.user.globalName || interaction.user.username, JSON.stringify(answers)]
    );
    const request = created.rows[0];
    let ticket = null;
    try {
        const guild = interaction.guild;
        const overwrites = [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] },
            { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] }
        ];
        const staffIds = [];
        for (const roleId of [...new Set([...(config.staff_role_ids || []), ...(division.reviewer_role_ids || [])])]) {
            if (!roleId || roleId === guild.roles.everyone.id) continue;
            const role = await guild.roles.fetch(roleId).catch(() => null);
            if (!role) continue;
            staffIds.push(role.id);
            overwrites.push({ id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] });
        }
        let parent;
        if (config.ticket_category_id) {
            parent = await guild.channels.fetch(config.ticket_category_id).catch(() => null);
            if (!parent || parent.type !== ChannelType.GuildCategory) throw new Error('A categoria de tíquetes configurada é inválida.');
        }
        ticket = await guild.channels.create({
            name: `div-${slug(division.division_key)}-${request.id}-${slug(member.displayName || interaction.user.username)}`.slice(0, 95),
            type: ChannelType.GuildText,
            parent: parent?.id,
            topic: `ALLIED_DIVISION_REQUEST:${request.id}:${interaction.user.id}:${division.division_key}`,
            permissionOverwrites: overwrites,
            reason: `Candidatura para ${division.name} por ${interaction.user.tag}`
        });
        const card = buildDivisionRequestCard(request, division, answers);
        const message = await ticket.send({
            content: [`<@${interaction.user.id}>`, ...staffIds.map((id) => `<@&${id}>`)].join(' '),
            ...card,
            allowedMentions: { users: [interaction.user.id], roles: staffIds, parse: [] }
        });
        await pool.query(
            `UPDATE allied_division_requests SET status='open', channel_id=$2, message_id=$3, updated_at=NOW() WHERE id=$1`,
            [request.id, ticket.id, message.id]
        );
        if (config.log_channel_id) {
            const log = await guild.channels.fetch(config.log_channel_id).catch(() => null);
            if (log?.isTextBased()) {
                await log.send({
                    content: `✦ Nova candidatura para **${division.name}** · #${request.id} · <@${interaction.user.id}> · ${ticket}`,
                    allowedMentions: { parse: [] }
                }).catch(() => {});
            }
        }
        return ticket;
    } catch (error) {
        await pool.query(`UPDATE allied_division_requests SET status='failed', updated_at=NOW() WHERE id=$1`, [request.id]).catch(() => {});
        if (ticket) await ticket.delete('Falha ao finalizar candidatura de divisão').catch(() => {});
        throw error;
    }
}

async function showDivisionPicker(interaction) {
    if (!interaction.guildId || !interaction.guild) {
        await interaction.reply({ content: 'Este painel só funciona dentro do servidor da Allied.', ephemeral: true });
        return;
    }
    const config = await getDivisionTicketConfig(interaction.guildId);
    if (!config.enabled) {
        await interaction.reply({ content: 'As candidaturas para divisões estão fechadas no momento.', ephemeral: true });
        return;
    }
    const divisions = await listAlliedDivisions(interaction.guildId, { enabledOnly: true });
    if (!divisions.length) {
        await interaction.reply({ content: 'Nenhuma divisão está recebendo candidaturas no momento.', ephemeral: true });
        return;
    }
    if (divisions.length > 25) {
        await interaction.reply({ content: 'A equipe precisa reduzir o número de divisões ativas para no máximo 25.', ephemeral: true });
        return;
    }
    const menu = new StringSelectMenuBuilder()
        .setCustomId('division-ticket:select')
        .setPlaceholder('Escolha a divisão que deseja integrar')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(divisions.map((division) => ({
            label: division.name.slice(0, 100),
            value: division.division_key,
            description: `Solicitar ingresso em ${division.name}`.slice(0, 100),
            ...(division.emoji ? { emoji: division.emoji } : {})
        })));
    const embed = new EmbedBuilder()
        .setColor(CARMINE)
        .setAuthor({ name: 'ALLIED · DIVISION ADMISSIONS' })
        .setTitle('Escolha sua divisão')
        .setDescription('Selecione a divisão na qual deseja ingressar. Em seguida, a Kaori abrirá seu formulário privado. A candidatura será analisada pela equipe responsável.');
    await interaction.reply({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(menu)],
        ephemeral: true,
        allowedMentions: { parse: [] }
    });
}

async function handleDivisionSelect(interaction) {
    const divisionKey = slug(interaction.values?.[0]);
    const config = await getDivisionTicketConfig(interaction.guildId);
    if (!config.enabled) {
        await interaction.reply({ content: 'As candidaturas para divisões estão fechadas no momento.', ephemeral: true });
        return;
    }
    const division = await getAlliedDivision(interaction.guildId, divisionKey);
    if (!division?.enabled) {
        await interaction.reply({ content: 'Essa divisão não está aceitando candidaturas no momento.', ephemeral: true });
        return;
    }
    const questions = validateDivisionQuestions(division.questions?.length ? division.questions : DEFAULT_DIVISION_QUESTIONS);
    await interaction.showModal(buildDivisionModal({ ...division, questions }));
}

async function handleDivisionModal(interaction) {
    const divisionKey = slug(interaction.customId.split(':')[2]);
    if (!interaction.guild || !interaction.guildId || interaction.user?.bot) {
        return interaction.reply({ content: 'Este formulário só funciona para pessoas dentro do servidor.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    const config = await getDivisionTicketConfig(interaction.guildId);
    if (!config.enabled) return interaction.editReply({ content: 'As candidaturas para divisões estão fechadas.' });
    const division = await getAlliedDivision(interaction.guildId, divisionKey);
    if (!division?.enabled) return interaction.editReply({ content: 'A divisão escolhida não está disponível.' });
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) return interaction.editReply({ content: 'Não consegui localizar seu perfil no servidor.' });
    if (!config.member_role_id || !member.roles.cache.has(config.member_role_id)) {
        return interaction.editReply({ content: 'Você precisa fazer parte da Allied antes de solicitar ingresso em uma divisão.' });
    }
    if (member.roles.cache.has(division.role_id)) {
        return interaction.editReply({ content: `Você já possui o cargo da divisão **${division.name}**.` });
    }
    const questions = validateDivisionQuestions(division.questions?.length ? division.questions : DEFAULT_DIVISION_QUESTIONS);
    const answers = {};
    for (const question of questions) {
        const value = interaction.fields.getTextInputValue(`answer_${question.id}`).trim();
        if (question.required && !value) return interaction.editReply({ content: `Preencha a pergunta **${question.label}**.` });
        answers[question.id] = value;
    }
    try {
        const ticket = await createDivisionTicket(interaction, member, division, answers, config);
        return interaction.editReply({ content: `Sua candidatura para **${division.name}** foi enviada. A equipe continuará o atendimento em ${ticket}. O cargo só será concedido após aprovação.` });
    } catch (error) {
        if (error?.code === '23505') {
            return interaction.editReply({ content: `Você já possui uma candidatura em andamento para **${division.name}**. Encerre o atendimento atual antes de abrir outra.` });
        }
        console.error('[AlliedDivisionTickets] create request:', error);
        return interaction.editReply({ content: `Não consegui abrir sua candidatura: ${truncate(error.message, 220)}. Avise a equipe.` });
    }
}

async function getDivisionRequest(id, guildId) {
    const result = await pool.query('SELECT * FROM allied_division_requests WHERE id=$1 AND guild_id=$2', [id, guildId]);
    return result.rows[0] || null;
}

async function setDivisionRequestStatus(id, guildId, status, reviewerId = null, note = null) {
    await pool.query(
        `UPDATE allied_division_requests SET status=$3, reviewer_id=COALESCE($4,reviewer_id),
         review_note=COALESCE($5,review_note),
         reviewed_at=CASE WHEN $3 IN ('approved','rejected','closed','cancelled') THEN NOW() ELSE reviewed_at END,
         updated_at=NOW() WHERE id=$1 AND guild_id=$2`,
        [id, guildId, status, reviewerId, note]
    );
}

async function handleDivisionReview(interaction, action, id) {
    await interaction.deferReply({ ephemeral: true });
    const config = await getDivisionTicketConfig(interaction.guildId);
    const request = await getDivisionRequest(id, interaction.guildId);
    if (!request) return interaction.editReply({ content: 'Candidatura não encontrada.' });
    const reviewer = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const requestDivisionAccess = { reviewer_role_ids: Array.isArray(request.reviewer_role_ids) ? request.reviewer_role_ids : [] };
    if (!reviewer || !canReview(reviewer, config, requestDivisionAccess)) return interaction.editReply({ content: 'Somente a equipe autorizada para esta divisão pode revisar candidaturas.' });
    if (!ACTIVE_STATUSES.includes(request.status)) return interaction.editReply({ content: `Esta candidatura já está **${request.status}**.` });
    const ticket = await interaction.guild.channels.fetch(request.channel_id).catch(() => null);
    if (!ticket?.isTextBased()) return interaction.editReply({ content: 'Canal de atendimento não encontrado.' });

    if (action === 'approve') {
        const member = await interaction.guild.members.fetch(request.user_id).catch(() => null);
        if (!member) {
            await setDivisionRequestStatus(id, interaction.guildId, 'cancelled', interaction.user.id, 'Candidato saiu do servidor.');
            return interaction.editReply({ content: 'O candidato saiu do servidor. A candidatura foi cancelada.' });
        }
        const role = await interaction.guild.roles.fetch(request.division_role_id).catch(() => null);
        if (!role || role.id === interaction.guild.roles.everyone.id || role.managed) {
            return interaction.editReply({ content: 'O cargo desta divisão não existe mais ou é gerenciado por integração.' });
        }
        const botMember = interaction.guild.members.me || await interaction.guild.members.fetch(interaction.client.user.id).catch(() => null);
        if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles) || botMember.roles.highest.position <= role.position) {
            return interaction.editReply({ content: 'Não consigo atribuir esse cargo. Verifique Gerenciar Cargos e a hierarquia da Kaori.' });
        }
        let added = false;
        try {
            if (!member.roles.cache.has(role.id)) {
                await member.roles.add(role, `Ingresso na divisão ${request.division_name} aprovado por ${interaction.user.tag}`);
                added = true;
            }
            await setDivisionRequestStatus(id, interaction.guildId, 'approved', interaction.user.id);
        } catch (error) {
            if (added) await member.roles.remove(role, 'Reversão por falha ao registrar aprovação').catch(() => {});
            console.error('[AlliedDivisionTickets] approve:', error);
            return interaction.editReply({ content: `Não consegui concluir a aprovação: ${truncate(error.message, 180)}.` });
        }
        await ticket.send({ content: `A candidatura foi **aprovada** por ${interaction.user}. O cargo ${role} foi atribuído.`, allowedMentions: { users: [], roles: [role.id], parse: [] } }).catch(() => {});
        await interaction.message.edit({ components: [buildDivisionCloseRow(id)] }).catch(() => {});
        await member.send(`Sua entrada na divisão **${request.division_name}** da Allied foi aprovada. Bem-vindo(a)!`).catch(() => {});
        return interaction.editReply({ content: `Aprovação concluída. ${member} recebeu ${role}.` });
    }

    if (action === 'reject') {
        await setDivisionRequestStatus(id, interaction.guildId, 'rejected', interaction.user.id);
        await ticket.send({ content: `A candidatura para **${request.division_name}** foi recusada por ${interaction.user}. Caso tenha dúvidas, consulte a equipe.` }).catch(() => {});
        await interaction.message.edit({ components: [buildDivisionCloseRow(id)] }).catch(() => {});
        const user = await interaction.client.users.fetch(request.user_id).catch(() => null);
        await user?.send(`Sua candidatura para a divisão **${request.division_name}** não foi aprovada neste momento.`).catch(() => {});
        return interaction.editReply({ content: 'Candidatura recusada e decisão registrada.' });
    }

    if (action === 'info') {
        await setDivisionRequestStatus(id, interaction.guildId, 'waiting_info', interaction.user.id);
        await ticket.send({ content: `<@${request.user_id}> a equipe precisa de mais informações para continuar sua análise. Responda neste canal, por favor.`, allowedMentions: { users: [request.user_id], parse: [] } }).catch(() => {});
        return interaction.editReply({ content: 'Pedido de esclarecimento enviado.' });
    }
    return interaction.editReply({ content: 'Ação desconhecida.' });
}

async function handleDivisionClose(interaction, id) {
    await interaction.deferReply({ ephemeral: true });
    const config = await getDivisionTicketConfig(interaction.guildId);
    const request = await getDivisionRequest(id, interaction.guildId);
    if (!request) return interaction.editReply({ content: 'Candidatura não encontrada.' });
    const requestDivisionAccess = { reviewer_role_ids: Array.isArray(request.reviewer_role_ids) ? request.reviewer_role_ids : [] };
    const owner = request.user_id === interaction.user.id;
    const member = owner ? null : await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!owner && (!member || !canReview(member, config, requestDivisionAccess))) return interaction.editReply({ content: 'Somente o autor ou a equipe autorizada para esta divisão pode encerrar este atendimento.' });
    if (ACTIVE_STATUSES.includes(request.status)) await setDivisionRequestStatus(id, interaction.guildId, 'closed', interaction.user.id);
    await interaction.channel.permissionOverwrites.edit(request.user_id, { SendMessages: false, AddReactions: false }).catch(() => {});
    await interaction.channel.setName(`encerrado-div-${id}`.slice(0, 95)).catch(() => {});
    await interaction.message.edit({ components: [] }).catch(() => {});
    return interaction.editReply({ content: 'Atendimento encerrado. O histórico foi mantido para consulta da equipe.' });
}

export async function handleDivisionTicketInteraction(interaction) {
    if (interaction.isButton?.() && interaction.customId === 'division-ticket:open') {
        await showDivisionPicker(interaction);
        return true;
    }
    if (interaction.isStringSelectMenu?.() && interaction.customId === 'division-ticket:select') {
        await handleDivisionSelect(interaction);
        return true;
    }
    if (interaction.isModalSubmit?.() && interaction.customId.startsWith('division-ticket:submit:')) {
        await handleDivisionModal(interaction);
        return true;
    }
    if (interaction.isButton?.() && interaction.customId.startsWith('division-ticket:')) {
        const [, action, id] = interaction.customId.split(':');
        if (['approve', 'reject', 'info'].includes(action)) await handleDivisionReview(interaction, action, id);
        else if (action === 'close') await handleDivisionClose(interaction, id);
        else return false;
        return true;
    }
    return false;
}

export async function initAlliedDivisionTickets() {
    await ensureDivisionTicketSchema();
    if (GUILD_ID) await readDivisionTicketConfig(GUILD_ID);
    console.log('✅ Allied Division Tickets pronto.');
}
