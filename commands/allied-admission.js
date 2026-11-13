import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder
} from 'discord.js';
import {
    ADMISSION_DEFAULTS,
    ADMISSION_TYPES,
    DEFAULT_QUESTIONS,
    buildAdmissionPanelPayload,
    getAdmissionConfig,
    parseAdmissionColor,
    publishAdmissionPanel,
    updateAdmissionConfig,
    validateAdmissionQuestions
} from '../systems/alliedAdmission.js';

function isAdmin(interaction) {
    return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) === true;
}

function isHexColor(value) {
    return /^#?[0-9a-f]{6}$/i.test(String(value || '').trim());
}

function optionalUrl(value, label) {
    if (value == null) return undefined;
    if (value === '-') return null;
    try {
        const url = new URL(value);
        if (!['https:', 'http:'].includes(url.protocol)) throw new Error();
        return url.href;
    } catch {
        throw new Error(`URL inválida em **${label}**. Use um link HTTP ou HTTPS; envie hífen para limpar o campo.`);
    }
}

export const alliedAdmissionCommand = new SlashCommandBuilder()
    .setName('allied-admission')
    .setDescription('Configura o sistema próprio de admissão e atendimento da Allied')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sc) =>
        sc.setName('configurar')
            .setDescription('Define canais, categoria e cargos do processo')
            .addChannelOption((o) =>
                o.setName('canal_painel').setDescription('Canal onde ficará o painel de admissão').addChannelTypes(ChannelType.GuildText)
            )
            .addChannelOption((o) =>
                o.setName('categoria').setDescription('Categoria onde os canais privados serão criados').addChannelTypes(ChannelType.GuildCategory)
            )
            .addChannelOption((o) =>
                o.setName('canal_logs').setDescription('Canal privado de registros das solicitações').addChannelTypes(ChannelType.GuildText)
            )
            .addChannelOption((o) =>
                o.setName('canal_aceitacao').setDescription('Canal onde recrutadores recebem e aprovam formulários de entrada').addChannelTypes(ChannelType.GuildText)
            )
            .addChannelOption((o) =>
                o.setName('canal_conversa').setDescription('Canal onde novos membros recebem as boas-vindas após aprovação').addChannelTypes(ChannelType.GuildText)
            )
            .addRoleOption((o) =>
                o.setName('cargo_membro').setDescription('Cargo concedido somente após aprovação da equipe')
            )
            .addRoleOption((o) =>
                o.setName('cargo_provisorio').setDescription('Cargo temporário opcional atribuído ao enviar candidatura; deve ter acesso limitado')
            )
            .addRoleOption((o) =>
                o.setName('cargo_equipe').setDescription('Cargo autorizado a revisar solicitações')
            )
    )
    .addSubcommand((sc) =>
        sc.setName('visual')
            .setDescription('Personaliza o texto e a aparência do painel')
            .addStringOption((o) => o.setName('titulo').setDescription('Título do embed').setMaxLength(256))
            .addStringOption((o) => o.setName('descricao').setDescription('Descrição do embed').setMaxLength(4096))
            .addStringOption((o) => o.setName('cor').setDescription('Cor hexadecimal, exemplo #8B1A1A').setMaxLength(7))
            .addStringOption((o) => o.setName('autor').setDescription('Nome do autor no topo').setMaxLength(256))
            .addStringOption((o) => o.setName('autor_icone').setDescription('URL do ícone do autor; - limpa').setMaxLength(500))
            .addStringOption((o) => o.setName('miniatura').setDescription('URL da miniatura à direita; - limpa').setMaxLength(500))
            .addStringOption((o) => o.setName('imagem_gif').setDescription('URL da imagem ou GIF principal; - limpa').setMaxLength(500))
            .addStringOption((o) => o.setName('rodape').setDescription('Texto do rodapé').setMaxLength(2048))
            .addStringOption((o) => o.setName('rodape_icone').setDescription('URL do ícone do rodapé; - limpa').setMaxLength(500))
            .addStringOption((o) => o.setName('fields_json').setDescription('Array JSON de fields adicionais (máx. 25)').setMaxLength(4000))
            .addBooleanOption((o) => o.setName('data_hora').setDescription('Exibir data e hora no embed'))
    )
    .addSubcommand((sc) =>
        sc.setName('formulario')
            .setDescription('Substitui as perguntas de um dos formulários usando JSON')
            .addStringOption((o) =>
                o.setName('tipo').setDescription('Qual formulário deseja alterar').setRequired(true)
                    .addChoices(
                        { name: 'Entrada na gangue', value: 'entry' },
                        { name: 'Parceria', value: 'partnership' },
                        { name: 'Guerra', value: 'war' }
                    )
            )
            .addStringOption((o) =>
                o.setName('perguntas_json').setDescription('Array JSON com 1 a 5 perguntas').setRequired(true).setMaxLength(4000)
            )
    )
    .addSubcommand((sc) =>
        sc.setName('ativar')
            .setDescription('Abre ou fecha novas solicitações')
            .addBooleanOption((o) => o.setName('ligado').setDescription('True = aberto; False = fechado').setRequired(true))
    )
    .addSubcommand((sc) => sc.setName('publicar').setDescription('Publica ou atualiza o painel no canal configurado'))
    .addSubcommand((sc) => sc.setName('preview').setDescription('Visualiza o painel sem publicar no canal'))
    .addSubcommand((sc) => sc.setName('status').setDescription('Mostra as configurações atuais do sistema'))
    .addSubcommand((sc) =>
        sc.setName('remover-equipe')
            .setDescription('Remove um cargo da lista de revisores')
            .addRoleOption((o) => o.setName('cargo').setDescription('Cargo que deixará de revisar').setRequired(true))
    );

