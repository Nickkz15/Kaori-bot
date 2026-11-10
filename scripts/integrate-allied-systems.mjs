import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const indexPath = path.join(root, 'index.js');
const packagePath = path.join(root, 'package.json');
const backups = [
    [indexPath, path.join(root, 'index.js.pre-allied-tickets.bak')],
    [packagePath, path.join(root, 'package.json.pre-allied-tickets.bak')]
];

for (const [source, backup] of backups) {
    if (!fs.existsSync(source)) {
        console.error(`Arquivo obrigatório não encontrado: ${path.basename(source)}. Execute na raiz de Kaori-bot.`);
        process.exit(1);
    }
    if (fs.existsSync(backup)) {
        console.error(`Backup já existe: ${path.basename(backup)}. Não vou sobrescrevê-lo.`);
        process.exit(1);
    }
}

let source = fs.readFileSync(indexPath, 'utf8');
const requiredMarkers = [
    "import { alliedInvitesCommand, executeAlliedInvites } from './commands/allied-invites.js';",
    '        await initAlliedInviteLogger(bot);',
    '                    alliedInvitesCommand.toJSON()',
    "    'allied-invites': executeAlliedInvites",
    'client.on(Events.InteractionCreate, async (interaction) => {\n    if (interaction.guildId && interaction.guildId !== GUILD_ID) return;\n\n    try {\n        if (interaction.isModalSubmit()) {'
];
for (const marker of requiredMarkers) {
    if (!source.includes(marker)) {
        console.error(`A estrutura da versão estável esperada não foi encontrada. Marcador ausente: ${marker.slice(0, 100)}`);
        process.exit(1);
    }
}
if (source.includes("from './commands/allied-admission.js'") ||
    source.includes("from './commands/allied-embed.js'") ||
    source.includes("from './commands/allied-divisions.js'")) {
    console.error('Os módulos Allied parecem já estar integrados. Não vou inserir imports duplicados.');
    process.exit(1);
}

const importAnchor = "import { alliedInvitesCommand, executeAlliedInvites } from './commands/allied-invites.js';";
source = source.replace(importAnchor, `${importAnchor}
import { alliedAdmissionCommand, executeAlliedAdmission } from './commands/allied-admission.js';
import { alliedEmbedCommand, executeAlliedEmbed } from './commands/allied-embed.js';
import { initAlliedAdmission, handleAdmissionButton, handleAdmissionModal } from './systems/alliedAdmission.js';
import { alliedDivisionsCommand, executeAlliedDivisions } from './commands/allied-divisions.js';
import { initAlliedDivisionTickets, handleDivisionTicketInteraction } from './systems/alliedDivisionTickets.js';`);

const initAnchor = '        await initAlliedInviteLogger(bot);';
source = source.replace(initAnchor, `${initAnchor}
        await initAlliedAdmission();
        await initAlliedDivisionTickets();
        console.log('🏯 Allied Admission + Division Tickets prontos.');`);

const commandAnchor = '                    alliedInvitesCommand.toJSON()';
source = source.replace(commandAnchor, `                    alliedInvitesCommand.toJSON(),
                    alliedAdmissionCommand.toJSON(),
                    alliedEmbedCommand.toJSON(),
                    alliedDivisionsCommand.toJSON()`);

const handlerAnchor = "    'allied-invites': executeAlliedInvites";
source = source.replace(handlerAnchor, `${handlerAnchor},
    'allied-admission': executeAlliedAdmission,
    'allied-embed': executeAlliedEmbed,
    'allied-divisions': executeAlliedDivisions`);

const interactionAnchor = '    try {\n        if (interaction.isModalSubmit()) {';
const interactionHandlers = `    try {
        if (
            (interaction.isButton() || interaction.isModalSubmit() || interaction.isStringSelectMenu()) &&
            typeof interaction.customId === 'string' &&
            interaction.customId.startsWith('division-ticket:')
        ) {
            const handled = await handleDivisionTicketInteraction(interaction);
            if (handled) return;
        }
        if (interaction.isButton() && interaction.customId.startsWith('admission:')) {
            await handleAdmissionButton(interaction);
            return;
        }
        if (interaction.isModalSubmit() && interaction.customId.startsWith('admission:submit:')) {
            await handleAdmissionModal(interaction);
            return;
        }

        if (interaction.isModalSubmit()) {`;
source = source.replace(interactionAnchor, interactionHandlers);

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
packageJson.scripts ||= {};
packageJson.scripts.test = 'node --test tests/*.test.js';

fs.copyFileSync(indexPath, backups[0][1], fs.constants.COPYFILE_EXCL);
fs.copyFileSync(packagePath, backups[1][1], fs.constants.COPYFILE_EXCL);
fs.writeFileSync(indexPath, source, 'utf8');
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
console.log('Integração Allied concluída.');
console.log('Backups criados: index.js.pre-allied-tickets.bak e package.json.pre-allied-tickets.bak.');
console.log('Foram adicionados: /allied-admission, /allied-embed e /allied-divisions.');
console.log('O script de testes agora executa todos os arquivos tests/*.test.js.');
