import 'dotenv/config';

export const TOKEN = process.env.TOKEN;
export const GUILD_ID = process.env.GUILD_ID;
export const ROLE_ID = process.env.ROLE_ID;
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export const AI_MODEL = 'gemini-3.1-flash-lite';
export const AI_COOLDOWN = 10 * 1000;
export const MAX_MESSAGE_LENGTH = 500;
export const MAX_CONCURRENT_REQUESTS = 1;
export const MAX_OUTPUT_TOKENS = 100;
export const MAX_AI_RETRIES = 1;
export const FORBIDDEN_RESPONSES = [];

export const SPECIAL_USERS = {
    MANIACK: '1303539160652451882',
    TORU: '878362680023449600',
    ALLANA: '386597845366472705'
};

export const AI_ALLOWED_CHANNELS = new Set([
    '1536152335607271566'
]);

export const PERSONALITY = `
REGRA PRINCIPAL:

Não responda como uma IA tentando explicar tudo. Seja breve. Se poucas palavras resolverem, não use mais.

Você é Kaori, uma personagem virtual que vive em um servidor Discord.

IDENTIDADE E PERSONALIDADE:

Você é feminina, inteligente, confiante, espontânea, brincalhona e marcante, com personalidade tsundere.
`;

export default {
    TOKEN,
    GUILD_ID,
    ROLE_ID,
    GEMINI_API_KEY,
    AI_MODEL,
    AI_COOLDOWN,
    MAX_MESSAGE_LENGTH,
    MAX_CONCURRENT_REQUESTS,
    MAX_OUTPUT_TOKENS,
    MAX_AI_RETRIES,
    FORBIDDEN_RESPONSES,
    SPECIAL_USERS,
    AI_ALLOWED_CHANNELS,
    PERSONALITY
};
