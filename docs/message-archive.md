# Arquivo privado de mensagens da Kaori

## O que é salvo

- Mensagens enviadas em canais e threads da única guilda configurada em **GUILD_ID**.
- Mensagens de membros, bots e webhooks.
- Conteúdo textual, embeds, componentes, stickers, enquetes disponíveis no objeto de mensagem, contagem de reações e metadados da mensagem.
- Edições: snapshot anterior e novo snapshot quando o Discord fornece a versão anterior; caso contrário, tenta recuperar o último snapshot salvo.
- Exclusões individuais e em massa.
- Anexos do Discord dentro dos limites técnicos descritos abaixo.

O arquivo é escrito diretamente no Cloudflare R2. Não usa PostgreSQL para gravar o conteúdo ou o índice principal. O PostgreSQL pode estar indisponível sem impedir este módulo de registrar eventos, desde que o processo da Kaori continue conectado ao Discord.

## Limites que precisam ficar claros

- O processo da Kaori precisa estar online e conectado ao Gateway para receber os eventos. Mensagens criadas e apagadas enquanto a Kaori está offline não podem ser recuperadas retroativamente.
- O evento normal de exclusão do Discord não informa quem executou a exclusão. O arquivo preserva a mensagem e registra a exclusão, mas não atribui o ato a uma pessoa ou bot sem uma correlação de auditoria separada, que pode ser inconclusiva.
- A captura de conteúdo depende de **GuildMessages** e da intenção privilegiada **MessageContent** estar habilitada no Developer Portal.
- A Kaori só recebe eventos dos canais e threads aos quais tem acesso. Threads privadas em que o bot não tenha acesso não serão observadas.
- Anexos são copiados imediatamente a partir dos domínios CDN do Discord, com limite padrão de 10 MiB por arquivo e 30 MiB por mensagem. É possível elevar o limite individual até 25 MiB por variável, mas o limite total por mensagem continua em 30 MiB. Arquivos maiores, URLs indisponíveis ou downloads falhos permanecem identificados no registro como não copiados.
- O comando /arquivo mensagem devolve no máximo 10 anexos, com até 20 MiB no total, em uma resposta efêmera.
- A busca examina no máximo 2.000 objetos por consulta para evitar consultas excessivamente caras. Se esse limite for atingido, a resposta informa que a varredura foi parcial.

## Segurança

- O bucket R2 deve permanecer privado; não habilite domínio público, acesso público ou links públicos.
- Mensagens, índices, configurações e anexos são comprimidos quando aplicável e criptografados no processo da Kaori com AES-256-GCM antes de serem enviados ao R2.
- IDs de canal, autor e mensagem não são expostos diretamente no caminho dos objetos de eventos; o índice por mensagem também usa um hash do ID.
- A chave de criptografia e as credenciais R2 ficam somente nas variáveis secretas da Railway. Não as adicione ao GitHub, código, prints ou mensagens.
- Os comandos são restritos ao ID configurado em **ARCHIVE_OWNER_ID**, mesmo que outra pessoa tenha Administrator ou Manage Server. As respostas de pesquisa são efêmeras.
- Um aviso público de transparência deve ser publicado antes da ativação. Se o aviso for apagado depois, a captura já ativada continuará funcionando, mas a administração deverá republicar o aviso para manter a transparência.

## Preparação do Cloudflare R2

1. Crie um bucket exclusivo para o arquivo da Allied.
2. Mantenha o bucket privado.
3. Crie credenciais S3 com Object Read & Write limitadas a esse bucket. Não use credenciais globais ou de outros buckets.
4. Copie o endpoint S3, Access Key ID e Secret Access Key. O endpoint padrão é https://<ACCOUNT_ID>.r2.cloudflarestorage.com e a região S3 usada pelo R2 é auto.
5. Configure três regras de Object Lifecycle para apagar objetos após 90 dias:
   - Prefixo events/<GUILD_ID>/
   - Prefixo attachments/<GUILD_ID>/
   - Prefixo message-index/<GUILD_ID>/
6. Não crie regra de expiração para config/<GUILD_ID>.bin, pois ela guarda a configuração de ativação e o aviso registrado.
7. Só depois de conferir as três regras, adicione **ARCHIVE_RETENTION_CONFIRMED=90_DAYS** na Railway. Essa confirmação impede a ativação acidental sem a política externa de expiração.

Se o bucket for dedicado exclusivamente a este sistema e a esta guilda, os prefixos podem ser simplesmente events/, attachments/ e message-index/.

## Variáveis na Railway

Adicione em Variables:

- **ARCHIVE_R2_ENDPOINT**: endpoint S3 do seu R2.
- **ARCHIVE_R2_BUCKET**: nome exato do bucket privado.
- **ARCHIVE_R2_ACCESS_KEY_ID**: Access Key ID.
- **ARCHIVE_R2_SECRET_ACCESS_KEY**: Secret Access Key.
- **ARCHIVE_ENCRYPTION_KEY**: 64 caracteres hexadecimais (32 bytes).
- **ARCHIVE_OWNER_ID**: seu ID de usuário Discord, com 17 a 20 dígitos.
- **ARCHIVE_RETENTION_CONFIRMED**: 90_DAYS, somente após configurar as três regras.
- **ARCHIVE_MAX_ATTACHMENT_BYTES**: opcional; padrão 10485760 (10 MiB), máximo 26214400 (25 MiB).

Para gerar uma chave nova de criptografia no PowerShell, execute localmente:

    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

Guarde uma cópia segura da chave. Se ela for perdida ou alterada, os objetos já criptografados não poderão ser descriptografados. Não gere uma chave nova a cada deploy.

## Ativação no Discord

1. Confirme no Developer Portal: Bot > Privileged Gateway Intents > Message Content Intent.
2. Reinicie/deploy a Kaori depois de adicionar as variáveis.
3. Use /arquivo status. Todos os campos obrigatórios precisam aparecer como disponíveis.
4. Use /arquivo aviso canal:#regras para publicar o aviso.
5. Use /arquivo ativar ligado:true.
6. Teste com uma mensagem de texto, uma edição, uma exclusão e um arquivo pequeno em um canal de teste.
7. Use /arquivo recentes e /arquivo mensagem id:<ID> para conferir o arquivo.

Para pausar a captura, use /arquivo ativar ligado:false. Isso não apaga os arquivos existentes; a regra do R2 continua responsável pela retenção de 90 dias.

## Comandos

- /arquivo status
- /arquivo aviso canal:#regras
- /arquivo ativar ligado:true
- /arquivo ativar ligado:false
- /arquivo recentes dias:1 limite:10
- /arquivo buscar termo:palavra usuario:@membro canal:#geral dias:7 tipo:deleted limite:10
- /arquivo mensagem id:<ID>

## Retenção

A aplicação impõe uma janela máxima de consulta de 90 dias. A exclusão física dos objetos é feita pelas regras de lifecycle do R2, não pelo PostgreSQL. O Cloudflare informa que os objetos normalmente são removidos em até 24 horas após a data de expiração calculada pela regra; portanto, 90 dias é a idade de expiração configurada, com possível atraso operacional de até cerca de um dia.
