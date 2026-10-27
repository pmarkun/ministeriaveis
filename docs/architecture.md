# Ministeriáveis — arquitetura e migração

Aplicação React sobre Vinext (API compatível com Next), executada em Worker. Persistência relacional D1/SQLite via SQL preparado; R2 guarda fotos de participantes. Interface, domínio, dados, validação e persistência ficam separados.

- `app/ui`: interface e fluxos; `lib/domain.ts`: regras e modelo portável.
- `data/ministries.json`: 38 pastas e órgãos, orçamento de referência e atribuições com identificadores estáveis.
- `data/people.json`: base Wikipédia e referências. `public/photos`: miniaturas Wikimedia.
- `app/api/[...path]/route.ts`: API JSON; todas as escritas verificam identidade no servidor e origem.
- `db/schema.ts` e `drizzle`: esquema versionado. Não alterar migrações aplicadas.

## Modelo

Selection v1 inclui pastas, atributos com IDs, indicações, pessoas personalizadas, atribuições pendentes e orçamento ainda não redistribuído. Pessoas não podem ocupar duas pastas. Salvar exige pelo menos uma indicação, nenhuma atribuição pendente e justificativa de corte quando há excesso de orçamento. Recursos livres podem permanecer como economia.

Versões são imutáveis. O ID é SHA-256 truncado em 24 caracteres hexadecimais, calculado sobre o conteúdo canônico + identidade interna + versão de origem. `parent_id` aponta para a origem exata. Revisões do mesmo autor mantêm `root_id`; bifurcações iniciam nova raiz. Um cadastro de pessoa fica restrito à própria escalação, sem alterar a base global ou versões anteriores.

Apoios têm chave composta (versão, participante). O ranking de pessoas considera apenas a escalação mais recente de cada participante, um voto por pasta, e não multiplica votos por versões. Apoios são de versões e não aumentam artificialmente votos dos ministros. O ranking agrega escolhas em SQL de todos os participantes e apresenta até 20 nomes por pasta, sem carregar os snapshots completos em memória. A galeria mostra até 24 versões terminais.

## Portabilidade

1. Clonar o repositório em outro ambiente. `pnpm install` e `pnpm dev` para desenvolvimento com o starter; `pnpm build` para gerar Worker.
2. Migrar `versions`, `supports`, `uploads` de SQLite/D1 para SQLite ou PostgreSQL. Preservar IDs, `root_id`, `parent_id` e timestamps ISO.
3. Copiar R2 `photos/` para armazenamento S3 ou disco persistente. Manter a rota GET `/api/photos/:id` ou reescrever URLs nos snapshots com migração explícita; versões históricas precisam continuar acessíveis.
4. Substituir `getChatGPTUser()` por um adaptador da autenticação escolhida. Manter um mapa entre os IDs antigos de usuário e os novos IDs. Nunca trocar por e-mail como chave primária nem confiar em cabeçalhos arbitrários no novo servidor.
5. Adaptar o acesso ao banco em um único módulo; a API usa a forma SQLite de SQL preparado. Preservar semântica e transações ao portar para PostgreSQL.
6. Conservar schemaVersion e exportações JSON. A interface importa uma escalação e exporta a seleção ou o histórico do próprio usuário. Exportações de dados não embutem bytes das fotos: copie o armazenamento separadamente para uma migração completa.
7. Para GitHub: adicionar um remoto e enviar o código. Não versionar banco, fotos privadas exportadas em massa, credenciais ou estado local de execução.

A autenticação e hospedagem do Sites são as únicas integrações específicas de plataforma. O repositório não contém segredos. A identidade fornecida por Sites é distinta entre sites; planeje o mapa de contas na migração.

## API

GET `/api/me`, `/api/community`, `/api/versions/:hash`, `/api/history/:hash`, `/api/photos/:uuid`.
GET `/api/export`: histórico do usuário autenticado.
POST `/api/versions`: `{payload,parentId,ownerLabel}`.
POST ou DELETE `/api/support/:hash`: apoio idempotente.
POST `/api/photos`: bytes JPEG/PNG/WebP de até 3 MB; verifica assinatura, exige autenticação, até 40 envios por conta por dia.

## Limites editoriais e técnicos

Competências iniciais derivadas do texto original da Lei 14.600/2023, não de todos os decretos regimentais posteriores. Orçamentos são despesas não financeiras fiscal/seguridade da LOA 2026 pós-vetos, do Raio X Câmara de fevereiro, valores arredondados em bilhões. Não é orçamento de 2027 nem execução. 12 pastas com valor importado; demais `null`.

