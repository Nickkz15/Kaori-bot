import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    AttachmentBuilder
} from 'discord.js';
import {
    getConfessConfig,
    updateConfessConfig,
    nextConfessionNumber,
    insertConfession,
    updateConfessionPublic,
    isConfessBanned,
    getLastConfessionTime,
    claimLatestConfessionButtons
} from './confessDb.js';

const COLOR_NAMES = {
    red: '#FF0000',
    green: '#57F287',
    blue: '#5865F2',
    yellow: '#FEE75C',
    orange: '#E67E22',
    purple: '#9B59B6',
    pink: '#EB459E',
    white: '#FFFFFF',
    black: '#000000',
    blurple: '#5865F2',
    grey: '#95A5A6',
    gray: '#95A5A6'
};

const ALLOWED_IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
const MAX_CONTENT = 2000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function parseColor(input, fallback = '#5865F2') {
    if (!input || typeof input !== 'string') return normalizeHex(fallback);
    const raw = input.trim().toLowerCase();
    if (COLOR_NAMES[raw]) return COLOR_NAMES[raw];
    let hex = raw.startsWith('#') ? raw.slice(1) : raw;
    if (!/^[0-9a-f]{6}$/i.test(hex) && !/^[0-9a-f]{3}$/i.test(hex)) {
        return null;
    }
    if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('');
    }
    return `#${hex.toUpperCase()}`;
}

function normalizeHex(hex) {
    if (!hex) return '#5865F2';
    const h = hex.startsWith('#') ? hex : `#${hex}`;
    return h.toUpperCase();
}

export function stripMentions(text) {
    return String(text || '')
        .replace(/@(everyone|here)/gi, '@\u200b$1')
        .replace(/<@&?\d+>/g, '[menção removida]')
        .trim();
}

export function containsBannedWord(content, words) {
    if (!words || words.length === 0) return null;
    const lower = content.toLowerCase();
    for (const w of words) {
        if (!w) continue;
        const term = String(w).toLowerCase().trim();
        if (term && lower.includes(term)) return term;
    }
    return null;
}

export function validateImageAttachment(attachment, attachmentsEnabled) {
    if (!attachment) return { ok: true, url: null };
    if (!attachmentsEnabled) {
        return { ok: false, msg: '❌ O envio de imagens está desativado neste servidor.' };
    }
    const name = (attachment.name || '').toLowerCase();
    const ext = name.includes('.') ? name.split('.').pop() : '';
    const contentType = (attachment.contentType || '').toLowerCase();
    const isImage =
        contentType.startsWith('image/') ||
        ALLOWED_IMAGE_EXT.has(ext);
    if (!isImage) {
        return { ok: false, msg: '❌ Apenas imagens são permitidas (PNG, JPG, GIF, WEBP).' };
    }
    if (attachment.size && attachment.size > MAX_IMAGE_BYTES) {
        return { ok: false, msg: '❌ A imagem é grande demais (máx. 8 MB).' };
    }
    return { ok: true, url: attachment.url };
}

export async function canUserConfess(guildId, user, accountCreatedAt) {
    const config = await getConfessConfig(guildId);

    if (!config.confession_enabled) {
        return { ok: false, msg: '❌ O sistema de confissões está desativado.' };
    }
    if (!config.confession_channel_id) {
        return { ok: false, msg: '❌ O canal de confissões ainda não foi configurado.' };
    }

    if (await isConfessBanned(guildId, user.id)) {
        return { ok: false, msg: '❌ Você não pode enviar confissões neste servidor.' };
    }

    if (config.min_account_age_enabled && config.min_account_age_days > 0) {
        const created = accountCreatedAt || user.createdAt;
        const ageMs = Date.now() - new Date(created).getTime();
        const need = config.min_account_age_days * 24 * 60 * 60 * 1000;
        if (ageMs < need) {
            return { ok: false, msg: `❌ Sua conta precisa ter pelo menos ${config.min_account_age_days} dia(s).` };
        }
    }

    if (config.cooldown_enabled && config.cooldown_seconds > 0) {
        const last = await getLastConfessionTime(guildId, user.id);
        if (last) {
            const elapsed = (Date.now() - new Date(last).getTime()) / 1000;
            if (elapsed < config.cooldown_seconds) {
                const wait = Math.ceil(config.cooldown_seconds - elapsed);
                return { ok: false, msg: `⏳ Aguarde **${wait}** segundo(s) antes de enviar outra confissão.` };
            }
        }
    }

    return { ok: true, config };
}

