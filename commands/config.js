import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder
} from 'discord.js';
import { getConfessConfig, updateConfessConfig } from '../systems/confessDb.js';
import { buildConfessButton } from '../systems/confess.js';

export const configCommand = new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configurações administrativas da Kaori (Confess)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sc =>
        sc.setName('confissao')
            .setDescription('Define o canal de confissões')
            .addChannelOption(o =>
                o.setName('canal')
                    .setDescription('Canal de confissões')
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(true)
            )
    )
    .addSubcommand(sc =>
        sc.setName('logs')
            .setDescription('Define o canal de logs do Confess')
            .addChannelOption(o =>
                o.setName('canal')
                    .setDescription('Canal de logs')
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(true)
            )
    )
    .addSubcommand(sc =>
        sc.setName('enquetes')
            .setDescription('Define o canal de enquetes (opcional)')
            .addChannelOption(o =>
                o.setName('canal')
                    .setDescription('Canal de enquetes')
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(true)
            )
    )
    .addSubcommand(sc =>
        sc.setName('toggle')
            .setDescription('Ativa/desativa módulos do Confess')
            .addStringOption(o =>
                o.setName('modulo')
                    .setDescription('Módulo')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Confissões', value: 'confession_enabled' },
                        { name: 'Anexos', value: 'attachments_enabled' },
                        { name: 'Enquetes', value: 'polls_enabled' },
                        { name: 'Botão de confissão', value: 'button_enabled' },
                        { name: 'Filtro de palavras', value: 'word_filter_enabled' },
                        { name: 'Cooldown', value: 'cooldown_enabled' }
                    )
            )
            .addStringOption(o =>
                o.setName('estado')
                    .setDescription('Ativar ou desativar')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Ativar', value: 'on' },
                        { name: 'Desativar', value: 'off' }
                    )
            )
    )
    .addSubcommand(sc =>
        sc.setName('cooldown')
            .setDescription('Define o cooldown de confissões (segundos)')
            .addIntegerOption(o =>
                o.setName('segundos')
                    .setDescription('Segundos entre confissões')
                    .setRequired(true)
                    .setMinValue(0)
                    .setMaxValue(86400)
            )
    )
    .addSubcommand(sc =>
        sc.setName('cor')
            .setDescription('Cor padrão das confissões')
            .addStringOption(o =>
                o.setName('valor')
                    .setDescription('Hex ou nome (ex: #5865F2)')
                    .setRequired(true)
            )
    )
    .addSubcommand(sc =>
        sc.setName('titulo')
            .setDescription('Título das embeds públicas')
            .addStringOption(o =>
                o.setName('texto').setDescription('Título').setRequired(true).setMaxLength(100)
            )
    )
    .addSubcommand(sc =>
        sc.setName('autor')
            .setDescription('Texto do autor anônimo (ex: Anonymous)')
            .addStringOption(o =>
                o.setName('texto').setDescription('Autor').setRequired(true).setMaxLength(80)
            )
    )
    .addSubcommand(sc =>
        sc.setName('filtro')
            .setDescription('Define palavras proibidas (separadas por vírgula)')
            .addStringOption(o =>
                o.setName('palavras')
                    .setDescription('Ex: palavra1,palavra2')
                    .setRequired(true)
            )
    )
    .addSubcommand(sc =>
        sc.setName('botao')
            .setDescription('Publica o botão de confissão no canal configurado')
    )
    .addSubcommand(sc =>
        sc.setName('ver')
            .setDescription('Mostra a configuração atual do Confess')
    );

function onOff(v) {
    return v ? '🟢 ligado' : '⚪ desligado';
}

