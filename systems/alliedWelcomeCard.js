/**
 * Allied Welcomer 2.0 — renderização determinística do cartão de boas-vindas.
 * Usa @napi-rs/canvas (compatível com Railway/Node).
 */
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { AttachmentBuilder } from 'discord.js';

export const CARD_WIDTH = 1100;
export const CARD_HEIGHT = 500;
export const MAX_ART_BYTES = 2.5 * 1024 * 1024;
export const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

export const VISUAL_MODELS = {
    cinematic: {
        id: 'cinematic',
        label: 'Cinematográfico',
        description: 'Atmosfera noturna, barra carmim, hierarquia forte'
    },
    minimal: {
        id: 'minimal',
        label: 'Minimalista',
        description: 'Limpo, tipografia e espaço'
    },
    decorative: {
        id: 'decorative',
        label: 'Decorativo',
        description: 'Molduras e detalhes elegantes'
    }
};

const CARMINE = '#8B1A1A';
const WHITE = '#F5F5F5';
const MUTED = '#C8C8C8';
const BLACK = '#0A0A0A';

function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
}

function drawCoverImage(ctx, img, w, h, fit = 'cover') {
    const iw = img.width;
    const ih = img.height;
    const scale =
        fit === 'contain'
            ? Math.min(w / iw, h / ih)
            : Math.max(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
}

function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}

function truncate(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) {
        t = t.slice(0, -1);
    }
    return t + '…';
}

async function loadArtFromConfig(config) {
    if (!config.art_enabled) return null;
    if (config.art_buffer) {
        try {
            return await loadImage(Buffer.from(config.art_buffer));
        } catch {
            return null;
        }
    }
    if (config.art_url) {
        try {
            return await loadImage(config.art_url);
        } catch {
            return null;
        }
    }
    return null;
}

async function loadAvatar(url) {
    if (!url) return null;
    try {
        return await loadImage(url);
    } catch {
        return null;
    }
}

/**
 * @param {object} opts
 * @param {object} opts.config - welcome config
 * @param {string} opts.displayName
 * @param {string} opts.username
 * @param {string} opts.avatarUrl
 * @param {number} opts.memberCount
 * @param {string} opts.serverName
 */
export async function renderWelcomeCard(opts) {
    const {
        config,
        displayName,
        username,
        avatarUrl,
        memberCount,
        serverName
    } = opts;

    const model = VISUAL_MODELS[config.visual_model]?.id || 'cinematic';
    const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
    const ctx = canvas.getContext('2d');

    // Fundo padrão
    ctx.fillStyle = BLACK;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    const art = await loadArtFromConfig(config);
    if (art) {
        ctx.save();
        drawCoverImage(ctx, art, CARD_WIDTH, CARD_HEIGHT, config.art_fit || 'cover');
        ctx.restore();
    } else {
        // Gradiente noturno padrão Allied
        const g = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
        g.addColorStop(0, '#120808');
        g.addColorStop(0.5, '#1a0a0a');
        g.addColorStop(1, '#0a0a0a');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
        // Vinheta
        const v = ctx.createRadialGradient(
            CARD_WIDTH / 2,
            CARD_HEIGHT / 2,
            80,
            CARD_WIDTH / 2,
            CARD_HEIGHT / 2,
            700
        );
        v.addColorStop(0, 'rgba(0,0,0,0)');
        v.addColorStop(1, 'rgba(0,0,0,0.65)');
        ctx.fillStyle = v;
        ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    }

    // Overlay escuro para legibilidade (ajustável)
    const overlay = clamp(Number(config.overlay_opacity ?? 0.45), 0, 0.85);
    if (overlay > 0) {
        ctx.fillStyle = `rgba(0,0,0,${overlay})`;
        ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    }

    const showAvatar = config.show_avatar !== false;
    const showName = config.show_name !== false;
    const showBrand = config.show_brand !== false;
    const showCount = config.show_membercount !== false;
    const primary = config.text_primary || WHITE;
    const secondary = config.text_secondary || MUTED;
    const accent = config.accent_color || CARMINE;

    const name = String(displayName || username || 'Membro').slice(0, 32);
    const uname = String(username || '').slice(0, 32);

    if (model === 'minimal') {
        await drawMinimal(ctx, {
            showAvatar,
            showName,
            showBrand,
            showCount,
            primary,
            secondary,
            accent,
            name,
            uname,
            avatarUrl,
            memberCount,
            serverName,
            config
        });
    } else if (model === 'decorative') {
        await drawDecorative(ctx, {
            showAvatar,
            showName,
            showBrand,
            showCount,
            primary,
            secondary,
            accent,
            name,
            uname,
            avatarUrl,
            memberCount,
            serverName,
            config
        });
    } else {
        await drawCinematic(ctx, {
            showAvatar,
            showName,
            showBrand,
            showCount,
            primary,
            secondary,
            accent,
            name,
            uname,
            avatarUrl,
            memberCount,
            serverName,
            config
        });
    }

    const buffer = canvas.toBuffer('image/png');
    return buffer;
}

