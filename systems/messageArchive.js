import {
    createCipheriv,
    createDecipheriv,
    createHash,
    createHmac,
    randomBytes
} from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { EmbedBuilder } from 'discord.js';
import { GUILD_ID } from '../config/kaori.js';

const RETENTION_DAYS = 90;
const MAX_SEARCH_OBJECTS = 2000;
const MAX_HISTORY_EVENTS = 200;
const MAX_ATTACHMENT_BYTES = Math.min(
    Math.max(Number(process.env.ARCHIVE_MAX_ATTACHMENT_BYTES) || 10 * 1024 * 1024, 1),
    25 * 1024 * 1024
);
const MAX_MESSAGE_ATTACHMENT_BYTES = 30 * 1024 * 1024;
const CONFIG_KEY = 'config/' + String(GUILD_ID || 'unknown') + '.bin';

let runtime = {
    client: null,
    store: null,
    encryptionKey: null,
    ownerId: process.env.ARCHIVE_OWNER_ID || '',
    guildId: GUILD_ID || '',
    config: null,
    enabled: false,
    failureNoticeAt: 0
};

const messageLocks = new Map();

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

function hmac(key, value, encoding) {
    return createHmac('sha256', key).update(value).digest(encoding);
}

function awsEncode(value) {
    return encodeURIComponent(String(value)).replace(/[!'()*]/g, function (character) {
        return '%' + character.charCodeAt(0).toString(16).toUpperCase();
    });
}

function buildCanonicalQuery(query) {
    return Object.entries(query || {})
        .map(function (entry) {
            return [awsEncode(entry[0]), awsEncode(entry[1])];
        })
        .sort(function (a, b) {
            return a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0]);
        })
        .map(function (entry) {
            return entry[0] + '=' + entry[1];
        })
        .join('&');
}

function getEncryptionKey(value) {
    if (Buffer.isBuffer(value)) {
        if (value.length !== 32) throw new Error('A chave de criptografia deve ter 32 bytes.');
        return value;
    }
    const raw = String(value || '').trim();
    const key = /^[a-f0-9]{64}$/i.test(raw)
        ? Buffer.from(raw, 'hex')
        : Buffer.from(raw, 'base64');
    if (key.length !== 32) {
        throw new Error('ARCHIVE_ENCRYPTION_KEY precisa conter exatamente 32 bytes em hexadecimal ou Base64.');
    }
    return key;
}

export function encryptArchiveBuffer(input, encryptionKey) {
    const key = getEncryptionKey(encryptionKey);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(Buffer.from(input)), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([Buffer.from('KAR1'), iv, tag, ciphertext]);
}

