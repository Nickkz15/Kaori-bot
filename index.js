import 'dotenv/config';

import {
    Client,
    GatewayIntentBits,
    Events,
    REST,
    Routes
} from 'discord.js';

import {
    TOKEN,
    GUILD_ID,
    ROLE_ID,
    AI_MODEL,
    AI_COOLDOWN,
    MAX_MESSAGE_LENGTH,
    MAX_CONCURRENT_REQUESTS,
    MAX_OUTPUT_TOKENS,
    MAX_AI_RETRIES,
    SPECIAL_USERS,
    AI_ALLOWED_CHANNELS,
    PERSONALITY
} from './config/kaori.js';

import { initDatabase } from './database/database.js';
import { ai } from './systems/ai.js';
import { buscarGifKaori } from './systems/nekos.js';

import { verificarCommand, verificarMembro } from './commands/verificar.js';
import { kaoriCommand, KAORI_ACTIONS, criarEmbedAcao } from './commands/kaori.js';
import { shipCommand, executeShip } from './commands/ship.js';
import { perfilCommand, executePerfil } from './commands/perfil.js';
import { dadoCommand, moedaCommand, executeDado, executeMoeda } from './commands/dado.js';
import { sorteCommand, executeSorte } from './commands/sorte.js';
import { saldoCommand, executeSaldo } from './commands/saldo.js';
import { diarioCommand, executeDiario } from './commands/diario.js';
import { trabalharCommand, executeTrabalhar } from './commands/trabalhar.js';
import { pagarCommand, executePagar } from './commands/pagar.js';
import { rankCommand, executeRank } from './commands/rank.js';
import { lojaCommand, comprarCommand, executeLoja, executeComprar } from './commands/loja.js';
import { relacionamentoCommand, executeRelacionamento } from './commands/relacionamento.js';
import { conquistasCommand, executeConquistas } from './commands/conquistas.js';
import { abrirCommand, executeAbrir } from './commands/abrir.js';
import { inventarioCommand, executeInventario } from './commands/inventario.js';
import { usarCommand, executeUsar } from './commands/usar.js';
import { eventoCommand, executeEvento } from './commands/evento.js';
import { missaoCommand, executeMissao } from './commands/missao.js';
import { interagirCommand, executeInteragir } from './commands/interagir.js';
import { colecaoCommand, executeColecao } from './commands/colecao.js';
import { presenteCommand, executePresente } from './commands/presente.js';
import { segredoCommand, executeSegredo } from './commands/segredo.js';
import { resetarCommand, executeResetar } from './commands/resetar.js';
import { ajudaCommand, executeAjuda } from './commands/ajuda.js';

import { confessCommand, executeConfess, handleConfessModal, handleConfessButton } from './commands/confess.js';
import { confessbanCommand, executeConfessban } from './commands/confessban.js';
import { confessunbanCommand, executeConfessunban } from './commands/confessunban.js';
import { confessbanlistCommand, executeConfessbanlist } from './commands/confessbanlist.js';
import { logschannelCommand, executeLogschannel } from './commands/logschannel.js';
import { poolCommand, executePool } from './commands/pool.js';
import { configCommand, executeConfig } from './commands/config.js';
import { ensureConfessSchema } from './systems/confessDb.js';
import { handlePollVote, handlePollModal, buildPollModal } from './systems/confessPoll.js';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.on('error', (err) => console.error('Client error:', err));
process.on('unhandledRejection', (reason) => console.error('Unhandled Rejection:', reason));

const aiCooldowns = new Map();
let activeAIRequests = 0;
const conversationHistory = new Map();
const MAX_HISTORY_MESSAGES = 2;
const MAX_HISTORY_MESSAGE_LENGTH = 500;
const AI_RATE_LIMIT_MAX = 10;
const AI_RATE_LIMIT_WINDOW = 5 * 60 * 1000;
const aiRateLimits = new Map();
const processedMessages = new Set();

