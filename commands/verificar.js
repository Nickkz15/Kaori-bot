import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { ROLE_ID } from '../config/kaori.js';

export const verificarCommand = new SlashCommandBuilder()
    .setName('verificar')
    .setDescription('Verifica os membros e corrige os cargos da Server Tag.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function verificarMembro(member, user = member.user) {
    try {
        const primaryGuild = user.primaryGuild;

        const estaUsandoTag =
            primaryGuild?.identityEnabled === true &&
            primaryGuild?.identityGuildId === member.guild.id;

        const role = member.guild.roles.cache.get(ROLE_ID);

        if (!role) {
            console.error(`❌ Cargo não encontrado: ${ROLE_ID}`);
            return;
        }

        if (estaUsandoTag) {
            if (!member.roles.cache.has(ROLE_ID)) {
                await member.roles.add(role);
                console.log(`✅ ${user.username} recebeu o cargo.`);
            }
        } else {
            if (member.roles.cache.has(ROLE_ID)) {
                await member.roles.remove(role);
                console.log(`❌ ${user.username} perdeu o cargo.`);
            }
        }

    } catch (error) {
        console.error(`❌ Erro ao verificar ${user.username}:`, error.message);
    }
}
