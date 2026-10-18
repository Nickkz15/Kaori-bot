import { GoogleGenAI } from '@google/genai';
import {
    GEMINI_API_KEY,
    AI_MODEL,
    MAX_OUTPUT_TOKENS,
    MAX_AI_RETRIES,
    PERSONALITY,
    XAI_API_KEY,
    XAI_MODEL,
    AI_REQUEST_TIMEOUT_MS,
    MAX_REPLY_CHARS
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

const BREVITY_NUDGE_SHORT =
    'INSTRUÇÃO DE RESPOSTA: responda em UMA frase curta (cerca de 5 a 20 palavras). ' +
    'Sem parágrafo, sem introdução, sem explicação extra. Vá direto ao ponto. Sempre termine a frase.';

const BREVITY_NUDGE_EXTENDED =
    'INSTRUÇÃO DE RESPOSTA: esta pergunta pede um pouco mais de conteúdo. ' +
    'Use 2 a 6 frases curtas — o suficiente para responder completo. ' +
    'Termine a última frase com ponto. Nunca pare no meio de uma frase ou lista.';

/** Extended mode: enough room for a short list without mid-cut. */
const EXTENDED_OUTPUT_TOKENS = Number(process.env.MAX_OUTPUT_TOKENS_EXTENDED) || 280;
/** Discord hard cap; we never soft-cut mid-sentence below this for extended. */
const DISCORD_SAFE_CHARS = 1900;

const DANGLING_TAIL =
    /\s+(mas|por[eé]m|contudo|entretanto|e|ou|porque|pra|para|com|de|da|do|das|dos|que|se|quando|como|em|na|no|nas|nos|um|uma|uns|umas|ao|à|às|aos|,|;|:|…)\s*$/i;

/**
 * Detect if the user message likely needs a longer-than-casual answer.
 */
export function detectReplyBudget(userMessage) {
    const text = String(userMessage || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '');
    const shortTokens = MAX_OUTPUT_TOKENS || 60;
    const shortChars = MAX_REPLY_CHARS || 280;

    const extendedPatterns = [
        /\bquem (sao|são|e|é)\b/,
        /\bquais (sao|são|as|os)\b/,
        /\bquem (voce|vc) conhece\b/,
        /\bpessoas que (voce|vc) (conhece|sabe)\b/,
        /\bconhece\b/,
        /\blista(r)?\b/,
        /\bnome(s)? (das|dos|de)\b/,
        /\bmembros\b/,
        /\bdivisoes\b/,
        /\bdivisões\b/,
        /\bo que e (a |o )?allied\b/,
        /\bo que é (a |o )?allied\b/,
        /\bexplica/,
        /\bme explica\b/,
        /\bcomo funciona\b/,
        /\bcomo (e|é) que\b/,
        /\bme conta\b/,
        /\bresuma\b/,
        /\bresumo\b/,
        /\bdiferenca\b/,
        /\bdiferença\b/,
        /\bpor que\b/,
        /\bporque\b/,
        /\bhist[oó]ria\b/,
        /\bconta (mais|sobre)\b/,
        /\bfala (mais|sobre)\b/,
        /\bdetalha\b/,
        /\bem detalhes\b/,
        /\bpasso a passo\b/,
        /\bregras?\b/,
        /\bcomo (entrar|participar|recrutar)\b/
    ];

    const needsExtended = extendedPatterns.some((re) => re.test(text));

    if (needsExtended) {
        return {
            mode: 'extended',
            maxTokens: Math.max(shortTokens, EXTENDED_OUTPUT_TOKENS),
            // Prefer complete sentences over hard char cuts
            maxChars: DISCORD_SAFE_CHARS,
            nudge: BREVITY_NUDGE_EXTENDED
        };
    }

    return {
        mode: 'short',
        maxTokens: shortTokens,
        maxChars: shortChars,
        nudge: BREVITY_NUDGE_SHORT
    };
}

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
        fallbackUsed: meta.fallbackUsed ?? undefined,
        replyMode: meta.replyMode || undefined
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

function endsComplete(text) {
    return /[.!?…)]$/.test(String(text || '').trim());
}

/**
 * Last index of a complete sentence boundary (. ! ? …) not inside <@...> mention.
 */
function lastSentenceEnd(text) {
    const s = String(text || '');
    let best = -1;
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (ch === '.' || ch === '!' || ch === '?' || ch === '…') {
            // skip if looks like part of a number 3.14 — still ok for chat
            best = i;
        }
    }
    return best;
}

