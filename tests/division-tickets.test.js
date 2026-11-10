import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDivisionQuestions, buildDivisionPanelPayload } from '../systems/alliedDivisionTickets.js';

const minimalDivision = {
    guild_id: '123456789012345678',
    division_key: 'chuva',
    name: '1ª Chuva',
    role_id: '123456789012345678',
    emoji: '🌧️',
    enabled: true,
    questions: [{ id: 'motivation', label: 'Por que deseja entrar?', style: 'paragraph', required: true, max_length: 500 }]
};

test('division form accepts a valid configurable question set', () => {
    const questions = validateDivisionQuestions([
        { id: 'name', label: 'Como devemos te chamar?', required: true, style: 'short', max_length: 60 },
        { id: 'activity', label: 'Qual sua disponibilidade?', required: true, style: 'paragraph', max_length: 500 }
    ]);
    assert.equal(questions.length, 2);
    assert.equal(questions[1].style, 'paragraph');
});

test('division form rejects more than five questions and duplicated ids', () => {
    assert.throws(() => validateDivisionQuestions(Array.from({ length: 6 }, (_, i) => ({ id: `q${i}`, label: `Pergunta ${i}` }))), /entre 1 e 5/);
    assert.throws(() => validateDivisionQuestions([
        { id: 'same', label: 'Pergunta A' },
        { id: 'same', label: 'Pergunta B' }
    ]), /duplicado/);
});

test('division panel decorates active division choices using one select menu', () => {
    const payload = buildDivisionPanelPayload({
        panel_title: 'ALLIED | DIVISÕES',
        panel_description: 'Escolha sua divisão.',
        panel_content: 'ALLIED',
        panel_color: '#8B1A1A',
        panel_footer_text: 'Organização e disciplina'
    }, [minimalDivision]);
    assert.equal(payload.embeds.length, 1);
    assert.equal(payload.components.length, 1);
    assert.equal(payload.components[0].components.length, 1);
    assert.equal(payload.components[0].components[0].toJSON().custom_id, 'division-ticket:select');
});

test('division panel remains renderable when there are no open divisions', () => {
    const payload = buildDivisionPanelPayload({ panel_title: 'ALLIED | DIVISÕES' }, []);
    assert.equal(payload.embeds.length, 1);
    assert.equal(payload.components, undefined);
});
