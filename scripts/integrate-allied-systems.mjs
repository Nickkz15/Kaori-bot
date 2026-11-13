import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const indexPath = path.join(root, 'index.js');
const packagePath = path.join(root, 'package.json');

function fail(message) {
    console.error(`Integração cancelada: ${message}`);
    process.exit(1);
}

for (const file of [indexPath, packagePath]) {
    if (!fs.existsSync(file)) fail(`arquivo obrigatório não encontrado: ${path.basename(file)}. Execute na raiz da Kaori.`);
}

let originalIndex;
let originalPackage;
let packageJson;
try {
    originalIndex = fs.readFileSync(indexPath, 'utf8');
    originalPackage = fs.readFileSync(packagePath, 'utf8');
    packageJson = JSON.parse(originalPackage.replace(/^\uFEFF/, ''));
} catch (error) {
    fail(`não foi possível ler index.js/package.json: ${error.message}`);
}

const eol = originalIndex.includes('\r\n') ? '\r\n' : '\n';
let source = originalIndex;

function replaceExactlyOne(input, pattern, replacement, label) {
    const matches = [...input.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`))];
    if (matches.length !== 1) {
        throw new Error(`${label}: esperava encontrar exatamente uma ocorrência, encontrei ${matches.length}. Nenhum arquivo foi alterado.`);
    }
    return input.replace(pattern, replacement);
}

const expectedMarkers = [
    [/^import \{ alliedInvitesCommand, executeAlliedInvites \} from '\.\/commands\/allied-invites\.js';$/m, 'import do Allied InviteLogger'],
    [/^        await initAlliedInviteLogger\(bot\);$/m, 'inicialização do Allied InviteLogger'],
    [/^                    alliedInvitesCommand\.toJSON\(\)$/m, 'registro do comando /allied-invites'],
    [/^    'allied-invites': executeAlliedInvites$/m, 'COMMAND_HANDLERS do Allied InviteLogger'],
    [/^[ \t]{4}try \{\r?\n[ \t]{8}if \(interaction\.isModalSubmit\(\)\) \{$/m, 'início do bloco de interações']
];

for (const [pattern, label] of expectedMarkers) {
    if (!pattern.test(source)) fail(`não encontrei o ponto de integração esperado: ${label}. Seu index.js pode ter outra estrutura.`);
}

const newImportMarkers = [
    "from './commands/allied-admission.js'",
    "from './commands/allied-embed.js'",
    "from './commands/allied-divisions.js'",
    "from './systems/alliedAdmission.js'",
    "from './systems/alliedDivisionTickets.js'"
];
if (newImportMarkers.some((marker) => source.includes(marker))) {
    fail('um ou mais imports Allied já existem em index.js. Para evitar duplicações, revise a integração manualmente.');
}

try {
    source = replaceExactlyOne(
        source,
        /^import \{ alliedInvitesCommand, executeAlliedInvites \} from '\.\/commands\/allied-invites\.js';$/m,
        (match) => `${match}${eol}import { alliedAdmissionCommand, executeAlliedAdmission } from './commands/allied-admission.js';${eol}import { alliedEmbedCommand, executeAlliedEmbed } from './commands/allied-embed.js';${eol}import { initAlliedAdmission, handleAdmissionButton, handleAdmissionModal } from './systems/alliedAdmission.js';${eol}import { alliedDivisionsCommand, executeAlliedDivisions } from './commands/allied-divisions.js';${eol}import { initAlliedDivisionTickets, handleDivisionTicketInteraction } from './systems/alliedDivisionTickets.js';`,
        'imports Allied'
    );

    source = replaceExactlyOne(
        source,
        /^        await initAlliedInviteLogger\(bot\);$/m,
        (match) => `${match}${eol}        await initAlliedAdmission();${eol}        await initAlliedDivisionTickets();${eol}        console.log('Allied Admission + Division Tickets prontos.');`,
        'inicialização dos sistemas Allied'
    );

    source = replaceExactlyOne(
        source,
        /^                    alliedInvitesCommand\.toJSON\(\)$/m,
        (match) => `${match},${eol}                    alliedAdmissionCommand.toJSON(),${eol}                    alliedEmbedCommand.toJSON(),${eol}                    alliedDivisionsCommand.toJSON()`,
        'registro dos comandos Allied'
    );

    source = replaceExactlyOne(
        source,
        /^    'allied-invites': executeAlliedInvites$/m,
        (match) => `${match},${eol}    'allied-admission': executeAlliedAdmission,${eol}    'allied-embed': executeAlliedEmbed,${eol}    'allied-divisions': executeAlliedDivisions`,
        'roteamento dos comandos Allied'
    );

    const interactionPattern = /^([ \t]{4}try \{\r?\n)([ \t]{8}if \(interaction\.isModalSubmit\(\)\) \{)$/m;
    const interactionBlock = [
        '    try {',
        '        if (',
        '            (interaction.isButton() || interaction.isModalSubmit() || interaction.isStringSelectMenu()) &&',
        "            typeof interaction.customId === 'string' &&",
        "            interaction.customId.startsWith('division-ticket:')",
        '        ) {',
        '            const handled = await handleDivisionTicketInteraction(interaction);',
        '            if (handled) return;',
        '        }',
        "        if (interaction.isButton() && interaction.customId.startsWith('admission:')) {",
        '            await handleAdmissionButton(interaction);',
        '            return;',
        '        }',
        "        if (interaction.isModalSubmit() && interaction.customId.startsWith('admission:submit:')) {",
        '            await handleAdmissionModal(interaction);',
        '            return;',
        '        }',
        '',
        '        if (interaction.isModalSubmit()) {'
    ].join(eol);
    source = replaceExactlyOne(source, interactionPattern, interactionBlock, 'roteamento dos botões, formulários e menus');
} catch (error) {
    fail(error.message);
}

const requiredTests = [
    'tests/ai.test.js',
    'tests/admission.test.js',
    'tests/division-tickets.test.js'
];
for (const testFile of requiredTests) {
    if (!fs.existsSync(path.join(root, testFile))) fail(`teste esperado não encontrado: ${testFile}. Os testes não serão substituídos.`);
}

packageJson.scripts ||= {};
packageJson.scripts.test = `node --test ${requiredTests.join(' ')}`;
const nextPackage = `${JSON.stringify(packageJson, null, 2)}\n`;

// Keep backups outside the repository so they cannot be added accidentally with git add .
const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaori-allied-backup-'));
const indexBackup = path.join(backupDir, 'index.js');
const packageBackup = path.join(backupDir, 'package.json');
fs.writeFileSync(indexBackup, originalIndex, 'utf8');
fs.writeFileSync(packageBackup, originalPackage, 'utf8');

const indexTemp = `${indexPath}.allied-tmp.js`;
const packageTemp = `${packagePath}.allied-tmp.json`;
try {
    fs.writeFileSync(indexTemp, source, 'utf8');
    fs.writeFileSync(packageTemp, nextPackage, 'utf8');

    const syntax = spawnSync(process.execPath, ['--check', indexTemp], { cwd: root, encoding: 'utf8' });
    if (syntax.status !== 0) {
        throw new Error(`index.js integrado não passou em node --check:\n${syntax.stderr || syntax.stdout}`);
    }
    JSON.parse(fs.readFileSync(packageTemp, 'utf8'));

    fs.renameSync(indexTemp, indexPath);
    fs.renameSync(packageTemp, packagePath);
} catch (error) {
    for (const temp of [indexTemp, packageTemp]) {
        if (fs.existsSync(temp)) fs.rmSync(temp, { force: true });
    }
    // If the first rename succeeded and the second did not, restore both originals.
    fs.writeFileSync(indexPath, originalIndex, 'utf8');
    fs.writeFileSync(packagePath, originalPackage, 'utf8');
    fail(`${error.message}\nOs arquivos originais foram restaurados. Backups: ${backupDir}`);
}

console.log('Integração Allied concluída e index.js passou em node --check.');
console.log('Foram adicionados: /allied-admission, /allied-embed e /allied-divisions.');
console.log('Foram conectados os botões, formulários e menus dos sistemas de admissão e divisões.');
console.log(`npm test agora preserva e executa: ${requiredTests.join(', ')}.`);
console.log(`Backups dos arquivos anteriores: ${backupDir}`);
console.log('Os backups ficaram fora do repositório e não serão incluídos por git add .');