async function drawCinematic(ctx, p) {
    // Barra carmim lateral
    ctx.fillStyle = p.accent;
    ctx.fillRect(0, 0, 8, CARD_HEIGHT);

    // Linha inferior
    ctx.fillStyle = p.accent;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(0, CARD_HEIGHT - 4, CARD_WIDTH, 4);
    ctx.globalAlpha = 1;

    let textX = 56;
    if (p.showAvatar) {
        const av = await loadAvatar(p.avatarUrl);
        const size = clamp(Number(p.config.avatar_size ?? 140), 64, 200);
        const ax = 48;
        const ay = (CARD_HEIGHT - size) / 2;
        ctx.save();
        ctx.beginPath();
        ctx.arc(ax + size / 2, ay + size / 2, size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        if (av) ctx.drawImage(av, ax, ay, size, size);
        else {
            ctx.fillStyle = '#222';
            ctx.fillRect(ax, ay, size, size);
        }
        ctx.restore();
        // Anel
        ctx.strokeStyle = p.accent;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(ax + size / 2, ay + size / 2, size / 2 + 2, 0, Math.PI * 2);
        ctx.stroke();
        textX = ax + size + 40;
    }

    if (p.showBrand) {
        ctx.fillStyle = p.secondary;
        ctx.font = '600 22px sans-serif';
        ctx.fillText((p.config.brand_text || 'ALLIED').toUpperCase(), textX, 150);
    }

    if (p.showName) {
        ctx.fillStyle = p.primary;
        ctx.font = '700 52px sans-serif';
        const title = truncate(ctx, p.config.card_title || 'Bem-vindo(a)', 600);
        ctx.fillText(title, textX, 220);
        ctx.font = '600 40px sans-serif';
        ctx.fillStyle = p.primary;
        ctx.fillText(truncate(ctx, p.name, 620), textX, 275);
        if (p.uname && p.uname !== p.name) {
            ctx.fillStyle = p.secondary;
            ctx.font = '400 22px sans-serif';
            ctx.fillText(`@${truncate(ctx, p.uname, 400)}`, textX, 315);
        }
    }

    if (p.showCount && p.memberCount != null) {
        ctx.fillStyle = p.secondary;
        ctx.font = '400 20px sans-serif';
        ctx.fillText(`Membro #${p.memberCount}  ·  ${p.serverName || 'Allied'}`, textX, 380);
    }

    // Texto secundário do cartão
    if (p.config.card_subtitle) {
        ctx.fillStyle = p.secondary;
        ctx.font = '400 18px sans-serif';
        ctx.fillText(truncate(ctx, p.config.card_subtitle, 700), textX, 420);
    }
}

async function drawMinimal(ctx, p) {
    let textX = 80;
    if (p.showAvatar) {
        const av = await loadAvatar(p.avatarUrl);
        const size = clamp(Number(p.config.avatar_size ?? 96), 48, 160);
        const ax = CARD_WIDTH - size - 64;
        const ay = (CARD_HEIGHT - size) / 2;
        ctx.save();
        roundRect(ctx, ax, ay, size, size, 16);
        ctx.clip();
        if (av) ctx.drawImage(av, ax, ay, size, size);
        ctx.restore();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 2;
        roundRect(ctx, ax, ay, size, size, 16);
        ctx.stroke();
    }

    if (p.showBrand) {
        ctx.fillStyle = p.accent;
        ctx.font = '600 18px sans-serif';
        ctx.fillText((p.config.brand_text || 'ALLIED').toUpperCase(), textX, 180);
    }
    if (p.showName) {
        ctx.fillStyle = p.primary;
        ctx.font = '300 28px sans-serif';
        ctx.fillText(p.config.card_title || 'Bem-vindo(a)', textX, 230);
        ctx.font = '600 48px sans-serif';
        ctx.fillText(truncate(ctx, p.name, 700), textX, 290);
    }
    if (p.showCount && p.memberCount != null) {
        ctx.fillStyle = p.secondary;
        ctx.font = '400 18px sans-serif';
        ctx.fillText(`${p.memberCount} membros`, textX, 340);
    }
}

async function drawDecorative(ctx, p) {
    // Moldura
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 24, CARD_WIDTH - 48, CARD_HEIGHT - 48);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.strokeRect(32, 32, CARD_WIDTH - 64, CARD_HEIGHT - 64);

    // Cantos
    const c = 40;
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 3;
    // TL
    ctx.beginPath();
    ctx.moveTo(24, 24 + c);
    ctx.lineTo(24, 24);
    ctx.lineTo(24 + c, 24);
    ctx.stroke();
    // TR
    ctx.beginPath();
    ctx.moveTo(CARD_WIDTH - 24 - c, 24);
    ctx.lineTo(CARD_WIDTH - 24, 24);
    ctx.lineTo(CARD_WIDTH - 24, 24 + c);
    ctx.stroke();

    let textX = CARD_WIDTH / 2;
    ctx.textAlign = 'center';

    if (p.showAvatar) {
        const av = await loadAvatar(p.avatarUrl);
        const size = clamp(Number(p.config.avatar_size ?? 120), 64, 180);
        const ax = (CARD_WIDTH - size) / 2;
        const ay = 70;
        ctx.save();
        ctx.beginPath();
        ctx.arc(ax + size / 2, ay + size / 2, size / 2, 0, Math.PI * 2);
        ctx.clip();
        if (av) ctx.drawImage(av, ax, ay, size, size);
        ctx.restore();
        ctx.strokeStyle = p.accent;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ax + size / 2, ay + size / 2, size / 2 + 3, 0, Math.PI * 2);
        ctx.stroke();
    }

    if (p.showBrand) {
        ctx.fillStyle = p.secondary;
        ctx.font = '600 18px sans-serif';
        ctx.fillText((p.config.brand_text || 'ALLIED').toUpperCase(), textX, 230);
    }
    if (p.showName) {
        ctx.fillStyle = p.primary;
        ctx.font = '500 26px sans-serif';
        ctx.fillText(p.config.card_title || 'Bem-vindo(a) à Allied', textX, 280);
        ctx.font = '700 42px sans-serif';
        ctx.fillText(truncate(ctx, p.name, 800), textX, 340);
    }
    if (p.showCount && p.memberCount != null) {
        ctx.fillStyle = p.secondary;
        ctx.font = '400 18px sans-serif';
        ctx.fillText(`—  ${p.memberCount}  —`, textX, 390);
    }
    ctx.textAlign = 'left';
}

