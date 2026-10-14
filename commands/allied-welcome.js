import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder
} from 'discord.js';
import {
    getWelcomeConfig,
    updateWelcomeConfig,
    sendWelcomePreview,
    WELCOME_DEFAULTS,
    CARMINE
} from '../systems/alliedWelcomer.js';
import { setWelcomeArt, clearWelcomeArt } from '../systems/alliedDb.js';
import {
    validateArtAttachment,
    fetchArtBuffer,
    VISUAL_MODELS,
    buildWelcomeAttachment,
    MAX_ART_BYTES
} from '../systems/alliedWelcomeCard.js';

function assertAdmin(interaction) {
    return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

export const alliedWelcomeCommand = new SlashCommandBuilder()
    .setName('allied-welcome')
    .setDescription('Allied Welcomer 2.0 — arte, cartão e configurações')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sc) =>
        sc.setName('painel').setDescription('Resumo visual da configuração atual')
    )
    .addSubcommand((sc) =>
        sc
            .setName('ativar')
            .setDescription('Liga ou desliga o Welcomer')
            .addBooleanOption((o) =>
                o.setName('ligado').setDescription('true = ativo').setRequired(true)
            )
    )
    .addSubcommand((sc) =>
        sc
            .setName('canal')
            .setDescription('Canal de boas-vindas')
            .addChannelOption((o) =>
                o
                    .setName('canal')
                    .setDescription('Canal de texto')
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(true)
            )
    )
    .addSubcommand((sc) =>
        sc
            .setName('arte')
            .setDescription('Importa, troca ou remove a arte de fundo do cartão')
            .addAttachmentOption((o) =>
                o.setName('imagem').setDescription('PNG, JPEG ou WebP (máx. ~2.5 MB)')
            )
            .addBooleanOption((o) =>
                o.setName('remover').setDescription('Remove a arte personalizada')
            )
            .addBooleanOption((o) =>
                o.setName('usar').setDescription('Ativa/desativa uso da arte salva')
            )
    )
    .addSubcommand((sc) =>
        sc
            .setName('modelo')
            .setDescription('Modelo visual do cartão')
            .addStringOption((o) =>
                o
                    .setName('estilo')
                    .setDescription('Identidade do cartão')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Cinematográfico', value: 'cinematic' },
                        { name: 'Minimalista', value: 'minimal' },
                        { name: 'Decorativo', value: 'decorative' }
                    )
            )
    )
    .addSubcommand((sc) =>
        sc
            .setName('cartao')
            .setDescription('Textos e elementos do cartão gerado')
            .addStringOption((o) => o.setName('titulo').setDescription('Ex: Bem-vindo(a)'))
            .addStringOption((o) => o.setName('subtitulo').setDescription('Linha secundária'))
            .addStringOption((o) => o.setName('marca').setDescription('Texto da marca (ALLIED)'))
            .addBooleanOption((o) => o.setName('avatar').setDescription('Mostrar avatar'))
            .addBooleanOption((o) => o.setName('nome').setDescription('Mostrar nome'))
            .addBooleanOption((o) => o.setName('marca_visivel').setDescription('Mostrar marca'))
            .addBooleanOption((o) => o.setName('membros').setDescription('Mostrar contagem'))
            .addIntegerOption((o) =>
                o.setName('tamanho_avatar').setDescription('64–200').setMinValue(64).setMaxValue(200)
            )
            .addNumberOption((o) =>
                o
                    .setName('overlay')
                    .setDescription('Escurecimento 0–0.85')
                    .setMinValue(0)
                    .setMaxValue(0.85)
            )
            .addStringOption((o) =>
                o
                    .setName('encaixe')
                    .setDescription('Como a arte preenche o cartão')
                    .addChoices(
                        { name: 'Cobrir (cover)', value: 'cover' },
                        { name: 'Conter (contain)', value: 'contain' }
                    )
            )
            .addBooleanOption((o) =>
                o.setName('gerar_imagem').setDescription('Usar cartão gerado (false = só embed)')
            )
    )
    .addSubcommand((sc) =>
        sc
            .setName('mensagem')
            .setDescription('Texto acima do cartão / embed')
            .addStringOption((o) =>
                o
                    .setName('conteudo')
                    .setDescription('Use {user} {server} {memberCount} {rulesChannel}…')
                    .setMaxLength(500)
            )
            .addStringOption((o) =>
                o.setName('descricao').setDescription('Texto do embed auxiliar').setMaxLength(1000)
            )
            .addStringOption((o) => o.setName('cor').setDescription('Hex #8B1A1A'))
    )
    .addSubcommand((sc) =>
        sc
            .setName('canais-cta')
            .setDescription('Canais citados nas variáveis e dicas')
            .addChannelOption((o) =>
                o
                    .setName('regras')
                    .setDescription('{rulesChannel}')
                    .addChannelTypes(ChannelType.GuildText)
            )
            .addChannelOption((o) =>
                o
                    .setName('apresentacao')
                    .setDescription('{introductionsChannel}')
                    .addChannelTypes(ChannelType.GuildText)
            )
    )
    .addSubcommand((sc) =>
        sc
            .setName('botoes')
            .setDescription('Botões de link (JSON)')
            .addStringOption((o) =>
                o
                    .setName('json')
                    .setDescription('[{"label":"Regras","url":"https://..."}]')
                    .setRequired(true)
            )
    )
    .addSubcommand((sc) =>
        sc
            .setName('dm')
            .setDescription('Mensagem privada')
            .addBooleanOption((o) =>
                o.setName('ligado').setDescription('Ativar DM').setRequired(true)
            )
            .addStringOption((o) => o.setName('titulo').setDescription('Título'))
            .addStringOption((o) =>
                o.setName('descricao').setDescription('Corpo').setMaxLength(2000)
            )
    )
    .addSubcommand((sc) =>
        sc
            .setName('preview')
            .setDescription('Gera cartão de teste (não altera stats)')
            .addUserOption((o) =>
                o.setName('membro').setDescription('Usar avatar/nome deste membro')
            )
            .addStringOption((o) =>
                o
                    .setName('alvo')
                    .setDescription('Onde mostrar')
                    .addChoices(
                        { name: 'Só para mim (efêmero)', value: 'ephemeral' },
                        { name: 'Canal atual', value: 'channel' }
                    )
            )
    )
    .addSubcommand((sc) =>
        sc.setName('reset').setDescription('Restaura textos e modelo padrão (mantém canal e arte)')
    )
    .addSubcommand((sc) =>
        sc.setName('status').setDescription('Status resumido')
    );