export function decryptArchiveBuffer(input, encryptionKey) {
    const data = Buffer.from(input);
    const key = getEncryptionKey(encryptionKey);
    if (data.length < 32 || data.subarray(0, 4).toString('ascii') !== 'KAR1') {
        throw new Error('Formato de arquivo Kaori inválido.');
    }
    const iv = data.subarray(4, 16);
    const tag = data.subarray(16, 32);
    const ciphertext = data.subarray(32);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function encodeJson(value, key) {
    return encryptArchiveBuffer(gzipSync(Buffer.from(JSON.stringify(value), 'utf8')), key);
}

function decodeJson(value, key) {
    return JSON.parse(gunzipSync(decryptArchiveBuffer(value, key)).toString('utf8'));
}

function decodeXml(value) {
    return String(value || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}

function xmlTag(xml, name) {
    const match = String(xml || '').match(new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>'));
    return match ? decodeXml(match[1]) : '';
}

function getStorageEnvironment() {
    const required = [
        'ARCHIVE_R2_ENDPOINT',
        'ARCHIVE_R2_BUCKET',
        'ARCHIVE_R2_ACCESS_KEY_ID',
        'ARCHIVE_R2_SECRET_ACCESS_KEY',
        'ARCHIVE_ENCRYPTION_KEY',
        'ARCHIVE_OWNER_ID',
        'ARCHIVE_RETENTION_CONFIRMED'
    ];
    const missing = required.filter(function (key) {
        return !String(process.env[key] || '').trim();
    });
    if (!GUILD_ID) missing.push('GUILD_ID');
    if (String(process.env.ARCHIVE_RETENTION_CONFIRMED || '') !== '90_DAYS') {
        missing.push('ARCHIVE_RETENTION_CONFIRMED=90_DAYS (confirme após configurar a regra de expiração no R2)');
    }

    if (missing.length) return { ready: false, missing: missing };

    const endpoint = new URL(process.env.ARCHIVE_R2_ENDPOINT);
    if (endpoint.protocol !== 'https:' || (endpoint.pathname !== '/' && endpoint.pathname !== '')) {
        throw new Error('ARCHIVE_R2_ENDPOINT deve ser a URL HTTPS raiz do endpoint S3 do R2.');
    }
    if (!/^\d{17,20}$/.test(String(process.env.ARCHIVE_OWNER_ID).trim())) {
        throw new Error('ARCHIVE_OWNER_ID deve ser o ID numérico da conta autorizada.');
    }

    return {
        ready: true,
        endpoint: endpoint.origin,
        bucket: String(process.env.ARCHIVE_R2_BUCKET).trim(),
        accessKeyId: String(process.env.ARCHIVE_R2_ACCESS_KEY_ID).trim(),
        secretAccessKey: String(process.env.ARCHIVE_R2_SECRET_ACCESS_KEY).trim(),
        ownerId: String(process.env.ARCHIVE_OWNER_ID).trim(),
        encryptionKey: getEncryptionKey(process.env.ARCHIVE_ENCRYPTION_KEY)
    };
}

class R2ObjectStore {
    constructor(config) {
        this.endpoint = config.endpoint;
        this.bucket = config.bucket;
        this.accessKeyId = config.accessKeyId;
        this.secretAccessKey = config.secretAccessKey;
        this.region = 'auto';
    }

    async request(method, key, query, body) {
        const safeKey = String(key || '').split('/').filter(Boolean).map(awsEncode).join('/');
        const canonicalUri = '/' + awsEncode(this.bucket) + (safeKey ? '/' + safeKey : '');
        const canonicalQuery = buildCanonicalQuery(query);
        const url = this.endpoint + canonicalUri + (canonicalQuery ? '?' + canonicalQuery : '');
        const payload = body ? Buffer.from(body) : Buffer.alloc(0);
        const payloadHash = sha256(payload);
        const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
        const dateStamp = amzDate.slice(0, 8);
        const headers = {
            host: new URL(this.endpoint).host,
            'x-amz-content-sha256': payloadHash,
            'x-amz-date': amzDate
        };
        const headerNames = Object.keys(headers).sort();
        const canonicalHeaders = headerNames.map(function (name) {
            return name + ':' + String(headers[name]).trim() + '\n';
        }).join('');
        const signedHeaders = headerNames.join(';');
        const canonicalRequest = [
            method,
            canonicalUri,
            canonicalQuery,
            canonicalHeaders,
            signedHeaders,
            payloadHash
        ].join('\n');
        const scope = dateStamp + '/' + this.region + '/s3/aws4_request';
        const stringToSign = [
            'AWS4-HMAC-SHA256',
            amzDate,
            scope,
            sha256(Buffer.from(canonicalRequest, 'utf8'))
        ].join('\n');
        const dateKey = hmac(Buffer.from('AWS4' + this.secretAccessKey, 'utf8'), dateStamp);
        const regionKey = hmac(dateKey, this.region);
        const serviceKey = hmac(regionKey, 's3');
        const signingKey = hmac(serviceKey, 'aws4_request');
        const signature = hmac(signingKey, stringToSign, 'hex');
        headers.authorization =
            'AWS4-HMAC-SHA256 Credential=' + this.accessKeyId + '/' + scope +
            ', SignedHeaders=' + signedHeaders + ', Signature=' + signature;

        let lastError;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const response = await fetch(url, {
                    method: method,
                    headers: headers,
                    body: ['GET', 'HEAD', 'DELETE'].includes(method) ? undefined : payload,
                    signal: AbortSignal.timeout(20000)
                });
                if (response.ok || (method === 'DELETE' && response.status === 404)) return response;
                const responseText = await response.text().catch(function () { return ''; });
                const error = new Error('R2 respondeu HTTP ' + response.status + ': ' + responseText.slice(0, 180));
                error.status = response.status;
                if (response.status < 500 || attempt === 2) throw error;
                lastError = error;
            } catch (error) {
                lastError = error;
                if (error.status && error.status < 500) throw error;
                if (attempt === 2) throw error;
            }
            await new Promise(function (resolve) {
                setTimeout(resolve, 250 * (attempt + 1));
            });
        }
        throw lastError || new Error('Não foi possível acessar o armazenamento R2.');
    }

    async putObject(key, body) {
        await this.request('PUT', key, {}, body);
        return key;
    }

    async getObject(key) {
        const response = await this.request('GET', key, {}, null);
        return Buffer.from(await response.arrayBuffer());
    }

    async deleteObject(key) {
        await this.request('DELETE', key, {}, null);
    }

    async listObjects(prefix, continuationToken) {
        const query = { 'list-type': '2', prefix: prefix, 'max-keys': '1000' };
        if (continuationToken) query['continuation-token'] = continuationToken;
        const response = await this.request('GET', '', query, null);
        const xml = await response.text();
        const objects = Array.from(xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)).map(function (match) {
            const block = match[1];
            return {
                key: xmlTag(block, 'Key'),
                lastModified: xmlTag(block, 'LastModified'),
                size: Number(xmlTag(block, 'Size')) || 0
            };
        }).filter(function (item) { return item.key; });
        return {
            objects: objects,
            truncated: xmlTag(xml, 'IsTruncated') === 'true',
            nextToken: xmlTag(xml, 'NextContinuationToken') || null
        };
    }
}

