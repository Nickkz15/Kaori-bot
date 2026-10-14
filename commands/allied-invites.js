import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder
} from 'discord.js';
import {
    getInviteConfig,
    updateInviteConfig,
    getInviterStats,
    getInviteRanking,
    getGuildInviteTotals,
    getMemberJoinHistory,
    syncInvites,
    CARMINE
} from '../systems/alliedInviteLogger.js';

export const alliedInvitesCommand = new SlashCommandBuilder()
    .setName('allied-invites')
    .setDescription('InviteLogger Allied — convites, ranking e logs')
    .addSubcommand((sc) =>
        sc.setName('status').setDescription('Configuração e diagnóstico do InviteLogger')
    )
    .addSubcommand((sc) =>
        sc
            .setName('ativar')
            .setDescription('Liga ou desliga o InviteLogger')
            .addBooleanOption((o) =>
                o.setName('ligado').setDescription('true = ativo').setRequired(true)
            )
    )
    .addSubcommand((sc) =>
        sc
            .setName('canais')
            .setDescription('Define canais de log')
            .addChannelOption((o) =>
                o
                    .setName('entradas')
                    .setDescription('Log de entradas')
                    .addChannelTypes(ChannelType.GuildText)
            )
            .addChannelOption((o) =>
                o
                    .setName('saidas')
                    .setDescription('Log de saídas')
                    .addChannelTypes(ChannelType.GuildText)
            )
            .addChannelOption((o) =>
                o
                    .setName('convites')
                    .setDescription('Criação/exclusão de convites')
                    .addChannelTypes(ChannelType.GuildText)
            )
    )
    .addSubcommand((sc) =>
        sc
            .setName('logs')
            .setDescription('Liga/desliga tipos de log')
            .addBooleanOption((o) => o.setName('entradas').setDescription('Log de entradas'))
            .addBooleanOption((o) => o.setName('saidas').setDescription('Log de saídas'))
            .addBooleanOption((o) =>
                o.setName('criar_convite').setDescription('Log ao criar convite')
            )
            .addBooleanOption((o) =>
                o.setName('apagar_convite').setDescription('Log ao apagar convite')
            )
    )
    .addSubcommand((sc) =>
        sc
            .setName('stats')
            .setDescription('Estatísticas gerais ou de um membro')
            .addUserOption((o) =>
                o.setName('membro').setDescription('Ver convites deste membro')
            )
    )
    .addSubcommand((sc) =>
        sc
            .setName('ranking')
            .setDescription('Ranking de quem mais trouxe membros (entradas históricas)')
            .addIntegerOption((o) =>
                o.setName('limite').setDescription('1–25').setMinValue(1).setMaxValue(25)
            )
    )
    .addSubcommand((sc) =>
        sc
            .setName('historico')
            .setDescription('Histórico de entradas de um membro')
            .addUserOption((o) =>
                o.setName('membro').setDescription('Membro').setRequired(true)
            )
    )
    .addSubcommand((sc) =>
        sc.setName('sync').setDescription('Ressincroniza o cache de convites do servidor')
    )
    .addSubcommand((sc) =>
        sc.setName('diagnostico').setDescription('Verifica permissões necessárias')
    );

