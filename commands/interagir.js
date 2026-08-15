import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { interagir } from '../systems/interaction.js';

export const interagirCommand = new SlashCommandBuilder()
    .setName('interagir')
    .setDescription('Interage com a Kaori')
    .addStringOption(o =>
        o.setName('acao')
            .setDescription('O que fazer?')
            .setRequired(true)
            .addChoices(
                { name: '☕ Conversar', value: 'conversar' },
                { name: '🎮 Jogar', value: 'jogar' },
                { name: '😈 Provocar', value: 'provocar' },
                { name: '💌 Elogiar', value: 'elogiar' },
                { name: '🤗 Abraçar', value: 'abracar' },
                { name: '🌙 Despedir-se', value: 'despedir' },
                { name: '🔮 Segredo (90+ afinidade)', value: 'segredo' }
            )
    );

export async function executeInteragir(interaction) {
    const acao = interaction.options.getString('acao');
    const result = interagir(interaction.user.id, acao);

    if (!result.ok) {
        return interaction.reply({ content: result.msg, ephemeral: true });
    }

    const efeitos = [];
    if (result.efeito.carinho) efeitos.push(`❤️ ${result.efeito.carinho > 0 ? '+' : ''}${result.efeito.carinho}`);
    if (result.efeito.confianca) efeitos.push(`🤝 ${result.efeito.confianca > 0 ? '+' : ''}${result.efeito.confianca}`);
    if (result.efeito.afinidade) efeitos.push(`✨ ${result.efeito.afinidade > 0 ? '+' : ''}${result.efeito.afinidade}`);
    if (result.efeito.humor) efeitos.push(`🎭 ${result.efeito.humor > 0 ? '+' : ''}${result.efeito.humor}`);

    const embed = new EmbedBuilder()
        .setColor(acao === 'segredo' ? 0xe74c3c : 0xff4d6d)
        .setTitle(result.acao.nome)
        .setDescription(`${result.frase}\n\n${efeitos.length ? efeitos.join(' · ') : ''}`);

    await interaction.reply({ embeds: [embed] });

    try {
        const { tentarPresenteSecreto } = await import('../systems/secretGifts.js');
        const secreto = tentarPresenteSecreto(interaction.user.id);
        if (secreto) {
            await interaction.followUp({
                embeds: [{
                    color: 0x9b59b6,
                    title: '🎁 Presente Secreto',
                    description: `Kaori deixou algo pra você...\n\n**${secreto.item.nome}**\n${secreto.frase}`
                }],
                ephemeral: true
            });
        }
    } catch {}
}