export async function executeConfig(interaction) {
    if (!interaction.guildId) {
        return interaction.reply({ content: 'Só em servidores.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'confissao') {
        const canal = interaction.options.getChannel('canal', true);
        await updateConfessConfig(guildId, { confession_channel_id: canal.id });
        return interaction.reply({ content: `Canal de confissões: ${canal}`, ephemeral: true });
    }

    if (sub === 'logs') {
        const canal = interaction.options.getChannel('canal', true);
        await updateConfessConfig(guildId, { logs_channel_id: canal.id });
        return interaction.reply({ content: `Canal de logs do Confess: ${canal}`, ephemeral: true });
    }

    if (sub === 'enquetes') {
        const canal = interaction.options.getChannel('canal', true);
        await updateConfessConfig(guildId, { poll_channel_id: canal.id });
        return interaction.reply({ content: `Canal de enquetes: ${canal}`, ephemeral: true });
    }

    if (sub === 'toggle') {
        const modulo = interaction.options.getString('modulo', true);
        const estado = interaction.options.getString('estado', true) === 'on';
        await updateConfessConfig(guildId, { [modulo]: estado });
        return interaction.reply({
            content: `**${modulo}** → ${estado ? 'ativado' : 'desativado'}.`,
            ephemeral: true
        });
    }

    if (sub === 'cooldown') {
        const segundos = interaction.options.getInteger('segundos', true);
        await updateConfessConfig(guildId, {
            cooldown_seconds: segundos,
            cooldown_enabled: segundos > 0
        });
        return interaction.reply({ content: `Cooldown: **${segundos}s**.`, ephemeral: true });
    }

    if (sub === 'cor') {
        const { parseColor } = await import('../systems/confess.js');
        const valor = interaction.options.getString('valor', true);
        const parsed = parseColor(valor, null);
        if (!parsed) {
            return interaction.reply({ content: 'Cor inválida.', ephemeral: true });
        }
        await updateConfessConfig(guildId, { default_color: parsed });
        return interaction.reply({ content: `Cor padrão: **${parsed}**.`, ephemeral: true });
    }

    if (sub === 'titulo') {
        const texto = interaction.options.getString('texto', true);
        await updateConfessConfig(guildId, { confession_title: texto });
        return interaction.reply({ content: `Título: **${texto}**.`, ephemeral: true });
    }

    if (sub === 'autor') {
        const texto = interaction.options.getString('texto', true);
        await updateConfessConfig(guildId, { confession_author: texto });
        return interaction.reply({ content: `Autor anônimo: **${texto}**.`, ephemeral: true });
    }

    if (sub === 'filtro') {
        const raw = interaction.options.getString('palavras', true);
        const words = raw.split(',').map(s => s.trim()).filter(Boolean).slice(0, 50);
        await updateConfessConfig(guildId, {
            banned_words: words,
            word_filter_enabled: words.length > 0
        });
        return interaction.reply({
            content: words.length
                ? `Filtro atualizado (${words.length} palavra(s)).`
                : 'Filtro limpo.',
            ephemeral: true
        });
    }

    if (sub === 'botao') {
        const config = await getConfessConfig(guildId);
        if (!config.confession_channel_id) {
            return interaction.reply({
                content: 'Configure o canal de confissões antes (`/config confissao`).',
                ephemeral: true
            });
        }
        const channel = await interaction.guild.channels.fetch(config.confession_channel_id).catch(() => null);
        if (!channel?.isTextBased()) {
            return interaction.reply({ content: 'Canal de confissões inacessível.', ephemeral: true });
        }
        await updateConfessConfig(guildId, { button_enabled: true });
        await channel.send({
            content: '### 💬 Confissões anônimas\nNinguém vai ver quem enviou. Pode ser sincero.',
            components: [buildConfessButton(config)]
        });
        return interaction.reply({ content: `Botão publicado em ${channel}.`, ephemeral: true });
    }

    // ver
    const c = await getConfessConfig(guildId);
    const ch = (id) => (id ? `<#${id}>` : '_não configurado_');
    const embed = new EmbedBuilder()
        .setColor(0xEB459E)
        .setAuthor({ name: 'Kaori · Confess' })
        .setTitle('⚙️ Configuração do servidor')
        .setDescription('Tudo salvo automaticamente. Use os atalhos abaixo para ajustar.')
        .addFields(
            {
                name: '📌 Canais',
                value:
                    `💬 Confissões — ${ch(c.confession_channel_id)}\n` +
                    `📋 Logs — ${ch(c.logs_channel_id)}\n` +
                    `📊 Enquetes — ${ch(c.poll_channel_id)}`,
                inline: false
            },
            {
                name: '🛡️ Moderação',
                value:
                    `Confissões ${onOff(c.confession_enabled)}\n` +
                    `Imagens ${onOff(c.attachments_enabled)}\n` +
                    `Enquetes ${onOff(c.polls_enabled)}\n` +
                    `Filtro de palavras ${onOff(c.word_filter_enabled)}\n` +
                    `Cooldown ${onOff(c.cooldown_enabled)} · **${c.cooldown_seconds}s**\n` +
                    `Botão no canal ${onOff(c.button_enabled)}`,
                inline: true
            },
            {
                name: '✨ Visual',
                value:
                    `Título · **${c.confession_title}**\n` +
                    `Autor · **${c.confession_author}**\n` +
                    `Cor · \`${c.default_color}\``,
                inline: true
            }
        )
        .setFooter({ text: 'Dica: /config confissao  ·  /config logs  ·  /config botao' })
        .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
}
