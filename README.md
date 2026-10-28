# Ministeriáveis

Escale o governo como uma seleção de futebol: conheça as pastas, escolha pessoas, reorganize ministérios e publique versões com origem rastreável.

## Executar

Node >=22.13.0. `pnpm install`, `pnpm dev`; `pnpm build` gera o Worker para publicação. No Sites, use os helpers da plataforma. O manifesto `.openai/hosting.json` declara D1 `DB` e R2 `BUCKET`. Migrações SQL ficam em `drizzle/` e são aplicadas pela publicação. Para prévia local, aplicar a migração no D1 local com Wrangler antes de testar as escritas.

Detalhes de modelo, API, dados, limitações e roteiro para migração fora do Sites: [docs/architecture.md](docs/architecture.md).

## Fontes

- [Lei 14.600/2023](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14600.htm), texto original como referência das competências, e [Lei 14.816/2024](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/lei/l14816.htm).
- [Raio X da LOA 2026 pós-vetos, Câmara, página 4](https://www2.camara.leg.br/orcamento-da-uniao/raio-x-do-orcamento/2026/RaioXdoOramento2026PsVetos.pdf).
- [Lista de membros do gabinete Lula, Wikipédia](https://pt.wikipedia.org/wiki/Lista_de_membros_do_gabinete_de_Lula_(2023%E2%80%93presente)), consulta em 27/10/2026. Conteúdo Wikipédia sob CC BY-SA; fotografias Wikimedia Commons com licença/autoria individual acessíveis pela referência de cada pessoa.

Nenhum dado demográfico é inferido a partir de nome ou aparência. Cadastros da comunidade exigem referência pública e fonte para autodeclaração. Nomes listados não representam apoio, disponibilidade nem nomeação.

## Governo atual e banco eleitoral

A aba Governo atual apresenta uma composição de referência de 27/10/2026, com opção de copiá-la para uma nova escalação. Na escolha de pessoas, filtre Governo atual, histórico do gabinete, Câmara 2026 ou Senado 2026, além de UF, partido e eleitos.

O recorte eleitoral acrescenta os 50 eleitos à Câmara mais votados no Brasil e cinco candidatos ao Senado por UF, incluindo todos os eleitos (135 nomes em 27 UFs). Fotos e votos vêm do TSE. A condição de eleito em 2026 não significa exercício do mandato antes de 2027. Fontes: [Resultados 2026](https://dadosabertos.tse.jus.br/dataset/resultados-2026) e [Candidaturas 2026](https://dadosabertos.tse.jus.br/dataset/candidatos-2026). Os scripts em `scripts/import-election-*.py` permitem reproduzir a importação.

## Reorganização e orçamento

Clique em uma pasta para removê-la. O painel abaixo do campo acompanha orçamento livre e atribuições pendentes. Atribuições legais mantêm texto e fonte; a nova pasta pode recebê-las, além das atribuições sugeridas pelo autor. Toda atribuição precisa de destino antes de salvar. O orçamento livre pode permanecer como economia ou ser transferido.

O saldo considera o total conhecido das pastas de referência incluídas na seleção (dez editoriais e quaisquer pastas adicionadas da lista; versões anteriores mantêm o recorte original) menos os valores alocados. Criar uma pasta consome primeiro esse saldo. Se a proposta exceder a referência, `budgetJustification` registra de onde virá o corte. É uma explicação descritiva, sem alteração automática de outras pastas. Valores não individualizados continuam identificados. A API recalcula os totais e impede salvar excedentes sem justificativa, mesmo em requisições diretas. Os campos seguem no JSON e no hash de cada versão, sem migração de banco.

## GitHub e migração

Repositório: https://github.com/pmarkun/ministeriaveis. Os arquivos de execução não contêm chaves ou dados de usuários. `data/` e `public/photos/` contêm apenas a base pública de referência; uploads e versões dos participantes permanecem no armazenamento do aplicativo. A autenticação própria está em `lib/auth.ts`, com contas e sessões em D1. Para hospedar fora do Sites, preserve IDs das contas, hashes de senha e sessões ou revogue as sessões durante a migração; nunca use cabeçalhos arbitrários como identidade. Adapte os bindings D1/R2 e o manifesto de hospedagem conforme descrito em `docs/architecture.md`.

## Seleção editorial

Novas escalações começam com dez pastas escolhidas editorialmente, definidas em `data/editorial-2026.json`: Casa Civil, Fazenda, Planejamento, Saúde, Educação, Desenvolvimento Social, Justiça, Defesa, Relações Exteriores e Meio Ambiente. O critério busca cobrir áreas centrais de governo, sem ordenar por orçamento. A lista de seleção abaixo do campo permite escolher e adicionar outras pastas individualmente. A quantidade de pastas a critério do Presidente aparece logo abaixo; a relação completa abre em “Ver quais são”. As demais ficam a critério do Presidente e não geram recursos livres nem atribuições pendentes. Uma pasta adicionada passa a integrar a referência orçamentária e a conservação de competências. “Deixar a critério do Presidente” retira uma pasta original sem liberar recursos ou gerar pendências; ela pode ser adicionada novamente. “Propor extinção” conserva sua referência e exige realocar as competências. Pastas modificadas ou fundidas não podem ser descartadas como ausência de opinião.

O novo recorte usa `scope: "editorial"` , `additionalMinistryIds` e `deferredMinistryIds`. JSONs antigos com `top` e `all` continuam aceitos e preservam seus valores, escolhas e competências. A composição de referência completa continua na aba Governo atual; usá-la como base copia as dez editoriais, e outras podem ser adicionadas depois.

Ao abrir a página sem link de versão, o campo começa sempre com Lula e as dez pastas editoriais. Se houver uma escalação local, o botão Retomar rascunho a recupera explicitamente. A abertura da página não substitui esse rascunho. Ao começar a editar uma escalação nova, o rascunho anterior fica em uma cópia local de segurança e a proposta em edição passa a ser a salva automaticamente. Links de versões continuam abrindo a versão exata.

## Fluxo de participação

Visitantes podem montar e consultar escalações; salvar versões e fortalecer exigem autenticação. O compartilhamento pode ser parcial, com pelo menos uma indicação. Ao adicionar uma pasta, abre-se a busca para indicar uma pessoa; perfis e fontes são expansíveis. “Criar minha versão” preserva a origem. A redistribuição de competências permite selecionar várias atribuições, mostra a pasta de origem e oferece desfazer a última transferência enquanto o painel permanece aberto. No celular, salvar e compartilhar tem uma barra fixa.

## Acesso próprio

A conta do aplicativo usa e-mail e senha, sem login do ChatGPT. O e-mail é um identificador privado, sem confirmação de propriedade nem envio de mensagens. Senhas são protegidas com scrypt (N=16384, r=8, p=5), salt aleatório de 16 bytes e saída de 32 bytes. A sessão tem token aleatório de 32 bytes em cookie HttpOnly/SameSite=Lax/Secure em HTTPS, validade fixa de 30 dias e somente o hash do token é armazenado. Login renova a sessão; sair a revoga. Origem é validada nas escritas. Tentativas de acesso e recuperação têm limites por conta e por IP.

Cadastro, recuperação e troca de senha entregam um código de recuperação de uso único, exibido somente nessa resposta; o banco guarda seu hash. A recuperação não depende de e-mail transacional. Trocar a senha ou usar o código revoga as sessões anteriores e gira o código; a versão da credencial impede reutilização de sessões criadas concorrentemente com senha antiga. Na conta, é possível alterar a senha e renovar esse código. Sem a senha e sem o código guardado, a interface não permite recuperar o acesso.

Versões antigas vinculadas à identidade da hospedagem continuam acessíveis e podem originar novas versões. Não se transfere a autoria para uma conta nova somente por coincidência de e-mail ou apelido. Uma eventual vinculação precisa comprovar as duas identidades. Rascunhos locais continuam disponíveis.

O cadastro de pessoas tem uma chamada destacada e, em buscas sem resultado, uma ação que aproveita o nome buscado. Cadastrar e indicar com uma URL de foto funciona no rascunho sem conta; enviar arquivo de foto e publicar a escalação exigem acesso.

Verificação: `node --test tests/auth.test.mjs tests/api.test.mjs tests/auth-worker.test.mjs`, além dos testes de domínio/catálogo e TypeScript. Os testes de autenticação exercitam as rotas reais com SQLite isolado e criptografia real, sem simular o verificador de sessões. O teste Worker usa Miniflare/workerd e D1 isolados para verificar cadastro, login, recuperação e saída no runtime real.

## Nomes públicos

E-mails são usados somente como identificador de acesso no servidor. Respostas de conta e `/api/me` enviam apenas ID e nome público. Nome ausente ou contendo `@` vira “Participante” na interface e nos autores de versões/histórico. Novos cadastros, alterações de perfil e rótulos de autoria não aceitam e-mail como nome. “Minha conta” permite editar o nome em `/api/auth/profile`; essa alteração também corrige rótulos antigos vazios ou com e-mail, preservando apelidos explícitos e o conteúdo/hash das versões.