export async function executeAlliedAdmission(interaction) {
    if (!interaction.guildId || !interaction.guild) {
        return interaction.reply({ content: 'Este comando só pode ser usado dentro de um servidor.', ephemeral: true });
    }
    if (!isAdmin(interaction)) {
        return interaction.reply({ content: 'Você precisa da permissão **Gerenciar Servidor** para configurar a admissão.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'configurar') {
        const patch = {};
        const panel = interaction.options.getChannel('canal_painel');
        const category = interaction.options.getChannel('categoria');
        const logs = interaction.options.getChannel('canal_logs');
        const acceptance = interaction.options.getChannel('canal_aceitacao');
        const welcome = interaction.options.getChannel('canal_conversa');
        const memberRole = interaction.options.getRole('cargo_membro');
        const pendingRole = interaction.options.getRole('cargo_provisorio');
        const staffRole = interaction.options.getRole('cargo_equipe');
        if (panel) patch.panel_channel_id = panel.id;
        if (category) patch.ticket_category_id = category.id;
        if (logs) patch.log_channel_id = logs.id;
        if (acceptance) patch.acceptance_channel_id = acceptance.id;
        if (welcome) patch.welcome_channel_id = welcome.id;
        if (memberRole && memberRole.id === interaction.guild.roles.everyone.id) {
            return interaction.reply({ content: 'O cargo de membro não pode ser `@everyone`.', ephemeral: true });
        }
        if (pendingRole && pendingRole.id === interaction.guild.roles.everyone.id) {
            return interaction.reply({ content: 'O cargo provisório não pode ser `@everyone`.', ephemeral: true });
        }
        if (memberRole) patch.member_role_id = memberRole.id;
        if (pendingRole) patch.pending_role_id = pendingRole.id;
        if (staffRole) {
            if (staffRole.id === interaction.guild.roles.everyone.id || staffRole.managed) {
                return interaction.reply({ content: '`@everyone` não pode ser um cargo de revisão.', ephemeral: true });
            }
            const current = await getAdmissionConfig(guildId);
            patch.staff_role_ids = [...new Set([...current.staff_role_ids, staffRole.id])];
        }
        if (!Object.keys(patch).length) {
            return interaction.reply({ content: 'Informe pelo menos uma configuração.', ephemeral: true });
        }
        const currentConfig = await getAdmissionConfig(guildId);
        const nextMemberRole = patch.member_role_id || currentConfig.member_role_id;
        const nextPendingRole = Object.hasOwn(patch, 'pending_role_id') ? patch.pending_role_id : currentConfig.pending_role_id;
        if (nextPendingRole && nextPendingRole === nextMemberRole) {
            return interaction.reply({ content: 'O cargo provisório precisa ser diferente do cargo final de membro.', ephemeral: true });
        }
        const config = await updateAdmissionConfig(guildId, patch);
        return interaction.reply({
            content: `Configuração salva.\nPainel: ${config.panel_channel_id ? `<#${config.panel_channel_id}>` : 'não definido'}\nCanal de aceitação: ${config.acceptance_channel_id ? `<#${config.acceptance_channel_id}>` : 'não definido'}\nCanal de conversa: ${config.welcome_channel_id ? `<#${config.welcome_channel_id}>` : 'não definido'}\nCategoria: ${config.ticket_category_id ? `<#${config.ticket_category_id}>` : 'não definida'}\nCargo final: ${config.member_role_id ? `<@&${config.member_role_id}>` : 'não definido'}\nEquipe: ${config.staff_role_ids.length ? config.staff_role_ids.map((id) => `<@&${id}>`).join(', ') : 'nenhum cargo configurado'}`,
            ephemeral: true,
            allowedMentions: { parse: [] }
        });
    }

    if (sub === 'visual') {
        const patch = {};
        const fields = [
            ['titulo', 'panel_title'], ['descricao', 'panel_description'],
            ['autor', 'panel_author'], ['rodape', 'panel_footer_text']
        ];
        for (const [option, key] of fields) {
            const value = interaction.options.getString(option);
            if (value !== null) patch[key] = value;
        }
        const color = interaction.options.getString('cor');
        if (color !== null) {
            if (!isHexColor(color)) return interaction.reply({ content: 'Cor inválida. Use o formato `#8B1A1A`.', ephemeral: true });
            patch.panel_color = color.startsWith('#') ? color : `#${color}`;
        }
        const urlOptions = [
            ['autor_icone', 'panel_author_icon_url'], ['miniatura', 'panel_thumbnail_url'],
            ['imagem_gif', 'panel_image_url'], ['rodape_icone', 'panel_footer_icon_url']
        ];
        try {
            for (const [option, key] of urlOptions) {
                const value = interaction.options.getString(option);
                if (value !== null) patch[key] = optionalUrl(value, option);
            }
        } catch (error) {
            return interaction.reply({ content: error.message, ephemeral: true });
        }
        const fieldsRaw = interaction.options.getString('fields_json');
        if (fieldsRaw !== null) {
            try {
                const fields = JSON.parse(fieldsRaw);
                if (!Array.isArray(fields) || fields.length > 25) throw new Error('Informe um array com até 25 fields.');
                patch.panel_fields = fields.map((field, index) => {
                    const name = String(field?.name || '').trim();
                    const value = String(field?.value || '').trim();
                    if (!name || name.length > 256 || !value || value.length > 1024) {
                        throw new Error(`Field ${index + 1}: name (1–256) e value (1–1024) são obrigatórios.`);
                    }
                    return { name, value, inline: field.inline === true };
                });
            } catch (error) {
                return interaction.reply({ content: `Fields inválidos: ${error.message}`, ephemeral: true });
            }
        }
        const timestamp = interaction.options.getBoolean('data_hora');
        if (timestamp !== null) patch.panel_timestamp = timestamp;
        if (!Object.keys(patch).length) return interaction.reply({ content: 'Nenhum campo foi informado.', ephemeral: true });
        await updateAdmissionConfig(guildId, patch);
        return interaction.reply({ content: 'Visual do painel atualizado. Use `/allied-admission preview` e depois `/allied-admission publicar`.', ephemeral: true });
    }

    if (sub === 'formulario') {
        const kind = interaction.options.getString('tipo', true);
        const raw = interaction.options.getString('perguntas_json', true);
        let questions;
        try {
            questions = validateAdmissionQuestions(JSON.parse(raw));
        } catch (error) {
            return interaction.reply({ content: `Não consegui salvar o formulário: ${error.message}`, ephemeral: true });
        }
        const config = await getAdmissionConfig(guildId);
        const formQuestions = { ...config.form_questions, [kind]: questions };
        await updateAdmissionConfig(guildId, { form_questions: formQuestions });
        return interaction.reply({ content: `Formulário de **${ADMISSION_TYPES[kind]}** atualizado com ${questions.length} pergunta(s).`, ephemeral: true });
    }

    if (sub === 'ativar') {
        const enabled = interaction.options.getBoolean('ligado', true);
        if (enabled) {
            const config = await getAdmissionConfig(guildId);
            const errors = [];
            const botMember = interaction.guild.members.me || await interaction.guild.members.fetch(interaction.client.user.id).catch(() => null);
            const memberRole = config.member_role_id ? await interaction.guild.roles.fetch(config.member_role_id).catch(() => null) : null;
            const panelChannel = config.panel_channel_id ? await interaction.guild.channels.fetch(config.panel_channel_id).catch(() => null) : null;
            const staffRoles = await Promise.all((config.staff_role_ids || []).map((id) => interaction.guild.roles.fetch(id).catch(() => null)));
            const ticketCategory = config.ticket_category_id
                ? await interaction.guild.channels.fetch(config.ticket_category_id).catch(() => null)
                : null;
            const logChannel = config.log_channel_id
                ? await interaction.guild.channels.fetch(config.log_channel_id).catch(() => null)
                : null;
            const acceptanceChannel = config.acceptance_channel_id
                ? await interaction.guild.channels.fetch(config.acceptance_channel_id).catch(() => null)
                : null;
            const welcomeChannel = config.welcome_channel_id
                ? await interaction.guild.channels.fetch(config.welcome_channel_id).catch(() => null)
                : null;

            if (!memberRole || memberRole.id === interaction.guild.roles.everyone.id || memberRole.managed) errors.push('Cargo final de membro inválido ou gerenciado por integração.');
            if (!panelChannel?.isTextBased()) errors.push('Canal do painel não encontrado ou não é de texto.');
            if (!staffRoles.some((role) => role && role.id !== interaction.guild.roles.everyone.id && !role.managed)) errors.push('Configure pelo menos um cargo normal de equipe para revisar as solicitações.');
            if (config.ticket_category_id && (!ticketCategory || ticketCategory.type !== ChannelType.GuildCategory)) errors.push('Categoria de atendimentos inválida ou inacessível.');
            if (!acceptanceChannel?.isTextBased()) errors.push('Configure um canal de texto válido em canal_aceitacao.');
            if (!welcomeChannel?.isTextBased()) errors.push('Configure um canal de texto válido em canal_conversa.');
            if (config.log_channel_id && !logChannel?.isTextBased()) errors.push('Canal de logs inválido ou inacessível.');
            if (!botMember?.permissions?.has(PermissionFlagsBits.ManageChannels)) errors.push('A Kaori precisa de Gerenciar Canais.');
            if (!botMember?.permissions?.has(PermissionFlagsBits.ManageRoles)) errors.push('A Kaori precisa de Gerenciar Cargos.');
            if (memberRole && botMember && botMember.roles.highest.position <= memberRole.position) errors.push('O cargo mais alto da Kaori precisa ficar acima do cargo final de membro.');
            if (config.pending_role_id) {
                const pendingRole = await interaction.guild.roles.fetch(config.pending_role_id).catch(() => null);
                if (!pendingRole || pendingRole.id === interaction.guild.roles.everyone.id || pendingRole.managed) errors.push('Cargo provisório inválido ou gerenciado por integração.');
                else if (botMember && botMember.roles.highest.position <= pendingRole.position) errors.push('O cargo mais alto da Kaori precisa ficar acima do cargo provisório.');
                if (pendingRole && memberRole && pendingRole.id === memberRole.id) errors.push('O cargo provisório precisa ser diferente do cargo final.');
            }
            for (const [channel, label] of [[panelChannel, 'painel'], [acceptanceChannel, 'aceitação'], [welcomeChannel, 'conversa']]) {
                if (!channel || !botMember) continue;
                const perms = channel.permissionsFor(botMember);
                if (!perms?.has(PermissionFlagsBits.ViewChannel)) errors.push(`A Kaori precisa de Ver Canal em #${label}.`);
                if (!perms?.has(PermissionFlagsBits.SendMessages)) errors.push(`A Kaori precisa de Enviar Mensagens em #${label}.`);
                if ((channel === panelChannel || channel === acceptanceChannel) && !perms?.has(PermissionFlagsBits.EmbedLinks)) {
                    errors.push(`A Kaori precisa de Inserir Links em #${label} para publicar embeds.`);
                }
            }

            if (acceptanceChannel) {
                const recruitersCanView = staffRoles.some((role) => {
                    if (!role || role.id === interaction.guild.roles.everyone.id || role.managed) return false;
                    const rolePermissions = acceptanceChannel.permissionsFor(role);
                    return rolePermissions?.has(PermissionFlagsBits.ViewChannel)
                        && rolePermissions?.has(PermissionFlagsBits.ReadMessageHistory);
                });
                if (!recruitersCanView) {
                    errors.push('Pelo menos um cargo de recrutador precisa de Ver Canal e Ler Histórico de Mensagens em #aceitação.');
                }
            }
            if (errors.length) {
                return interaction.reply({ content: `Não foi possível abrir a admissão:
${errors.map((error) => `• ${error}`).join('\n')}`, ephemeral: true });
            }
        }
        await updateAdmissionConfig(guildId, { enabled });
        return interaction.reply({ content: enabled ? 'Admissão **aberta**. O painel já pode receber novas solicitações.' : 'Admissão **fechada**. Solicitações em andamento continuam acessíveis.', ephemeral: true });
    }

    if (sub === 'publicar') {
        const config = await getAdmissionConfig(guildId);
        if (!config.enabled) {
            return interaction.reply({ content: 'O sistema está fechado. Use `/allied-admission ativar ligado:true` antes de publicar.', ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: true });
        try {
            const result = await publishAdmissionPanel(interaction.guild, config);
            return interaction.editReply({ content: `Painel publicado/atualizado em ${result.channel}.` });
        } catch (error) {
            return interaction.editReply({ content: `Falha ao publicar: ${error.message}` });
        }
    }

    if (sub === 'preview') {
        const config = await getAdmissionConfig(guildId);
        return interaction.reply({ ...buildAdmissionPanelPayload(config), ephemeral: true });
    }

    if (sub === 'remover-equipe') {
        const role = interaction.options.getRole('cargo', true);
        const config = await getAdmissionConfig(guildId);
        const staffRoleIds = config.staff_role_ids.filter((id) => id !== role.id);
        await updateAdmissionConfig(guildId, { staff_role_ids: staffRoleIds });
        return interaction.reply({ content: `O cargo ${role} foi removido da equipe de revisão.`, ephemeral: true, allowedMentions: { parse: [] } });
    }

    const config = await getAdmissionConfig(guildId);
    const channel = (id) => id ? `<#${id}>` : 'Não configurado';
    const role = (id) => id ? `<@&${id}>` : 'Não configurado';
    const embed = new EmbedBuilder()
        .setColor(parseAdmissionColor(config.panel_color))
        .setTitle('ALLIED · Admission System')
        .setDescription(config.enabled ? '🟢 **Recebendo solicitações**' : '⚪ **Admissão fechada**')
        .addFields(
            { name: 'Painel', value: channel(config.panel_channel_id), inline: true },
            { name: 'Categoria dos tickets', value: channel(config.ticket_category_id), inline: true },
            { name: 'Canal de aceitação', value: channel(config.acceptance_channel_id), inline: true },
            { name: 'Canal de conversa', value: channel(config.welcome_channel_id), inline: true },
            { name: 'Canal de logs', value: channel(config.log_channel_id), inline: true },
            { name: 'Cargo final', value: role(config.member_role_id), inline: true },
            { name: 'Cargo provisório', value: role(config.pending_role_id), inline: true },
            { name: 'Equipe de revisão', value: config.staff_role_ids.length ? config.staff_role_ids.map(role).join('\n') : 'Nenhum cargo configurado', inline: false },
            { name: 'Formulários', value: Object.entries(ADMISSION_TYPES).map(([key, name]) => `${name}: **${(config.form_questions[key] || DEFAULT_QUESTIONS[key]).length}** perguntas`).join('\n') }
        )
        .setFooter({ text: `Membro padrão: ${ADMISSION_DEFAULTS.member_role_id}` })
        .setTimestamp();
    return interaction.reply({ embeds: [embed], ephemeral: true, allowedMentions: { parse: [] } });
}
