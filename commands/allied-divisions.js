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
    updateAlliedDivisionLeadership,
    updateAlliedDivisionPresentation,
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
    .setDescription('Gerencia as divisões, seus painéis e o recrutamento da Allied')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sc) => sc.setName('configurar')
        .setDescription('Configura o painel público e o canal central de candidaturas')
        .addChannelOption((o) => o.setName('painel').setDescription('Canal #divisões onde ficará a embed').addChannelTypes(ChannelType.GuildText))
        .addChannelOption((o) => o.setName('canal_entrada').setDescription('Canal central #entrada-divisão para receber formulários').addChannelTypes(ChannelType.GuildText))
        .addChannelOption((o) => o.setName('logs').setDescription('Canal privado de registros').addChannelTypes(ChannelType.GuildText))
        .addRoleOption((o) => o.setName('cargo_membro').setDescription('Cargo exigido para solicitar ingresso em divisão'))
    )
    .addSubcommand((sc) => sc.setName('adicionar')
        .setDescription('Cadastra uma divisão e cria seu botão de candidatura')
        .addStringOption((o) => o.setName('chave').setDescription('Identificador curto, ex.: chuva').setRequired(true).setMaxLength(32))
        .addStringOption((o) => o.setName('nome').setDescription('Nome exibido, ex.: 1ª Chuva').setRequired(true).setMaxLength(80))
        .addRoleOption((o) => o.setName('cargo').setDescription('Cargo concedido somente após aprovação').setRequired(true))
        .addStringOption((o) => o.setName('descricao').setDescription('Descrição completa exibida na embed').setMaxLength(1024))
        .addStringOption((o) => o.setName('botao').setDescription('Texto do botão de candidatura').setMaxLength(80))
        .addStringOption((o) => o.setName('estilo').setDescription('Cor/estilo do botão').addChoices(
            { name: 'Vermelho', value: 'Danger' },
            { name: 'Verde', value: 'Success' },
            { name: 'Azul', value: 'Primary' },
            { name: 'Cinza', value: 'Secondary' }
        ))
        .addStringOption((o) => o.setName('emoji').setDescription('Emoji opcional do botão e título').setMaxLength(64))
        .addChannelOption((o) => o.setName('canal_destino').setDescription('Canal específico para receber esta divisão; vazio usa canal_entrada').addChannelTypes(ChannelType.GuildText))
    )
    .addSubcommand((sc) => sc.setName('editar')
        .setDescription('Altera descrição, botão ou canal de envio de uma divisão')
        .addStringOption((o) => o.setName('chave').setDescription('Identificador cadastrado').setRequired(true).setMaxLength(32))
        .addStringOption((o) => o.setName('descricao').setDescription('Nova descrição completa').setMaxLength(1024))
        .addStringOption((o) => o.setName('botao').setDescription('Novo texto do botão').setMaxLength(80))
        .addStringOption((o) => o.setName('estilo').setDescription('Novo estilo do botão').addChoices(
            { name: 'Vermelho', value: 'Danger' },
            { name: 'Verde', value: 'Success' },
            { name: 'Azul', value: 'Primary' },
            { name: 'Cinza', value: 'Secondary' }
        ))
        .addStringOption((o) => o.setName('emoji').setDescription('Novo emoji do botão; hífen remove').setMaxLength(64))
        .addChannelOption((o) => o.setName('canal_destino').setDescription('Canal específico desta divisão').addChannelTypes(ChannelType.GuildText))
        .addBooleanOption((o) => o.setName('usar_canal_padrao').setDescription('Sim = volta a usar o canal_entrada global'))
    )
    .addSubcommand((sc) => sc.setName('adicionar-lider')
        .setDescription('Autoriza um cargo de líder a aceitar ou recusar candidaturas desta divisão')
        .addStringOption((o) => o.setName('chave').setDescription('Chave da divisão').setRequired(true).setMaxLength(32))
        .addRoleOption((o) => o.setName('cargo').setDescription('Cargo do líder').setRequired(true))
    )
    .addSubcommand((sc) => sc.setName('remover-lider')
        .setDescription('Remove um cargo da liderança desta divisão')
        .addStringOption((o) => o.setName('chave').setDescription('Chave da divisão').setRequired(true).setMaxLength(32))
        .addRoleOption((o) => o.setName('cargo').setDescription('Cargo do líder').setRequired(true))
    )
    .addSubcommand((sc) => sc.setName('adicionar-vice')
        .setDescription('Autoriza um cargo de vice-líder a aceitar ou recusar candidaturas desta divisão')
        .addStringOption((o) => o.setName('chave').setDescription('Chave da divisão').setRequired(true).setMaxLength(32))
        .addRoleOption((o) => o.setName('cargo').setDescription('Cargo do vice-líder').setRequired(true))
    )
    .addSubcommand((sc) => sc.setName('remover-vice')
        .setDescription('Remove um cargo de vice-liderança desta divisão')
        .addStringOption((o) => o.setName('chave').setDescription('Chave da divisão').setRequired(true).setMaxLength(32))
        .addRoleOption((o) => o.setName('cargo').setDescription('Cargo do vice-líder').setRequired(true))
    )
    .addSubcommand((sc) => sc.setName('remover')
        .setDescription('Remove uma divisão do painel')
        .addStringOption((o) => o.setName('chave').setDescription('Identificador cadastrado da divisão').setRequired(true).setMaxLength(32))
    )
    .addSubcommand((sc) => sc.setName('disponibilidade')
        .setDescription('Abre ou pausa candidaturas de uma divisão')
        .addStringOption((o) => o.setName('chave').setDescription('Identificador da divisão').setRequired(true).setMaxLength(32))
        .addBooleanOption((o) => o.setName('ligado').setDescription('True = aceitar candidaturas').setRequired(true))
    )
    .addSubcommand((sc) => sc.setName('formulario')
        .setDescription('Configura o formulário que abre ao clicar no botão da divisão')
        .addStringOption((o) => o.setName('chave').setDescription('Identificador da divisão').setRequired(true).setMaxLength(32))
        .addStringOption((o) => o.setName('perguntas_json').setDescription('Array JSON com 1 a 5 perguntas').setRequired(true).setMaxLength(4000))
    )
    .addSubcommand((sc) => sc.setName('visual')
        .setDescription('Personaliza a aparência geral da embed #divisões')
        .addStringOption((o) => o.setName('titulo').setDescription('Título do embed').setMaxLength(256))
        .addStringOption((o) => o.setName('descricao').setDescription('Descrição geral do painel').setMaxLength(4096))
        .addStringOption((o) => o.setName('cor').setDescription('Cor hexadecimal, ex.: #8B1A1A').setMaxLength(7))
        .addStringOption((o) => o.setName('miniatura').setDescription('URL de miniatura; hífen para limpar').setMaxLength(500))
        .addStringOption((o) => o.setName('imagem_gif').setDescription('URL da imagem/GIF principal; hífen para limpar').setMaxLength(500))
        .addStringOption((o) => o.setName('rodape').setDescription('Texto do rodapé').setMaxLength(2048))
    )
    .addSubcommand((sc) => sc.setName('ativar')
        .setDescription('Abre ou fecha novas candidaturas para as divisões')
        .addBooleanOption((o) => o.setName('ligado').setDescription('True = aberto; False = fechado').setRequired(true))
    )
    .addSubcommand((sc) => sc.setName('publicar').setDescription('Publica ou atualiza a embed em #divisões'))
    .addSubcommand((sc) => sc.setName('preview').setDescription('Visualiza a embed sem publicar'))
    .addSubcommand((sc) => sc.setName('listar').setDescription('Lista divisões, formulários e lideranças cadastradas'))
    .addSubcommand((sc) => sc.setName('status').setDescription('Mostra a configuração do recrutamento de divisões'));

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
        const submission = interaction.options.getChannel('canal_entrada');
        const logs = interaction.options.getChannel('logs');
        const memberRole = interaction.options.getRole('cargo_membro');

        if (panel) patch.panel_channel_id = panel.id;
        if (submission) patch.submission_channel_id = submission.id;
        if (logs) patch.log_channel_id = logs.id;
        if (memberRole) {
            if (memberRole.id === interaction.guild.roles.everyone.id || memberRole.managed) {
                return interaction.reply({ content: 'Escolha um cargo de membro válido, não gerenciado e diferente de @everyone.', ephemeral: true });
            }
            patch.member_role_id = memberRole.id;
        }
        if (!Object.keys(patch).length) {
            return interaction.reply({ content: 'Informe ao menos uma configuração.', ephemeral: true });
        }

        const config = await updateDivisionTicketConfig(guildId, patch);
        return interaction.reply({
            content: `Configuração salva.\nPainel: ${config.panel_channel_id ? `<#${config.panel_channel_id}>` : 'não definido'}\nCanal de entrada padrão: ${config.submission_channel_id ? `<#${config.submission_channel_id}>` : 'não definido'}\nCanal de logs: ${config.log_channel_id ? `<#${config.log_channel_id}>` : 'não definido'}\nCargo de membro exigido: ${config.member_role_id ? `<@&${config.member_role_id}>` : 'não definido'}`,
            ephemeral: true,
            allowedMentions: { parse: [] }
        });
    }

    if (sub === 'adicionar') {
        const key = interaction.options.getString('chave', true).trim().toLowerCase();
        const name = interaction.options.getString('nome', true);
        const role = interaction.options.getRole('cargo', true);
        const emoji = interaction.options.getString('emoji');
        const description = interaction.options.getString('descricao');
        const buttonLabel = interaction.options.getString('botao');
        const buttonStyle = interaction.options.getString('estilo');
        const submission = interaction.options.getChannel('canal_destino');

        if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(key)) {
            return interaction.reply({ content: 'A chave deve conter letras minúsculas, números, hífen ou _. Exemplo: `chuva`.', ephemeral: true });
        }
        if (role.id === interaction.guild.roles.everyone.id || role.managed) {
            return interaction.reply({ content: 'Escolha um cargo normal, não gerenciado e diferente de @everyone.', ephemeral: true });
        }
        const botMember = interaction.guild.members.me || await interaction.guild.members.fetch(interaction.client.user.id).catch(() => null);
        if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles) || botMember.roles.highest.position <= role.position) {
            return interaction.reply({ content: 'A Kaori precisa de Gerenciar Cargos e seu cargo mais alto deve ficar acima do cargo da divisão.', ephemeral: true });
        }

        try {
            const division = await upsertAlliedDivision(guildId, {
                key, name, roleId: role.id, emoji, description, buttonLabel, buttonStyle,
                submissionChannelId: submission?.id || null
            });
            return interaction.reply({
                content: `Divisão **${division.name}** cadastrada. O botão usará o formulário individual desta divisão e enviará a candidatura para ${division.submission_channel_id ? `<#${division.submission_channel_id}>` : 'o canal de entrada padrão'}.`,
                ephemeral: true,
                allowedMentions: { parse: [] }
            });
        } catch (error) {
            return interaction.reply({ content: `Não consegui cadastrar a divisão: ${error.message}`, ephemeral: true });
        }
    }

    if (sub === 'editar') {
        const key = interaction.options.getString('chave', true);
        const patch = {};
        const description = interaction.options.getString('descricao');
        const buttonLabel = interaction.options.getString('botao');
        const buttonStyle = interaction.options.getString('estilo');
        const emoji = interaction.options.getString('emoji');
        const destination = interaction.options.getChannel('canal_destino');
        const useDefaultChannel = interaction.options.getBoolean('usar_canal_padrao');

        if (description !== null) patch.description = description === '-' ? '' : description;
        if (buttonLabel !== null) patch.button_label = buttonLabel;
        if (buttonStyle !== null) patch.button_style = buttonStyle;
        if (emoji !== null) patch.emoji = emoji === '-' ? null : emoji;
        if (destination) patch.submission_channel_id = destination.id;
        if (useDefaultChannel === true) patch.submission_channel_id = null;

        try {
            const division = await updateAlliedDivisionPresentation(guildId, key, patch);
            return interaction.reply({
                content: `Configuração de **${division.name}** atualizada. Publique novamente o painel para aplicar as mudanças.`,
                ephemeral: true
            });
        } catch (error) {
            return interaction.reply({ content: `Não consegui editar a divisão: ${error.message}`, ephemeral: true });
        }
    }

    if (['adicionar-lider', 'remover-lider', 'adicionar-vice', 'remover-vice'].includes(sub)) {
        const key = interaction.options.getString('chave', true);
        const role = interaction.options.getRole('cargo', true);
        if (role.id === interaction.guild.roles.everyone.id || role.managed) {
            return interaction.reply({ content: 'Escolha um cargo normal, não gerenciado e diferente de @everyone.', ephemeral: true });
        }
        const kind = sub.endsWith('-lider') ? 'leader' : 'vice';
        const action = sub.startsWith('adicionar-') ? 'add' : 'remove';
        try {
            const division = await updateAlliedDivisionLeadership(guildId, key, kind, role.id, action);
            const roleIds = kind === 'leader' ? division.leader_role_ids : division.vice_role_ids;
            const title = kind === 'leader' ? 'Líderes' : 'Vice-líderes';
            return interaction.reply({
                content: `Cargo ${role} ${action === 'add' ? 'adicionado à lista de' : 'removido da lista de'} **${title}** da divisão **${division.name}**. Cargos autorizados: ${roleIds.length ? roleIds.map((id) => `<@&${id}>`).join(', ') : 'nenhum'}.`,
                ephemeral: true,
                allowedMentions: { parse: [] }
            });
        } catch (error) {
            return interaction.reply({ content: error.message, ephemeral: true });
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
            const config = await getDivisionTicketConfig(guildId);
            const divisions = await listAlliedDivisions(guildId, { enabledOnly: true });
            const botMember = interaction.guild.members.me || await interaction.guild.members.fetch(interaction.client.user.id).catch(() => null);
            const panel = config.panel_channel_id ? await interaction.guild.channels.fetch(config.panel_channel_id).catch(() => null) : null;
            const memberRole = config.member_role_id ? await interaction.guild.roles.fetch(config.member_role_id).catch(() => null) : null;
            const errors = [];

            if (!panel?.isTextBased()) errors.push('Configure um canal de texto válido para #divisões.');
            if (!memberRole || memberRole.id === interaction.guild.roles.everyone.id || memberRole.managed) errors.push('Configure o cargo de membro exigido para solicitar ingresso em divisões.');
            if (!divisions.length) errors.push('Cadastre ao menos uma divisão antes de ativar.');
            if (divisions.length > 25) errors.push('O Discord permite no máximo 25 botões no painel.');
            if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) errors.push('A Kaori precisa de Gerenciar Cargos.');
            if (memberRole && botMember && botMember.roles.highest.position <= memberRole.position) {
                errors.push('O cargo mais alto da Kaori precisa ficar acima do cargo de membro exigido.');
            }

            for (const division of divisions) {
                const divisionRole = await interaction.guild.roles.fetch(division.role_id).catch(() => null);
                if (!divisionRole || divisionRole.id === interaction.guild.roles.everyone.id || divisionRole.managed) {
                    errors.push(`Cargo da divisão **${division.name}** inválido.`);
                } else if (botMember && botMember.roles.highest.position <= divisionRole.position) {
                    errors.push(`O cargo da Kaori precisa ficar acima do cargo **${divisionRole.name}**.`);
                }

                const leadershipIds = [...new Set([...(division.leader_role_ids || []), ...(division.vice_role_ids || [])])];
                if (!leadershipIds.length) {
                    errors.push(`Cadastre ao menos um líder ou vice-líder para **${division.name}**.`);
                    continue;
                }

                const destinationId = division.submission_channel_id || config.submission_channel_id;
                const destination = destinationId
                    ? await interaction.guild.channels.fetch(destinationId).catch(() => null)
                    : null;
                if (!destination?.isTextBased()) {
                    errors.push(`Configure #entrada-divisão ou um canal_destino válido para **${division.name}**.`);
                    continue;
                }

                const publicPermissions = destination.permissionsFor(interaction.guild.roles.everyone);
                if (publicPermissions?.has(PermissionFlagsBits.ViewChannel)) {
                    errors.push(`O canal ${destination} precisa ser privado; negue Ver Canal para @everyone.`);
                }
                if (botMember) {
                    const botPermissions = destination.permissionsFor(botMember);
                    if (!botPermissions?.has(PermissionFlagsBits.ViewChannel)) errors.push(`A Kaori precisa de Ver Canal em ${destination}.`);
                    if (!botPermissions?.has(PermissionFlagsBits.SendMessages)) errors.push(`A Kaori precisa de Enviar Mensagens em ${destination}.`);
                    if (!botPermissions?.has(PermissionFlagsBits.EmbedLinks)) errors.push(`A Kaori precisa de Inserir Links em ${destination}.`);
                }

                for (const roleId of leadershipIds) {
                    const leadershipRole = await interaction.guild.roles.fetch(roleId).catch(() => null);
                    if (!leadershipRole || leadershipRole.id === interaction.guild.roles.everyone.id || leadershipRole.managed) {
                        errors.push(`Cargo de liderança inválido na divisão **${division.name}**.`);
                        continue;
                    }
                    const rolePermissions = destination.permissionsFor(leadershipRole);
                    if (!rolePermissions?.has(PermissionFlagsBits.ViewChannel) || !rolePermissions?.has(PermissionFlagsBits.ReadMessageHistory)) {
                        errors.push(`O cargo ${leadershipRole} precisa de Ver Canal e Ler Histórico em ${destination}.`);
                    }
                }
            }

            if (panel && botMember) {
                const perms = panel.permissionsFor(botMember);
                if (!perms?.has(PermissionFlagsBits.ViewChannel)) errors.push('A Kaori precisa de Ver Canal em #divisões.');
                if (!perms?.has(PermissionFlagsBits.SendMessages)) errors.push('A Kaori precisa de Enviar Mensagens em #divisões.');
                if (!perms?.has(PermissionFlagsBits.EmbedLinks)) errors.push('A Kaori precisa de Inserir Links em #divisões.');
            }

            if (errors.length) {
                return interaction.reply({
                    content: `Não foi possível ativar o recrutamento das divisões:\n${errors.map((error) => `• ${error}`).join('\n')}`,
                    ephemeral: true
                });
            }
        }

        await updateDivisionTicketConfig(guildId, { enabled });
        return interaction.reply({
            content: enabled
                ? 'Recrutamento das divisões **aberto**. Cada botão enviará o formulário para a fila da divisão e somente seus líderes/vice-líderes poderão decidir.'
                : 'Recrutamento das divisões **fechado**. Candidaturas já enviadas continuam registradas.',
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
            const questionCount = Array.isArray(division.questions) ? division.questions.length : 0;
            const leaders = (division.leader_role_ids || []).length;
            const viceLeaders = (division.vice_role_ids || []).length;
            const destination = division.submission_channel_id ? `<#${division.submission_channel_id}>` : 'canal padrão';
            return `${division.enabled ? '🟢' : '⚪'} **${division.name}** · chave \`${division.division_key}\` · cargo <@&${division.role_id}> · ${questionCount} pergunta(s) · líderes: ${leaders} · vice-líderes: ${viceLeaders} · envio: ${destination}`;
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
            { name: 'Painel público', value: config.panel_channel_id ? `<#${config.panel_channel_id}>` : 'Não configurado', inline: true },
            { name: 'Canal padrão de entrada', value: config.submission_channel_id ? `<#${config.submission_channel_id}>` : 'Não configurado', inline: true },
            { name: 'Divisões cadastradas', value: String(divisions.length), inline: true },
            { name: 'Cargo exigido', value: config.member_role_id ? `<@&${config.member_role_id}>` : 'Não configurado', inline: true },
            { name: 'Divisões ativas', value: String(divisions.filter((division) => division.enabled).length), inline: true }
        )
        .setFooter({ text: 'Somente os cargos de líder e vice-líder de cada divisão podem aceitar ou recusar.' });

    return interaction.reply({
        embeds: [embed],
        ephemeral: true,
        allowedMentions: { parse: [] }
    });
}