function formatDateParts(date) {
    const iso = date.toISOString();
    return { year: iso.slice(0, 4), month: iso.slice(5, 7), day: iso.slice(8, 10) };
}

function makeEventObjectKey(guildId, channelId, authorId, messageId, eventType, capturedAt) {
    const date = formatDateParts(new Date(capturedAt));
    const safeType = String(eventType).replace(/[^a-z_]/gi, '');
    const nonce = randomBytes(4).toString('hex');
    return 'events/' + guildId + '/' + date.year + '/' + date.month + '/' + date.day +
        '/' + sha256(channelId || 'unknown').slice(0, 20) + '/' +
        sha256(authorId || 'unknown').slice(0, 20) + '/' +
        Date.parse(capturedAt) + '_' + sha256(messageId).slice(0, 24) + '_' + safeType + '_' + nonce + '.bin';
}

export function buildMessageArchiveObjectKey(input) {
    return makeEventObjectKey(
        String(input.guildId || 'guild'),
        String(input.channelId || 'channel'),
        String(input.authorId || 'author'),
        String(input.messageId || 'message'),
        String(input.eventType || 'created'),
        input.capturedAt || new Date(0).toISOString()
    );
}

export function buildMessageArchiveNoticeEmbed() {
    return new EmbedBuilder()
        .setColor(0x8b1a1a)
        .setTitle('✦ AVISO DE ARQUIVAMENTO DE MENSAGENS')
        .setDescription(
            'Para fins de segurança, prevenção de abuso e moderação, mensagens enviadas nos canais da Allied aos quais a Kaori tem acesso poderão ser arquivadas por até **90 dias**.\n\n' +
            'O registro inclui mensagens de pessoas, bots e webhooks, além de versões anteriores e posteriores de mensagens editadas e conteúdo disponível no momento de exclusões. Anexos acessíveis também poderão ser copiados para o arquivo, respeitando o limite técnico informado pela administração.\n\n' +
            'Os registros ficam em armazenamento privado, criptografados antes do envio, e o acesso ao arquivo é restrito ao responsável designado pelo sistema. O arquivo não é publicado em canais de logs do Discord.\n\n' +
            'Não envie senhas, dados financeiros ou outras informações altamente sensíveis no servidor. Em caso de dúvidas sobre o tratamento dos registros, procure a administração da Allied.'
        )
        .addFields(
            { name: 'Abrangência', value: 'Canais de servidor e threads que a Kaori consegue acessar.', inline: true },
            { name: 'Retenção', value: 'Até 90 dias, com remoção automática no armazenamento.', inline: true },
            { name: 'Acesso', value: 'Restrito à conta autorizada do responsável pelo arquivo.', inline: false }
        )
        .setFooter({ text: 'ALLIED · TRANSPARÊNCIA E SEGURANÇA' })
        .setTimestamp();
}

function getMessageIdentity(message) {
    return {
        guildId: message.guildId || message.guild?.id || '',
        channelId: message.channelId || message.channel?.id || '',
        messageId: message.id || '',
        authorId: message.author?.id || ''
    };
}

function safeJson(value) {
    try {
        return value && typeof value.toJSON === 'function' ? value.toJSON() : value ?? null;
    } catch {
        return null;
    }
}

