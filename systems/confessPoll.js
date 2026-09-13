import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import {
    getConfessConfig,
    isConfessBanned,
    createPoll,
    getPoll,
    updatePollMessage,
    castPollVote,
    getPollCounts
} from './confessDb.js';

export async function createAnonymousPoll({ guild, user, question, options }) {
    const guildId = guild.id;
    const config = await getConfessConfig(guildId);

    if (!config.polls_enabled) {
        return { ok: false, msg: '❌ O sistema de enquetes está desativado.' };
    }
    if (await isConfessBanned(guildId, user.id)) {
        return { ok: false, msg: '❌ Você não pode criar enquetes neste servidor.' };
    }

    const q = String(question || '').trim().slice(0, 256);
    if (q.length < 3) {
        return { ok: false, msg: '❌ A pergunta precisa ter pelo menos 3 caracteres.' };
    }

    let opts = options;
    if (typeof options === 'string') {
        opts = options.split(/[;|]/).map(s => s.trim()).filter(Boolean);
    }
    if (!Array.isArray(opts) || opts.length < 2 || opts.length > 5) {
        return { ok: false, msg: '❌ Informe de 2 a 5 opções, separadas por ponto e vírgula (;)' };
    }
    opts = opts.map(o => String(o).slice(0, 80));

    const channelId = config.poll_channel_id || config.confession_channel_id;
    if (!channelId) {
        return { ok: false, msg: '❌ Configure o canal de confissões ou de enquetes primeiro.' };
    }

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) {
        return { ok: false, msg: '❌ Canal de enquetes inacessível.' };
    }

    const poll = await createPoll({
        guild_id: guildId,
        creator_id: user.id,
        question: q,
        options: opts,
        channel_id: channel.id
    });

    const { embed, components } = buildPollMessage(poll.id, q, opts, opts.map(() => 0), config);

    let msg;
    try {
        msg = await channel.send({
            embeds: [embed],
            components,
            allowedMentions: { parse: [] }
        });
    } catch (e) {
        console.error('Poll publish failed:', e.message);
        return { ok: false, msg: '❌ Não foi possível publicar a enquete.' };
    }

    await updatePollMessage(poll.id, msg.id, channel.id);

    if (config.logs_channel_id) {
        try {
            const logCh = await guild.channels.fetch(config.logs_channel_id).catch(() => null);
            if (logCh?.isTextBased()) {
                await logCh.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x5865F2)
                            .setTitle('Poll Log')
                            .setDescription(
                                `**Pergunta:** ${q}\n**Opções:** ${opts.join(' | ')}\n` +
                                `**Criador:** ${user} (\`${user.id}\`)\n**Mensagem:** ${msg.url}`
                            )
                            .setTimestamp()
                    ],
                    allowedMentions: { parse: [] }
                });
            }
        } catch (e) {
            console.error('Poll log failed:', e.message);
        }
    }

    return { ok: true, msg: '✨ Enquete anônima no ar!', url: msg.url };
}

export function buildPollMessage(pollId, question, options, counts, config) {
    const total = counts.reduce((a, b) => a + b, 0);
    const lines = options.map((opt, i) => {
        const c = counts[i] || 0;
        const pct = total ? Math.round((c / total) * 100) : 0;
        const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
        return `**${i + 1}.** ${opt}\n${bar} ${c} voto(s) (${pct}%)`;
    });

    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📊 Enquete anônima')
        .setDescription(`**${question}**\n\n${lines.join('\n\n')}`)
        .setFooter({ text: `${total} voto(s) · votos anônimos` })
        .setTimestamp();

    const row = new ActionRowBuilder();
    options.forEach((opt, i) => {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`confess_poll_vote:${pollId}:${i}`)
                .setLabel(`${i + 1}`)
                .setStyle(ButtonStyle.Secondary)
        );
    });

    return { embed, components: [row] };
}

export async function handlePollVote(interaction, pollId, optionIndex) {
    const result = await castPollVote(pollId, interaction.user.id, optionIndex);
    if (!result.ok) {
        return interaction.reply({ content: result.msg, ephemeral: true });
    }

    const config = await getConfessConfig(interaction.guildId);
    const { embed, components } = buildPollMessage(
        pollId,
        result.question,
        result.options,
        result.counts,
        config
    );

    try {
        await interaction.update({ embeds: [embed], components });
    } catch {
        await interaction.reply({ content: '✅ Voto registrado.', ephemeral: true }).catch(() => {});
        if (interaction.message?.editable) {
            await interaction.message.edit({ embeds: [embed], components }).catch(() => {});
        }
    }
}


export function buildPollModal() {
    const modal = new ModalBuilder()
        .setCustomId('confess_poll_modal')
        .setTitle('📊 Nova enquete anônima');

    const pergunta = new TextInputBuilder()
        .setCustomId('poll_question')
        .setLabel('Pergunta')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: Qual deve ser o próximo evento?')
        .setRequired(true)
        .setMaxLength(256);

    const opcoes = new TextInputBuilder()
        .setCustomId('poll_options')
        .setLabel('Opções (separe com ; )')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Anime; Jogos; Música')
        .setRequired(true)
        .setMaxLength(500);

    modal.addComponents(
        new ActionRowBuilder().addComponents(pergunta),
        new ActionRowBuilder().addComponents(opcoes)
    );
    return modal;
}

export async function handlePollModal(interaction) {
    const question = interaction.fields.getTextInputValue('poll_question');
    const options = interaction.fields.getTextInputValue('poll_options');
    await interaction.deferReply({ ephemeral: true });
    const result = await createAnonymousPoll({
        guild: interaction.guild,
        user: interaction.user,
        question,
        options
    });
    if (!result.ok) {
        return interaction.editReply({ content: result.msg });
    }
    return interaction.editReply({ content: `${result.msg}\n${result.url || ''}` });
}