/**
 * HARD RULE: never return text that ends mid-sentence or on a dangling conjunction.
 * - Prefer cutting only at . ! ?
 * - If no boundary exists and text is incomplete, strip dangling tail; if still bad, keep as-is only if complete
 * - maxChars is a soft preference for short mode; completeness always wins over length
 */
export function finalizeReply(text, { maxChars = null, partial = false } = {}) {
    if (!isNonEmptyText(text)) return text;
    let t = text.trim();

    // Prefer complete sentences within maxChars when provided
    if (maxChars && t.length > maxChars) {
        const window = t.slice(0, maxChars);
        const end = lastSentenceEnd(window);
        if (end >= Math.floor(maxChars * 0.25)) {
            t = window.slice(0, end + 1).trim();
        }
        // else: DO NOT hard-cut mid-sentence — keep full text up to Discord safe limit
        else if (t.length > DISCORD_SAFE_CHARS) {
            const end2 = lastSentenceEnd(t.slice(0, DISCORD_SAFE_CHARS));
            if (end2 >= 0) t = t.slice(0, end2 + 1).trim();
            else t = t.slice(0, DISCORD_SAFE_CHARS).trim();
        }
    }

    // If model stopped mid-way (partial or no terminal punct), keep only complete sentences
    if (partial || !endsComplete(t)) {
        const end = lastSentenceEnd(t);
        if (end >= 0) {
            t = t.slice(0, end + 1).trim();
        } else {
            // No full sentence at all — strip dangling words so we don't end on "mas"
            t = t.replace(DANGLING_TAIL, '').trim();
            // Still incomplete and short fragment: better a clean short line than "mas"
            if (!endsComplete(t) && t.length > 0) {
                t = t.replace(/[,:;\-–—]+$/u, '').trim();
            }
        }
    }

    // Final pass: never leave dangling conjunctions
    t = t.replace(DANGLING_TAIL, '').trim();

    // Absolute Discord safety
    if (t.length > 2000) {
        const end = lastSentenceEnd(t.slice(0, 1900));
        t = end >= 0 ? t.slice(0, end + 1).trim() : t.slice(0, 1900).trim();
    }

    return t;
}

/** @deprecated use finalizeReply — kept for tests/compat */
export function softTrimReply(text, maxChars = MAX_REPLY_CHARS || 280) {
    return finalizeReply(text, { maxChars, partial: false });
}

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

