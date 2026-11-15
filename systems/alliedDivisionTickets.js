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
const REVIEWABLE_STATUSES = ['open', 'waiting_info'];
const CLOSABLE_STATUSES = ['creating', 'open', 'waiting_info'];
const divisionConfigCache = new Map();

export const DEFAULT_DIVISION_QUESTIONS = Object.freeze([
    { id: 'display_name', label: 'Como devemos te chamar?', placeholder: 'Seu apelido ou nome de preferência', style: 'short', required: true, max_length: 60 },
    { id: 'activity', label: 'Qual é sua disponibilidade?', placeholder: 'Dias, horários e frequência em que costuma jogar', style: 'short', required: true, max_length: 180 },
    { id: 'experience', label: 'Qual é sua experiência?', placeholder: 'Conte um pouco sobre sua experiência na área', style: 'paragraph', required: true, max_length: 700 },
    { id: 'motivation', label: 'Por que deseja entrar nesta divisão?', placeholder: 'O que espera contribuir e aprender?', style: 'paragraph', required: true, max_length: 700 }
]);

export const DEFAULT_DIVISION_DESCRIPTIONS = Object.freeze({
    chuva: 'A Divisão da Chuva é uma frente voltada aos membros que atuam com estratégia, precisão e controle, priorizando decisões calculadas e execução disciplinada. É a divisão para quem prefere entender o cenário antes de agir e transformar situações caóticas em algo previsível.\n\n• Foco em estratégia e precisão;\n• Presença marcada por disciplina e paciência;\n• Ideal para membros que preferem resultado ao alarde.\n\nSeu objetivo é reunir aqueles que trabalham melhor sob pressão sem perder o controle, mantendo uma atuação constante dentro da estrutura da Allied.',
    sangue: 'A Divisão do Sangue representa a presença ofensiva da Allied, sendo voltada aos membros que se destacam por iniciativa, intensidade e capacidade de impor ritmo. É uma frente para quem prefere agir, pressionar e transformar confronto em oportunidade.\n\n• Foco em impacto e iniciativa;\n• Voltada a membros de postura agressiva e determinada;\n• Presença marcada por intensidade e domínio.\n\nSeu objetivo é concentrar membros que não esperam o cenário mudar por conta própria, mas procuram criar o momento e conduzir a situação em seu favor.',
    abismo: 'A Divisão do Abismo é uma frente dedicada aos membros que valorizam informação, observação e controle do que acontece por trás das decisões visíveis. Sua força está menos na exposição e mais na capacidade de compreender o cenário antes que os outros percebam o movimento.\n\n• Foco em profundidade e leitura de cenário;\n• Valorização de informação, timing e paciência;\n• Perfil mais reservado e estratégico.\n\nSeu objetivo é reunir aqueles que preferem trabalhar nas camadas menos evidentes da estrutura, influenciando decisões por meio de análise, controle e conhecimento.',
    eclipse: 'A Divisão do Eclipse reúne os membros que conseguem transitar entre diferentes formas de atuação, adaptando sua postura conforme a situação exige. Sua identidade está na dualidade: saber quando avançar, quando recuar e quando mudar completamente a abordagem.\n\n• Foco em adaptação e versatilidade;\n• Equilíbrio entre pressão e contenção;\n• Compatível com diferentes estilos de atuação.\n\nSeu objetivo é reunir membros capazes de lidar com situações imprevisíveis sem ficar presos a uma única maneira de agir, encontrando equilíbrio entre forças opostas dentro da estrutura da Allied.'
});