function parseButtons(raw) {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error('JSON deve ser um array');
    return data
        .slice(0, 5)
        .map((b) => ({
            label: String(b.label || '').slice(0, 80),
            url: String(b.url || '')
        }))
        .filter((b) => b.label && /^https?:\/\//i.test(b.url));
}

export async function executeAlliedWelcome(interaction) {
    if (!interaction.guildId) {
        return interaction.reply({ content: 'Só em servidores.', ephemeral: true });
    }
    if (!assertAdmin(interaction)) {
        return interaction.reply({
            content: 'Você precisa de **Gerenciar Servidor**.',
            ephemeral: true
        });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'status' || sub === 'painel') {
        const c = await getWelcomeConfig(interaction.guildId);
        const model = VISUAL_MODELS[c.visual_model] || VISUAL_MODELS.cinematic;
        const embed = new EmbedBuilder()
            .setColor(CARMINE)
            .setTitle('Allied Welcomer 2.0')
            .setDescription(c.enabled ? '🟢 **Ativo**' : '⚪ **Desativado**')
            .addFields(
                {
                    name: 'Canal',
                    value: c.channel_id ? `<#${c.channel_id}>` : '_não definido_',
                    inline: true
                },
                {
                    name: 'Cartão gerado',
                    value: c.use_generated_card !== false ? 'Sim' : 'Não (só embed)',
                    inline: true
                },
                {
                    name: 'Arte',
                    value: c.has_art
                        ? c.art_enabled
                            ? 'Importada · em uso'
                            : 'Importada · desligada'
                        : 'Padrão (gradiente Allied)',
                    inline: true
                },
                { name: 'Modelo', value: `**${model.label}**\n${model.description}`, inline: false },
                {
                    name: 'Mensagem',
                    value: `\`${(c.message_content || '').slice(0, 120)}\``,
                    inline: false
                },
                {
                    name: 'Variáveis',
                    value: '`{user}` `{username}` `{server}` `{memberCount}` `{rulesChannel}` `{introductionsChannel}` `{inviter}` `{invitecode}`'
                }
            )
            .setFooter({ text: 'Use /allied-welcome preview para ver o cartão' })
            .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'ativar') {
        const on = interaction.options.getBoolean('ligado', true);
        await updateWelcomeConfig(interaction.guildId, { enabled: on });
        return interaction.reply({
            content: on ? 'Welcomer **ativado**.' : 'Welcomer **desativado**.',
            ephemeral: true
        });
    }

    if (sub === 'canal') {
        const ch = interaction.options.getChannel('canal', true);
        await updateWelcomeConfig(interaction.guildId, { channel_id: ch.id });
        return interaction.reply({ content: `Canal: ${ch}`, ephemeral: true });
    }

    if (sub === 'arte') {
        const remover = interaction.options.getBoolean('remover');
        const usar = interaction.options.getBoolean('usar');
        const img = interaction.options.getAttachment('imagem');

        if (remover) {
            await clearWelcomeArt(interaction.guildId);
            return interaction.reply({
                content: 'Arte personalizada removida. Voltando ao fundo padrão.',
                ephemeral: true
            });
        }

        if (usar != null && !img) {
            await updateWelcomeConfig(interaction.guildId, { art_enabled: usar });
            return interaction.reply({
                content: usar ? 'Arte personalizada **ativada**.' : 'Arte personalizada **desativada** (fundo padrão).',
                ephemeral: true
            });
        }

        if (!img) {
            return interaction.reply({
                content: 'Envie `imagem` como anexo, ou use `remover:True` / `usar:True|False`.',
                ephemeral: true
            });
        }

        const check = validateArtAttachment(img);
        if (!check.ok) {
            return interaction.reply({ content: check.msg, ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });
        try {
            const buf = await fetchArtBuffer(img);
            await setWelcomeArt(interaction.guildId, buf, img.contentType || 'image/png');
            // Prévia rápida
            const config = await getWelcomeConfig(interaction.guildId);
            const file = await buildWelcomeAttachment({
                config,
                displayName: interaction.member.displayName,
                username: interaction.user.username,
                avatarUrl: interaction.user.displayAvatarURL({ extension: 'png', size: 256 }),
                memberCount: interaction.guild.memberCount,
                serverName: interaction.guild.name
            });
            return interaction.editReply({
                content: `Arte salva (**${(buf.length / 1024).toFixed(0)} KB**). Prévia com o modelo atual:`,
                files: [file]
            });
        } catch (e) {
            console.error('arte import:', e);
            return interaction.editReply({
                content: `Não foi possível processar a imagem: ${e.message}`
            });
        }
    }

    if (sub === 'modelo') {
        const estilo = interaction.options.getString('estilo', true);
        await updateWelcomeConfig(interaction.guildId, { visual_model: estilo });
        const m = VISUAL_MODELS[estilo];
        return interaction.reply({
            content: `Modelo: **${m.label}** — ${m.description}`,
            ephemeral: true
        });
    }

    if (sub === 'cartao') {
        const patch = {};
        const titulo = interaction.options.getString('titulo');
        const subtitulo = interaction.options.getString('subtitulo');
        const marca = interaction.options.getString('marca');
        const avatar = interaction.options.getBoolean('avatar');
        const nome = interaction.options.getBoolean('nome');
        const marcaV = interaction.options.getBoolean('marca_visivel');
        const membros = interaction.options.getBoolean('membros');
        const tam = interaction.options.getInteger('tamanho_avatar');
        const overlay = interaction.options.getNumber('overlay');
        const encaixe = interaction.options.getString('encaixe');
        const gerar = interaction.options.getBoolean('gerar_imagem');
        if (titulo != null) patch.card_title = titulo;
        if (subtitulo != null) patch.card_subtitle = subtitulo;
        if (marca != null) patch.brand_text = marca;
        if (avatar != null) patch.show_avatar = avatar;
        if (nome != null) patch.show_name = nome;
        if (marcaV != null) patch.show_brand = marcaV;
        if (membros != null) patch.show_membercount = membros;
        if (tam != null) patch.avatar_size = tam;
        if (overlay != null) patch.overlay_opacity = overlay;
        if (encaixe != null) patch.art_fit = encaixe;
        if (gerar != null) patch.use_generated_card = gerar;
        if (!Object.keys(patch).length) {
            return interaction.reply({
                content: 'Informe ao menos uma opção do cartão.',
                ephemeral: true
            });
        }
        await updateWelcomeConfig(interaction.guildId, patch);
        return interaction.reply({ content: 'Cartão atualizado. Use `/allied-welcome preview`.', ephemeral: true });
    }

    if (sub === 'mensagem') {
        const patch = {};
        const conteudo = interaction.options.getString('conteudo');
        const descricao = interaction.options.getString('descricao');
        const cor = interaction.options.getString('cor');
        if (conteudo != null) patch.message_content = conteudo;
        if (descricao != null) patch.description = descricao;
        if (cor != null) {
            if (!/^#?[0-9a-fA-F]{6}$/.test(cor.trim())) {
                return interaction.reply({ content: 'Cor hex inválida.', ephemeral: true });
            }
            patch.color = cor.startsWith('#') ? cor.toUpperCase() : `#${cor.toUpperCase()}`;
        }
        if (!Object.keys(patch).length) {
            return interaction.reply({ content: 'Nada para salvar.', ephemeral: true });
        }
        await updateWelcomeConfig(interaction.guildId, patch);
        return interaction.reply({ content: 'Mensagem atualizada.', ephemeral: true });
    }

    if (sub === 'canais-cta') {
        const patch = {};
        const r = interaction.options.getChannel('regras');
        const a = interaction.options.getChannel('apresentacao');
        if (r) patch.rules_channel_id = r.id;
        if (a) patch.intro_channel_id = a.id;
        if (!Object.keys(patch).length) {
            return interaction.reply({ content: 'Informe um canal.', ephemeral: true });
        }
        await updateWelcomeConfig(interaction.guildId, patch);
        return interaction.reply({ content: 'Canais de CTA salvos.', ephemeral: true });
    }

    if (sub === 'botoes') {
        try {
            const buttons = parseButtons(interaction.options.getString('json', true));
            await updateWelcomeConfig(interaction.guildId, {
                buttons,
                cta_buttons: buttons
            });
            return interaction.reply({
                content: `${buttons.length} botão(ões) de link salvos.`,
                ephemeral: true
            });
        } catch (e) {
            return interaction.reply({ content: `JSON inválido: ${e.message}`, ephemeral: true });
        }
    }

    if (sub === 'dm') {
        const patch = { dm_enabled: interaction.options.getBoolean('ligado', true) };
        const t = interaction.options.getString('titulo');
        const d = interaction.options.getString('descricao');
        if (t) patch.dm_title = t;
        if (d) patch.dm_description = d;
        await updateWelcomeConfig(interaction.guildId, patch);
        return interaction.reply({
            content: `DM ${patch.dm_enabled ? 'ligada' : 'desligada'}.`,
            ephemeral: true
        });
    }

    if (sub === 'preview') {
        await interaction.deferReply({
            ephemeral: (interaction.options.getString('alvo') || 'ephemeral') === 'ephemeral'
        });
        const targetUser = interaction.options.getUser('membro') || interaction.user;
        let member = interaction.member;
        if (targetUser.id !== interaction.user.id) {
            member =
                (await interaction.guild.members.fetch(targetUser.id).catch(() => null)) ||
                interaction.member;
        }
        const config = await getWelcomeConfig(interaction.guildId);
        try {
            const { buildWelcomePayload } = await import('../systems/alliedWelcomer.js');
            const payload = await buildWelcomePayload(
                member,
                config,
                {
                    inviter_id: interaction.user.id,
                    invite_code: 'preview',
                    inviter_joins: 0,
                    attribution: 'confirmed'
                },
                { preview: true }
            );
            return interaction.editReply({
                content: payload.content,
                embeds: payload.embeds,
                files: payload.files,
                components: payload.components
            });
        } catch (e) {
            console.error('preview:', e);
            return interaction.editReply({ content: `Falha na prévia: ${e.message}` });
        }
    }

    if (sub === 'reset') {
        const cur = await getWelcomeConfig(interaction.guildId);
        await updateWelcomeConfig(interaction.guildId, {
            ...WELCOME_DEFAULTS,
            channel_id: cur.channel_id,
            enabled: cur.enabled,
            // não limpa arte automaticamente
            art_enabled: cur.art_enabled,
            rules_channel_id: cur.rules_channel_id,
            intro_channel_id: cur.intro_channel_id
        });
        return interaction.reply({
            content: 'Textos e modelo restaurados (canal e arte preservados).',
            ephemeral: true
        });
    }

    return interaction.reply({ content: 'Subcomando desconhecido.', ephemeral: true });
}