Pessoas: lista do gabinete Wikipédia consultada em 27/10/2026, inclusive antigos ocupantes. Partido pode ser histórico. Gênero e raça/cor começam não informados; novas declarações exigem fonte. Fotos Commons mantêm referência para autoria/licença na biografia. Antes de lançamento público em escala, ampliar revisão editorial, dados demográficos autodeclarados, atualização de partidos e moderação de cadastros/denúncias.

## Ampliação em 27/10/2026

`data/current-government.json` separa a composição de referência do governo dos rascunhos dos participantes. Tem uma indicação por cada uma das 38 pastas; a aba permite consultar e copiar para um rascunho independente. A lista foi conferida na Wikipédia em 27/10/2026; o diretório oficial do Planalto estava indisponível para coleta automatizada. Não existe atualização automática dessa referência.

`data/elections-2026.json` acrescenta 185 perfis: 50 deputados federais eleitos com maior votação nominal nacional e cinco candidatos ao Senado por UF (135), incluindo todos os 54 eleitos. O processamento valida o universo de 513 deputados e 54 senadores eleitos, usa apenas o 1º turno da eleição ordinária e lê uma vez cada um dos 27 arquivos estaduais, sem somar novamente o arquivo BRASIL. A data de geração do resultado original é preservada no JSON.

O campo `election` de cada pessoa conserva cargo disputado, UF, votos nominais, votos nominais válidos, situação, posição no recorte (nacional na Câmara, estadual no Senado), número e identificador da candidatura, ano e fontes. Só dados públicos necessários à ficha são exportados; CPF, contatos, data de nascimento e título eleitoral não entram no aplicativo. Gênero e raça/cor são os declarados na candidatura do TSE. Partido corresponde à candidatura; não é prometida filiação atual.

Reproduzir a importação:

```sh
python scripts/import-election-2026.py --votes-zip /path/votacao_candidato_munzona_2026.zip --candidates-zip /path/consulta_cand_2026.zip --as-of 2026-10-27
python scripts/import-election-photos.py --metadata-json /path/ckan-candidatos-2026.json --cache-dir /path/photo-cache
```

O segundo comando requer Pillow e usa o catálogo CKAN `package_show?id=candidatos-2026`. Baixa os arquivos oficiais por UF e copia só as 185 fotos selecionadas, redimensionadas. As fotografias mantêm a URL do arquivo-fonte. A importação principal combina as pessoas por identificador da base e correspondência explícita de nome, sem criar duas fichas para a mesma pessoa já reconhecida no gabinete.


### Saldo e justificativa de cortes

`budgetSummary` calcula referência, orçamento alocado, saldo livre e excesso a partir do recorte `scope`. `createMinistry`, `removeMinistry` e `allocateBudget` atualizam o saldo; o servidor compara o saldo recebido com o calculado, rejeitando discrepâncias. `Selection.budgetJustification` é opcional para compatibilidade com versões anteriores, mas obrigatório em novas gravações com excesso. O texto é público na versão e permanece no payload imutável. Recursos livres podem ser guardados como economia. Atribuições pendentes continuam bloqueando publicação da escalação, com conservação de IDs, textos e fontes originais. Não se pretende validar juridicamente nem executar os cortes sugeridos.


### Recorte editorial e ausência de opinião

Novas seleções usam `scope: editorial`. As dez pastas iniciais estão em `data/editorial-2026.json`; `additionalMinistryIds` registra quais outras pastas oficiais entraram na proposta, inclusive quando depois removidas ou fundidas. `referenceMinistries` deriva a referência de competências e orçamento dessa combinação. Os recortes históricos `top` e `all` continuam com a definição anterior, acrescidos das pastas extras quando existirem. Não se reescrevem versões já salvas.

Uma pasta ainda não incluída significa ausência de opinião. Seu orçamento e atribuições permanecem fora da simulação e não podem ser reaproveitados. `addExistingMinistry` inclui simultaneamente os valores e as competências oficiais, sem criar saldo artificial ou duplicatas. A integridade exige todas as competências das pastas de referência e rejeita atribuições oficiais importadas sem a inclusão correspondente. Criar uma pasta proposta continua separado de adicionar uma pasta oficial da lista.

`deferredMinistryIds` registra ausência de opinião em pastas que integravam o recorte. Essas pastas saem tanto da alocação quanto da referência: não geram saldo livre nem competências pendentes. A UI permite essa ação apenas se o objeto da pasta for idêntico ao catálogo original. A integridade rejeita IDs desconhecidos/duplicados, pastas simultaneamente ativas e diferidas, e competências legais fora da referência. A extinção mantém a referência e a conservação das competências. Reintroduzir uma pasta diferida limpa o marcador sem duplicar referências adicionais. O campo pode ficar sem pastas, mas salvar continua exigindo ao menos uma pessoa indicada.
