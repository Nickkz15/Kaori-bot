import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder
} from 'discord.js';
import {
    getWelcomeConfig,
    updateWelcomeConfig,
    sendWelcomePreview,
    WELCOME_DEFAULTS,
    CARMINE
} from '../systems/alliedWelcomer.js';

export const alliedWelcomeCommand = new SlashCommandBuilder()
    .setName('allied-welcome')
    .setDescription('Configura o sistema de boas-vindas Allied')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sc) =>
        sc
            .setName('status')
            .setDescription('Mostra a configuração atual do Welcomer')
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
            .setDescription('Define o canal de boas-vindas')
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
            .setName('mensagem')
            .setDescription('Define título e descrição do embed público')
            .addStringOption((o) =>
                o.setName('titulo').setDescription('Título').setRequired(false).setMaxLength(256)
            )
            .addStringOption((o) =>
                o
                    .setName('descricao')
                    .setDescription('Descrição (use {user}, {server}, {membercount}...)')
                    .setRequired(false)
                    .setMaxLength(2000)
            )
    )
    .addSubcommand((sc) =>
        sc
            .setName('cor')
            .setDescription('Cor hexadecimal do embed')
            .addStringOption((o) =>
                o.setName('hex').setDescription('Ex: #8B1A1A').setRequired(true)
            )
    )
    .addSubcommand((sc) =>
        sc
            .setName('imagem')
            .setDescription('Imagem principal ou thumbnail fixa')
            .addStringOption((o) =>
                o
                    .setName('tipo')
                    .setDescription('Qual imagem')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Banner (image)', value: 'image' },
                        { name: 'Thumbnail URL fixa', value: 'thumbnail' },
                        { name: 'Thumbnail = avatar do membro', value: 'avatar' }
                    )
            )
            .addStringOption((o) =>
                o.setName('url').setDescription('URL https (omitir para limpar)').setRequired(false)
            )
    )
    .addSubcommand((sc) =>
        sc
            .setName('dm')
            .setDescription('Configura a mensagem privada de boas-vindas')
            .addBooleanOption((o) =>
                o.setName('ligado').setDescription('Ativar DM').setRequired(true)
            )
            .addStringOption((o) =>
                o.setName('titulo').setDescription('Título da DM').setRequired(false)
            )
            .addStringOption((o) =>
                o.setName('descricao').setDescription('Texto da DM').setRequired(false).setMaxLength(2000)
            )
    )
    .addSubcommand((sc) =>
        sc
            .setName('botoes')
            .setDescription('Define até 3 botões de link no embed público (JSON)')
            .addStringOption((o) =>
                o
                    .setName('json')
                    .setDescription('Ex: [{"label":"Regras","url":"https://..."}]')
                    .setRequired(true)
            )
    )
    .addSubcommand((sc) =>
        sc
            .setName('dm-botoes')
            .setDescription('Botões de link da DM (JSON)')
            .addStringOption((o) =>
                o.setName('json').setDescription('Array JSON de {label,url}').setRequired(true)
            )
    )
    .addSubcommand((sc) =>
        sc
            .setName('opcoes')
            .setDescription('Liga/desliga partes do embed')
            .addBooleanOption((o) => o.setName('mencao').setDescription('Mencionar o membro'))
            .addBooleanOption((o) => o.setName('conta').setDescription('Mostrar data da conta'))
            .addBooleanOption((o) => o.setName('membros').setDescription('Mostrar contagem'))
            .addBooleanOption((o) => o.setName('convite').setDescription('Mostrar dados do convite'))
            .addBooleanOption((o) => o.setName('timestamp').setDescription('Mostrar horário'))
    )
    .addSubcommand((sc) =>
        sc
            .setName('preview')
            .setDescription('Prévia sem alterar estatísticas')
            .addStringOption((o) =>
                o
                    .setName('alvo')
                    .setDescription('Onde enviar')
                    .addChoices(
                        { name: 'Aqui (efêmero)', value: 'channel' },
                        { name: 'Minha DM', value: 'dm' }
                    )
            )
    )
    .addSubcommand((sc) =>
        sc.setName('reset').setDescription('Restaura textos padrão Allied (mantém canal)')
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
        .filter((b) => b.label && b.url.startsWith('http'));
}