function snapshotHasContent(snapshot) {
    return Boolean(
        snapshot &&
        (snapshot.content !== null ||
            (Array.isArray(snapshot.attachments) && snapshot.attachments.length > 0) ||
            (Array.isArray(snapshot.embeds) && snapshot.embeds.length > 0))
    );
}

async function readResponseLimited(response, maxBytes) {
    const declaredLength = Number(response.headers.get('content-length')) || 0;
    if (declaredLength > maxBytes) throw new Error('attachment_over_limit');

    const reader = response.body?.getReader?.();
    if (!reader) {
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > maxBytes) throw new Error('attachment_over_limit');
        return buffer;
    }

    const chunks = [];
    let total = 0;
    while (true) {
        const part = await reader.read();
        if (part.done) break;
        total += part.value.byteLength;
        if (total > maxBytes) {
            await reader.cancel().catch(function () {});
            throw new Error('attachment_over_limit');
        }
        chunks.push(Buffer.from(part.value));
    }
    return Buffer.concat(chunks, total);
}

async function copyAttachment(attachment, identity, capturedAt, currentTotal) {
    const metadata = {
        id: attachment.id || null,
        filename: attachment.name || null,
        description: attachment.description || null,
        contentType: attachment.contentType || attachment.content_type || null,
        size: Number(attachment.size) || 0,
        url: null,
        archived: false,
        storageKey: null,
        skippedReason: null
    };
    const sourceUrl = attachment.url || null;
    if (!sourceUrl) {
        metadata.skippedReason = 'url_unavailable';
        return { metadata: metadata, bytes: 0 };
    }
    if (metadata.size > MAX_ATTACHMENT_BYTES) {
        metadata.skippedReason = 'attachment_over_limit';
        return { metadata: metadata, bytes: 0 };
    }
    if (currentTotal + metadata.size > MAX_MESSAGE_ATTACHMENT_BYTES) {
        metadata.skippedReason = 'message_total_over_limit';
        return { metadata: metadata, bytes: 0 };
    }

    let url;
    try {
        url = new URL(sourceUrl);
    } catch {
        metadata.skippedReason = 'invalid_url';
        return { metadata: metadata, bytes: 0 };
    }
    if (url.protocol !== 'https:' || !['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname)) {
        metadata.skippedReason = 'untrusted_attachment_host';
        return { metadata: metadata, bytes: 0 };
    }

    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('download_http_' + response.status);
        const bytes = await readResponseLimited(response, Math.min(
            MAX_ATTACHMENT_BYTES,
            MAX_MESSAGE_ATTACHMENT_BYTES - currentTotal
        ));
        const date = formatDateParts(new Date(capturedAt));
        const safeName = String(metadata.filename || metadata.id || 'attachment')
            .replace(/[^a-z0-9._-]/gi, '_').slice(0, 80);
        const storageKey = 'attachments/' + identity.guildId + '/' + date.year + '/' + date.month +
            '/' + date.day + '/' + sha256(identity.messageId) + '/' +
            Date.parse(capturedAt) + '_' + randomBytes(4).toString('hex') + '_' +
            String(metadata.id || 'file') + '_' + safeName + '.bin';
        await runtime.store.putObject(storageKey, encryptArchiveBuffer(bytes, runtime.encryptionKey));
        metadata.archived = true;
        metadata.storageKey = storageKey;
        return { metadata: metadata, bytes: bytes.length };
    } catch (error) {
        metadata.skippedReason = String(error.message || 'download_failed').slice(0, 100);
        return { metadata: metadata, bytes: 0 };
    }
}

