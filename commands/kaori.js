import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const kaoriCommand = new SlashCommandBuilder()
    .setName('kaori')
    .setDescription('Ações da Kaori (com GIF + personalidade)')
    // Ações com alvo
    .addSubcommand(sc => sc.setName('hug').setDescription('Abraça alguém').addUserOption(o => o.setName('usuario').setDescription('Quem?').setRequired(true)))
    .addSubcommand(sc => sc.setName('pat').setDescription('Faz carinho').addUserOption(o => o.setName('usuario').setDescription('Quem?').setRequired(true)))
    .addSubcommand(sc => sc.setName('kiss').setDescription('Beija alguém').addUserOption(o => o.setName('usuario').setDescription('Quem?').setRequired(true)))
    .addSubcommand(sc => sc.setName('cuddle').setDescription('Aconchega').addUserOption(o => o.setName('usuario').setDescription('Quem?').setRequired(true)))
    .addSubcommand(sc => sc.setName('poke').setDescription('Cutuca').addUserOption(o => o.setName('usuario').setDescription('Quem?').setRequired(true)))
    .addSubcommand(sc => sc.setName('slap').setDescription('Dá um tapa').addUserOption(o => o.setName('usuario').setDescription('Quem?').setRequired(true)))
    .addSubcommand(sc => sc.setName('bonk').setDescription('Aplica BONK').addUserOption(o => o.setName('usuario').setDescription('Quem?').setRequired(true)))
    .addSubcommand(sc => sc.setName('bite').setDescription('Morde').addUserOption(o => o.setName('usuario').setDescription('Quem?').setRequired(true)))
    .addSubcommand(sc => sc.setName('tickle').setDescription('Faz cócegas').addUserOption(o => o.setName('usuario').setDescription('Quem?').setRequired(true)))
    .addSubcommand(sc => sc.setName('highfive').setDescription('Bate na mão').addUserOption(o => o.setName('usuario').setDescription('Quem?').setRequired(true)))
    .addSubcommand(sc => sc.setName('wave').setDescription('Acena').addUserOption(o => o.setName('usuario').setDescription('Quem?').setRequired(false)))
    .addSubcommand(sc => sc.setName('stare').setDescription('Encarar').addUserOption(o => o.setName('usuario').setDescription('Quem?').setRequired(false)))
    // Ações sem alvo
    .addSubcommand(sc => sc.setName('dance').setDescription('Kaori dança'))
    .addSubcommand(sc => sc.setName('wink').setDescription('Kaori pisca'))
    .addSubcommand(sc => sc.setName('blush').setDescription('Kaori fica vermelha'))
    .addSubcommand(sc => sc.setName('cry').setDescription('Kaori chora'))
    .addSubcommand(sc => sc.setName('angry').setDescription('Kaori fica brava'))
    .addSubcommand(sc => sc.setName('sleep').setDescription('Kaori dorme'))
    .addSubcommand(sc => sc.setName('run').setDescription('Kaori corre'));

