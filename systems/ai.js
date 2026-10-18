import { GoogleGenAI } from '@google/genai';
import {
    GEMINI_API_KEY,
    AI_MODEL,
    MAX_OUTPUT_TOKENS,
    MAX_AI_RETRIES,
    PERSONALITY,
    XAI_API_KEY,
    XAI_MODEL,
    AI_REQUEST_TIMEOUT_MS
} from '../config/kaori.js';

export const ai = GEMINI_API_KEY
    ? new GoogleGenAI({ apiKey: GEMINI_API_KEY })
    : null;

const CONTINGENCY_REPLIES = [
    'Aff, travei por um segundo. Manda de novo pra mim, nya.',
    'Minha cabeça deu um branco. Tenta de novo, senpai.',
    'Tch... deu uma pane aqui. Chama de novo.',
    'Hm? Travou. Repete aí pra eu te responder direito.',
    'Eita, me perdi no meio do caminho. Manda de novo.'
];

const SAFETY_REPLIES = [
    'Não vou entrar nisso agora. Muda de assunto?',
    'Hmm, melhor a gente falar de outra coisa.',
    'Prefiro não seguir por esse caminho. Outra pergunta?'
];

/**
 * Safe structured log — never dumps secrets, prompts or full history.
 */
export function logAI(level, event, meta = {}) {
    const safe = {
        ts: new Date().toISOString(),
        event,
        provider: meta.provider || undefined,
        category: meta.category || undefined,
        status: meta.status ?? undefined,
        code: meta.code || undefined,
        finishReason: meta.finishReason || undefined,
        attempt: meta.attempt ?? undefined,
        durationMs: meta.durationMs ?? undefined,
        messageId: meta.messageId || undefined,
        hasText: meta.hasText ?? undefined,
        textLen: typeof meta.textLen === 'number' ? meta.textLen : undefined,
        fallbackUsed: meta.fallbackUsed ?? undefined
    };
    const line = JSON.stringify(safe);
    if (level === 'error') console.error('[AI]', line);
    else if (level === 'warn') console.warn('[AI]', line);
    else console.log('[AI]', line);
}

