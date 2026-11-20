import test from 'node:test';
import assert from 'node:assert/strict';
import {
    encryptArchiveBuffer,
    decryptArchiveBuffer,
    buildMessageArchiveObjectKey,
    buildMessageArchiveNoticeEmbed
} from '../systems/messageArchive.js';

const KEY = 'ab'.repeat(32);

test('archive payload uses authenticated encryption and round-trips binary data', () => {
    const original = Buffer.from('Mensagem privada da Allied\ncom acentos: ação, coração e estratégia.');
    const encrypted = encryptArchiveBuffer(original, KEY);

    assert.notDeepEqual(encrypted, original);
    assert.equal(encrypted.subarray(0, 4).toString('ascii'), 'KAR1');
    assert.deepEqual(decryptArchiveBuffer(encrypted, KEY), original);
});

test('archive payload rejects tampering and an incorrect encryption key', () => {
    const encrypted = encryptArchiveBuffer(Buffer.from('conteúdo protegido'), KEY);
    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 1] ^= 0xff;

    assert.throws(() => decryptArchiveBuffer(tampered, KEY));
    assert.throws(() => decryptArchiveBuffer(encrypted, 'cd'.repeat(32)));
});

test('archive encryption validates the 32-byte key length', () => {
    assert.throws(() => encryptArchiveBuffer(Buffer.from('x'), 'not-a-valid-key'), /32 bytes/);
    assert.throws(() => decryptArchiveBuffer(Buffer.from('invalid'), KEY), /Formato/);
});

test('archive object keys partition events by date and do not expose raw Discord identifiers', () => {
    const input = {
        guildId: '111111111111111111',
        channelId: '222222222222222222',
        authorId: '333333333333333333',
        messageId: '444444444444444444',
        eventType: 'deleted',
        capturedAt: '2026-11-20T15:30:00.000Z'
    };
    const key = buildMessageArchiveObjectKey(input);

    assert.ok(key.startsWith('events/111111111111111111/2026/11/20/'));
    assert.ok(key.includes('_deleted_'));
    assert.ok(key.endsWith('.bin'));
    assert.equal(key.includes(input.channelId), false);
    assert.equal(key.includes(input.authorId), false);
    assert.equal(key.includes(input.messageId), false);
});

test('public archive notice explains its purpose, scope, retention and restricted access', () => {
    const embed = buildMessageArchiveNoticeEmbed().toJSON();

    assert.match(embed.title, /ARQUIVAMENTO/);
    assert.match(embed.description, /90 dias/);
    assert.match(embed.description, /armazenamento privado/);
    assert.match(embed.description, /bots e webhooks/);
    assert.equal(embed.fields.length, 3);
});