export function buildConfessModal(customId = 'confess_modal') {
    const modal = new ModalBuilder()
        .setCustomId(customId)
        .setTitle('✨ Sua confissão anônima');

    const content = new TextInputBuilder()
        .setCustomId('confession_content')
        .setLabel('O que você quer contar?')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Pode escrever com calma... ninguém vai saber que foi você.')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(MAX_CONTENT);

    const color = new TextInputBuilder()
        .setCustomId('confession_color')
        .setLabel('Cor da mensagem (opcional)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('#ff4d6d  ·  red  ·  blurple')
        .setRequired(false)
        .setMaxLength(20);

    modal.addComponents(
        new ActionRowBuilder().addComponents(content),
        new ActionRowBuilder().addComponents(color)
    );
    return modal;
}

export function buildConfessButton(config) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('confess_open_modal')
            .setLabel(config.confession_button_text || 'Enviar uma confissão')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('💬')
    );
}

export function formatNumber(n) {
    return `(#${String(n).padStart(3, '0')}º)`;
}

export function buildPublicEmbed({ number, content, color, imageUrl, config, botAvatarUrl }) {
    const title = config.confession_title || 'Confissão Anônima';
    const authorName = config.confession_author || 'Anonymous';
    const num = formatNumber(number);
    const parsedColor = parseColor(color, config.default_color) || 0xEB459E;

    const body =
        `✦・**${num}**\n\n` +
        `> ${content.split('\n').join('\n> ')}\n\n` +
        `♡ ・ *${authorName}*`;

    const embed = new EmbedBuilder()
        .setColor(parsedColor)
        .setAuthor({
            name: `💭 ${title}`,
            iconURL: botAvatarUrl || undefined
        })
        .setDescription(body);

    if (imageUrl) {
        embed.setImage(imageUrl);
    }

    if (botAvatarUrl) {
        embed.setThumbnail(botAvatarUrl);
    }

    const footerBits = ['Kaori Confess'];
    if (config.confession_footer) footerBits.push(config.confession_footer);
    embed.setFooter({ text: footerBits.join(' · '), iconURL: botAvatarUrl || undefined });
    embed.setTimestamp();

    return embed;
}

/** Botões fixos da última confissão */
export function buildLatestConfessionButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('confess_make_confession')
            .setLabel('Faça sua confissão')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('💬'),
        new ButtonBuilder()
            .setCustomId('confess_open_poll')
            .setLabel('Abra uma enquete')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📊')
    );
}

export function buildLogEmbed({ number, user, content, color, imageUrl, channel, messageUrl, source }) {
    const embed = new EmbedBuilder()
        .setColor(parseColor(color) || 0xEB459E)
        .setAuthor({
            name: `Confession Log  ·  ${formatNumber(number)}`,
            iconURL: user.displayAvatarURL({ size: 64 })
        })
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .addFields(
            { name: '👤 Autor', value: `${user}\n\`${user.tag}\``, inline: true },
            { name: '🆔 User ID', value: `\`${user.id}\``, inline: true },
            { name: '📅 Quando', value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true },
            { name: '📍 Canal', value: channel ? `${channel}` : '—', inline: true },
            { name: '✨ Origem', value: source === 'modal' ? 'Modal' : source === 'button' ? 'Botão' : 'Comando', inline: true },
            { name: '🎨 Cor', value: `\`${parseColor(color) || 'padrão'}\``, inline: true },
            { name: '💬 Conteúdo', value: content.length > 900 ? content.slice(0, 900) + '…' : content }
        )
        .setTimestamp();

    if (messageUrl) {
        embed.addFields({ name: '🔗 Mensagem pública', value: messageUrl });
    }
    if (imageUrl) {
        embed.setImage(imageUrl);
    }
    return embed;
}

/**
 * Core: create + publish confession. Returns { ok, msg?, number? }
 */
