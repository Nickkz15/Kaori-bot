export async function buscarGifKaori(categoria) {
    try {
        const response = await fetch(
            `https://nekos.best/api/v2/${categoria}`,
            {
                headers: {
                    'User-Agent': 'KaoriDiscordBot (kaori-discord-bot)'
                }
            }
        );

        if (!response.ok) {
            throw new Error(`Nekos.best respondeu com HTTP ${response.status}`);
        }

        const data = await response.json();
        const url = data?.results?.[0]?.url;

        if (!url) {
            throw new Error('A API não retornou uma imagem válida.');
        }

        return url;

    } catch (error) {
        console.error('❌ Erro ao buscar GIF da Kaori:', error.message);
        return null;
    }
}