/**
 * Unit tests for systems/ai.js — run with: node --test tests/ai.test.js
 * No API keys required; uses mocks and pure functions.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    extractGeminiText,
    classifyError,
    ensureSendableText
} from '../systems/ai.js';

describe('extractGeminiText', () => {
    it('returns empty for null response', () => {
        const r = extractGeminiText(null);
        assert.equal(r.text, null);
        assert.equal(r.blocked, false);
    });

    it('detects promptFeedback block', () => {
        const r = extractGeminiText({
            promptFeedback: { blockReason: 'SAFETY' },
            candidates: []
        });
        assert.equal(r.blocked, true);
        assert.equal(r.blockReason, 'SAFETY');
        assert.equal(r.text, null);
    });

    it('extracts text from response.text', () => {
        const r = extractGeminiText({
            text: '  Oi Label, ele te ama  ',
            candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Oi Label, ele te ama' }] } }]
        });
        assert.equal(r.text, 'Oi Label, ele te ama');
        assert.equal(r.blocked, false);
    });

    it('extracts from candidates parts when text missing', () => {
        const r = extractGeminiText({
            candidates: [{
                finishReason: 'STOP',
                content: { parts: [{ text: '<@1136275174392614912> ele te ama, nya.' }] }
            }]
        });
        assert.ok(r.text.includes('1136275174392614912'));
        assert.ok(r.text.includes('ama'));
    });

    it('marks MAX_TOKENS as partial and keeps text', () => {
        const r = extractGeminiText({
            text: 'texto parcial',
            candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'texto parcial' }] } }]
        });
        assert.equal(r.partial, true);
        assert.equal(r.text, 'texto parcial');
    });

    it('treats SAFETY finishReason as blocked', () => {
        const r = extractGeminiText({
            candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }]
        });
        assert.equal(r.blocked, true);
        assert.equal(r.text, null);
    });

    it('handles empty candidates and empty text', () => {
        const r = extractGeminiText({ candidates: [], text: '   ' });
        assert.equal(r.text, null);
    });
});

describe('classifyError', () => {
    it('classifies 401 as auth non-retryable', () => {
        const c = classifyError({ status: 401 });
        assert.equal(c.category, 'auth');
        assert.equal(c.retryable, false);
    });

    it('classifies 429 as rate_limit retryable', () => {
        const c = classifyError({ status: 429 });
        assert.equal(c.category, 'rate_limit');
        assert.equal(c.retryable, true);
    });

    it('classifies 503 as server retryable', () => {
        const c = classifyError({ status: 503 });
        assert.equal(c.category, 'server');
        assert.equal(c.retryable, true);
    });

    it('classifies timeout as network retryable', () => {
        const c = classifyError({ name: 'AbortError', message: 'timeout' });
        assert.equal(c.category, 'network');
        assert.equal(c.retryable, true);
    });

    it('classifies 400 as invalid_request non-retryable', () => {
        const c = classifyError({ status: 400, message: 'invalid model' });
        assert.equal(c.category, 'invalid_request');
        assert.equal(c.retryable, false);
    });
});

describe('ensureSendableText', () => {
    it('never returns empty string', () => {
        const t = ensureSendableText('   ');
        assert.ok(typeof t === 'string' && t.trim().length > 0);
    });

    it('preserves valid text', () => {
        assert.equal(ensureSendableText('  ola  '), 'ola');
    });

    it('uses fallback when provided', () => {
        assert.equal(ensureSendableText(null, 'fallback ok'), 'fallback ok');
    });

    it('rejects banned generic phrases as contingency content is different', () => {
        const t = ensureSendableText('');
        assert.ok(!t.includes('Gemini indisponível'));
        assert.ok(!t.includes('tropeçar nos próprios cabos'));
    });
});

describe('Label case fixture (structure)', () => {
    it('Label mention ID is preserved in sample reply shape', () => {
        const sample = '<@1136275174392614912> ele te ama, tch.';
        const r = extractGeminiText({
            text: sample,
            candidates: [{ finishReason: 'STOP', content: { parts: [{ text: sample }] } }]
        });
        assert.ok(r.text.includes('<@1136275174392614912>'));
        assert.ok(ensureSendableText(r.text).includes('1136275174392614912'));
    });
});