export async function submitConfession({
    guild,
    user,
    content,
    colorInput,
    imageAttachment,
    source = 'command',
    client
}) {
    const guildId = guild.id;
    const check = await canUserConfess(guildId, user, user.createdAt);
    if (!check.ok) return check;
    const config = check.config;

    let text = stripMentions(content);
    if (!text || text.length < 1) {
        return { ok: false, msg: '❌ Escreva o conteúdo da confissão.' };
    }
    if (text.length > MAX_CONTENT) {
        text = text.slice(0, MAX_CONTENT);
    }

    if (config.word_filter_enabled) {
        const hit = containsBannedWord(text, config.banned_words);
        if (hit) {
            return { ok: false, msg: '❌ Sua confissão contém palavras não permitidas.' };
        }
    }

    let color = config.default_color;
    if (colorInput) {
        const parsed = parseColor(colorInput, null);
        if (!parsed) {
            return { ok: false, msg: '❌ Cor inválida. Use hex (#ff0000) ou nomes como red, blue, blurple.' };
        }
        color = parsed;
    }

    const img = validateImageAttachment(imageAttachment, config.attachments_enabled);
    if (!img.ok) return img;

    const channel = await guild.channels.fetch(config.confession_channel_id).catch(() => null);
    if (!channel || !channel.isTextBased()) {
        return { ok: false, msg: '❌ O canal de confissões configurado está inacessível. Peça a um admin para reconfigurar.' };
    }

    const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
    if (me) {
        const perms = channel.permissionsFor(me);
        if (!perms?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
            return { ok: false, msg: '❌ Não tenho permissão para enviar mensagens no canal de confissões.' };
        }
    }

    const number = await nextConfessionNumber(guildId);
    const row = await insertConfession({
        guild_id: guildId,
        confession_number: number,
        user_id: user.id,
        content: text,
        color,
        image_url: img.url,
        source
    });

    let botAvatarUrl = null;
    try {
        botAvatarUrl = client?.user?.displayAvatarURL?.({ size: 128 })
            || guild.members.me?.user?.displayAvatarURL?.({ size: 128 })
            || null;
    } catch {
        botAvatarUrl = null;
    }

    const publicEmbed = buildPublicEmbed({
        number,
        content: text,
        color,
        imageUrl: img.url,
        config,
        botAvatarUrl
    });

    const actionRow = buildLatestConfessionButtons();

    let publicMessage;
    try {
        publicMessage = await channel.send({
            embeds: [publicEmbed],
            components: [actionRow],
            allowedMentions: { parse: [] }
        });
    } catch (err) {
        console.error('Confess publish failed:', err.message);
        return { ok: false, msg: '❌ Não foi possível publicar a confissão no canal.' };
    }

    const messageUrl = publicMessage.url;
    await updateConfessionPublic(row.id, {
        public_channel_id: channel.id,
        public_message_id: publicMessage.id,
        public_message_url: messageUrl
    }).catch((e) => console.error('Confess update public ids:', e.message));

    // Somente a confissão mais recente mantém os botões
    try {
        const claim = await claimLatestConfessionButtons(
            guildId,
            publicMessage.id,
            channel.id,
            number
        );
        if (!claim.isLatest) {
            await publicMessage.edit({ components: [] }).catch(() => {});
        } else if (claim.previousMessageId && claim.previousChannelId) {
            try {
                const prevCh =
                    claim.previousChannelId === channel.id
                        ? channel
                        : await guild.channels.fetch(claim.previousChannelId).catch(() => null);
                if (prevCh?.isTextBased?.()) {
                    const prevMsg = await prevCh.messages.fetch(claim.previousMessageId).catch(() => null);
                    if (prevMsg && prevMsg.editable) {
                        await prevMsg.edit({ components: [] }).catch(() => {});
                    }
                }
            } catch (e) {
                console.error('Confess strip previous buttons:', e.message);
            }
        }
    } catch (e) {
        console.error('Confess claim latest buttons:', e.message);
    }

    if (config.logs_channel_id) {
        try {
            const logCh = await guild.channels.fetch(config.logs_channel_id).catch(() => null);
            if (logCh?.isTextBased()) {
                const logEmbed = buildLogEmbed({
                    number,
                    user,
                    content: text,
                    color,
                    imageUrl: img.url,
                    channel,
                    messageUrl,
                    source
                });
                await logCh.send({
                    embeds: [logEmbed],
                    allowedMentions: { parse: [] }
                });
            }
        } catch (err) {
            console.error('Confess log failed:', err.message);
        }
    }

    return {
        ok: true,
        number,
        msg: config.success_message || 'Sua confissão foi enviada anonimamente.',
        messageUrl
    };
}

export { getConfessConfig, updateConfessConfig, MAX_CONTENT };
