import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAdmissionQuestions, parseAdmissionColor } from '../systems/alliedAdmission.js';
import { buildEmbedMessagePayload, parseEmbedJson } from '../systems/alliedEmbed.js';

test('admission questions enforce Discord modal limits', () => {
    const valid = validateAdmissionQuestions([
        { id: 'name', label: 'Como devemos te chamar?', required: true, style: 'short', max_length: 50 }
    ]);
    assert.equal(valid.length, 1);
    assert.throws(() => validateAdmissionQuestions([]), /entre 1 e 5/);
    assert.throws(() => validateAdmissionQuestions(Array.from({ length: 6 }, (_, i) => ({ id: `q${i}`, label: `Pergunta ${i}` }))), /entre 1 e 5/);
    assert.throws(() => validateAdmissionQuestions([
        { id: 'same', label: 'Pergunta 1' },
        { id: 'same', label: 'Pergunta 2' }
    ]), /duplicado/);
});

test('admission color accepts six-digit hexadecimal values', () => {
    assert.equal(parseAdmissionColor('#8B1A1A'), 0x8b1a1a);
    assert.equal(parseAdmissionColor('8B1A1A'), 0x8b1a1a);
    assert.equal(parseAdmissionColor('not-a-color'), 0x8b1a1a);
});

test('embed payload supports rich fields and link buttons', () => {
    const payload = buildEmbedMessagePayload({
        content: 'Mensagem de teste',
        embed: {
            title: 'ALLIED',
            description: 'Painel de teste',
            color: '#8B1A1A',
            fields: [{ name: 'Regras', value: 'Leia as regras', inline: true }]
        },
        buttons: [{ label: 'Regras', url: 'https://example.com/regras' }]
    });
    assert.equal(payload.embeds.length, 1);
    assert.equal(payload.components.length, 1);
    assert.equal(payload.allowedMentions.parse.length, 0);
});

test('embed JSON rejects unsafe URLs and empty embeds', () => {
    assert.throws(() => parseEmbedJson(JSON.stringify({ embed: { image: 'javascript:alert(1)' } })), /HTTP ou HTTPS/);
    assert.throws(() => parseEmbedJson(JSON.stringify({ embed: {} })), /vazio/);
});
