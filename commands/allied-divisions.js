import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder
} from 'discord.js';
import {
    getDivisionTicketConfig,
    updateDivisionTicketConfig,
    listAlliedDivisions,
    getAlliedDivision,
    upsertAlliedDivision,
    setAlliedDivisionQuestions,
    setAlliedDivisionEnabled,
    removeAlliedDivision,
    buildDivisionPanelPayload,
    publishDivisionPanel,
    validateDivisionQuestions
} from '../systems/alliedDivisionTickets.js';

function isAdmin(interaction) {
    return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) === true;
}

function parseUrl(value, label) {
    if (value == null) return undefined;
    if (value === '-') return null;
    try {
        const url = new URL(value);
        if (!['https:', 'http:'].includes(url.protocol)) throw new Error();
        return url.href;
    } catch {
        throw new Error(`URL inválida em **${label}**. Use HTTP(S) ou hífen para limpar.`);
    }
}

export const alliedDivisionsCommand = new SlashCommandBuilder()
    .setName('allied-divisions')
    .setDescription('Gerencia candidaturas e tíquetes de ingresso nas divisões da Allied')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sc) => sc.setName('configurar')
        .setDescription('Configura painel, categoria, logs e cargos responsáveis')
        .addChannelOption((o) => o.setName('painel').setDescription('Canal do painel público').addChannelTypes(ChannelType.GuildText))
        .addChannelOption((o) => o.setName('categoria').setDescription('Categoria dos tíquetes privados').addChannelTypes(ChannelType.GuildCategory))
        .addChannelOption((o) => o.setName('logs').setDescription('Canal privado de registros').addChannelTypes(ChannelType.GuildText))
        .addRoleOption((o) => o.setName('cargo_membro').setDescription('Cargo exigido para solicitar ingresso em divisão'))
        .addRoleOption((o) => o.setName('cargo_equipe').setDescription('Cargo autorizado a revisar candidaturas'))
    )
    .addSubcommand((sc) => sc.setName('adicionar')
        .setDescription('Adiciona uma divisão ao seletor de candidaturas')
        .addStringOption((o) => o.setName('chave').setDescription('Identificador curto, ex.: chuva').setRequired(true).setMaxLength(32))
        .addStringOption((o) => o.setName('nome').setDescription('Nome exibido, ex.: 1ª Chuva').setRequired(true).setMaxLength(80))
        .addRoleOption((o) => o.setName('cargo').setDescription('Cargo concedido somente após aprovação').setRequired(true))
        .addRoleOption((o) => o.setName('cargo_revisor').setDescription('Cargo adicional que revisará esta divisão'))
        .addStringOption((o) => o.setName('emoji').setDescription('Emoji opcional para decorar o painel').setMaxLength(64))
    )
    .addSubcommand((sc) => sc.setName('remover')
        .setDescription('Remove uma divisão do painel de novas candidaturas')
        .addStringOption((o) => o.setName('chave').setDescription('Identificador cadastrado da divisão').setRequired(true).setMaxLength(32))
    )
    .addSubcommand((sc) => sc.setName('disponibilidade')
        .setDescription('Abre ou pausa as candidaturas de uma divisão específica')
        .addStringOption((o) => o.setName('chave').setDescription('Identificador da divisão').setRequired(true).setMaxLength(32))
        .addBooleanOption((o) => o.setName('ligado').setDescription('True = aceitar candidaturas').setRequired(true))
    )
    .addSubcommand((sc) => sc.setName('formulario')
        .setDescription('Personaliza as perguntas de uma divisão')
        .addStringOption((o) => o.setName('chave').setDescription('Identificador cadastrado da divisão').setRequired(true).setMaxLength(32))
        .addStringOption((o) => o.setName('perguntas_json').setDescription('Array JSON com 1 a 5 perguntas').setRequired(true).setMaxLength(4000))
    )
    .addSubcommand((sc) => sc.setName('visual')
        .setDescription('Personaliza a aparência do painel de divisões')
        .addStringOption((o) => o.setName('titulo').setDescription('Título do embed').setMaxLength(256))
        .addStringOption((o) => o.setName('descricao').setDescription('Descrição do painel').setMaxLength(4096))
        .addStringOption((o) => o.setName('texto').setDescription('Texto fora do embed').setMaxLength(2000))
        .addStringOption((o) => o.setName('cor').setDescription('Cor hexadecimal, ex.: #8B1A1A').setMaxLength(7))
        .addStringOption((o) => o.setName('miniatura').setDescription('URL de miniatura; hífen para limpar').setMaxLength(500))
        .addStringOption((o) => o.setName('imagem_gif').setDescription('URL da imagem principal ou GIF; hífen para limpar').setMaxLength(500))
        .addStringOption((o) => o.setName('rodape').setDescription('Texto do rodapé').setMaxLength(2048))
    )
    .addSubcommand((sc) => sc.setName('ativar')
        .setDescription('Abre ou fecha novas candidaturas para as divisões')
        .addBooleanOption((o) => o.setName('ligado').setDescription('True = aberto; False = fechado').setRequired(true))
    )
    .addSubcommand((sc) => sc.setName('publicar').setDescription('Publica ou atualiza o painel no canal configurado'))
    .addSubcommand((sc) => sc.setName('preview').setDescription('Visualiza o painel sem publicar'))
    .addSubcommand((sc) => sc.setName('listar').setDescription('Lista divisões e cargos configurados'))
    .addSubcommand((sc) => sc.setName('status').setDescription('Mostra o estado e a configuração do sistema'));