function isNonEmptyText(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function pickLocal(list) {
    return list[Math.floor(Math.random() * list.length)];
}

/**
 * Extract usable text + metadata from @google/genai GenerateContentResponse.
 * Never throws on missing nested fields.
 */
export function extractGeminiText(response) {
    const result = {
        text: null,
        finishReason: null,
        blocked: false,
        blockReason: null,
        partial: false,
        rawCandidates: 0
    };

    if (!response || typeof response !== 'object') {
        return result;
    }

    const promptFeedback = response.promptFeedback;
    if (promptFeedback?.blockReason) {
        result.blocked = true;
        result.blockReason = String(promptFeedback.blockReason);
        return result;
    }

    const candidates = Array.isArray(response.candidates) ? response.candidates : [];
    result.rawCandidates = candidates.length;

    if (candidates.length === 0) {
        // Some SDK versions expose .text even without candidates array mirrored
        if (isNonEmptyText(response.text)) {
            result.text = response.text.trim();
            result.finishReason = 'STOP';
        }
        return result;
    }

    const first = candidates[0] || {};
    const finishReason = first.finishReason || first.finish_reason || null;
    result.finishReason = finishReason ? String(finishReason) : null;

    const safetyFinish = ['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'IMAGE_SAFETY'];
    if (finishReason && safetyFinish.includes(String(finishReason).toUpperCase())) {
        result.blocked = true;
        result.blockReason = String(finishReason);
        return result;
    }

    // Prefer SDK helper when present and non-empty
    if (isNonEmptyText(response.text)) {
        result.text = response.text.trim();
    } else {
        const parts = first.content?.parts;
        if (Array.isArray(parts)) {
            const joined = parts
                .map((p) => (typeof p?.text === 'string' ? p.text : ''))
                .join('')
                .trim();
            if (joined) result.text = joined;
        }
    }

    const upper = result.finishReason ? result.finishReason.toUpperCase() : '';
    if (upper === 'MAX_TOKENS' || upper === 'CONTINUATION') {
        result.partial = true;
    }

    return result;
}

/**
 * Classify API / network errors for retry vs permanent handling.
 */
export function classifyError(error) {
    const status =
        error?.status ??
        error?.statusCode ??
        error?.response?.status ??
        error?.code ??
        null;

    const message = String(error?.message || error || '').toLowerCase();
    const name = String(error?.name || '');

    if (status === 401 || status === 403) {
        return { category: 'auth', retryable: false, status };
    }
    if (status === 400 || status === 404) {
        return { category: 'invalid_request', retryable: false, status };
    }
    if (status === 429) {
        return { category: 'rate_limit', retryable: true, status };
    }
    if (typeof status === 'number' && status >= 500) {
        return { category: 'server', retryable: true, status };
    }
    if (
        name === 'AbortError' ||
        message.includes('timeout') ||
        message.includes('etimedout') ||
        message.includes('econnreset') ||
        message.includes('econnrefused') ||
        message.includes('fetch failed') ||
        message.includes('network') ||
        message.includes('socket')
    ) {
        return { category: 'network', retryable: true, status: status || null };
    }
    return { category: 'unknown', retryable: false, status };
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function withTimeout(promise, ms, label = 'request') {
    if (!ms || ms <= 0) return promise;
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
            const err = new Error(`${label}_timeout`);
            err.name = 'AbortError';
            err.status = 408;
            reject(err);
        }, ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Call Gemini with limited retries for transient failures.
 */
async function callGemini({ contents, systemInstruction, maxOutputTokens, messageId }) {
    if (!ai) {
        const err = new Error('gemini_not_configured');
        err.status = 401;
        throw err;
    }

    const maxAttempts = Math.max(1, (MAX_AI_RETRIES ?? 1) + 1);
    let lastError = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const started = Date.now();
        try {
            const response = await withTimeout(
                ai.models.generateContent({
                    model: AI_MODEL,
                    contents,
                    config: {
                        systemInstruction,
                        maxOutputTokens: maxOutputTokens ?? MAX_OUTPUT_TOKENS
                    }
                }),
                AI_REQUEST_TIMEOUT_MS,
                'gemini'
            );

            const extracted = extractGeminiText(response);
            const durationMs = Date.now() - started;

            if (extracted.blocked) {
                logAI('warn', 'gemini_blocked', {
                    provider: 'gemini',
                    category: 'safety',
                    finishReason: extracted.finishReason,
                    code: extracted.blockReason,
                    attempt,
                    durationMs,
                    messageId
                });
                return {
                    ok: false,
                    category: 'safety',
                    text: null,
                    finishReason: extracted.finishReason,
                    provider: 'gemini'
                };
            }

            if (isNonEmptyText(extracted.text)) {
                logAI('info', 'gemini_ok', {
                    provider: 'gemini',
                    category: extracted.partial ? 'partial' : 'ok',
                    finishReason: extracted.finishReason,
                    attempt,
                    durationMs,
                    messageId,
                    hasText: true,
                    textLen: extracted.text.length
                });
                return {
                    ok: true,
                    category: extracted.partial ? 'partial' : 'ok',
                    text: extracted.text.trim(),
                    finishReason: extracted.finishReason,
                    provider: 'gemini'
                };
            }

            // Empty / no candidates — retry once if attempts remain
            logAI('warn', 'gemini_empty', {
                provider: 'gemini',
                category: 'empty',
                finishReason: extracted.finishReason,
                attempt,
                durationMs,
                messageId,
                hasText: false
            });
            lastError = { category: 'empty', retryable: attempt + 1 < maxAttempts };
            if (attempt + 1 < maxAttempts) {
                await sleep(400 * Math.pow(2, attempt) + Math.floor(Math.random() * 200));
                continue;
            }
            return {
                ok: false,
                category: 'empty',
                text: null,
                finishReason: extracted.finishReason,
                provider: 'gemini'
            };
        } catch (error) {
            const classified = classifyError(error);
            lastError = classified;
            logAI('error', 'gemini_error', {
                provider: 'gemini',
                category: classified.category,
                status: classified.status,
                attempt,
                durationMs: Date.now() - started,
                messageId
            });

            if (!classified.retryable || attempt + 1 >= maxAttempts) {
                return {
                    ok: false,
                    category: classified.category,
                    text: null,
                    finishReason: null,
                    provider: 'gemini',
                    status: classified.status
                };
            }

            let wait = 500 * Math.pow(2, attempt);
            const retryAfter = error?.headers?.get?.('retry-after') || error?.response?.headers?.['retry-after'];
            if (retryAfter) {
                const sec = Number(retryAfter);
                if (!Number.isNaN(sec) && sec > 0) wait = Math.min(sec * 1000, 8000);
            }
            wait = Math.min(wait + Math.floor(Math.random() * 250), 8000);
            await sleep(wait);
        }
    }

    return {
        ok: false,
        category: lastError?.category || 'unknown',
        text: null,
        finishReason: null,
        provider: 'gemini',
        status: lastError?.status
    };
}

/**
 * Optional xAI / Grok chat completions (OpenAI-compatible).
 * Only used for technical failures / empty responses, never for safety blocks.
 */
async function callGrok({ systemInstruction, history, userMessage, messageId }) {
    if (!XAI_API_KEY) {
        return { ok: false, category: 'not_configured', text: null, provider: 'xai' };
    }

    const started = Date.now();
    try {
        const messages = [{ role: 'system', content: systemInstruction }];

        if (Array.isArray(history)) {
            for (const m of history) {
                if (!m || !isNonEmptyText(m.content)) continue;
                const role = m.role === 'assistant' || m.role === 'model' ? 'assistant' : 'user';
                messages.push({ role, content: String(m.content).slice(0, 500) });
            }
        }

        messages.push({ role: 'user', content: userMessage });

        const body = {
            model: XAI_MODEL || 'grok-3-mini',
            messages,
            max_tokens: MAX_OUTPUT_TOKENS || 100,
            temperature: 0.9
        };

        const response = await withTimeout(
            fetch('https://api.x.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${XAI_API_KEY}`
                },
                body: JSON.stringify(body)
            }),
            AI_REQUEST_TIMEOUT_MS,
            'xai'
        );

        const status = response.status;
        if (!response.ok) {
            const classified = classifyError({ status, message: `xai_http_${status}` });
            logAI('error', 'xai_error', {
                provider: 'xai',
                category: classified.category,
                status,
                durationMs: Date.now() - started,
                messageId
            });
            return {
                ok: false,
                category: classified.category,
                text: null,
                provider: 'xai',
                status
            };
        }

        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content;

        if (!isNonEmptyText(text)) {
            logAI('warn', 'xai_empty', {
                provider: 'xai',
                category: 'empty',
                durationMs: Date.now() - started,
                messageId,
                hasText: false
            });
            return { ok: false, category: 'empty', text: null, provider: 'xai' };
        }

        const trimmed = text.trim();
        logAI('info', 'xai_ok', {
            provider: 'xai',
            category: 'ok',
            durationMs: Date.now() - started,
            messageId,
            hasText: true,
            textLen: trimmed.length,
            fallbackUsed: true
        });

        return { ok: true, category: 'ok', text: trimmed, provider: 'xai' };
    } catch (error) {
        const classified = classifyError(error);
        logAI('error', 'xai_error', {
            provider: 'xai',
            category: classified.category,
            status: classified.status,
            durationMs: Date.now() - started,
            messageId
        });
        return {
            ok: false,
            category: classified.category,
            text: null,
            provider: 'xai',
            status: classified.status
        };
    }
}