function dividirResposta(texto, limite = 1900) {
    const partes = [];
    let restante = texto.trim();

    while (restante.length > limite) {
        let corte = restante.lastIndexOf('\n', limite);
        if (corte < limite * 0.5) corte = restante.lastIndexOf('. ', limite);
        if (corte < limite * 0.5) corte = restante.lastIndexOf('! ', limite);
        if (corte < limite * 0.5) corte = restante.lastIndexOf('? ', limite);
        if (corte < limite * 0.5) corte = restante.lastIndexOf(' ', limite);
        if (corte <= 0) corte = limite;

        partes.push(restante.slice(0, corte).trim());
        restante = restante.slice(corte).trim();
    }

    if (restante.length > 0) partes.push(restante);
    return partes;
}

function identificarUsuario(userId) {
    if (userId === SPECIAL_USERS.MANIACK) {
        return `\nVocê está falando com Maniack.\nEle é seu criador.\nEle namora uma garota chamada Ana, respeite-a.\n`;
    }
    if (userId === SPECIAL_USERS.TORU) {
        return `\nVocê está falando com Toru.\nEle é o líder do servidor, deve gostar dele.\nTrate-o como líder, mas mantenha sua personalidade normal.\n`;
    }
    if (userId === SPECIAL_USERS.TDH) {
        return `\nVocê está falando com TDH.\nEle é o seu amado marido, você é casada com ele, ame-o e demonstre interesse romântico excessivo.\n`;
    }
    if (userId === SPECIAL_USERS.LABEL) {
        return `\nVocê está falando com Label.\nEle é sua melhor amiga e ela tem muita aura.\n`;
    }
    return `\nVocê está falando com um membro comum do servidor.\n`;
}

async function safeReply(interaction, payload) {
    try {
        if (interaction.deferred || interaction.replied) {
            return await interaction.editReply(payload);
        }
        return await interaction.reply(payload);
    } catch (err) {
        console.error('safeReply error:', err.message);
    }
}

const COMMAND_HANDLERS = {
    ship: executeShip,
    perfil: executePerfil,
    dado: executeDado,
    moeda: executeMoeda,
    sorte: executeSorte,
    saldo: executeSaldo,
    diario: executeDiario,
    trabalhar: executeTrabalhar,
    pagar: executePagar,
    rank: executeRank,
    loja: executeLoja,
    comprar: executeComprar,
    relacionamento: executeRelacionamento,
    conquistas: executeConquistas,
    abrir: executeAbrir,
    inventario: executeInventario,
    usar: executeUsar,
    evento: executeEvento,
    missao: executeMissao,
    interagir: executeInteragir,
    colecao: executeColecao,
    presente: executePresente,
    segredo: executeSegredo,
    'resetar-perfil': executeResetar,
    ajuda: executeAjuda,
    confess: executeConfess,
    confessban: executeConfessban,
    confessunban: executeConfessunban,
    confessbanlist: executeConfessbanlist,
    logschannel: executeLogschannel,
    pool: executePool,
    config: executeConfig
};