export const DIVISION_TICKET_DEFAULTS = Object.freeze({
    enabled: false,
    panel_channel_id: null,
    panel_message_id: null,
    submission_channel_id: null,
    ticket_category_id: null,
    log_channel_id: null,
    member_role_id: '1524393369835671663',
    staff_role_ids: [],
    panel_title: 'ALLIED | DIVISÕES',
    panel_description: 'Cada divisão possui uma identidade, um propósito e uma forma própria de contribuir para a Allied. Conheça cada uma e escolha onde deseja construir sua trajetória.',
    panel_content: '',
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
    const divisionKey = String(row.division_key || '').toLowerCase();
    const description = String(row.description || DEFAULT_DIVISION_DESCRIPTIONS[divisionKey] || `Conheça a ${row.name} e descubra como contribuir para a Allied.`);
    return {
        ...row,
        description: cleanText(description, 1024),
        button_label: cleanText(row.button_label, 80, `Entrar em ${row.name}`) || `Entrar em ${row.name}`,
        button_style: ['Primary', 'Secondary', 'Success', 'Danger'].includes(row.button_style) ? row.button_style : 'Primary',
        reviewer_role_ids: Array.isArray(row.reviewer_role_ids) ? row.reviewer_role_ids : [],
        leader_role_ids: Array.isArray(row.leader_role_ids) ? row.leader_role_ids : [],
        vice_role_ids: Array.isArray(row.vice_role_ids) ? row.vice_role_ids : [],
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
            submission_channel_id TEXT,
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
            description TEXT NOT NULL DEFAULT '',
            button_label TEXT NOT NULL DEFAULT '',
            button_style TEXT NOT NULL DEFAULT 'Primary',
            submission_channel_id TEXT,
            leader_role_ids TEXT[] NOT NULL DEFAULT '{}',
            vice_role_ids TEXT[] NOT NULL DEFAULT '{}',
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            questions JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (guild_id, division_key)
        );

        ALTER TABLE allied_division_ticket_config ADD COLUMN IF NOT EXISTS submission_channel_id TEXT;

        ALTER TABLE allied_divisions ADD COLUMN IF NOT EXISTS reviewer_role_ids TEXT[] NOT NULL DEFAULT '{}';
        ALTER TABLE allied_divisions ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
        ALTER TABLE allied_divisions ADD COLUMN IF NOT EXISTS button_label TEXT NOT NULL DEFAULT '';
        ALTER TABLE allied_divisions ADD COLUMN IF NOT EXISTS button_style TEXT NOT NULL DEFAULT 'Primary';
        ALTER TABLE allied_divisions ADD COLUMN IF NOT EXISTS submission_channel_id TEXT;
        ALTER TABLE allied_divisions ADD COLUMN IF NOT EXISTS leader_role_ids TEXT[] NOT NULL DEFAULT '{}';
        ALTER TABLE allied_divisions ADD COLUMN IF NOT EXISTS vice_role_ids TEXT[] NOT NULL DEFAULT '{}';

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
        CREATE UNIQUE INDEX IF NOT EXISTS idx_allied_division_one_active_request_v2
            ON allied_division_requests (guild_id, user_id, division_key)
            WHERE status IN ('creating', 'open', 'waiting_info', 'reviewing');
        UPDATE allied_division_requests
            SET status = 'open', reviewer_id = NULL, updated_at = NOW()
            WHERE status = 'reviewing';
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

export async function upsertAlliedDivision(guildId, {
    key, name, roleId, emoji = null, reviewerRoleIds = [],
    description = null, buttonLabel = null, buttonStyle = null,
    submissionChannelId = null, questions = DEFAULT_DIVISION_QUESTIONS
}) {
    const divisionKey = slug(key);
    const divisionName = cleanText(name, 80);
    if (!divisionKey || !/^[a-z0-9][a-z0-9_-]{0,31}$/.test(divisionKey)) {
        throw new Error('Chave inválida. Use letras minúsculas, números, hífen ou _.');
    }
    if (!divisionName) throw new Error('O nome da divisão é obrigatório.');
    if (!/^\d{17,20}$/.test(String(roleId || ''))) throw new Error('Selecione um cargo válido para a divisão.');
    if (submissionChannelId && !/^\d{17,20}$/.test(String(submissionChannelId))) throw new Error('Canal de envio inválido.');

    const normalizedQuestions = validateDivisionQuestions(questions);
    const defaultDescription = DEFAULT_DIVISION_DESCRIPTIONS[divisionKey] || `Conheça a ${divisionName} e descubra como contribuir para a Allied.`;
    const finalDescription = description == null ? defaultDescription : (cleanText(description, 1024) || defaultDescription);
    const finalButtonLabel = buttonLabel == null ? `Entrar em ${divisionName}` : (cleanText(buttonLabel, 80) || `Entrar em ${divisionName}`);
    const finalButtonStyle = buttonStyle == null ? 'Primary' : (['Primary', 'Secondary', 'Success', 'Danger'].includes(buttonStyle) ? buttonStyle : 'Primary');

    const result = await pool.query(
        `INSERT INTO allied_divisions
            (guild_id, division_key, name, role_id, emoji, reviewer_role_ids, enabled, questions,
             description, button_label, button_style, submission_channel_id)
         VALUES ($1,$2,$3,$4,$5,$6,TRUE,$7::jsonb,$8,$9,$10,$11)
         ON CONFLICT (guild_id, division_key) DO UPDATE SET
            name = EXCLUDED.name,
            role_id = EXCLUDED.role_id,
            emoji = COALESCE(EXCLUDED.emoji, allied_divisions.emoji),
            reviewer_role_ids = CASE WHEN cardinality(EXCLUDED.reviewer_role_ids) > 0 THEN EXCLUDED.reviewer_role_ids ELSE allied_divisions.reviewer_role_ids END,
            enabled = TRUE,
            questions = EXCLUDED.questions,
            description = CASE WHEN $12 THEN EXCLUDED.description ELSE allied_divisions.description END,
            button_label = CASE WHEN $13 THEN EXCLUDED.button_label ELSE allied_divisions.button_label END,
            button_style = CASE WHEN $14 THEN EXCLUDED.button_style ELSE allied_divisions.button_style END,
            submission_channel_id = COALESCE(EXCLUDED.submission_channel_id, allied_divisions.submission_channel_id),
            updated_at = NOW()
         RETURNING *`,
        [
            guildId, divisionKey, divisionName, roleId,
            emoji ? String(emoji).slice(0, 64) : null,
            [...new Set(reviewerRoleIds)],
            JSON.stringify(normalizedQuestions),
            finalDescription,
            finalButtonLabel,
            finalButtonStyle,
            submissionChannelId,
            description != null,
            buttonLabel != null,
            buttonStyle != null
        ]
    );
    return normalizeDivision(result.rows[0]);
}
export async function updateAlliedDivisionLeadership(guildId, key, kind, roleId, action) {
    const divisionKey = slug(key);
    const column = kind === 'leader' ? 'leader_role_ids' : kind === 'vice' ? 'vice_role_ids' : null;
    if (!column) throw new Error('Tipo de liderança inválido.');
    if (!/^\d{17,20}$/.test(String(roleId || ''))) throw new Error('Selecione um cargo válido.');
    if (!['add', 'remove'].includes(action)) throw new Error('Ação inválida.');
    const result = await pool.query(
        `UPDATE allied_divisions
         SET ${column} = CASE
             WHEN $3 = 'add' THEN
                 CASE
                     WHEN $4 = ANY(COALESCE(${column}, '{}'::text[])) THEN COALESCE(${column}, '{}'::text[])
                     ELSE array_append(COALESCE(${column}, '{}'::text[]), $4)
                 END
             ELSE array_remove(COALESCE(${column}, '{}'::text[]), $4)
         END,
         updated_at = NOW()
         WHERE guild_id = $1 AND division_key = $2
         RETURNING *`,
        [guildId, divisionKey, action, roleId]
    );
    if (!result.rows[0]) throw new Error('Divisão não encontrada. Confira a chave informada.');
    return normalizeDivision(result.rows[0]);
}

export async function updateAlliedDivisionPresentation(guildId, key, patch) {
    const allowed = new Set(['description', 'button_label', 'button_style', 'submission_channel_id', 'emoji']);
    const entries = Object.entries(patch).filter(([field]) => allowed.has(field));
    if (!entries.length) throw new Error('Nenhuma configuração de apresentação foi informada.');
    const sets = [];
    const values = [guildId, slug(key)];
    let index = 3;
    for (const [field, value] of entries) {
        sets.push(`${field} = $${index}`);
        values.push(value);
        index += 1;
    }
    sets.push('updated_at = NOW()');
    const result = await pool.query(
        `UPDATE allied_divisions SET ${sets.join(', ')}
         WHERE guild_id = $1 AND division_key = $2 RETURNING *`,
        values
    );
    if (!result.rows[0]) throw new Error('Divisão não encontrada.');
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
    if (!Array.isArray(divisions) || divisions.length > 25) {
        throw new Error('O painel aceita no máximo 25 divisões ativas, uma por botão.');
    }
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
        embed.addFields(...divisions.map((division) => ({
            name: `${division.emoji || '✦'} ${cleanText(division.name, 90).toUpperCase()}`.slice(0, 256),
            value: truncate(division.description || DEFAULT_DIVISION_DESCRIPTIONS[division.division_key] || 'Divisão da Allied.', 1024),
            inline: false
        })));
    } else {
        embed.addFields({ name: 'INSCRIÇÕES', value: 'Nenhuma divisão está aceitando candidaturas no momento.' });
    }

    const embedJson = embed.toJSON();
    const totalCharacters = [
        embedJson.title || '', embedJson.description || '', embedJson.author?.name || '',
        embedJson.footer?.text || '',
        ...(embedJson.fields || []).flatMap((field) => [field.name, field.value])
    ].join('').length;
    if (totalCharacters > 6000) throw new Error('A embed das divisões ultrapassa o limite de 6000 caracteres do Discord.');

    const payload = { embeds: [embed], allowedMentions: { parse: [] } };
    if (divisions.length) {
        const rows = [];
        for (let index = 0; index < divisions.length; index += 5) {
            const row = new ActionRowBuilder();
            for (const division of divisions.slice(index, index + 5)) {
                const style = ButtonStyle[division.button_style] || ButtonStyle.Primary;
                const button = new ButtonBuilder()
                    .setCustomId(`division-ticket:apply:${division.division_key}`)
                    .setLabel(cleanText(division.button_label, 80) || `Entrar em ${division.name}`)
                    .setStyle(style);
                if (division.emoji) button.setEmoji(division.emoji);
                row.addComponents(button);
            }
            rows.push(row);
        }
        payload.components = rows;
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
    if (divisions.length > 25) throw new Error('O Discord permite no máximo 25 botões de divisão.');
    const payload = buildDivisionPanelPayload(current, divisions);
    let message = current.panel_message_id ? await channel.messages.fetch(current.panel_message_id).catch(() => null) : null;
    if (message) await message.edit(payload);
    else message = await channel.send(payload);
    await updateDivisionTicketConfig(guild.id, { panel_channel_id: channel.id, panel_message_id: message.id });
    return { channel, message, divisions };
}

export function canReviewDivision(member, request) {
    if (!member || !request) return false;
    const allowedRoles = Array.isArray(request.reviewer_role_ids) ? request.reviewer_role_ids : [];
    return allowedRoles.some((roleId) => member.roles?.cache?.has(roleId));
}

function canReview(member, config, division = null) {
    return canReviewDivision(member, division);
}

export function buildDivisionRequestCard(request, division, answers) {
    const embed = new EmbedBuilder()
        .setColor(CARMINE)
        .setAuthor({ name: 'ALLIED · DIVISION RECRUITMENT' })
        .setTitle(`${division.name} · Candidatura #${request.id}`)
        .setDescription(`**Candidato:** <@${request.user_id}>\n**Divisão:** ${division.emoji || '✦'} ${division.name}\n**Cargo após aprovação:** <@&${request.division_role_id}>\n**Situação:** Aguardando análise dos líderes e vice-líderes\n\nSomente a liderança cadastrada para esta divisão pode aceitar ou recusar a candidatura.`)
        .setTimestamp(new Date(request.created_at || Date.now()))
        .setFooter({ text: 'ALLIED · Recrutamento das divisões' });
    for (const question of division.questions) {
        embed.addFields({ name: truncate(question.label, 256), value: truncate(answers[question.id], 800), inline: false });
    }
    const actions = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`division-ticket:approve:${request.id}`).setLabel('Aceitar candidatura').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`division-ticket:reject:${request.id}`).setLabel('Recusar candidatura').setStyle(ButtonStyle.Danger)
    );
    return { embeds: [embed], components: [actions] };
}

