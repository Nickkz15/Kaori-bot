import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAdmissionQuestions, parseAdmissionColor, buildAdmissionPanelPayload, buildAdmissionWelcomeMessage, buildAdmissionRejectionMessage, isServerTagRoleConflict, buildAdmissionAcceptanceAnnouncement, getAdmissionApprovalRoleId } from '../systems/alliedAdmission.js';
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

test('admission panel keeps all copy inside the embed and has safe button components', () => {
    const payload = buildAdmissionPanelPayload({
        panel_title: 'ALLIED | ADMISSÃO',
        panel_description: 'Painel de entrada',
        panel_color: '#8B1A1A',
        panel_author: 'ALLIED',
        panel_author_icon_url: null,
        panel_thumbnail_url: null,
        panel_image_url: 'https://example.com/allied.gif',
        panel_footer_text: 'Organização e união',
        panel_footer_icon_url: null,
        panel_fields: [],
        panel_timestamp: false,
        panel_content: 'Este texto legado não deve aparecer fora da embed'
    });

    assert.equal(payload.content, undefined);
    assert.equal(payload.embeds.length, 1);
    const embed = payload.embeds[0].toJSON();
    assert.equal(embed.image.url, 'https://example.com/allied.gif');
    assert.equal(embed.fields.length, 3);
    assert.equal(payload.components[0].components.length, 3);
    const buttonIds = payload.components[0].components.map((button) => button.toJSON().custom_id);
    assert.deepEqual(buttonIds, [
        'admission:form:entry',
        'admission:form:partnership',
        'admission:form:war'
    ]);
});

test('admission decision messages are safe and use the expected wording', () => {
    assert.equal(
        buildAdmissionWelcomeMessage('12345678901234567'),
        'Seja muito bem-vindo(a), <@12345678901234567>! Interaja com o pessoal e divirta-se!'
    );
    assert.match(buildAdmissionRejectionMessage(), /pode tentar novamente/i);
    assert.throws(() => buildAdmissionWelcomeMessage('not-a-discord-id'), /ID de usuário inválido/);
});


test('server tag role must differ from the final Allied member role', () => {
    assert.equal(isServerTagRoleConflict('123', '123'), true);
    assert.equal(isServerTagRoleConflict('123', '456'), false);
    assert.equal(isServerTagRoleConflict('123', null), false);
    assert.equal(isServerTagRoleConflict(null, '123'), false);
});

test('partnership approval announcement includes the partner, representative, proposal and a safe invite link', () => {
    const payload = buildAdmissionAcceptanceAnnouncement({
        application_type: 'partnership',
        display_name: 'Comunidade Aurora',
        answers: {
            server_name: 'Aurora',
            representative: 'Líder Aurora',
            proposal: 'Cooperação entre comunidades.',
            server_link: 'https://discord.gg/aurora'
        }
    });

    assert.deepEqual(payload.allowedMentions.parse, []);
    assert.equal(payload.embeds.length, 1);
    const embed = payload.embeds[0].toJSON();
    assert.equal(embed.title, '✦ NOVA PARCERIA');
    assert.match(embed.description, /Aurora/);
    assert.equal(embed.fields.find((field) => field.name === 'Comunidade parceira').value, 'Aurora');
    assert.equal(embed.fields.find((field) => field.name === 'Proposta').value, 'Cooperação entre comunidades.');
    assert.equal(embed.fields.find((field) => field.name === 'Convite / site').value, '<https://discord.gg/aurora>');
});

test('war approval announcement includes the opponent, reason and call to confrontation without triggering mass mentions', () => {
    const payload = buildAdmissionAcceptanceAnnouncement({
        application_type: 'war',
        display_name: 'Clã rival',
        answers: {
            organization: 'Clã rival',
            representative: 'Representante',
            reason: 'Ofensas e ataques contra membros da Allied.',
            evidence: 'https://example.com/evidencias',
            expectation: 'Resolver o conflito em confronto organizado.'
        }
    });

    assert.deepEqual(payload.allowedMentions.parse, []);
    const embed = payload.embeds[0].toJSON();
    assert.equal(embed.title, '✦ GUERRA CONFIRMADA');
    assert.match(embed.description, /O confronto está lançado/);
    assert.equal(embed.fields.find((field) => field.name === 'Contra quem').value, 'Clã rival');
    assert.equal(embed.fields.find((field) => field.name === 'Motivo da guerra').value, 'Ofensas e ataques contra membros da Allied.');
    assert.equal(embed.fields.find((field) => field.name === 'Registros / provas').value, '<https://example.com/evidencias>');
});

test('announcement text neutralizes mass mentions and invalid application types cannot create an announcement', () => {
    const payload = buildAdmissionAcceptanceAnnouncement({
        application_type: 'war',
        answers: { organization: '@everyone', reason: '@here' }
    });
    const embed = payload.embeds[0].toJSON();
    assert.equal(embed.fields.find((field) => field.name === 'Contra quem').value.includes('@everyone'), false);
    assert.equal(embed.fields.find((field) => field.name === 'Motivo da guerra').value.includes('@here'), false);
    assert.throws(() => buildAdmissionAcceptanceAnnouncement({ application_type: 'entry', answers: {} }), /Somente parcerias e guerras/);
});

test('partnership and war approvals map to their own configured roles only', () => {
    const config = { partnership_role_id: '11111111111111111', war_role_id: '22222222222222222' };
    assert.equal(getAdmissionApprovalRoleId(config, 'partnership'), '11111111111111111');
    assert.equal(getAdmissionApprovalRoleId(config, 'war'), '22222222222222222');
    assert.equal(getAdmissionApprovalRoleId(config, 'entry'), null);
    assert.equal(getAdmissionApprovalRoleId({}, 'partnership'), null);
});