export async function executeAlliedDivisions(interaction) {
    if (!interaction.guildId || !interaction.guild) {
        return interaction.reply({ content: 'Este comando só pode ser usado dentro de um servidor.', ephemeral: true });
    }
    if (!isAdmin(interaction)) {
        return interaction.reply({ content: 'Você precisa da permissão **Gerenciar Servidor** para configurar as candidaturas.', ephemeral: true });
    }

    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === 'configurar') {
        const patch = {};
        const panel = interaction.options.getChannel('painel');
        const category = interaction.options.getChannel('categoria');
        const logs = interaction.options.getChannel('logs');
        const memberRole = interaction.options.getRole('cargo_membro');
        const staffRole = interaction.options.getRole('cargo_equipe');

        if (panel) patch.panel_channel_id = panel.id;
        if (category) patch.ticket_category_id = category.id;
        if (logs) patch.log_channel_id = logs.id;

        if (memberRole) {
            if (memberRole.id === interaction.guild.roles.everyone.id || memberRole.managed) {
                return interaction.reply({
                    content: 'Escolha um cargo de membro válido, não gerenciado e diferente de @everyone.',
                    ephemeral: true
                });
            }
            patch.member_role_id = memberRole.id;
        }

        if (staffRole) {
            if (staffRole.id === interaction.guild.roles.everyone.id || staffRole.managed) {
                return interaction.reply({
                    content: 'Escolha um cargo de equipe válido.',
                    ephemeral: true
                });
            }

            const current = await getDivisionTicketConfig(guildId).catch(() => ({ staff_role_ids: [] }));
            patch.staff_role_ids = [...new Set([...(current.staff_role_ids ?? []), staffRole.id])];
        }

        if (!Object.keys(patch).length) {
            return interaction.reply({ content: 'Informe ao menos uma configuração.', ephemeral: true });
        }

        const config = await updateDivisionTicketConfig(guildId, patch);
        return interaction.reply({
            content: `Configuração salva.\nPainel: ${config.panel_channel_id ? `<#${config.panel_channel_id}>` : 'não definido'}\nCategoria: ${config.ticket_category_id ? `<#${config.ticket_category_id}>` : 'não definida'}\nCargo de membro exigido: ${config.member_role_id ? `<@&${config.member_role_id}>` : 'não definido'}\nEquipe: ${Array.isArray(config.staff_role_ids) && config.staff_role_ids.length ? config.staff_role_ids.map((id) => `<@&${id}>`).join(', ') : 'nenhum cargo configurado'}`,
            ephemeral: true,
            allowedMentions: { parse: [] }
        });
    }

    if (sub === 'adicionar') {
        const key = interaction.options.getString('chave', true).trim().toLowerCase();
        const name = interaction.options.getString('nome', true);
        const role = interaction.options.getRole('cargo', true);
        const reviewerRole = interaction.options.getRole('cargo_revisor');
        const emoji = interaction.options.getString('emoji');

        if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(key)) {
            return interaction.reply({
                content: 'A chave deve conter somente letras minúsculas, números, hífen ou _. Exemplo: `chuva`.',
                ephemeral: true
            });
        }

        if (role.id === interaction.guild.roles.everyone.id || role.managed) {
            return interaction.reply({
                content: 'Escolha um cargo normal, não gerenciado e diferente de @everyone.',
                ephemeral: true
            });
        }

        const botMember = interaction.guild.members.me || await interaction.guild.members.fetch(interaction.client.user.id).catch(() => null);
        if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles) || botMember.roles.highest.position <= role.position) {
            return interaction.reply({
                content: 'A Kaori precisa de Gerenciar Cargos e seu cargo mais alto deve ficar acima do cargo da divisão.',
                ephemeral: true
            });
        }

        if (reviewerRole && (reviewerRole.id === interaction.guild.roles.everyone.id || reviewerRole.managed)) {
            return interaction.reply({
                content: 'O cargo revisor precisa ser um cargo normal, diferente de @everyone.',
                ephemeral: true
            });
        }

        try {
            const existing = await getAlliedDivision(guildId, key);
            const reviewerRoleIds = reviewerRole ? [reviewerRole.id] : (existing?.reviewer_role_ids || []);
            const division = await upsertAlliedDivision(guildId, { key, name, roleId: role.id, emoji, reviewerRoleIds });
            return interaction.reply({
                content: `Divisão **${division.name}** cadastrada. Cargo de aprovação: ${role}. Formulário padrão criado; personalize com /allied-divisions formulario.`,
                ephemeral: true,
                allowedMentions: { parse: [] }
            });
        } catch (error) {
            return interaction.reply({
                content: `Não consegui cadastrar a divisão: ${error.message}`,
                ephemeral: true
            });
        }
    }

    if (sub === 'remover') {
        const key = interaction.options.getString('chave', true);
        const removed = await removeAlliedDivision(guildId, key);
        return interaction.reply({
            content: removed ? `A divisão **${key}** foi removida do painel. Solicitações já abertas continuam registradas.` : 'Não encontrei uma divisão com essa chave.',
            ephemeral: true
        });
    }

    if (sub === 'disponibilidade') {
        const key = interaction.options.getString('chave', true);
        const enabled = interaction.options.getBoolean('ligado', true);

        try {
            const division = await setAlliedDivisionEnabled(guildId, key, enabled);
            return interaction.reply({
                content: `Candidaturas para **${division.name}** ${enabled ? 'abertas' : 'pausadas'}. Publique novamente o painel para atualizar o seletor.`,
                ephemeral: true
            });
        } catch (error) {
            return interaction.reply({ content: error.message, ephemeral: true });
        }
    }

    if (sub === 'formulario') {
        const key = interaction.options.getString('chave', true);

        try {
            const questions = validateDivisionQuestions(JSON.parse(interaction.options.getString('perguntas_json', true)));
            const division = await setAlliedDivisionQuestions(guildId, key, questions);
            return interaction.reply({
                content: `Formulário de **${division.name}** atualizado com ${questions.length} pergunta(s).`,
                ephemeral: true
            });
        } catch (error) {
            return interaction.reply({
                content: `Não consegui salvar o formulário: ${error.message}`,
                ephemeral: true
            });
        }
    }

    if (sub === 'visual') {
        const patch = {};
        const strings = [
            ['titulo', 'panel_title'],
            ['descricao', 'panel_description'],
            ['texto', 'panel_content'],
            ['rodape', 'panel_footer_text']
        ];

        for (const [option, key] of strings) {
            const value = interaction.options.getString(option);
            if (value !== null) patch[key] = value;
        }

        const color = interaction.options.getString('cor');
        if (color !== null) {
            if (!/^#?[0-9a-f]{6}$/i.test(color.trim())) {
                return interaction.reply({
                    content: 'Cor inválida. Use hexadecimal, por exemplo `#8B1A1A`.',
                    ephemeral: true
                });
            }
            patch.panel_color = color.startsWith('#') ? color : `#${color}`;
        }

        try {
            const thumbnail = parseUrl(interaction.options.getString('miniatura'), 'miniatura');
            const image = parseUrl(interaction.options.getString('imagem_gif'), 'imagem/GIF');

            if (thumbnail !== undefined) patch.panel_thumbnail_url = thumbnail;
            if (image !== undefined) patch.panel_image_url = image;
        } catch (error) {
            return interaction.reply({ content: error.message, ephemeral: true });
        }

        if (!Object.keys(patch).length) {
            return interaction.reply({ content: 'Nenhum campo foi informado.', ephemeral: true });
        }

        await updateDivisionTicketConfig(guildId, patch);
        return interaction.reply({
            content: 'Visual atualizado. Use `/allied-divisions preview` e depois `/allied-divisions publicar`.',
            ephemeral: true
        });
    }

    if (sub === 'ativar') {
        const enabled = interaction.options.getBoolean('ligado', true);

        if (enabled) {
            const config = await getDivisionTicketConfig(guildId).catch(() => ({
                panel_channel_id: null,
                ticket_category_id: null,
                member_role_id: null,
                staff_role_ids: []
            }));
            const divisions = await listAlliedDivisions(guildId, { enabledOnly: true });
            const botMember = interaction.guild.members.me || await interaction.guild.members.fetch(interaction.client.user.id).catch(() => null);
            const panel = config.panel_channel_id ? await interaction.guild.channels.fetch(config.panel_channel_id).catch(() => null) : null;
            const category = config.ticket_category_id ? await interaction.guild.channels.fetch(config.ticket_category_id).catch(() => null) : null;
            const memberRole = config.member_role_id ? await interaction.guild.roles.fetch(config.member_role_id).catch(() => null) : null;
            const staffIds = Array.isArray(config.staff_role_ids) ? config.staff_role_ids : [];
            const staffRoles = await Promise.all(staffIds.map((id) => interaction.guild.roles.fetch(id).catch(() => null)));
            const hasGlobalReviewers = staffRoles.some((role) => role && role.id !== interaction.guild.roles.everyone.id && !role.managed);
            const errors = [];

            if (!panel?.isTextBased()) errors.push('Configure um canal de painel válido.');
            if (config.ticket_category_id && category?.type !== ChannelType.GuildCategory) errors.push('A categoria de tíquetes é inválida.');
            if (!memberRole || memberRole.id === interaction.guild.roles.everyone.id || memberRole.managed) errors.push('Configure o cargo de membro exigido.');
            if (!divisions.length) errors.push('Cadastre ao menos uma divisão antes de ativar.');
            if (divisions.length > 25) errors.push('O painel aceita no máximo 25 divisões ativas.');
            if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) errors.push('A Kaori precisa de Gerenciar Canais.');
            if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) errors.push('A Kaori precisa de Gerenciar Cargos.');

            for (const division of divisions) {
                const role = await interaction.guild.roles.fetch(division.role_id).catch(() => null);
                if (!role || role.id === interaction.guild.roles.everyone.id || role.managed) {
                    errors.push(`Cargo da divisão **${division.name}** inválido.`);
                } else if (botMember && botMember.roles.highest.position <= role.position) {
                    errors.push(`O cargo da Kaori precisa ficar acima do cargo **${role.name}**.`);
                }

                const reviewers = await Promise.all((division.reviewer_role_ids || []).map((id) => interaction.guild.roles.fetch(id).catch(() => null)));
                const hasDivisionReviewers = reviewers.some((reviewerRole) => reviewerRole && reviewerRole.id !== interaction.guild.roles.everyone.id && !reviewerRole.managed);

                if (!hasGlobalReviewers && !hasDivisionReviewers) {
                    errors.push(`Configure um cargo revisor global ou específico para **${division.name}**.`);
                }

                for (const reviewerRole of reviewers) {
                    if (!reviewerRole || reviewerRole.id === interaction.guild.roles.everyone.id || reviewerRole.managed) {
                        errors.push(`Cargo revisor inválido em **${division.name}**.`);
                    }
                }
            }

            if (panel && botMember) {
                const perms = panel.permissionsFor(botMember);
                if (!perms?.has(PermissionFlagsBits.ViewChannel)) errors.push('A Kaori precisa de Ver Canal no painel.');
                if (!perms?.has(PermissionFlagsBits.SendMessages)) errors.push('A Kaori precisa de Enviar Mensagens no painel.');
                if (!perms?.has(PermissionFlagsBits.EmbedLinks)) errors.push('A Kaori precisa de Inserir Links no painel.');
            }

            if (errors.length) {
                return interaction.reply({
                    content: `Não foi possível ativar:\n${errors.map((e) => `• ${e}`).join('\n')}`,
                    ephemeral: true
                });
            }
        }

        await updateDivisionTicketConfig(guildId, { enabled });
        return interaction.reply({
            content: enabled ? 'Candidaturas para divisões **abertas**.' : 'Candidaturas para divisões **fechadas**. Atendimentos abertos continuam funcionando.',
            ephemeral: true
        });
    }

    if (sub === 'publicar') {
        const config = await getDivisionTicketConfig(guildId).catch(() => ({
            enabled: false,
            panel_channel_id: null
        }));

        if (!config.enabled) {
            return interaction.reply({ content: 'Ative as candidaturas antes de publicar.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });
        try {
            const { channel, divisions } = await publishDivisionPanel(interaction.guild, config);
            return interaction.editReply({
                content: `Painel publicado/atualizado em ${channel}. Divisões disponíveis: **${divisions.length}**.`
            });
        } catch (error) {
            return interaction.editReply({ content: `Falha ao publicar: ${error.message}` });
        }
    }

    if (sub === 'preview') {
        const config = await getDivisionTicketConfig(guildId).catch(() => ({
            panel_channel_id: null,
            enabled: false
        }));
        const divisions = await listAlliedDivisions(guildId, { enabledOnly: true });
        return interaction.reply({ ...buildDivisionPanelPayload(config, divisions), ephemeral: true });
    }

    if (sub === 'listar') {
        const divisions = await listAlliedDivisions(guildId);

        if (!divisions.length) {
            return interaction.reply({
                content: 'Nenhuma divisão cadastrada. Use `/allied-divisions adicionar`.',
                ephemeral: true
            });
        }

        const lines = divisions.map((division) => {
            const reviewerCount = Array.isArray(division.reviewer_role_ids) ? division.reviewer_role_ids.length : 0;
            const questionCount = Array.isArray(division.questions) ? division.questions.length : 0;
            return `${division.enabled ? '🟢' : '⚪'} **${division.name}** · chave \`${division.division_key}\` · <@&${division.role_id}> · ${questionCount} pergunta(s) · revisores: ${reviewerCount}`;
        });

        const embed = new EmbedBuilder()
            .setColor(0x8b1a1a)
            .setTitle('ALLIED · Divisões cadastradas')
            .setDescription(lines.join('\n'))
            .setFooter({ text: 'Use /allied-divisions formulario para editar perguntas' });

        return interaction.reply({
            embeds: [embed],
            ephemeral: true,
            allowedMentions: { parse: [] }
        });
    }

    const config = await getDivisionTicketConfig(guildId).catch(() => ({
        enabled: false,
        panel_channel_id: null,
        ticket_category_id: null,
        member_role_id: null,
        staff_role_ids: []
    }));
    const divisions = await listAlliedDivisions(guildId);
    const staffCount = Array.isArray(config.staff_role_ids) ? config.staff_role_ids.length : 0;

    const embed = new EmbedBuilder()
        .setColor(0x8b1a1a)
        .setTitle('ALLIED · Division Tickets')
        .setDescription(config.enabled ? '🟢 **Candidaturas abertas**' : '⚪ **Candidaturas fechadas**')
        .addFields(
            { name: 'Painel', value: config.panel_channel_id ? `<#${config.panel_channel_id}>` : 'Não configurado', inline: true },
            { name: 'Categoria', value: config.ticket_category_id ? `<#${config.ticket_category_id}>` : 'Não configurada', inline: true },
            { name: 'Divisões', value: String(divisions.length), inline: true },
            { name: 'Cargo de membro exigido', value: config.member_role_id ? `<@&${config.member_role_id}>` : 'Não configurado', inline: true },
            { name: 'Equipe', value: String(staffCount), inline: true }
        )
        .setFooter({ text: 'Os cargos de divisão só são atribuídos após aprovação da equipe.' });

    return interaction.reply({
        embeds: [embed],
        ephemeral: true,
        allowedMentions: { parse: [] }
    });
}