async function callGemini({ contents, systemInstruction, maxOutputTokens, maxChars, messageId, replyMode }) {
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
                        maxOutputTokens: maxOutputTokens ?? MAX_OUTPUT_TOKENS,
                        temperature: 0.9
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
                    messageId,
                    replyMode
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
                const trimmed = finalizeReply(extracted.text.trim(), {
                    maxChars,
                    partial: extracted.partial
                });
                if (!isNonEmptyText(trimmed)) {
                    logAI('warn', 'gemini_empty_after_finalize', {
                        provider: 'gemini',
                        category: 'empty',
                        finishReason: extracted.finishReason,
                        attempt,
                        durationMs,
                        messageId,
                        replyMode
                    });
                    lastError = { category: 'empty', retryable: attempt + 1 < maxAttempts };
                    if (attempt + 1 < maxAttempts) {
                        await sleep(200);
                        continue;
                    }
                    return {
                        ok: false,
                        category: 'empty',
                        text: null,
                        finishReason: extracted.finishReason,
                        provider: 'gemini'
                    };
                }
                logAI('info', 'gemini_ok', {
                    provider: 'gemini',
                    category: extracted.partial ? 'partial' : 'ok',
                    finishReason: extracted.finishReason,
                    attempt,
                    durationMs,
                    messageId,
                    hasText: true,
                    textLen: trimmed.length,
                    replyMode
                });
                return {
                    ok: true,
                    category: extracted.partial ? 'partial' : 'ok',
                    text: trimmed,
                    finishReason: extracted.finishReason,
                    provider: 'gemini'
                };
            }

            logAI('warn', 'gemini_empty', {
                provider: 'gemini',
                category: 'empty',
                finishReason: extracted.finishReason,
                attempt,
                durationMs,
                messageId,
                hasText: false,
                replyMode
            });
            lastError = { category: 'empty', retryable: attempt + 1 < maxAttempts };
            if (attempt + 1 < maxAttempts) {
                await sleep(250 + Math.floor(Math.random() * 150));
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
                messageId,
                replyMode
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

            let wait =
                classified.category === 'server' || classified.category === 'network'
                    ? 400 + Math.floor(Math.random() * 300)
                    : 600 + attempt * 400;

            const retryAfter =
                error?.headers?.get?.('retry-after') || error?.response?.headers?.['retry-after'];
            if (retryAfter) {
                const sec = Number(retryAfter);
                if (!Number.isNaN(sec) && sec > 0) wait = Math.min(sec * 1000, 3000);
            }
            wait = Math.min(wait, 3000);
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

async function callGrok({ systemInstruction, history, userMessage, maxTokens, maxChars, messageId, replyMode }) {
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
            max_tokens: maxTokens || MAX_OUTPUT_TOKENS || 60,
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
            Math.min(AI_REQUEST_TIMEOUT_MS || 45000, 20000),
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
                messageId,
                replyMode
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
                hasText: false,
                replyMode
            });
            return { ok: false, category: 'empty', text: null, provider: 'xai' };
        }

        const trimmed = finalizeReply(text.trim(), { maxChars, partial: false });
        logAI('info', 'xai_ok', {
            provider: 'xai',
            category: 'ok',
            durationMs: Date.now() - started,
            messageId,
            hasText: true,
            textLen: trimmed.length,
            fallbackUsed: true,
            replyMode
        });

        return { ok: true, category: 'ok', text: trimmed, provider: 'xai' };
    } catch (error) {
        const classified = classifyError(error);
        logAI('error', 'xai_error', {
            provider: 'xai',
            category: classified.category,
            status: classified.status,
            durationMs: Date.now() - started,
            messageId,
            replyMode
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

export async function generateKaoriReply({
    history = [],
    userMessage,
    systemInstruction = PERSONALITY,
    extraContext = '',
    messageId = null
}) {
    const budget = detectReplyBudget(userMessage);

    const historyGemini = (Array.isArray(history) ? history : []).map((m) => ({
        role: m.role === 'assistant' || m.role === 'model' ? 'model' : 'user',
        parts: [{ text: String(m.content || '').slice(0, 400) }]
    }));

    const fullUserText = [
        extraContext || '',
        budget.nudge,
        `MENSAGEM:\n${userMessage}`
    ]
        .filter(Boolean)
        .join('\n\n');

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
        maxOutputTokens: budget.maxTokens,
        maxChars: budget.maxChars,
        messageId,
        replyMode: budget.mode
    });

    if (geminiResult.ok && isNonEmptyText(geminiResult.text)) {
        return {
            text: finalizeReply(geminiResult.text.trim(), {
                maxChars: budget.maxChars,
                partial: geminiResult.category === 'partial'
            }),
            provider: 'gemini',
            category: geminiResult.category,
            fromContingency: false,
            replyMode: budget.mode
        };
    }

    if (geminiResult.category === 'safety') {
        const text = pickLocal(SAFETY_REPLIES);
        logAI('info', 'contingency_safety', {
            provider: 'local',
            category: 'safety',
            messageId,
            hasText: true,
            textLen: text.length,
            replyMode: budget.mode
        });
        return {
            text,
            provider: 'local',
            category: 'safety',
            fromContingency: true,
            replyMode: budget.mode
        };
    }

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
        const skipFallback =
            geminiResult.category === 'auth' || geminiResult.category === 'invalid_request';

        if (!skipFallback) {
            const grokResult = await callGrok({
                systemInstruction,
                history,
                userMessage: fullUserText,
                maxTokens: budget.maxTokens,
                maxChars: budget.maxChars,
                messageId,
                replyMode: budget.mode
            });

            if (grokResult.ok && isNonEmptyText(grokResult.text)) {
                return {
                    text: finalizeReply(grokResult.text.trim(), { maxChars: budget.maxChars }),
                    provider: 'xai',
                    category: grokResult.category,
                    fromContingency: false,
                    replyMode: budget.mode
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
        fallbackUsed: Boolean(XAI_API_KEY),
        replyMode: budget.mode
    });

    return {
        text,
        provider: 'local',
        category: geminiResult.category || 'unknown',
        fromContingency: true,
        replyMode: budget.mode
    };
}

export function ensureSendableText(text, fallback = null) {
    if (isNonEmptyText(text)) {
        // Final gate: never send mid-sentence tail
        return finalizeReply(text.trim(), { maxChars: null, partial: !endsComplete(text) });
    }
    return isNonEmptyText(fallback) ? fallback.trim() : pickLocal(CONTINGENCY_REPLIES);
}