export async function executeAlliedInvites(interaction) {
    if (!interaction.guildId) {
        return interaction.reply({ content: 'Só em servidores.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);

    if (['ativar', 'canais', 'logs', 'sync', 'diagnostico', 'historico'].includes(sub) && !isAdmin) {
        return interaction.reply({
            content: 'Você precisa de **Gerenciar Servidor**.',
            ephemeral: true
        });
    }

    if (sub === 'status') {
        const c = await getInviteConfig(interaction.guildId);
        const totals = await getGuildInviteTotals(interaction.guildId);
        const embed = new EmbedBuilder()
            .setColor(CARMINE)
            .setTitle('Allied InviteLogger')
            .setDescription(c.enabled ? '🟢 **Ativo**' : '⚪ **Desativado**')
            .addFields(
                {
                    name: 'Canais',
                    value:
                        `Entradas: ${c.join_channel_id ? `<#${c.join_channel_id}>` : '—'}\n` +
                        `Saídas: ${c.leave_channel_id ? `<#${c.leave_channel_id}>` : '—'}\n` +
                        `Convites: ${c.invite_create_channel_id ? `<#${c.invite_create_channel_id}>` : '—'}`
                },
                {
                    name: 'Totais (histórico)',
                    value:
                        `Entradas: **${totals.total_joins}**\n` +
                        `Saídas: **${totals.total_leaves}**\n` +
                        `Sem atribuição clara: **${totals.unknown_or_ambiguous}**`
                },
                {
                    name: 'Ranking',
                    value: 'Conta **entradas históricas atribuídas** (não só membros ainda no servidor).'
                }
            )
            .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'ativar') {
        const on = interaction.options.getBoolean('ligado', true);
        await updateInviteConfig(interaction.guildId, { enabled: on });
        return interaction.reply({
            content: on ? 'InviteLogger **ativado**.' : 'InviteLogger **desativado**.',
            ephemeral: true
        });
    }

    if (sub === 'canais') {
        const patch = {};
        const e = interaction.options.getChannel('entradas');
        const s = interaction.options.getChannel('saidas');
        const c = interaction.options.getChannel('convites');
        if (e) {
            patch.join_channel_id = e.id;
        }
        if (s) {
            patch.leave_channel_id = s.id;
        }
        if (c) {
            patch.invite_create_channel_id = c.id;
            patch.invite_delete_channel_id = c.id;
        }
        if (!Object.keys(patch).length) {
            return interaction.reply({ content: 'Informe ao menos um canal.', ephemeral: true });
        }
        await updateInviteConfig(interaction.guildId, patch);
        return interaction.reply({ content: 'Canais atualizados.', ephemeral: true });
    }

    if (sub === 'logs') {
        const patch = {};
        const a = interaction.options.getBoolean('entradas');
        const b = interaction.options.getBoolean('saidas');
        const c = interaction.options.getBoolean('criar_convite');
        const d = interaction.options.getBoolean('apagar_convite');
        if (a != null) patch.log_joins = a;
        if (b != null) patch.log_leaves = b;
        if (c != null) patch.log_invite_create = c;
        if (d != null) patch.log_invite_delete = d;
        if (!Object.keys(patch).length) {
            return interaction.reply({ content: 'Nenhuma opção enviada.', ephemeral: true });
        }
        await updateInviteConfig(interaction.guildId, patch);
        return interaction.reply({ content: 'Preferências de log salvas.', ephemeral: true });
    }

    if (sub === 'stats') {
        const user = interaction.options.getUser('membro') || interaction.user;
        if (user.id !== interaction.user.id && !isAdmin) {
            return interaction.reply({
                content: 'Só administradores consultam stats de outros membros.',
                ephemeral: true
            });
        }
        const st = await getInviterStats(interaction.guildId, user.id);
        const still = Math.max(0, st.joins - st.leaves);
        const embed = new EmbedBuilder()
            .setColor(CARMINE)
            .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL({ size: 64 }) })
            .setTitle('Convites atribuídos')
            .setDescription(
                `Entradas históricas: **${st.joins}**\n` +
                    `Saídas de convidados: **${st.leaves}**\n` +
                    `Saldo aproximado (ainda no servidor*): **${still}**\n\n` +
                    `_\\*aproximado: baseado em leaves registrados após join atribuído._`
            )
            .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'ranking') {
        const limit = interaction.options.getInteger('limite') || 10;
        const rows = await getInviteRanking(interaction.guildId, limit);
        if (!rows.length) {
            return interaction.reply({
                content: 'Ainda não há entradas atribuídas.',
                ephemeral: true
            });
        }
        const lines = rows.map(
            (r, i) =>
                `**${i + 1}.** <@${r.inviter_id}> — **${r.joins}** entradas · ${r.leaves} saídas`
        );
        const embed = new EmbedBuilder()
            .setColor(CARMINE)
            .setTitle('Ranking de convites · Allied')
            .setDescription(lines.join('\n'))
            .setFooter({ text: 'Entradas históricas confirmadas · não inclui atribuições desconhecidas' })
            .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'historico') {
        const user = interaction.options.getUser('membro', true);
        const hist = await getMemberJoinHistory(interaction.guildId, user.id, 10);
        if (!hist.length) {
            return interaction.reply({
                content: 'Sem registros de entrada para este membro.',
                ephemeral: true
            });
        }
        const lines = hist.map((h) => {
            const when = `<t:${Math.floor(new Date(h.joined_at).getTime() / 1000)}:d>`;
            const left = h.left_at
                ? ` · saiu <t:${Math.floor(new Date(h.left_at).getTime() / 1000)}:d>`
                : '';
            const inv = h.invite_code ? `\`${h.invite_code}\`` : '—';
            const by = h.inviter_id ? `<@${h.inviter_id}>` : '—';
            return `${when} · ${inv} · ${by} · \`${h.attribution}\`${left}`;
        });
        const embed = new EmbedBuilder()
            .setColor(CARMINE)
            .setTitle(`Histórico · ${user.tag}`)
            .setDescription(lines.join('\n'))
            .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'sync') {
        await interaction.deferReply({ ephemeral: true });
        const ok = await syncInvites(interaction.guild);
        return interaction.editReply({
            content: ok
                ? 'Cache de convites sincronizado.'
                : 'Falha ao sincronizar. Verifique a permissão **Gerenciar Servidor** do bot.'
        });
    }

    if (sub === 'diagnostico') {
        const me = interaction.guild.members.me;
        const perms = me?.permissions;
        const lines = [
            `Gerenciar Servidor (convites): ${perms?.has('ManageGuild') ? '✅' : '❌'}`,
            `Ver canais: ${perms?.has('ViewChannel') ? '✅' : '❌'}`,
            `Enviar mensagens: ${perms?.has('SendMessages') ? '✅' : '❌'}`,
            `Embeds: ${perms?.has('EmbedLinks') ? '✅' : '❌'}`,
            `Intent Server Members: necessário no Portal + Client`,
            `Intent Guild Invites: necessário para rastrear convites`
        ];
        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(CARMINE)
                    .setTitle('Diagnóstico Allied Invites')
                    .setDescription(lines.join('\n'))
            ],
            ephemeral: true
        });
    }

    return interaction.reply({ content: 'Subcomando desconhecido.', ephemeral: true });
}