client.once(Events.ClientReady, async (bot) => {
    console.log('================================');
    console.log(`🤖 Kaori online como ${bot.user.tag}`);
    console.log('================================');

    try {
        await initDatabase();
        await ensureConfessSchema();
        console.log('✅ Sistema Confess (PostgreSQL) pronto.');
    } catch (err) {
        console.error('❌ Falha ao inicializar PostgreSQL:', err.message);
        process.exit(1);
    }

    const rest = new REST({ version: '10' }).setToken(TOKEN);

    try {
        await rest.put(
            Routes.applicationGuildCommands(bot.user.id, GUILD_ID),
            {
                body: [
                    verificarCommand.toJSON(),
                    kaoriCommand.toJSON(),
                    shipCommand.toJSON(),
                    perfilCommand.toJSON(),
                    dadoCommand.toJSON(),
                    moedaCommand.toJSON(),
                    sorteCommand.toJSON(),
                    saldoCommand.toJSON(),
                    diarioCommand.toJSON(),
                    trabalharCommand.toJSON(),
                    pagarCommand.toJSON(),
                    rankCommand.toJSON(),
                    lojaCommand.toJSON(),
                    comprarCommand.toJSON(),
                    inventarioCommand.toJSON(),
                    usarCommand.toJSON(),
                    abrirCommand.toJSON(),
                    eventoCommand.toJSON(),
                    missaoCommand.toJSON(),
                    interagirCommand.toJSON(),
                    segredoCommand.toJSON(),
                    colecaoCommand.toJSON(),
                    presenteCommand.toJSON(),
                    relacionamentoCommand.toJSON(),
                    conquistasCommand.toJSON(),
                    resetarCommand.toJSON(),
                    ajudaCommand.toJSON(),
                    confessCommand.toJSON(),
                    confessbanCommand.toJSON(),
                    confessunbanCommand.toJSON(),
                    confessbanlistCommand.toJSON(),
                    logschannelCommand.toJSON(),
                    poolCommand.toJSON(),
                    configCommand.toJSON()
                ]
            }
        );
        console.log('✅ Todos os comandos foram registrados com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao registrar comandos:', error);
    }

    console.log('🟢 Sistema de Server Tag ativo.');
    console.log('🧠 Sistema de IA Gemini ativo.');
    console.log(`🤖 Modelo: ${AI_MODEL}`);
    console.log('💬 Kaori responderá quando mencionada.');
    console.log('================================');
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.guildId && interaction.guildId !== GUILD_ID) return;

    try {
        // ---------- Modal Confess / Poll ----------
        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'confess_modal') {
                await handleConfessModal(interaction);
                return;
            }
            if (interaction.customId === 'confess_poll_modal') {
                await handlePollModal(interaction);
                return;
            }
        }

        // ---------- Buttons ----------
        if (interaction.isButton()) {
            // Botão legado do /config botao + botão da última confissão
            if (
                interaction.customId === 'confess_open_modal' ||
                interaction.customId === 'confess_make_confession'
            ) {
                await handleConfessButton(interaction);
                return;
            }
            if (interaction.customId === 'confess_open_poll') {
                if (!interaction.guildId) {
                    return interaction.reply({ content: 'Só em servidores.', ephemeral: true });
                }
                return interaction.showModal(buildPollModal());
            }
            if (interaction.customId.startsWith('confess_poll_vote:')) {
                const parts = interaction.customId.split(':');
                const pollId = Number(parts[1]);
                const optionIndex = Number(parts[2]);
                await handlePollVote(interaction, pollId, optionIndex);
                return;
            }
        }

        if (!interaction.isChatInputCommand()) return;

        if (interaction.commandName === 'kaori') {
            const acao = interaction.options.getSubcommand();
            const configuracao = KAORI_ACTIONS[acao];

            if (!configuracao) {
                return safeReply(interaction, { content: 'Essa ação ainda não existe, bobinho.', ephemeral: true });
            }

            const autor = interaction.user;
            let alvo = interaction.options.getUser('usuario');

            if (configuracao.precisaAlvo && !alvo) {
                alvo = autor;
            }

            await interaction.deferReply();

            const gifUrl = await buscarGifKaori(configuracao.categoria);

            if (!gifUrl) {
                return interaction.editReply({ content: 'Hm... o meu fornecedor de GIFs resolveu dormir. Tenta de novo.' });
            }

            const frases = configuracao.frases;
            const fraseBase = frases[Math.floor(Math.random() * frases.length)];
            const frase = fraseBase
                .replaceAll('{autor}', `<@${autor.id}>`)
                .replaceAll('{alvo}', alvo ? `<@${alvo.id}>` : '');

            const embed = criarEmbedAcao(autor, alvo, frase, gifUrl);

            try {
                const { incrementAction } = await import('./database/database.js');
                await incrementAction(interaction.guildId, autor.id, acao);

                const { aplicarAcaoRelacionamento } = await import('./systems/relationship.js');
                await aplicarAcaoRelacionamento(interaction.guildId, autor.id, acao);

                const { checkAndUnlock } = await import('./systems/achievements.js');
                const novasConquistas = await checkAndUnlock(interaction.guildId, autor.id, { action: acao });

                await interaction.editReply({ embeds: [embed] });

                if (novasConquistas.length > 0) {
                    const { enviarConquista } = await import('./systems/notifications.js');
                    await enviarConquista(interaction, novasConquistas);
                }
            } catch (err) {
                console.error('Erro na integração de progresso:', err.message);
                await interaction.editReply({ embeds: [embed] });
            }
            return;
        }

        if (interaction.commandName === 'verificar') {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '🔎 Iniciando verificação dos membros...', ephemeral: true });
            }

            try {
                const guild = interaction.guild;
                const members = await guild.members.fetch();
                let verificados = 0;
                let alterados = 0;

                for (const member of members.values()) {
                    if (member.user.bot) continue;

                    const tinhaCargo = member.roles.cache.has(ROLE_ID);
                    await verificarMembro(member);
                    const temCargoAgora = member.roles.cache.has(ROLE_ID);

                    verificados++;
                    if (tinhaCargo !== temCargoAgora) alterados++;
                }

                await interaction.editReply({
                    content: `✅ **Verificação concluída!**\n\n👥 Membros verificados: **${verificados}**\n🔄 Cargos alterados: **${alterados}**`
                });
            } catch (error) {
                console.error('❌ Erro no /verificar:', error);
                await interaction.editReply({ content: '❌ Ocorreu um erro durante a verificação.' });
            }
            return;
        }

        const handler = COMMAND_HANDLERS[interaction.commandName];
        if (handler) {
            await handler(interaction);
            return;
        }
    } catch (error) {
        console.error(`Erro no comando /${interaction.commandName}:`, error);
        try {
            const payload = {
                content: 'Algo deu errado ao processar o comando. Tenta de novo em instantes.',
                ephemeral: true
            };
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp(payload).catch(() => {});
            } else {
                await interaction.reply(payload).catch(() => {});
            }
        } catch {}
    }
});

