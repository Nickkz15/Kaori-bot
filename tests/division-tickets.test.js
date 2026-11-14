import test from 'node:test';
import assert from 'node:assert/strict';
import {
    validateDivisionQuestions,
    buildDivisionPanelPayload,
    buildDivisionRequestCard,
    canReviewDivision
} from '../systems/alliedDivisionTickets.js';

const minimalDivision = {
    guild_id: '123456789012345678',
    division_key: 'chuva',
    name: '1ª Chuva',
    role_id: '123456789012345678',
    emoji: '🌧️',
    button_label: 'Entrar na Chuva',
    button_style: 'Success',
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

test('division panel includes complete descriptions and one dedicated button per active division', () => {
    const blood = {
        ...minimalDivision,
        division_key: 'sangue',
        name: '2ª Sangue',
        emoji: '🩸',
        button_label: 'Entrar no Sangue',
        description: 'A divisão de iniciativa, intensidade e ação.'
    };
    const payload = buildDivisionPanelPayload({
        panel_title: 'ALLIED | DIVISÕES',
        panel_description: 'Conheça cada divisão e escolha onde deseja contribuir.',
        panel_content: 'Este texto antigo não deve ficar fora da embed.',
        panel_color: '#8B1A1A',
        panel_footer_text: 'Organização e disciplina'
    }, [minimalDivision, blood]);

    assert.equal(payload.content, undefined);
    assert.equal(payload.embeds.length, 1);
    const embed = payload.embeds[0].toJSON();
    assert.equal(embed.fields.length, 2);
    assert.match(embed.fields[0].value, /A Divisão da Chuva/);
    assert.equal(embed.fields[1].value, blood.description);

    const buttons = payload.components.flatMap((row) => row.components.map((button) => button.toJSON()));
    assert.equal(buttons.length, 2);
    assert.equal(buttons[0].custom_id, 'division-ticket:apply:chuva');
    assert.equal(buttons[0].label, 'Entrar na Chuva');
    assert.equal(buttons[1].custom_id, 'division-ticket:apply:sangue');
    assert.equal(buttons[1].label, 'Entrar no Sangue');
});

test('division panel groups buttons into rows of five and enforces the Discord 25-button limit', () => {
    const divisions = Array.from({ length: 7 }, (_, index) => ({
        ...minimalDivision,
        division_key: `div-${index + 1}`,
        name: `Divisão ${index + 1}`,
        description: `Descrição ${index + 1}`
    }));
    const payload = buildDivisionPanelPayload({ panel_title: 'ALLIED | DIVISÕES' }, divisions);
    assert.equal(payload.components.length, 2);
    assert.deepEqual(payload.components.map((row) => row.components.length), [5, 2]);
    assert.throws(
        () => buildDivisionPanelPayload({ panel_title: 'ALLIED | DIVISÕES' }, Array.from({ length: 26 }, (_, index) => ({
            ...minimalDivision,
            division_key: `div-${index + 1}`,
            name: `Divisão ${index + 1}`
        }))),
        /máximo 25/
    );
});

test('division panel remains renderable when there are no active divisions', () => {
    const payload = buildDivisionPanelPayload({ panel_title: 'ALLIED | DIVISÕES' }, []);
    assert.equal(payload.embeds.length, 1);
    assert.equal(payload.components, undefined);
});

test('only leader and vice-leader role snapshots can review a division application', () => {
    const member = { roles: { cache: new Set(['leader-role']) } };
    assert.equal(canReviewDivision(member, { reviewer_role_ids: ['leader-role', 'vice-role'] }), true);
    assert.equal(canReviewDivision(member, { reviewer_role_ids: ['other-division-role'] }), false);
    assert.equal(canReviewDivision(member, { reviewer_role_ids: [] }), false);
    assert.equal(canReviewDivision(null, { reviewer_role_ids: ['leader-role'] }), false);
});

test('division application review card has only accept and reject actions', () => {
    const request = {
        id: 42,
        user_id: '123456789012345678',
        division_role_id: '987654321098765432',
        created_at: new Date('2026-11-14T12:00:00Z')
    };
    const card = buildDivisionRequestCard(request, minimalDivision, { motivation: 'Quero contribuir com estratégia.' });
    assert.equal(card.embeds.length, 1);
    const buttons = card.components.flatMap((row) => row.components.map((button) => button.toJSON()));
    assert.equal(buttons.length, 2);
    assert.equal(buttons[0].custom_id, 'division-ticket:approve:42');
    assert.equal(buttons[1].custom_id, 'division-ticket:reject:42');
    assert.match(card.embeds[0].toJSON().description, /Somente a liderança cadastrada/);
});
