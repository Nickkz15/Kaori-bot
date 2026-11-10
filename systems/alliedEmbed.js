import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} from 'discord.js';

function requiredHttpUrl(value, fieldName) {
    if (value == null || value === '') return null;
    let url;
    try {
        url = new URL(String(value));
    } catch {
        throw new Error(`URL inválida no campo ${fieldName}.`);
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error(`O campo ${fieldName} aceita somente links HTTP ou HTTPS.`);
    }
    return url.href;
}

function parseColor(value) {
    if (value == null || value === '') return null;
    if (Number.isInteger(value) && value >= 0 && value <= 0xffffff) return value;
    const match = String(value).trim().match(/^#?([0-9a-f]{6})$/i);
    if (!match) throw new Error('Cor inválida. Use hexadecimal, por exemplo `#8B1A1A`.');
    return Number.parseInt(match[1], 16);
}

function asString(value, fieldName, maxLength) {
    if (value == null) return null;
    const text = String(value);
    if (text.length > maxLength) throw new Error(`${fieldName} excede ${maxLength} caracteres.`);
    return text;
}

export function buildEmbedFromData(data = {}) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Cada embed precisa ser um objeto JSON.');
    }

    const embed = new EmbedBuilder();
    const title = asString(data.title, 'Título', 256);
    const description = asString(data.description, 'Descrição', 4096);
    const url = requiredHttpUrl(data.url, 'URL do embed');
    const color = parseColor(data.color);

    if (title) embed.setTitle(title);
    if (description) embed.setDescription(description);
    if (url) embed.setURL(url);
    if (color != null) embed.setColor(color);

    if (data.author != null) {
        if (typeof data.author !== 'object' || Array.isArray(data.author)) throw new Error('author precisa ser um objeto.');
        const name = asString(data.author.name, 'Nome do autor', 256);
        if (!name) throw new Error('author.name é obrigatório quando author é informado.');
        const author = { name };
        const authorUrl = requiredHttpUrl(data.author.url, 'author.url');
        const iconURL = requiredHttpUrl(data.author.icon_url ?? data.author.iconURL, 'author.icon_url');
        if (authorUrl) author.url = authorUrl;
        if (iconURL) author.iconURL = iconURL;
        embed.setAuthor(author);
    }

    if (data.thumbnail != null) {
        const value = typeof data.thumbnail === 'string' ? data.thumbnail : data.thumbnail.url;
        const urlValue = requiredHttpUrl(value, 'thumbnail');
        if (urlValue) embed.setThumbnail(urlValue);
    }
    if (data.image != null) {
        const value = typeof data.image === 'string' ? data.image : data.image.url;
        const urlValue = requiredHttpUrl(value, 'image');
        if (urlValue) embed.setImage(urlValue);
    }

    if (data.footer != null) {
        if (typeof data.footer !== 'object' || Array.isArray(data.footer)) throw new Error('footer precisa ser um objeto.');
        const text = asString(data.footer.text, 'Texto do rodapé', 2048);
        if (!text) throw new Error('footer.text é obrigatório quando footer é informado.');
        const footer = { text };
        const iconURL = requiredHttpUrl(data.footer.icon_url ?? data.footer.iconURL, 'footer.icon_url');
        if (iconURL) footer.iconURL = iconURL;
        embed.setFooter(footer);
    }

    if (data.timestamp) {
        if (data.timestamp === true) embed.setTimestamp();
        else {
            const date = new Date(data.timestamp);
            if (Number.isNaN(date.getTime())) throw new Error('Timestamp inválido. Use uma data ISO ou true.');
            embed.setTimestamp(date);
        }
    }

    if (data.fields != null) {
        if (!Array.isArray(data.fields) || data.fields.length > 25) {
            throw new Error('fields precisa ser um array com no máximo 25 elementos.');
        }
        const fields = data.fields.map((field, index) => {
            if (!field || typeof field !== 'object') throw new Error(`Field ${index + 1} inválido.`);
            const name = asString(field.name, `Nome do field ${index + 1}`, 256);
            const value = asString(field.value, `Valor do field ${index + 1}`, 1024);
            if (!name || !value) throw new Error(`Field ${index + 1} precisa de name e value.`);
            return { name, value, inline: field.inline === true };
        });
        if (fields.length) embed.addFields(fields);
    }

    const json = embed.toJSON();
    if (!['title', 'description', 'url', 'color', 'author', 'thumbnail', 'image', 'footer', 'timestamp', 'fields'].some((key) => json[key] != null)) {
        throw new Error('O embed está vazio. Adicione pelo menos título, descrição, imagem, autor, rodapé ou fields.');
    }
    const characterCount = [
        json.title || '', json.description || '', json.author?.name || '', json.footer?.text || '',
        ...(json.fields || []).flatMap((field) => [field.name, field.value])
    ].join('').length;
    if (characterCount > 6000) {
        throw new Error(`O embed possui ${characterCount} caracteres; o limite total do Discord é 6000.`);
    }
    return embed;
}

export function buildLinkButtonRows(buttons = []) {
    if (!Array.isArray(buttons) || buttons.length > 25) {
        throw new Error('buttons precisa ser um array com no máximo 25 botões.');
    }
    const normalized = buttons.map((button, index) => {
        if (!button || typeof button !== 'object') throw new Error(`Botão ${index + 1} inválido.`);
        const label = String(button.label || '').trim().slice(0, 80);
        const url = requiredHttpUrl(button.url, `URL do botão ${index + 1}`);
        if (!label || !url) throw new Error(`Botão ${index + 1} precisa de label e URL HTTP(S).`);
        return { label, url, emoji: button.emoji ? String(button.emoji) : null };
    });

    const rows = [];
    for (let offset = 0; offset < normalized.length; offset += 5) {
        const row = new ActionRowBuilder();
        for (const button of normalized.slice(offset, offset + 5)) {
            const builder = new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel(button.label)
                .setURL(button.url);
            if (button.emoji) builder.setEmoji(button.emoji);
            row.addComponents(builder);
        }
        rows.push(row);
    }
    return rows;
}

export function buildEmbedMessagePayload(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error('O payload precisa ser um objeto JSON.');
    }
    const content = asString(input.content, 'Texto da mensagem', 2000);
    const rawEmbeds = Array.isArray(input.embeds)
        ? input.embeds
        : input.embed
            ? [input.embed]
            : [];
    if (rawEmbeds.length > 10) throw new Error('O Discord permite até 10 embeds por mensagem.');
    const embeds = rawEmbeds.map(buildEmbedFromData);
    const totalEmbedCharacters = embeds.reduce((total, embed) => {
        const data = embed.toJSON();
        return total + [data.title || '', data.description || '', data.author?.name || '', data.footer?.text || '', ...(data.fields || []).flatMap((field) => [field.name, field.value])].join('').length;
    }, 0);
    if (totalEmbedCharacters > 6000) {
        throw new Error(`O conjunto de embeds possui ${totalEmbedCharacters} caracteres; o limite por mensagem do Discord é 6000.`);
    }
    const buttons = buildLinkButtonRows(input.buttons || []);

    if (!content && embeds.length === 0 && buttons.length === 0) {
        throw new Error('Adicione texto, pelo menos um embed ou algum botão.');
    }

    return {
        content: content || undefined,
        embeds,
        components: buttons,
        allowedMentions: { parse: [], users: [], roles: [] }
    };
}

export function parseEmbedJson(raw) {
    let value;
    try {
        value = JSON.parse(raw);
    } catch {
        throw new Error('JSON inválido. Confira aspas, vírgulas e chaves.');
    }
    return buildEmbedMessagePayload(value);
}