export async function buildWelcomeAttachment(opts) {
    const buffer = await renderWelcomeCard(opts);
    return new AttachmentBuilder(buffer, { name: 'allied-welcome.png' });
}

export function validateArtAttachment(attachment) {
    if (!attachment) return { ok: false, msg: 'Envie uma imagem como anexo.' };
    const mime = (attachment.contentType || '').toLowerCase();
    const name = (attachment.name || '').toLowerCase();
    const extOk = /\.(png|jpe?g|webp)$/i.test(name);
    const mimeOk = ALLOWED_MIME.has(mime) || mime.startsWith('image/');
    if (!mimeOk && !extOk) {
        return { ok: false, msg: 'Formato inválido. Use PNG, JPEG ou WebP.' };
    }
    if (attachment.size && attachment.size > MAX_ART_BYTES) {
        return {
            ok: false,
            msg: `Imagem muito grande (máx. ${Math.round(MAX_ART_BYTES / 1024 / 1024)} MB).`
        };
    }
    return { ok: true };
}

export async function fetchArtBuffer(attachment) {
    const res = await fetch(attachment.url);
    if (!res.ok) throw new Error(`Download falhou (${res.status})`);
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    if (buf.length > MAX_ART_BYTES) {
        throw new Error('Arquivo excede o limite após download.');
    }
    // valida se é imagem carregável
    await loadImage(buf);
    return buf;
}