export const KAORI_ACTIONS = {
    hug: {
        categoria: 'hug',
        precisaAlvo: true,
        frases: [
            '{autor} abraçou {alvo}.\n"Hm... vocês são fofos demais. Que irritante."',
            '{autor} deu um abraço apertado em {alvo}.\n"Não fiquem se apegando, ok?"',
            '{autor} abraçou {alvo}.\n"Tá... só dessa vez."'
        ]
    },
    pat: {
        categoria: 'pat',
        precisaAlvo: true,
        frases: [
            '{autor} fez carinho em {alvo}.\n"Patético... mas um pouco fofo."',
            '{autor} acariciou a cabeça de {alvo}.\n"Não se acostume."'
        ]
    },
    kiss: {
        categoria: 'kiss',
        precisaAlvo: true,
        frases: [
            '{autor} beijou {alvo}.\n"Ousado... muito ousado."',
            '{autor} deu um beijo em {alvo}.\n"Eu não vi nada. Absolutamente nada."'
        ]
    },
    cuddle: {
        categoria: 'cuddle',
        precisaAlvo: true,
        frases: [
            '{autor} se aconcheou em {alvo}.\n"Vocês estão demorando demais juntos..."',
            '{autor} ficou juntinho de {alvo}.\n"Hm. Aceitável."'
        ]
    },
    poke: {
        categoria: 'poke',
        precisaAlvo: true,
        frases: [
            '{autor} cutucou {alvo}.\n"Irritante."',
            '{autor} cutucou {alvo} várias vezes.\n"Para com isso."'
        ]
    },
    slap: {
        categoria: 'slap',
        precisaAlvo: true,
        frases: [
            '{autor} deu um tapa em {alvo}.\n"Merecido."',
            '{autor} estapeou {alvo}.\n"Hah. Bom."'
        ]
    },
    bonk: {
        categoria: 'bonk',
        precisaAlvo: true,
        frases: [
            '{autor} aplicou um BONK em {alvo}.\n"Volta pro canto."',
            '{autor} deu um bonk em {alvo}.\n"Horny jail."'
        ]
    },
    bite: {
        categoria: 'bite',
        precisaAlvo: true,
        frases: [
            '{autor} mordeu {alvo}.\n"Ai. Que selvagem."',
            '{autor} deu uma mordida em {alvo}.\n"Não façam isso na minha frente."'
        ]
    },
    tickle: {
        categoria: 'tickle',
        precisaAlvo: true,
        frases: [
            '{autor} fez cócegas em {alvo}.\n"Parece que alguém está se divertindo demais."'
        ]
    },
    highfive: {
        categoria: 'highfive',
        precisaAlvo: true,
        frases: [
            '{autor} bateu na mão de {alvo}.\n"Ok. Trabalhinho em equipe."'
        ]
    },
    wave: {
        categoria: 'wave',
        precisaAlvo: false,
        frases: [
            '{autor} acenou.\n"Oi... eu acho."',
            '{autor} deu um tchauzinho.\n"Até."'
        ]
    },
    stare: {
        categoria: 'stare',
        precisaAlvo: false,
        frases: [
            '{autor} ficou encarando.\n"O que você está olhando?"',
            '{autor} fixou o olhar.\n"..."'
        ]
    },
    dance: {
        categoria: 'dance',
        precisaAlvo: false,
        frases: [
            '{autor} começou a dançar.\n"Não diga que eu tenho talento."',
            'Kaori dançou um pouco.\n"Só porque eu quis."'
        ]
    },
    wink: {
        categoria: 'wink',
        precisaAlvo: false,
        frases: [
            'Kaori piscou.\n"Não fique imaginando coisas."'
        ]
    },
    blush: {
        categoria: 'blush',
        precisaAlvo: false,
        frases: [
            'Kaori ficou vermelha.\n"E-eu não estou com vergonha!"',
            'Kaori ficou com as bochechas rosadas.\n"Cale a boca."'
        ]
    },
    cry: {
        categoria: 'cry',
        precisaAlvo: false,
        frases: [
            'Kaori começou a chorar.\n"Não é o que parece..."'
        ]
    },
    angry: {
        categoria: 'angry',
        precisaAlvo: false,
        frases: [
            'Kaori ficou brava.\n"Vocês estão me testando."'
        ]
    },
    sleep: {
        categoria: 'sleep',
        precisaAlvo: false,
        frases: [
            'Kaori dormiu.\n"Não me acordem."'
        ]
    },
    run: {
        categoria: 'run',
        precisaAlvo: false,
        frases: [
            'Kaori saiu correndo.\n"Não me sigam!"'
        ]
    }
};

export function criarEmbedAcao(autor, alvo, frase, gifUrl) {
    const embed = new EmbedBuilder()
        .setColor(0xff4d6d)
        .setDescription(frase)
        .setImage(gifUrl)
        .setFooter({ text: 'Kaori • zero Gemini' });

    return embed;
}