async function makeSnapshot(message, options) {
    const identity = getMessageIdentity(message);
    const capturedAt = options.capturedAt || new Date().toISOString();
    const attachments = [];
    let copiedBytes = 0;

    for (const attachment of message.attachments?.values?.() || []) {
        const copied = options.copyAttachments
            ? await copyAttachment(attachment, identity, capturedAt, copiedBytes)
            : {
                metadata: {
                    id: attachment.id || null,
                    filename: attachment.name || null,
                    description: attachment.description || null,
                    contentType: attachment.contentType || attachment.content_type || null,
                    size: Number(attachment.size) || 0,
                    url: null,
                    archived: false,
                    storageKey: null,
                    skippedReason: 'not_copied_for_this_event'
                },
                bytes: 0
            };
        attachments.push(copied.metadata);
        copiedBytes += copied.bytes;
    }

    const author = message.author || null;
    return {
        messageId: identity.messageId,
        guildId: identity.guildId,
        guildName: message.guild?.name || null,
        channelId: identity.channelId,
        channelName: message.channel?.name || null,
        channelType: message.channel?.type ?? null,
        parentChannelId: message.channel?.parentId || null,
        author: author ? {
            id: author.id || null,
            username: author.username || null,
            globalName: author.globalName || author.global_name || null,
            discriminator: author.discriminator || null,
            bot: author.bot === true,
            system: author.system === true
        } : null,
        webhookId: message.webhookId || null,
        content: typeof message.content === 'string' ? message.content : null,
        embeds: Array.from(message.embeds?.values?.() || []).map(safeJson),
        components: Array.from(message.components || []).map(safeJson),
        stickers: Array.from(message.stickers?.values?.() || []).map(safeJson),
        reactions: Array.from(message.reactions?.cache?.values?.() || []).map(function (reaction) {
            return {
                emoji: reaction.emoji?.name || null,
                emojiId: reaction.emoji?.id || null,
                count: Number(reaction.count) || 0,
                me: reaction.me === true
            };
        }),
        poll: safeJson(message.poll),
        messageType: message.type ?? null,
        attachments: attachments,
        reference: message.reference ? {
            messageId: message.reference.messageId || null,
            channelId: message.reference.channelId || null,
            guildId: message.reference.guildId || null
        } : null,
        flags: message.flags?.bitfield ?? null,
        createdAt: message.createdAt?.toISOString?.() || null,
        editedAt: message.editedAt?.toISOString?.() || null,
        capturedAt: capturedAt,
        partial: message.partial === true
    };
}

async function readJsonObject(key) {
    try {
        return decodeJson(await runtime.store.getObject(key), runtime.encryptionKey);
    } catch (error) {
        if (error.status === 404 || /NoSuchKey|Not Found/i.test(error.message || '')) return null;
        throw error;
    }
}

async function writeJsonObject(key, value) {
    await runtime.store.putObject(key, encodeJson(value, runtime.encryptionKey));
}

async function updateMessageIndex(identity, recordKey, eventType, capturedAt) {
    const indexKey = 'message-index/' + identity.guildId + '/' + sha256(identity.messageId) + '.bin';
    const current = await readJsonObject(indexKey);
    const eventKeys = Array.isArray(current?.eventKeys) ? current.eventKeys.slice(-MAX_HISTORY_EVENTS + 1) : [];
    eventKeys.push(recordKey);
    await writeJsonObject(indexKey, {
        guildId: identity.guildId,
        messageId: identity.messageId,
        channelId: identity.channelId || current?.channelId || null,
        authorId: identity.authorId || current?.authorId || null,
        latestRecordKey: recordKey,
        latestEventType: eventType,
        eventKeys: eventKeys,
        updatedAt: capturedAt,
        deleted: eventType === 'deleted' || eventType === 'bulk_deleted'
    });
}

async function getLatestSnapshot(identity) {
    if (!identity.guildId || !identity.messageId) return null;
    const index = await readJsonObject('message-index/' + identity.guildId + '/' + sha256(identity.messageId) + '.bin');
    if (!index?.latestRecordKey) return null;
    const record = await readJsonObject(index.latestRecordKey);
    return record?.snapshot || record?.beforeSnapshot || null;
}

async function persistMessageEvent(identity, eventType, snapshot, options) {
    if (!identity.guildId || !identity.messageId) return null;
    const capturedAt = new Date().toISOString();
    const authorId = identity.authorId || snapshot?.author?.id || options?.authorId || 'unknown';
    const channelId = identity.channelId || snapshot?.channelId || options?.channelId || 'unknown';
    const recordKey = makeEventObjectKey(
        identity.guildId,
        channelId,
        authorId,
        identity.messageId,
        eventType,
        capturedAt
    );
    const record = {
        schemaVersion: 1,
        eventType: eventType,
        capturedAt: capturedAt,
        guildId: identity.guildId,
        channelId: channelId,
        messageId: identity.messageId,
        authorId: authorId,
        snapshot: snapshot || null,
        beforeSnapshot: options?.beforeSnapshot || null,
        deleterId: null,
        deleterAttribution: eventType === 'deleted' || eventType === 'bulk_deleted'
            ? 'O evento Gateway de exclusão não informa quem executou a ação.'
            : null
    };
    await writeJsonObject(recordKey, record);
    await updateMessageIndex({
        guildId: identity.guildId,
        channelId: channelId,
        authorId: authorId,
        messageId: identity.messageId
    }, recordKey, eventType, capturedAt);
    return recordKey;
}