async function createDivisionApplication(interaction, member, division, answers, config) {
    const guild = interaction.guild;
    const submissionChannelId = division.submission_channel_id || config.submission_channel_id;
    const submissionChannel = submissionChannelId
        ? await guild.channels.fetch(submissionChannelId).catch(() => null)
        : null;
    if (!submissionChannel?.isTextBased() || !submissionChannel.send) {
        throw new Error(`Configure um canal de texto de envio para a divisão ${division.name} (canal_entrada global ou canal_destino da divisão).`);
    }

    const leaders = [...new Set([...(division.leader_role_ids || []), ...(division.vice_role_ids || [])])];
    if (!leaders.length) throw new Error(`A divisão ${division.name} ainda não tem líderes ou vice-líderes cadastrados.`);

    const botMember = guild.members.me || await guild.members.fetch(interaction.client.user.id).catch(() => null);
    if (!botMember) throw new Error('Não consegui localizar a Kaori no servidor.');
    const botPermissions = submissionChannel.permissionsFor(botMember);
    const missingPermissions = [];
    if (!botPermissions?.has(PermissionFlagsBits.ViewChannel)) missingPermissions.push('Ver Canal');
    if (!botPermissions?.has(PermissionFlagsBits.SendMessages)) missingPermissions.push('Enviar Mensagens');
    if (!botPermissions?.has(PermissionFlagsBits.EmbedLinks)) missingPermissions.push('Inserir Links');
    if (missingPermissions.length) {
        throw new Error(`A Kaori precisa de ${missingPermissions.join(', ')} em <#${submissionChannel.id}>.`);
    }

    const validLeaderIds = [];
    for (const roleId of leaders) {
        const role = await guild.roles.fetch(roleId).catch(() => null);
        if (!role || role.id === guild.roles.everyone.id || role.managed) continue;
        const rolePermissions = submissionChannel.permissionsFor(role);
        if (rolePermissions?.has(PermissionFlagsBits.ViewChannel) && rolePermissions?.has(PermissionFlagsBits.ReadMessageHistory)) {
            validLeaderIds.push(role.id);
        }
    }
    if (!validLeaderIds.length) {
        throw new Error(`Nenhum líder ou vice-líder cadastrado consegue ver e ler <#${submissionChannel.id}>. Confira as permissões do canal.`);
    }

    const created = await pool.query(
        `INSERT INTO allied_division_requests
            (guild_id, user_id, division_key, division_name, division_role_id, reviewer_role_ids, display_name, answers, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'creating') RETURNING *`,
        [guild.id, interaction.user.id, division.division_key, division.name, division.role_id,
            validLeaderIds, member.displayName || interaction.user.globalName || interaction.user.username, JSON.stringify(answers)]
    );
    const request = created.rows[0];
    let reviewMessage = null;
    try {
        // Save channel and open status before publishing the buttons, preventing a fast-click race.
        await pool.query(
            `UPDATE allied_division_requests
             SET status='open', channel_id=$2, updated_at=NOW()
             WHERE id=$1`,
            [request.id, submissionChannel.id]
        );

        const card = buildDivisionRequestCard({ ...request, reviewer_role_ids: validLeaderIds }, division, answers);
        const leadershipMentions = validLeaderIds.map((id) => `<@&${id}>`).join(' ');
        reviewMessage = await submissionChannel.send({
            content: `**Nova candidatura para ${division.name}** · ${leadershipMentions}`,
            ...card,
            allowedMentions: { users: [], roles: validLeaderIds, parse: [] }
        });
        await pool.query(
            `UPDATE allied_division_requests SET message_id=$2, updated_at=NOW() WHERE id=$1`,
            [request.id, reviewMessage.id]
        );

        if (config.log_channel_id) {
            const log = await guild.channels.fetch(config.log_channel_id).catch(() => null);
            if (log?.isTextBased()) {
                await log.send({
                    content: `✦ Nova candidatura para **${division.name}** · #${request.id} · <@${interaction.user.id}> · <#${submissionChannel.id}>`,
                    allowedMentions: { parse: [] }
                }).catch(() => {});
            }
        }
        return { channel: submissionChannel, message: reviewMessage };
    } catch (error) {
        await pool.query(`UPDATE allied_division_requests SET status='failed', updated_at=NOW() WHERE id=$1`, [request.id]).catch(() => {});
        if (reviewMessage) await reviewMessage.delete('Falha ao registrar candidatura de divisão').catch(() => {});
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
    await interaction.reply({ ...buildDivisionPanelPayload(config, divisions), ephemeral: true });
}

async function handleDivisionApply(interaction, divisionKey) {
    if (!interaction.guild || !interaction.guildId || interaction.user?.bot) {
        await interaction.reply({ content: 'Este painel só funciona para pessoas dentro da Allied.', ephemeral: true });
        return;
    }
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
        const result = await createDivisionApplication(interaction, member, division, answers, config);
        return interaction.editReply({ content: `Sua candidatura para **${division.name}** foi enviada para ${result.channel}. Os líderes e vice-líderes responsáveis farão a análise. O cargo só será concedido após aprovação.` });
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

async function claimDivisionRequest(id, guildId, reviewerId) {
    const result = await pool.query(
        `UPDATE allied_division_requests
         SET status='reviewing', reviewer_id=$3, updated_at=NOW()
         WHERE id=$1 AND guild_id=$2 AND status = ANY($4::text[])
         RETURNING *`,
        [id, guildId, reviewerId, REVIEWABLE_STATUSES]
    );
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

async function closeDivisionRequestIfOpen(id, guildId, reviewerId) {
    const result = await pool.query(
        `UPDATE allied_division_requests
         SET status='closed', reviewer_id=COALESCE($3,reviewer_id), reviewed_at=NOW(), updated_at=NOW()
         WHERE id=$1 AND guild_id=$2 AND status = ANY($4::text[])
         RETURNING id`,
        [id, guildId, reviewerId, CLOSABLE_STATUSES]
    );
    return result.rowCount > 0;
}

async function handleDivisionReview(interaction, action, id) {
    await interaction.deferReply({ ephemeral: true });
    let request = await getDivisionRequest(id, interaction.guildId);
    if (!request) return interaction.editReply({ content: 'Candidatura não encontrada.' });

    const currentDivision = await getAlliedDivision(interaction.guildId, request.division_key);
    if (!currentDivision) {
        return interaction.editReply({ content: 'Esta divisão não está mais cadastrada. A candidatura não pode ser revisada.' });
    }
    const reviewer = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const currentLeadership = {
        reviewer_role_ids: [...new Set([
            ...(currentDivision.leader_role_ids || []),
            ...(currentDivision.vice_role_ids || [])
        ])]
    };
    if (!reviewer || !canReviewDivision(reviewer, currentLeadership)) {
        return interaction.editReply({ content: 'Somente os cargos atualmente cadastrados como líder ou vice-líder desta divisão podem aceitar ou recusar esta candidatura.' });
    }
    if (!['approve', 'reject'].includes(action)) {
        return interaction.editReply({ content: 'Ação de revisão inválida.' });
    }
    if (!REVIEWABLE_STATUSES.includes(request.status)) {
        const statusMessage = request.status === 'reviewing'
            ? 'Esta candidatura já está sendo analisada por outra pessoa da liderança.'
            : `Esta candidatura já está **${request.status}**.`;
        return interaction.editReply({ content: statusMessage });
    }

    const reviewChannel = await interaction.guild.channels.fetch(request.channel_id).catch(() => null);
    if (!reviewChannel?.isTextBased()) {
        return interaction.editReply({ content: 'Canal de entrada da divisão não encontrado.' });
    }

    const previousStatus = request.status;
    request = await claimDivisionRequest(id, interaction.guildId, interaction.user.id);
    if (!request) {
        return interaction.editReply({ content: 'Outra pessoa da liderança começou a analisar esta candidatura. Atualize a mensagem.' });
    }

    if (action === 'approve') {
        const member = await interaction.guild.members.fetch(request.user_id).catch(() => null);
        if (!member) {
            await setDivisionRequestStatus(id, interaction.guildId, 'cancelled', interaction.user.id, 'Candidato saiu do servidor.');
            await interaction.message.edit({ components: [] }).catch(() => {});
            return interaction.editReply({ content: 'O candidato saiu do servidor. A candidatura foi cancelada.' });
        }

        const role = await interaction.guild.roles.fetch(request.division_role_id).catch(() => null);
        if (!role || role.id === interaction.guild.roles.everyone.id || role.managed) {
            await setDivisionRequestStatus(id, interaction.guildId, previousStatus).catch(() => {});
            return interaction.editReply({ content: 'O cargo desta divisão não existe mais ou é gerenciado por integração.' });
        }
        const botMember = interaction.guild.members.me || await interaction.guild.members.fetch(interaction.client.user.id).catch(() => null);
        if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles) || botMember.roles.highest.position <= role.position) {
            await setDivisionRequestStatus(id, interaction.guildId, previousStatus).catch(() => {});
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
            await setDivisionRequestStatus(id, interaction.guildId, previousStatus).catch((statusError) => {
                console.error('[AlliedDivisionTickets] failed to release review claim:', statusError.message);
            });
            console.error('[AlliedDivisionTickets] approve:', error);
            return interaction.editReply({ content: `Não consegui concluir a aprovação: ${truncate(error.message, 180)}.` });
        }

        await interaction.message.edit({ components: [] }).catch(() => {});
        await reviewChannel.send({
            content: `A candidatura de <@${member.id}> para **${request.division_name}** foi **aceita** por ${interaction.user}. O cargo ${role} foi atribuído.`,
            allowedMentions: { users: [], roles: [role.id], parse: [] }
        }).catch((error) => console.error('[AlliedDivisionTickets] approval notice:', error.message));
        await member.send(`Sua entrada na divisão **${request.division_name}** da Allied foi aprovada. Bem-vindo(a)!`).catch((error) => {
            console.warn('[AlliedDivisionTickets] approval DM could not be delivered:', error?.code || error?.message);
        });
        return interaction.editReply({ content: `Aprovação concluída. ${member} recebeu ${role}.` });
    }

    await setDivisionRequestStatus(id, interaction.guildId, 'rejected', interaction.user.id);
    await interaction.message.edit({ components: [] }).catch(() => {});
    await reviewChannel.send({
        content: `A candidatura de <@${request.user_id}> para **${request.division_name}** foi **recusada** por ${interaction.user}.`,
        allowedMentions: { users: [], parse: [] }
    }).catch((error) => console.error('[AlliedDivisionTickets] rejection notice:', error.message));

    const user = await interaction.client.users.fetch(request.user_id).catch((error) => {
        console.warn('[AlliedDivisionTickets] could not fetch applicant for rejection DM:', error?.code || error?.message);
        return null;
    });
    let dmSent = false;
    if (user) {
        try {
            await user.send(`Sua candidatura para a divisão **${request.division_name}** da Allied foi recusada. Você pode conversar com a liderança da divisão caso precise de mais informações.`);
            dmSent = true;
        } catch (error) {
            console.warn('[AlliedDivisionTickets] rejection DM could not be delivered:', error?.code || error?.message);
        }
    }
    return interaction.editReply({
        content: dmSent
            ? 'Candidatura recusada. A mensagem foi enviada por DM.'
            : 'Candidatura recusada, mas não foi possível enviar a DM. O candidato pode estar com as mensagens privadas fechadas.'
    });
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
    if (request.status === 'reviewing') {
        return interaction.editReply({ content: 'A equipe está analisando esta candidatura. Aguarde a conclusão antes de encerrar.' });
    }
    if (CLOSABLE_STATUSES.includes(request.status)) {
        const closed = await closeDivisionRequestIfOpen(id, interaction.guildId, interaction.user.id);
        if (!closed) {
            return interaction.editReply({ content: 'A equipe começou a analisar esta candidatura. Aguarde a conclusão antes de encerrar.' });
        }
    }
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
    if (interaction.isButton?.() && interaction.customId.startsWith('division-ticket:apply:')) {
        const divisionKey = interaction.customId.split(':')[2];
        await handleDivisionApply(interaction, divisionKey);
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
        if (['approve', 'reject'].includes(action)) await handleDivisionReview(interaction, action, id);
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