/**
 * Main entry: generate Kaori reply with Gemini → optional Grok → local contingency.
 * Always returns { text, provider, category, fromContingency } with non-empty text.
 */
export async function generateKaoriReply({
    history = [],
    userMessage,
    systemInstruction = PERSONALITY,
    extraContext = '',
    messageId = null
}) {
    const historyGemini = (Array.isArray(history) ? history : []).map((m) => ({
        role: m.role === 'assistant' || m.role === 'model' ? 'model' : 'user',
        parts: [{ text: String(m.content || '').slice(0, 500) }]
    }));

    const fullUserText = extraContext
        ? `${extraContext}\n\nMENSAGEM:\n${userMessage}`
        : userMessage;

    const contents = [
        ...historyGemini,
        {
            role: 'user',
            parts: [{ text: fullUserText }]
        }
    ];

    const geminiResult = await callGemini({
        contents,
        systemInstruction,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        messageId
    });

    if (geminiResult.ok && isNonEmptyText(geminiResult.text)) {
        return {
            text: geminiResult.text.trim(),
            provider: 'gemini',
            category: geminiResult.category,
            fromContingency: false
        };
    }

    // Explicit safety block: local soft reply, never secondary provider
    if (geminiResult.category === 'safety') {
        const text = pickLocal(SAFETY_REPLIES);
        logAI('info', 'contingency_safety', {
            provider: 'local',
            category: 'safety',
            messageId,
            hasText: true,
            textLen: text.length
        });
        return {
            text,
            provider: 'local',
            category: 'safety',
            fromContingency: true
        };
    }

    // Technical failure or empty → optional Grok
    const technicalCategories = new Set([
        'empty',
        'server',
        'network',
        'rate_limit',
        'unknown',
        'auth',
        'invalid_request'
    ]);

    if (technicalCategories.has(geminiResult.category) && XAI_API_KEY) {
        // Do not fallback on pure auth/invalid if we know key is wrong — still try once if configured
        const skipFallback =
            geminiResult.category === 'auth' || geminiResult.category === 'invalid_request';

        if (!skipFallback) {
            const grokResult = await callGrok({
                systemInstruction,
                history,
                userMessage: fullUserText,
                messageId
            });

            if (grokResult.ok && isNonEmptyText(grokResult.text)) {
                return {
                    text: grokResult.text.trim(),
                    provider: 'xai',
                    category: grokResult.category,
                    fromContingency: false
                };
            }
        }
    }

    const text = pickLocal(CONTINGENCY_REPLIES);
    logAI('warn', 'contingency_local', {
        provider: 'local',
        category: geminiResult.category || 'unknown',
        status: geminiResult.status,
        messageId,
        hasText: true,
        textLen: text.length,
        fallbackUsed: Boolean(XAI_API_KEY)
    });

    return {
        text,
        provider: 'local',
        category: geminiResult.category || 'unknown',
        fromContingency: true
    };
}

/**
 * Final guard before any Discord send.
 */
export function ensureSendableText(text, fallback = null) {
    if (isNonEmptyText(text)) return text.trim();
    return isNonEmptyText(fallback) ? fallback.trim() : pickLocal(CONTINGENCY_REPLIES);
}