async function withMessageLock(messageId, task) {
    const previous = messageLocks.get(messageId) || Promise.resolve();
    const current = previous.catch(function () {}).then(task);
    messageLocks.set(messageId, current);
    try {
        return await current;
    } finally {
        if (messageLocks.get(messageId) === current) messageLocks.delete(messageId);
    }
}

async function reportArchiveFailure(error, context) {
    console.error('[MessageArchive] ' + context + ':', error?.message || error);
    const now = Date.now();
    if (!runtime.client || !runtime.ownerId || now - runtime.failureNoticeAt < 30 * 60 * 1000) return;
    runtime.failureNoticeAt = now;
    try {
        const owner = await runtime.client.users.fetch(runtime.ownerId);
        await owner.send(
            '⚠️ A Kaori não conseguiu arquivar um evento de mensagem no armazenamento privado. ' +
            'Confira as variáveis e a disponibilidade do Cloudflare R2. O evento que falhou pode não estar preservado.'
        );
    } catch (dmError) {
        console.error('[MessageArchive] não foi possível avisar o responsável por DM:', dmError.message);
    }
}

function validGuildMessage(message) {
    const guildId = message?.guildId || message?.guild?.id;
    return Boolean(runtime.enabled && runtime.store && runtime.encryptionKey && guildId === runtime.guildId);
}

export async function handleArchiveMessageCreate(message) {
    if (!validGuildMessage(message)) return;
    const identity = getMessageIdentity(message);
    if (!identity.messageId) return;
    return withMessageLock(identity.messageId, async function () {
        try {
            const snapshot = await makeSnapshot(message, { copyAttachments: true });
            await persistMessageEvent(identity, 'created', snapshot);
        } catch (error) {
            await reportArchiveFailure(error, 'messageCreate');
        }
    });
}

export async function handleArchiveMessageUpdate(before, after) {
    if (!validGuildMessage(after)) return;
    const identity = getMessageIdentity(after);
    if (!identity.messageId) return;
    return withMessageLock(identity.messageId, async function () {
        try {
            let beforeSnapshot = await makeSnapshot(before, { copyAttachments: false });
            if (!snapshotHasContent(beforeSnapshot)) {
                beforeSnapshot = await getLatestSnapshot(identity);
            }
            const afterSnapshot = await makeSnapshot(after, { copyAttachments: true });
            await persistMessageEvent(identity, 'edited', afterSnapshot, {
                beforeSnapshot: beforeSnapshot
            });
        } catch (error) {
            await reportArchiveFailure(error, 'messageUpdate');
        }
    });
}

export async function handleArchiveMessageDelete(message, bulk) {
    const identity = getMessageIdentity(message);
    const guildId = identity.guildId || runtime.guildId;
    if (!runtime.enabled || !runtime.store || !runtime.encryptionKey || guildId !== runtime.guildId || !identity.messageId) return;
    identity.guildId = guildId;
    return withMessageLock(identity.messageId, async function () {
        try {
            let snapshot = await makeSnapshot(message, { copyAttachments: false });
            if (!snapshotHasContent(snapshot)) snapshot = await getLatestSnapshot(identity);
            await persistMessageEvent(identity, bulk ? 'bulk_deleted' : 'deleted', snapshot, {
                authorId: identity.authorId || snapshot?.author?.id,
                channelId: identity.channelId || snapshot?.channelId
            });
        } catch (error) {
            await reportArchiveFailure(error, bulk ? 'messageDeleteBulk' : 'messageDelete');
        }
    });
}

export async function handleArchiveMessageDeleteBulk(messages) {
    for (const message of messages?.values?.() || []) {
        await handleArchiveMessageDelete(message, true);
    }
}

function getDefaultArchiveConfig() {
    return {
        enabled: false,
        retentionDays: RETENTION_DAYS,
        noticeChannelId: null,
        noticeMessageId: null,
        noticePublishedAt: null,
        updatedAt: new Date().toISOString()
    };
}

async function readArchiveConfig() {
    const stored = await readJsonObject(CONFIG_KEY);
    return stored && typeof stored === 'object'
        ? { ...getDefaultArchiveConfig(), ...stored, retentionDays: RETENTION_DAYS }
        : getDefaultArchiveConfig();
}