client.on(Events.GuildMemberAdd, async (member) => {
    if (member.guild.id !== GUILD_ID) return;
    if (member.user.bot) return;

    console.log(`👤 Novo membro: ${member.user.username}`);
    await verificarMembro(member);
});

client.on(Events.UserUpdate, async (oldUser, newUser) => {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return;

    let member = guild.members.cache.get(newUser.id);
    if (!member) {
        member = await guild.members.fetch(newUser.id).catch(() => null);
    }
    if (!member || newUser.bot) return;

    await verificarMembro(member, newUser);
});

client.on(Events.MessageCreate, async (message) => {
    if (processedMessages.has(message.id)) return;
    processedMessages.add(message.id);
    setTimeout(() => processedMessages.delete(message.id), 30 * 1000);

    if (message.author.bot) return;
    if (message.guild?.id !== GUILD_ID) return;
    if (!AI_ALLOWED_CHANNELS.has(message.channel.id)) return;
    if (!message.mentions.has(client.user)) return;

    const userId = message.author.id;
    const guildId = message.guild.id;
    const agora = Date.now();
    const scopeKey = `${guildId}:${userId}`;

    let registros = aiRateLimits.get(scopeKey) || [];
    registros = registros.filter(t => agora - t < AI_RATE_LIMIT_WINDOW);
    registros.push(agora);
    aiRateLimits.set(scopeKey, registros);

    if (registros.length > AI_RATE_LIMIT_MAX) {
        const tempoRestante = AI_RATE_LIMIT_WINDOW - (agora - registros[registros.length - AI_RATE_LIMIT_MAX]);
        const minutos = Math.ceil(tempoRestante / 60000);
        return message.reply(`Você já falou demais comigo por enquanto. Espera mais **${minutos} min**.`);
    }

    const ultimoUso = aiCooldowns.get(scopeKey) || 0;
    const tempoRestante = AI_COOLDOWN - (agora - ultimoUso);

    if (tempoRestante > 0) {
        const segundos = Math.ceil(tempoRestante / 1000);
        return message.reply(`Calma aí. Me dá **${segundos}s** antes de me chamar de novo.`);
    }

    if (activeAIRequests >= MAX_CONCURRENT_REQUESTS) {
        return message.reply('Tem gente demais falando comigo ao mesmo tempo. Espera um pouquinho.');
    }

    aiCooldowns.set(scopeKey, agora);

    let pergunta = message.content
        .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
        .trim();

    if (!pergunta) {
        const respostas = [
            'Hm? Você me chamou?',
            'O que foi? Fala logo.',
            'Você me marcou só para ficar me olhando?',
            'Sim? Estou ouvindo.'
        ];
        return message.reply(respostas[Math.floor(Math.random() * respostas.length)]);
    }

    if (pergunta.length > MAX_MESSAGE_LENGTH) {
        pergunta = pergunta.substring(0, MAX_MESSAGE_LENGTH) + '...';
        await message.reply('Você escreveu um livro inteiro. Vou considerar só os primeiros 500 caracteres, tá?');
    }

    activeAIRequests++;

    try {
        await message.channel.sendTyping();

        let history = conversationHistory.get(scopeKey) || [];
        const contextoUsuario = identificarUsuario(message.author.id);

        let resposta = null;

        for (let tentativa = 0; tentativa <= MAX_AI_RETRIES; tentativa++) {
            try {
                const historyGemini = history.map(m => ({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: m.content }]
                }));

                let contextoRelacionamento = '';
                try {
                    const { getRelacionamento } = await import('./systems/relationship.js');
                    const rel = await getRelacionamento(guildId, userId);
                    contextoRelacionamento = `
Relacionamento atual com este usuário:
Carinho: ${rel.carinho}/100 | Confiança: ${rel.confianca}/100 | Afinidade: ${rel.afinidade}/100
Status: ${rel.status}
`;
                } catch (e) {}

                const contextoAtual =
                    `USUÁRIO ATUAL:\n${contextoUsuario}\n\n` +
                    contextoRelacionamento;

                const response = await ai.models.generateContent({
                    model: AI_MODEL,
                    contents: [
                        ...historyGemini,
                        {
                            role: 'user',
                            parts: [{
                                text: contextoAtual + `\n\nMENSAGEM:\n${pergunta}`
                            }]
                        }
                    ],
                    config: {
                        systemInstruction: PERSONALITY,
                        maxOutputTokens: MAX_OUTPUT_TOKENS
                    }
                });

                resposta = response.text?.trim();
                if (resposta) break;

                console.warn(`⚠️ Gemini retornou resposta vazia. Tentativa ${tentativa + 1}.`);
                if (tentativa < MAX_AI_RETRIES) await new Promise(r => setTimeout(r, 700));
            } catch (error) {
                throw error;
            }
        }

        if (!resposta) {
            return message.reply('Hm... minha cabeça travou por um instante. Tenta me chamar de novo.');
        }

        history.push(
            { role: 'user', content: pergunta.substring(0, MAX_HISTORY_MESSAGE_LENGTH) },
            { role: 'assistant', content: resposta.substring(0, MAX_HISTORY_MESSAGE_LENGTH) }
        );
        if (history.length > MAX_HISTORY_MESSAGES * 2) {
            history = history.slice(-MAX_HISTORY_MESSAGES * 2);
        }
        conversationHistory.set(scopeKey, history);

        if (resposta.length <= 2000) {
            await message.reply(resposta);
        } else {
            const partes = dividirResposta(resposta, 2000);
            for (const parte of partes) {
                await message.channel.send(parte);
            }
        }
    } catch (error) {
        if (error?.status === 401) {
            console.error('❌ GEMINI_API_KEY inválida.');
            return message.reply('Minha chave de acesso resolveu tirar férias. O administrador precisa verificar a configuração da API.');
        }
        if (error?.status === 429) {
            console.error('⚠️ Limite da Gemini atingido.');
            return message.reply('Calma aí... vocês estão me chamando rápido demais. Até eu tenho limites.');
        }
        if (error?.status >= 500) {
            console.error(`⚠️ Gemini indisponível. Status: ${error.status}`);
            return message.reply('A Gemini resolveu tropeçar nos próprios cabos. Tenta novamente daqui a pouco.');
        }

        console.error('❌ Erro na API da Gemini:', error);
        await message.reply('Minha cabeça deu uma pequena pane. Tenta de novo daqui a pouco.');
    } finally {
        activeAIRequests--;
    }
});

if (!TOKEN || TOKEN.length < 50) {
    console.error('❌ TOKEN inválido ou não definido.');
    console.error('Defina a variável de ambiente TOKEN no painel do host (Railway/Render/etc).');
    process.exit(1);
}

client.login(TOKEN);