export async function executeAlliedWelcome(interaction) {
    if (!interaction.guildId) {
        return interaction.reply({ content: 'Só em servidores.', ephemeral: true });
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
            content: 'Você precisa da permissão **Gerenciar Servidor**.',
            ephemeral: true
        });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'status') {
        const c = await getWelcomeConfig(interaction.guildId);
        const embed = new EmbedBuilder()
            .setColor(CARMINE)
            .setTitle('Allied Welcomer')
            .setDescription(c.enabled ? '🟢 **Ativo**' : '⚪ **Desativado**')
            .addFields(
                {
                    name: 'Canal',
                    value: c.channel_id ? `<#${c.channel_id}>` : '_não definido_',
                    inline: true
                },
                {
                    name: 'DM',
                    value: c.dm_enabled ? '🟢 ligada' : '⚪ desligada',
                    inline: true
                },
                { name: 'Título', value: c.title || '—', inline: false },
                {
                    name: 'Variáveis',
                    value: '`{user}` `{username}` `{server}` `{membercount}` `{createdat}` `{joinedat}` `{inviter}` `{invitecode}` `{invites}`'
                }
            )
            .setFooter({ text: 'Allied · configuração por servidor' })
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
        return interaction.reply({
            content: `Canal de boas-vindas: ${ch}`,
            ephemeral: true
        });
    }

    if (sub === 'mensagem') {
        const patch = {};
        const titulo = interaction.options.getString('titulo');
        const descricao = interaction.options.getString('descricao');
        if (titulo != null) patch.title = titulo;
        if (descricao != null) patch.description = descricao;
        if (!Object.keys(patch).length) {
            return interaction.reply({
                content: 'Informe `titulo` e/ou `descricao`.',
                ephemeral: true
            });
        }
        await updateWelcomeConfig(interaction.guildId, patch);
        return interaction.reply({ content: 'Mensagem pública atualizada.', ephemeral: true });
    }

    if (sub === 'cor') {
        const hex = interaction.options.getString('hex', true).trim();
        if (!/^#?[0-9a-fA-F]{6}$/.test(hex)) {
            return interaction.reply({ content: 'Hex inválido. Ex: `#8B1A1A`', ephemeral: true });
        }
        const normalized = hex.startsWith('#') ? hex.toUpperCase() : `#${hex.toUpperCase()}`;
        await updateWelcomeConfig(interaction.guildId, { color: normalized });
        return interaction.reply({ content: `Cor: \`${normalized}\``, ephemeral: true });
    }

    if (sub === 'imagem') {
        const tipo = interaction.options.getString('tipo', true);
        const url = interaction.options.getString('url');
        if (tipo === 'avatar') {
            await updateWelcomeConfig(interaction.guildId, {
                thumbnail_mode: 'avatar',
                thumbnail_url: null
            });
            return interaction.reply({
                content: 'Thumbnail = avatar do novo membro.',
                ephemeral: true
            });
        }
        if (tipo === 'thumbnail') {
            await updateWelcomeConfig(interaction.guildId, {
                thumbnail_mode: 'url',
                thumbnail_url: url || null
            });
            return interaction.reply({
                content: url ? 'Thumbnail fixa definida.' : 'Thumbnail limpa.',
                ephemeral: true
            });
        }
        await updateWelcomeConfig(interaction.guildId, { image_url: url || null });
        return interaction.reply({
            content: url ? 'Banner definido.' : 'Banner removido.',
            ephemeral: true
        });
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

    if (sub === 'botoes' || sub === 'dm-botoes') {
        try {
            const buttons = parseButtons(interaction.options.getString('json', true));
            if (sub === 'botoes') {
                await updateWelcomeConfig(interaction.guildId, { buttons });
            } else {
                await updateWelcomeConfig(interaction.guildId, { dm_buttons: buttons });
            }
            return interaction.reply({
                content: `${buttons.length} botão(ões) salvos.`,
                ephemeral: true
            });
        } catch (e) {
            return interaction.reply({
                content: `JSON inválido: ${e.message}`,
                ephemeral: true
            });
        }
    }

    if (sub === 'opcoes') {
        const patch = {};
        const mencao = interaction.options.getBoolean('mencao');
        const conta = interaction.options.getBoolean('conta');
        const membros = interaction.options.getBoolean('membros');
        const convite = interaction.options.getBoolean('convite');
        const timestamp = interaction.options.getBoolean('timestamp');
        if (mencao != null) patch.mention_user = mencao;
        if (conta != null) patch.show_createdat = conta;
        if (membros != null) patch.show_membercount = membros;
        if (convite != null) patch.show_invite = convite;
        if (timestamp != null) patch.show_timestamp = timestamp;
        if (!Object.keys(patch).length) {
            return interaction.reply({ content: 'Nenhuma opção enviada.', ephemeral: true });
        }
        await updateWelcomeConfig(interaction.guildId, patch);
        return interaction.reply({ content: 'Opções atualizadas.', ephemeral: true });
    }

    if (sub === 'preview') {
        const alvo = interaction.options.getString('alvo') || 'channel';
        const result = await sendWelcomePreview(interaction, alvo);
        if (alvo === 'dm') {
            return interaction.reply({ content: result.msg, ephemeral: true });
        }
        if (!result.ok) {
            return interaction.reply({ content: result.msg, ephemeral: true });
        }
        return interaction.reply(result.payload);
    }

    if (sub === 'reset') {
        const cur = await getWelcomeConfig(interaction.guildId);
        await updateWelcomeConfig(interaction.guildId, {
            ...WELCOME_DEFAULTS,
            channel_id: cur.channel_id,
            enabled: cur.enabled
        });
        return interaction.reply({
            content: 'Textos restaurados ao padrão Allied (canal preservado).',
            ephemeral: true
        });
    }

    return interaction.reply({ content: 'Subcomando desconhecido.', ephemeral: true });
}