async function writeArchiveConfig(config) {
    const next = { ...config, retentionDays: RETENTION_DAYS, updatedAt: new Date().toISOString() };
    await writeJsonObject(CONFIG_KEY, next);
    runtime.config = next;
    runtime.enabled = next.enabled === true;
    return next;
}

export async function initMessageArchive(client) {
    runtime.client = client;
    runtime.ownerId = process.env.ARCHIVE_OWNER_ID || '';
    runtime.guildId = GUILD_ID || '';
    runtime.enabled = false;
    runtime.config = null;
    runtime.store = null;
    runtime.encryptionKey = null;
    try {
        const environment = getStorageEnvironment();
        if (!environment.ready) return { ready: false, enabled: false, missing: environment.missing };
        runtime.store = new R2ObjectStore(environment);
        runtime.encryptionKey = environment.encryptionKey;
        runtime.ownerId = environment.ownerId;
        await runtime.store.listObjects('config/' + String(GUILD_ID) + '.bin');
        runtime.config = await readArchiveConfig();
        runtime.enabled = runtime.config.enabled === true;
        return { ready: true, enabled: runtime.enabled, retentionDays: RETENTION_DAYS, encrypted: true };
    } catch (error) {
        runtime.store = null;
        runtime.encryptionKey = null;
        runtime.enabled = false;
        console.error('[MessageArchive] inicialização indisponível:', error.message);
        return { ready: false, enabled: false, error: error.message };
    }
}

export function isMessageArchiveOwner(userId, guildId) {
    return Boolean(
        runtime.ownerId &&
        String(userId) === runtime.ownerId &&
        runtime.guildId &&
        String(guildId) === runtime.guildId
    );
}

export function getMessageArchiveStatus() {
    let environment;
    try {
        environment = getStorageEnvironment();
    } catch (error) {
        environment = { ready: false, missing: [error.message] };
    }
    return {
        ready: environment.ready && Boolean(runtime.store),
        enabled: runtime.enabled,
        ownerConfigured: Boolean(runtime.ownerId),
        retentionDays: RETENTION_DAYS,
        encrypted: Boolean(runtime.encryptionKey),
        storage: 'Cloudflare R2 (bucket privado)',
        missing: environment.missing || [],
        noticeChannelId: runtime.config?.noticeChannelId || null,
        noticeMessageId: runtime.config?.noticeMessageId || null
    };
}

export async function publishMessageArchiveNotice(channel) {
    if (!runtime.store || !runtime.encryptionKey) {
        throw new Error('O armazenamento R2 ainda não está configurado nas variáveis da Railway.');
    }
    if (!channel?.isTextBased?.() || !channel.send) {
        throw new Error('Escolha um canal de texto público para publicar o aviso.');
    }
    const botMember = channel.guild?.members?.me;
    const permissions = botMember ? channel.permissionsFor(botMember) : null;
    if (!permissions?.has('ViewChannel') || !permissions?.has('SendMessages') || !permissions?.has('EmbedLinks')) {
        throw new Error('A Kaori precisa de Ver Canal, Enviar Mensagens e Inserir Links no canal escolhido.');
    }
    const message = await channel.send({
        embeds: [buildMessageArchiveNoticeEmbed()],
        allowedMentions: { parse: [] }
    });
    const current = runtime.config || getDefaultArchiveConfig();
    await writeArchiveConfig({
        ...current,
        enabled: false,
        noticeChannelId: channel.id,
        noticeMessageId: message.id,
        noticePublishedAt: new Date().toISOString()
    });
    return message;
}

export async function setMessageArchiveEnabled(enabled, guild) {
    if (!runtime.store || !runtime.encryptionKey) {
        throw new Error('O armazenamento R2 ainda não está configurado nas variáveis da Railway.');
    }
    const current = runtime.config || await readArchiveConfig();
    if (enabled) {
        if (!current.noticeChannelId || !current.noticeMessageId) {
            throw new Error('Publique primeiro o aviso público com /arquivo aviso canal:#regras.');
        }
        const channel = await guild.channels.fetch(current.noticeChannelId).catch(function () { return null; });
        if (!channel?.messages?.fetch) throw new Error('O canal do aviso não está mais acessível. Publique o aviso novamente.');
        const notice = await channel.messages.fetch(current.noticeMessageId).catch(function () { return null; });
        if (!notice) throw new Error('O aviso público não foi encontrado. Publique-o novamente antes de ativar o arquivo.');
    }
    return writeArchiveConfig({ ...current, enabled: Boolean(enabled) });
}

