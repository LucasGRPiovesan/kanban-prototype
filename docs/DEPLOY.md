# Deploy — Vercel + Aiven

Guia de publicação da primeira versão: frontend e API na **Vercel**, banco **MySQL no
Aiven** e anexos no **Vercel Blob**. O ambiente Docker local continua funcionando igual —
nada aqui é exclusivo da Vercel no código, só configuração.

## Sumário

- [Arquitetura publicada](#arquitetura-publicada)
- [Pré-requisitos](#pré-requisitos)
- [1. Banco de dados no Aiven](#1-banco-de-dados-no-aiven)
- [2. Projeto da API na Vercel](#2-projeto-da-api-na-vercel)
- [3. Projeto do frontend na Vercel](#3-projeto-do-frontend-na-vercel)
- [4. Fechando o circuito](#4-fechando-o-circuito)
- [Production × Preview](#production--preview)
- [Checklist pós-deploy](#checklist-pós-deploy)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Comportamento em ambiente serverless](#comportamento-em-ambiente-serverless)
- [Segurança](#segurança)
- [Migrations](#migrations)
- [Execução local com Docker](#execução-local-com-docker)
- [Solução de problemas](#solução-de-problemas)

---

## Arquitetura publicada

```mermaid
flowchart LR
    B[Navegador] -->|"/ , /assets/*"| F["Vercel — projeto frontend<br/>(build estático do Vite)"]
    B -->|"/api/v1/*"| F
    F -->|"rewrite de mesma origem<br/>$API_ORIGIN/api/*"| A["Vercel — projeto API<br/>(Express como função, Fluid compute)"]
    A -->|"TLS verificado (CA do Aiven)"| D[("Aiven — MySQL 8")]
    A -->|"put / delete via OIDC"| S[("Vercel Blob<br/>(store público)")]
    B -->|"miniaturas e anexos"| S
```

Decisões que moldam o deploy:

| Decisão | Por quê |
|---|---|
| **Dois projetos na Vercel** (`frontend/` e `backend/`) | Cada um com seu build, variáveis e ciclo de deploy; o monorepo continua um só repositório. |
| **Rewrite de mesma origem** (`/api/*` do frontend → API) | O navegador só conversa com o domínio do frontend: o cookie de sessão é *first-party*, `SameSite=Lax` funciona em todos os navegadores (inclusive Safari, que bloqueia cookies de terceiros) e não há CORS no caminho. O destino vem da variável `API_ORIGIN` — nenhuma URL fica fixa no repositório. |
| **Vercel Blob para anexos, autenticado por OIDC** | O disco das funções é efêmero. O adapter `VercelBlobStorage` implementa a mesma porta `FileStoragePort` do disco local e nunca recebe credencial: o SDK usa o token OIDC que a Vercel entrega a cada requisição da função, junto de `BLOB_STORE_ID` — nenhum segredo de longa duração no projeto. O banco guarda chaves, não URLs, então trocar de driver nunca reescreve linhas. |
| **Migrations e seed só no build de Production** | Aplicadas antes de o novo deploy receber tráfego — o código nunca roda contra um schema mais antigo. Deploys de Preview geram o Prisma Client e não tocam o banco. |
| **Uma única migration de inicialização, mais as que vierem depois** | O histórico de desenvolvimento foi consolidado em `20260913000000_init` (verificado idêntico à cadeia anterior); mudanças no schema entram como novas migrations a partir dela. |

---

## Pré-requisitos

- Repositório no GitHub (os arquivos de ferramentas de IA, `.env` e dados locais já estão
  no `.gitignore`).
- Conta na **Vercel** (o plano Hobby atende a avaliação).
- Conta no **Aiven** com um serviço **MySQL 8**.
- Node.js 22 localmente, apenas se quiser rodar a seed ou migrations manualmente.

---

## 1. Banco de dados no Aiven

1. Crie um serviço **MySQL**. Se possível, escolha uma região próxima da região das
   funções da Vercel (padrão `iad1`, Washington D.C.; ajustável em *Project Settings →
   Functions → Region*). Latência entre função e banco é o custo dominante de cada
   requisição.
2. Na página do serviço, em **Connection information**:
   - copie a **Service URI** (`mysql://avnadmin:SENHA@HOST:PORTA/defaultdb?ssl-mode=REQUIRED`);
   - baixe o **CA certificate** (`ca.pem`).
3. Monte a `DATABASE_URL` no formato do Prisma — **troque** `?ssl-mode=REQUIRED` por um
   limite de conexões por instância:

   ```
   mysql://avnadmin:SENHA@HOST:PORTA/defaultdb?connection_limit=5
   ```

   A senha precisa estar *URL-encoded* se tiver caracteres especiais.

4. O TLS verificado é ligado pela variável `DATABASE_CA_CERT` (passo 2): a aplicação grava
   o certificado num arquivo temporário e acrescenta `sslcert=…&sslaccept=strict` à URL —
   no runtime, nas migrations e na seed. Aceita o PEM como texto ou em base64:

   ```bash
   # base64 em uma linha, útil para colar no painel da Vercel
   base64 -w0 ca.pem          # Linux
   base64 -i ca.pem | tr -d '\n'   # macOS
   ```

> **Compatível com os padrões do Aiven.** Todas as tabelas têm chave primária (o Aiven
> liga `sql_require_primary_key`) e cada tabela declara `utf8mb4_unicode_ci`
> explicitamente, independentemente do collation padrão do servidor.

---

## 2. Projeto da API na Vercel

1. **Add New → Project**, importe o repositório.
2. **Root Directory:** `backend`. O `backend/vercel.json` já define o preset **Express**,
   *Fluid compute*, `npm ci` e o build `npm run vercel-build`.
3. **Storage → Create → Blob**:
   - acesso **Public** (o modo de um store não pode ser alterado depois; os anexos são
     entregues pela URL, com UUID aleatório, como no driver local);
   - ambientes: marque **Production** (desmarque *Preview*, ou use outro store para Preview —
     veja [Production × Preview](#production--preview));
   - conecte ao projeto. A Vercel adiciona `BLOB_STORE_ID` e passa a entregar às funções um
     token **OIDC** de curta duração, renovado automaticamente. Não há token a copiar.

   > `BLOB_READ_WRITE_TOKEN` é o token estático que a Vercel indica só para código que roda
   > **fora** dela (Docker, CI). Na Vercel o OIDC tem precedência sempre que `BLOB_STORE_ID`
   > existe, e o adapter nunca passa um token explícito — o que anularia o OIDC. Não é
   > necessário cadastrá-lo.

4. **Environment Variables** — escopo **Production** (veja [Production × Preview](#production--preview)):

   | Variável | Valor |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | a URL do passo 1.3 — *Secret* |
   | `DATABASE_CA_CERT` | o `ca.pem` (texto ou base64) |
   | `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` — *Secret* |
   | `CORS_ORIGIN` | a URL do frontend (preencha no passo 4) |
   | `STORAGE_DRIVER` | `vercel-blob` |
   | `APP_TIMEZONE` | `America/Sao_Paulo` |
   | `SEED_ASSISTANT_API_KEY` | *(opcional)* chave do Gemini para o assistente de IA — *Secret* |

   Na Vercel (`VERCEL=1`) a API aplica sozinha os valores seguros da plataforma quando as
   variáveis estão ausentes: `UPLOAD_MAX_FILE_SIZE_MB=4`, `NOTIFICATION_STREAM_MAX_SECONDS=240`
   e `NOTIFICATION_POLL_INTERVAL_SECONDS=5`. Valores explícitos além dos limites da plataforma
   são recusados na inicialização.

5. **Deploy.** O build (`scripts/vercel-build.ts`) decide pelo ambiente
   (`VERCEL_TARGET_ENV`, com `VERCEL_ENV` de reserva):

   | Etapa | Production | Preview / ambientes customizados |
   |---|:---:|:---:|
   | `prisma generate` | ✅ | ✅ |
   | `prisma migrate deploy` | ✅ | — |
   | seed idempotente (perfis, usuários de avaliação, dados de demonstração) | ✅, salvo `SEED_ON_DEPLOY=false` | — |

   Em Production, `DATABASE_URL` ausente derruba o build com mensagem explícita. A regra
   está isolada em `scripts/vercel-build-plan.ts` e coberta por testes.
6. Anote o domínio de produção, ex.: `https://kanban-api.vercel.app`. Teste
   `https://kanban-api.vercel.app/health` e `/docs`.

---

## 3. Projeto do frontend na Vercel

1. **Add New → Project**, o mesmo repositório.
2. **Root Directory:** `frontend`. Mantenha habilitado *Include files outside the root
   directory in the Build Step* (padrão): o módulo **Documentação** lê `../docs/*.md` e
   `../README.md` durante o build.
3. **Environment Variables:**

   | Variável | Valor |
   |---|---|
   | `API_ORIGIN` | domínio de produção da API, **sem barra final**: `https://kanban-api.vercel.app` |
   | `VITE_UPLOAD_MAX_FILE_SIZE_MB` | `4` (texto de ajuda dos anexos) |

   **Não** defina `VITE_API_BASE_URL`: vazia, a aplicação usa `/api/v1` relativo, que é o
   caminho atendido pela rewrite.

4. **Deploy.** O `scripts/vercel-build.mjs` recusa o build se `API_ORIGIN` estiver
   ausente ou mal formada — melhor falhar no build do que em cada requisição em produção.

O `frontend/vercel.json` cuida de: rewrite `/api/:path*` → `$API_ORIGIN/api/:path*`, fallback
de SPA para `index.html`, cache imutável de `/assets/*` e cabeçalhos de segurança
(`X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`).

> **Sintaxe da variável na rewrite.** A Vercel expande variáveis de ambiente no destino
> quando elas estão listadas em `env` (`"env": ["API_ORIGIN"]`), no formato **`$API_ORIGIN`**.
> A forma `${API_ORIGIN}` é codificada como `$%7BAPI_ORIGIN%7D` pelo compilador de rotas
> da própria Vercel e nunca seria expandida. `scripts/check-vercel-config.mjs` compila o
> arquivo com `@vercel/routing-utils` — a mesma biblioteca da plataforma — e o build falha se
> a rewrite não resultar em `$API_ORIGIN/api/$1` (`npm run check:vercel` faz o mesmo localmente).
>
> O cabeçalho `x-vercel-enable-rewrite-caching: 0` em `/api/:path*` desliga o cache de
> respostas da origem na rewrite (mecanismo documentado pela Vercel); a API, além disso,
> responde `Cache-Control: no-store`.
>
> A expansão usa as variáveis do deploy: mudou `API_ORIGIN`, faça **redeploy** do frontend.

---

## 4. Fechando o circuito

1. No projeto da **API**, defina `CORS_ORIGIN` com o domínio de produção do frontend
   (ex.: `https://kanban.vercel.app`). Vários domínios: separe por vírgula.
2. **Redeploy** da API para aplicar.

`CORS_ORIGIN` é também a lista da proteção CSRF (verificação do header `Origin`) e aqui é
**obrigatória**: atrás de uma rewrite entre projetos, a Vercel entrega à API `Host` e
`X-Forwarded-Host` com o domínio da própria API, então a origem do frontend só é aceita se
estiver listada. Um deploy de *preview* do frontend recebe `403 ORIGIN_NOT_ALLOWED` até ser
adicionado — o que, por padrão, impede previews de operar sobre a API de produção.

---

## Production × Preview

Cada push fora da branch de produção cria um **Preview Deployment**. A regra deste projeto:
**Preview nunca escreve no banco de produção.**

- **Build:** garantido pelo código — só `VERCEL_TARGET_ENV=production` executa migrations e
  seed (tabela do passo 2.5).
- **Runtime:** garantido pela configuração. Cadastre `DATABASE_URL`, `DATABASE_CA_CERT` e
  `JWT_SECRET` com escopo **somente Production**, e conecte o Blob store só a Production.
  Sem essas variáveis a API de preview recusa inicializar (validação da configuração), em vez
  de ler e gravar dados reais.
- **Quer previews funcionais?** Crie um segundo serviço MySQL (ou outro banco) e um segundo
  Blob store, cadastre as mesmas variáveis com escopo **Preview** e prepare esse banco uma vez
  a partir da sua máquina:

  ```bash
  cd backend
  DATABASE_URL="mysql://…preview…" DATABASE_CA_CERT="$(cat ca-preview.pem)" npm run db:deploy
  ```

  No frontend, `API_ORIGIN` pode ter um valor por ambiente (a API de preview), e o domínio
  de preview do frontend entra no `CORS_ORIGIN` da API de preview.
- **Deployment Protection:** por padrão a Vercel exige login nos deploys de preview. Uma
  rewrite do frontend para uma API de preview protegida recebe a página de autenticação;
  aponte `API_ORIGIN` para o domínio de produção da API ou ajuste a proteção do projeto da API.

---

## Checklist pós-deploy

- [ ] `https://<api>/health` responde `200`.
- [ ] O frontend abre a tela de login com os 8 usuários de avaliação.
- [ ] Entrar como **Mariana Alves** (Administrador): Kanban sem arrastar/editar/excluir.
- [ ] Entrar como **Joana Martins** (Agilista): arrastar um card, editar, excluir; o
      quadro mostra os três projetos.
- [ ] Anexar uma imagem numa demanda: a miniatura aparece no card (confirma Vercel Blob
      + Sharp na função).
- [ ] Abrir um PDF anexado no visualizador e usar **Baixar**. Se o armazenamento recusar
      a exibição embutida ou o download direto, o arquivo abre numa nova aba.
- [ ] Com duas janelas (Joana e Lucas Barbosa), mover um card de Lucas como Joana: o sino
      de Lucas acende em poucos segundos.
- [ ] `https://<api>/docs` abre o Swagger.
- [ ] Recarregar uma rota profunda (ex.: `/kanban`) no frontend não dá 404.

---

## Variáveis de ambiente

### API (`backend/`)

| Variável | Padrão | Descrição |
|---|---|---|
| `NODE_ENV` | `development` | `production` em qualquer ambiente publicado |
| `PORT` | `3333` | Só para o servidor tradicional (`src/main/server.ts`); a Vercel ignora |
| `DATABASE_URL` | — | Conexão MySQL (obrigatória). Serverless: `?connection_limit=5` |
| `DATABASE_CA_CERT` | — | CA do MySQL gerenciado (PEM ou base64); liga `sslaccept=strict` |
| `JWT_SECRET` | — | ≥ 32 caracteres (obrigatória). Também deriva a chave que cifra a chave do assistente |
| `JWT_EXPIRES_IN` | `12h` | Validade da sessão |
| `AUTH_COOKIE_NAME` | `kanban_session` | Nome do cookie |
| `AUTH_COOKIE_SAMESITE` | `lax` | `none` só com API em outro site (exige `AUTH_COOKIE_SECURE=true`) |
| `AUTH_COOKIE_SECURE` | `true` em produção | Cookie só por HTTPS |
| `TRUST_PROXY` | `1` | Proxies à frente da API; define o IP usado no rate limit (atrás da rewrite da Vercel é o IP do proxy — ver rate limiting abaixo) |
| `CORS_ORIGIN` | `http://localhost:5173` | Origens do frontend (CORS e CSRF) |
| `STORAGE_DRIVER` | `local` | `local` (disco + `/files`) ou `vercel-blob` |
| `STORAGE_LOCAL_DIR` | `./storage` | Driver local |
| `STORAGE_PUBLIC_BASE_URL` | `http://localhost:3333/files` | Driver local |
| `BLOB_STORE_ID` | — | Id do Blob store. Adicionada pela Vercel ao conectar o store; com ela o SDK autentica por **OIDC** |
| `BLOB_READ_WRITE_TOKEN` | — | Só **fora** da Vercel (Docker, CI) com `vercel-blob` |
| `BLOB_PUBLIC_BASE_URL` | derivada do store | `https://<store>.public.blob.vercel-storage.com` |
| `UPLOAD_MAX_FILE_SIZE_MB` | `10` (Vercel: `4`) | Na Vercel, acima de 4,5 é recusado |
| `UPLOAD_MAX_FILES_PER_REQUEST` | `10` | Arquivos por envio |
| `NOTIFICATION_STREAM_MAX_SECONDS` | `1800` (Vercel: `240`) | Na Vercel, `0` ou ≥ 300 é recusado |
| `NOTIFICATION_POLL_INTERVAL_SECONDS` | `15` (Vercel: `5`) | Entrega de notificações entre instâncias |
| `API_DOCS_ENABLED` | `true` | Swagger em `/docs` |
| `INTEGRATION_TOKEN_EXPIRES_IN` | `1h` | Token da API de integração |
| `APP_TIMEZONE` | `America/Sao_Paulo` | Calendário da Dashboard |
| `SEED_ASSISTANT_API_KEY` | — | Só a seed: chave do Gemini gravada cifrada num banco novo |
| `SEED_ON_DEPLOY` | `true` | Só o build de Production na Vercel: `false`/`0`/`off` pula a seed (migrations continuam) |
| `VERCEL`, `VERCEL_ENV`, `VERCEL_TARGET_ENV` | sistema | Definidas pela Vercel; decidem limites de plataforma e o que o build executa |
| `VERCEL_OIDC_TOKEN` | sistema | Na função vem por requisição (não configure). Localmente, `vercel env pull` o grava para usar OIDC fora da Vercel |

### Frontend (`frontend/`)

| Variável | Onde | Descrição |
|---|---|---|
| `API_ORIGIN` | Vercel (expandida na rewrite a cada requisição; validada no build) | Domínio da API, sem barra final; mudou, faça redeploy |
| `VITE_API_BASE_URL` | build | Local/Docker: `http://localhost:3333/api/v1`. Vercel: **não defina** |
| `VITE_UPLOAD_MAX_FILE_SIZE_MB` | build | Limite exibido na tela de anexos (padrão 10) |

A configuração da API é validada com Zod ao carregar: variável faltando ou incoerente
derruba a inicialização com a lista exata do que corrigir. Exemplos: `vercel-blob` sem
`BLOB_STORE_ID` nem token; `BLOB_STORE_ID` fora da Vercel sem `VERCEL_OIDC_TOKEN` nem token;
na Vercel, driver `local`, upload acima de 4,5 MB ou stream sem limite abaixo de 300 s;
`SameSite=None` sem `Secure`. Variáveis vazias valem como ausentes.

---

## Comportamento em ambiente serverless

O mesmo código roda como servidor tradicional (Docker) e como função (Vercel). As
diferenças, e como cada uma foi tratada:

| Tema | Na Vercel | Tratamento |
|---|---|---|
| **Ponto de entrada** | Sem `listen`; a função importa o app | `src/index.ts` exporta o app; `src/main/server.ts` segue para Docker/local. |
| **Anexos** | Disco efêmero; `express.static` ignorado | `STORAGE_DRIVER=vercel-blob` (obrigatório na Vercel); credencial OIDC resolvida pelo SDK a cada requisição; `/files` só é montado com o driver local. |
| **Corpo da requisição** | Máximo de 4,5 MB | `UPLOAD_MAX_FILE_SIZE_MB=4`; o cliente HTTP transforma o `413` da plataforma numa mensagem legível. |
| **Notificações em tempo real (SSE)** | Função com duração máxima; várias instâncias sem memória compartilhada | O stream se encerra sozinho antes do limite (`NOTIFICATION_STREAM_MAX_SECONDS`) e o navegador reconecta; além do push em memória, cada stream consulta o banco a cada `NOTIFICATION_POLL_INTERVAL_SECONDS` e entrega o que outra instância gravou — validado com duas instâncias da API contra o mesmo banco. O sino também atualiza a contagem a cada 2 min como rede de segurança. |
| **Cache da CDN** | Rewrites externas respeitam `Cache-Control` da origem | Toda resposta `/api` sai com `Cache-Control: no-store`, e o frontend envia `x-vercel-enable-rewrite-caching: 0` na rota `/api`. |
| **Swagger UI** | Arquivos estáticos do `swagger-ui-express` não são servidos | Na Vercel, `/docs` carrega o Swagger UI de uma versão fixada no jsDelivr lendo `/openapi.json`. |
| **Pool de conexões** | Uma instância por requisição concorrente, cada uma com seu pool | `connection_limit=5` na URL; o client Prisma é único por instância. |
| **Rate limiting** | Contagem em memória, por instância; atrás da rewrite a Vercel sobrescreve `X-Forwarded-For` com o IP do proxy | A chave combina IP **e** a conta alvo (`userUuid` no login, `apiKey` na troca de token): mesmo com todos os navegadores chegando pelo mesmo IP, quem abusa esgota só o próprio balde. Um limite compartilhado entre instâncias exigiria Redis (ver `IMPROVEMENTS.md`). |
| **Logs de sistema** | Escritos sem aguardar | Um evento técnico gravado no fim de uma requisição pode se perder se a instância for suspensa; atividade de negócio é transacional e nunca se perde. |
| **Cold start** | Primeira requisição de uma instância nova | O app é construído uma vez por instância; o Prisma conecta sob demanda. |

---

## Segurança

Revisão pré-deploy — o que foi verificado e o que foi corrigido.

**Corrigido nesta versão**

| Tema | Antes | Agora |
|---|---|---|
| Segredo no código | Chave da API do Gemini fixa em `prisma/seed-data.ts` | Lida de `SEED_ASSISTANT_API_KEY`; nunca entra no repositório |
| CSRF | Em produção o cookie era `SameSite=None`, e rotas sem corpo (`POST /users/:uuid/restore`, `POST /notifications/read-all`…) aceitariam um POST forjado de outro site | Cookie `SameSite=Lax` por padrão **e** verificação do header `Origin` em toda requisição que altera estado (`ORIGIN_NOT_ALLOWED`) |
| Isolamento por projeto | Adicionar/remover membros não verificava se o ator alcança o projeto — um perfil com `PROJECT_MANAGE_MEMBERS` sem `PROJECT_ACCESS_ALL` poderia se alocar num projeto alheio | Mesma verificação de acesso do restante do módulo (`404`) |
| Escalonamento de privilégio | Quem tem `USER_UPDATE` podia mover o próprio usuário para um perfil mais poderoso | `CANNOT_CHANGE_OWN_ROLE` (a tela também bloqueia) |
| Usuário excluído | Um `PATCH active=true` reativava um usuário excluído, que voltava a entrar | Regra no domínio (`USER_DELETED`); a sessão e a lista de login também ignoram contas excluídas |
| Força bruta / abuso | Login e troca de token de integração sem limite | Limite por IP + conta alvo (60/min no login, 20/min no token) |
| Cache de respostas autenticadas | Sem `Cache-Control` | `no-store` em toda a API |
| Dependências | `sharp` com CVEs do libvips/libheif; `qs` com DoS | `sharp` 0.35.4; `qs` 6.16 (override) |
| Cabeçalhos do frontend | Nenhum no nginx | `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (nginx e Vercel) |

**Verificado e mantido**

- JWT com algoritmo fixado (`HS256`), sessão em cookie `HttpOnly`; tokens de sessão e de
  integração não se confundem (claims distintas).
- Permissões relidas do banco a cada requisição — revogar vale na hora.
- Segredo da integração com `scrypt` + `timingSafeEqual`; o segredo nunca vai para log.
- Rich text sanitizado duas vezes (allowlist no servidor, DOMPurify no navegador); nenhum
  `dangerouslySetInnerHTML` sem sanitização.
- Uploads: allowlist de MIME + extensão coerente, chave gerada pela aplicação (nunca o
  nome do arquivo), proteção contra *path traversal*, `nosniff` na entrega.
- Nenhum SQL cru; toda entrada validada com Zod; erros inesperados nunca vazam detalhes
  (ficam no log de sistema com `requestId`).
- Chave do provedor de IA cifrada com AES-256-GCM, derivada por HKDF.
- Nenhum id numérico atravessa a API (coberto por teste).

**Riscos aceitos, com justificativa**

| Item | Por que não foi alterado |
|---|---|
| `react-router` 6.x (`npm audit`: redirect aberto via `\` em `navigate`) | A correção só existe na v7 (migração com quebra). A aplicação nunca navega para um destino vindo do usuário; o outro alerta afeta só SSR, que não é usado. |
| `quill` 2.0.3 (XSS no export `getSemanticHTML`) | É a versão mais recente; o método não é usado, e todo HTML é sanitizado no servidor e no navegador. |
| `deepmerge-ts` (via CLI do Prisma) | Afeta só a leitura da configuração do Prisma em tempo de build — entrada confiável, sem superfície para usuários. |
| Login sem senha | Exigido pelo escopo do teste (seleção de usuário). Toda a autorização é aplicada no servidor. |
| `ROLE_UPDATE` equivale a acesso total | Quem edita perfis pode conceder qualquer permissão — é o papel de quem administra a instalação. Conceda só a perfis de confiança. |
| Anexos públicos por URL | URLs com UUID aleatório (não enumeráveis), mesma postura do driver local. Um store privado exigiria servir cada arquivo por uma função autenticada (`get()` do SDK) — mudança de produto, não de configuração. |

---

## Migrations

- Primeira versão: **uma** migration, `20260913000000_init`, gerada do `schema.prisma` e
  comparada com o resultado da cadeia de desenvolvimento anterior num banco de teste:
  mesmas colunas, tipos, defaults, collations, 89 índices e 20 FKs.
- Próximas mudanças: `npm run db:migrate` localmente (gera a nova migration), commit, e o
  build da Vercel aplica com `migrate deploy`. Primeiro exemplo:
  `20260915000000_add_comment_replies`, que acrescenta `parent_comment_id` a
  `demand_comments` para as respostas indentadas.
- **Banco local criado antes da consolidação** (volume Docker antigo): o schema já é
  idêntico, basta registrar a nova migration como aplicada:

  ```bash
  docker compose exec mysql mysql -uroot -proot kanban -e "DELETE FROM _prisma_migrations;"
  cd backend && npx prisma migrate resolve --applied 20260913000000_init
  ```

  Ou recriar do zero: `docker compose down -v && docker compose up --build`.

---

## Execução local com Docker

```bash
cp .env.example .env     # opcional: SEED_ASSISTANT_API_KEY para o assistente de IA
docker compose up --build
```

A inicialização é uma sequência estrita, cada etapa aguardando a anterior estar pronta:

```
mysql (healthy) → migrate (migrations + seed, encerra) → api (healthy) → web
```

O serviço `migrate` usa a mesma imagem da API e roda uma única vez; os logs de migration,
seed e servidor não se misturam mais. Comandos úteis:

```bash
docker compose logs migrate      # saída das migrations e da seed
docker compose logs -f api       # API
docker compose run --rm migrate  # reaplicar migrations/seed manualmente
```

---

## Manter o banco ativo (plano gratuito do Aiven)

O MySQL do Aiven roda no plano `free-1-1gb`, que **se desliga automaticamente depois de
um período sem conexões de cliente** — comportamento documentado do free tier de todo
serviço Aiven, não uma falha desta aplicação. Quando isso acontece, toda chamada à API
volta `500 INTERNAL_ERROR` com `Can't reach database server` no log.

Para evitar isso, `.github/workflows/db-keepalive.yml` roda a cada hora e faz uma
chamada real a `GET /api/v1/auth/candidates` — o mesmo endpoint público que a tela de
login já usa, sem precisar de nenhum segredo novo. Isso mantém uma consulta genuína
fluindo para o banco, não apenas um ping que prova que o processo da API está de pé. Se
o banco for desligado manualmente, ou o plano gratuito for descontinuado, o job passa a
falhar de forma visível na aba *Actions* do repositório em vez de continuar em silêncio.

Se o banco chegar a desligar mesmo assim:

1. Console do Aiven → o serviço `mysql-*` → *Actions* → **Power on service** (ou
   `avn service update <nome> --power-on` pela CLI).
2. O estado passa por `REBUILDING` por alguns minutos antes de `RUNNING`. Nenhum dado é
   perdido — os backups diários continuam intactos.

Para eliminar esse risco por completo (custo à parte), migre o serviço para um plano
pago (a partir do *Startup*/*Developer tier*) em Console do Aiven → o serviço →
*Service plan usage* → **Upgrade plan**: nesses planos o serviço nunca é desligado por
inatividade.

---

## Solução de problemas

| Sintoma | Causa provável | Correção |
|---|---|---|
| Build de Production falha em `migrate deploy` com `P1011` (TLS) | `DATABASE_CA_CERT` ausente ou de outro serviço | Baixe de novo o CA do serviço Aiven |
| `P1001 Can't reach database server` | Host/porta errados ou IP bloqueado no Aiven | Confira a Service URI; em *Allowed IP addresses* mantenha `0.0.0.0/0` (a Vercel não tem IP fixo no Hobby) |
| `Too many connections` | Pool grande demais por instância | `connection_limit=5` (ou menor) na `DATABASE_URL` |
| Login retorna `403 ORIGIN_NOT_ALLOWED` | Domínio do frontend fora de `CORS_ORIGIN` | Adicione o domínio exato (com `https://`, sem barra) e faça redeploy da API |
| Toda chamada `/api` dá 404 no frontend | `API_ORIGIN` errada | Domínio de produção da API, sem barra final; redeploy do frontend |
| Upload falha com "excede o tamanho máximo" | Limite de 4,5 MB da Vercel | `UPLOAD_MAX_FILE_SIZE_MB=4`; envie menos arquivos por vez |
| Miniaturas quebradas | Blob store privado, ou `BLOB_PUBLIC_BASE_URL` errada | Crie o store como *Public*; o log da API avisa se a URL gerada divergir da esperada |
| Upload falha com "No blob credentials found" | Store não conectado ao ambiente do deploy (sem `BLOB_STORE_ID`), ou OIDC desligado | Conecte o store ao projeto no ambiente certo; confira *Settings → Security → Secure backend access with OIDC federation* |
| API não inicia: "Fora da Vercel, BLOB_STORE_ID precisa de credencial" | `vercel-blob` rodando localmente sem OIDC | `vercel env pull` e exporte as variáveis, use `BLOB_READ_WRITE_TOKEN`, ou `STORAGE_DRIVER=local` |
| Build do frontend: "rewrite de /api compilou para …" | `vercel.json` editado com `${API_ORIGIN}` | Use `$API_ORIGIN` sem chaves |
| Chamadas `/api` devolvem HTML de login da Vercel | `API_ORIGIN` aponta para um deploy protegido (preview ou URL única) | Use o domínio de produção da API |
| Preview da API não inicia | Variáveis de banco com escopo só Production (intencional) | Veja [Production × Preview](#production--preview) |
| Assistente responde "não configurado" | Banco criado sem `SEED_ASSISTANT_API_KEY` | Cadastre a chave em *Ação rápida → Configurar* (Administrador) |
| Tudo dá `500 INTERNAL_ERROR`, log mostra `Can't reach database server` | **Serviço Aiven em `POWEROFF`** — o plano gratuito se autodesliga após um período sem conexões (comportamento documentado do free tier, não uma falha) | Religue em Aiven Console → o serviço → *Actions* → *Power on service* (leva alguns minutos, passa por `REBUILDING`). Ver keep-alive abaixo para evitar que aconteça de novo |