function getRecentDatePrefixes(guildId, days) {
    const prefixes = [];
    const now = new Date();
    for (let index = 0; index < days; index++) {
        const date = new Date(now);
        date.setUTCDate(date.getUTCDate() - index);
        const parts = formatDateParts(date);
        prefixes.push('events/' + guildId + '/' + parts.year + '/' + parts.month + '/' + parts.day + '/');
    }
    return prefixes;
}

async function collectArchiveObjects(prefixes, maxObjects) {
    const objects = [];
    for (const prefix of prefixes) {
        let continuationToken = null;
        do {
            const page = await runtime.store.listObjects(prefix, continuationToken);
            for (const object of page.objects) {
                objects.push(object);
                if (objects.length >= maxObjects) {
                    return { objects: objects, truncated: true };
                }
            }
            continuationToken = page.truncated ? page.nextToken : null;
        } while (continuationToken);
    }
    return { objects: objects, truncated: false };
}

export async function searchMessageArchive(options) {
    if (!runtime.store || !runtime.encryptionKey) throw new Error('O armazenamento privado não está disponível.');
    const days = Math.min(Math.max(Number(options.days) || 7, 1), RETENTION_DAYS);
    const limit = Math.min(Math.max(Number(options.limit) || 10, 1), 10);
    const authorId = options.authorId ? String(options.authorId) : '';
    const channelId = options.channelId ? String(options.channelId) : '';
    const term = String(options.term || '').trim().toLocaleLowerCase('pt-BR');
    const eventType = options.eventType || 'all';
    const prefixes = getRecentDatePrefixes(runtime.guildId, days).map(function (prefix) {
        return prefix;
    });
    const collected = await collectArchiveObjects(prefixes, MAX_SEARCH_OBJECTS);
    const candidates = collected.objects.filter(function (object) {
        if (eventType !== 'all' && !object.key.includes('_' + eventType + '_')) return false;
        return true;
    });
    candidates.sort(function (a, b) {
        return String(b.lastModified).localeCompare(String(a.lastModified));
    });

    const records = [];
    let scanned = 0;
    for (const object of candidates) {
        scanned++;
        let record;
        try {
            record = await readJsonObject(object.key);
        } catch (error) {
            console.error('[MessageArchive] falha ao ler registro:', error.message);
            continue;
        }
        if (!record) continue;
        if (authorId && record.authorId !== authorId) continue;
        if (channelId && record.channelId !== channelId) continue;
        const searchable = [
            record.snapshot?.content,
            record.beforeSnapshot?.content,
            record.snapshot?.author?.username,
            record.snapshot?.author?.globalName,
            record.snapshot?.channelName
        ].filter(Boolean).join('\n').toLocaleLowerCase('pt-BR');
        if (term && !searchable.includes(term)) continue;
        records.push({ key: object.key, lastModified: object.lastModified, record: record });
        if (records.length >= limit) break;
    }
    return { records: records, scanned: scanned, truncated: collected.truncated, scanLimit: MAX_SEARCH_OBJECTS };
}

export async function getMessageArchiveHistory(messageId) {
    if (!runtime.store || !runtime.encryptionKey) throw new Error('O armazenamento privado não está disponível.');
    const cleanId = String(messageId || '').trim();
    if (!/^\d{17,20}$/.test(cleanId)) throw new Error('Informe um ID válido de mensagem do Discord.');
    const index = await readJsonObject('message-index/' + runtime.guildId + '/' + sha256(cleanId) + '.bin');
    if (!index || !Array.isArray(index.eventKeys)) return [];
    const history = [];
    for (const key of index.eventKeys.slice(-20)) {
        const record = await readJsonObject(key).catch(function () { return null; });
        if (record) history.push({ key: key, record: record });
    }
    return history;
}


export async function getArchivedAttachment(storageKey) {
    if (!runtime.store || !runtime.encryptionKey) throw new Error('O armazenamento privado não está disponível.');
    const prefix = 'attachments/' + runtime.guildId + '/';
    if (typeof storageKey !== 'string' || !storageKey.startsWith(prefix) || storageKey.includes('..')) {
        throw new Error('Referência de anexo inválida.');
    }
    return decryptArchiveBuffer(await runtime.store.getObject(storageKey), runtime.encryptionKey);
}
