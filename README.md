# Quadro Kanban de Projetos — Teste Técnico Full Stack

Aplicação completa de gestão de demandas em quadro Kanban, com controle de acesso
baseado em permissões e isolamento por projeto.

---

## Sumário

- [Visão geral](#visão-geral)
- [Stack](#stack)
- [Execução com Docker](#execução-com-docker)
- [Execução local](#execução-local)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Scripts](#scripts)
- [Usuários e perfis para avaliação](#usuários-e-perfis-para-avaliação)
- [Roteiro de avaliação](#roteiro-de-avaliação)
- [Swagger](#swagger)
- [Testes](#testes)
- [Documentação](#documentação)

---

## Visão geral

O sistema implementa o quadro Kanban descrito no teste, acrescido de três requisitos
adicionais que sustentam o modelo de autorização: **projetos**, **alocação N:N de
usuários em projetos** e **gestão de perfis com permissões editáveis**. Todos os
acréscimos estão listados em [`docs/ADDED_REQUIREMENTS.md`](docs/ADDED_REQUIREMENTS.md).

Dois princípios organizam a aplicação inteira:

| Conceito | Responde | Onde vive |
|---|---|---|
| **Role / Permission** | *O que* o usuário pode fazer | Perfil global do usuário |
| **ProjectMember** | *Onde* o usuário pode fazer | Alocação em projetos |

Nenhuma decisão de autorização usa `if (role === 'ADMIN')`. O administrador enxerga
todos os projetos porque a seed concede a ele a permissão `PROJECT_ACCESS_ALL` — remova
essa permissão pela interface e o mesmo código passa a restringi-lo às suas alocações.

O ciclo de vida da demanda usa **State Pattern**: `PRODUCTION` é terminal, e essa regra é
garantida pelo domínio, não pelo frontend.

---

## Stack

**Backend** — Node.js 22, TypeScript strict, Express, Prisma ORM, MySQL 8, JWT em cookie
HttpOnly, Zod, Multer, Sharp, Morgan, Swagger UI, Vitest + Supertest. Assistente de IA
sobre a API do Google Gemini (Flash-Lite), chamada via `fetch`, sem SDK.

**Frontend** — React 18, TypeScript strict, Vite, Tailwind CSS, React Router, TanStack
Query, React Hook Form + Zod, dnd-kit, lucide-react, Vitest + Testing Library.

**Infra** — Docker / Docker Compose, migrations Prisma, seed idempotente. Deploy de
referência na Vercel (frontend + API) com MySQL no Aiven e anexos no Vercel Blob — ver
[`docs/DEPLOY.md`](docs/DEPLOY.md).

---

## Execução com Docker

Requisito: Docker com Compose v2.

```bash
docker compose up --build
```

Isso sobe três serviços:

| Serviço | Porta | Descrição |
|---|---|---|
| `web` | http://localhost:8080 | Frontend (nginx) |
| `api` | http://localhost:3333 | API + Swagger em `/docs` |
| `mysql` | 3306 | MySQL 8 com volume persistente |

A inicialização é uma sequência estrita — cada etapa só começa quando a anterior está
pronta:

```
mysql (healthy) → migrate (migrations + seed, encerra) → api (healthy) → web
```

O serviço `migrate` usa a mesma imagem da API e roda uma única vez. **Não é necessário
nenhum comando adicional** — ao abrir http://localhost:8080 já existem usuários, projetos
e demandas.

> O primeiro `up` demora alguns minutos: o MySQL inicializa o datadir e as imagens são
> construídas do zero. Acompanhe com `docker compose logs -f migrate api`.

> O assistente de IA (**Ação rápida**) chama a API do Google Gemini, então o container
> `api` precisa de acesso à internet. A chave **não** fica no repositório: para que a seed
> já o deixe configurado num banco novo, copie `.env.example` para `.env` na raiz e
> preencha `SEED_ASSISTANT_API_KEY`. Sem ela, um Administrador cadastra a chave em
> *Ação rápida → Configurar*; sem internet, o restante do sistema funciona normalmente.

Para começar do zero novamente:

```bash
docker compose down -v && docker compose up --build
```

---

## Execução local

Requisitos: Node.js 22+, e um MySQL 8 acessível (o do Compose serve).

```bash
# 1. Banco de dados
docker compose up -d mysql

# 2. Backend
cd backend
cp .env.example .env          # ajuste DATABASE_URL e JWT_SECRET se necessário
npm install
npm run db:migrate            # aplica as migrations
npm run db:seed               # popula a base (idempotente)
npm run dev                   # http://localhost:3333

# 3. Frontend (em outro terminal)
cd frontend
cp .env.example .env
npm install
npm run dev                   # http://localhost:5173
```

> **Migrations em desenvolvimento.** `prisma migrate dev` cria um *shadow database*
> temporário e por isso exige que o usuário do MySQL possa criar bancos. Com o container
> do Compose, conceda uma vez:
> ```bash
> docker exec kanban-mysql mysql -uroot -proot \
>   -e "GRANT ALL PRIVILEGES ON *.* TO 'kanban'@'%'; FLUSH PRIVILEGES;"
> ```
> Em produção usa-se `prisma migrate deploy`, que não precisa disso.

---

## Variáveis de ambiente

Backend (`backend/.env.example`):

| Variável | Padrão | Descrição |
|---|---|---|
| `NODE_ENV` | `development` | Ambiente de execução |
| `PORT` | `3333` | Porta da API |
| `DATABASE_URL` | — | Conexão MySQL (obrigatória) |
| `JWT_SECRET` | — | Segredo do token, mínimo 32 caracteres (obrigatória). Também deriva a chave que cifra a chave de API do assistente de IA |
| `JWT_EXPIRES_IN` | `12h` | Validade da sessão |
| `AUTH_COOKIE_NAME` | `kanban_session` | Nome do cookie de sessão |
| `AUTH_COOKIE_SAMESITE` | `lax` | `none` só para API servida de outro site |
| `AUTH_COOKIE_SECURE` | `true` em produção | Cookie só por HTTPS |
| `DATABASE_CA_CERT` | — | CA do MySQL gerenciado (Aiven), PEM ou base64 — liga TLS verificado |
| `TRUST_PROXY` | `1` | Proxies à frente da API (IP usado no rate limit) |
| `INTEGRATION_TOKEN_EXPIRES_IN` | `1h` | Validade do token da API de integração (requisito adicionado) |
| `APP_TIMEZONE` | `America/Sao_Paulo` | Fuso do calendário do negócio — define "hoje" e "atrasada" na Dashboard |
| `CORS_ORIGIN` | `http://localhost:5173` | Origens permitidas, separadas por vírgula (CORS e proteção CSRF) |
| `STORAGE_DRIVER` | `local` | `local` (disco) ou `vercel-blob` |
| `BLOB_STORE_ID` | — | Blob store da Vercel (com `vercel-blob`); na Vercel autentica por OIDC, sem token |
| `BLOB_READ_WRITE_TOKEN` | — | Só fora da Vercel (Docker, CI) com `vercel-blob` |
| `STORAGE_LOCAL_DIR` | `./storage` | Diretório dos arquivos (driver local) |
| `STORAGE_PUBLIC_BASE_URL` | `http://localhost:3333/files` | Base pública dos anexos |
| `UPLOAD_MAX_FILE_SIZE_MB` | `10` | Tamanho máximo por arquivo |
| `UPLOAD_MAX_FILES_PER_REQUEST` | `10` | Arquivos por requisição |
| `NOTIFICATION_STREAM_MAX_SECONDS` | `1800` | Duração máxima do stream de notificações antes de reconectar |
| `NOTIFICATION_POLL_INTERVAL_SECONDS` | `15` | Verificação no banco que entrega notificações de outra instância |
| `API_DOCS_ENABLED` | `true` | Swagger em `/docs` |
| `SEED_ASSISTANT_API_KEY` | — | Só a seed: chave do Gemini gravada (cifrada) num banco novo |
| `SEED_ON_DEPLOY` | `true` | Só o build de Production na Vercel: `false` pula a seed. Preview nunca roda migrations nem seed |

Frontend (`frontend/.env.example`):

| Variável | Padrão | Descrição |
|---|---|---|
| `VITE_API_BASE_URL` | `/api/v1` | URL base da API (local: `http://localhost:3333/api/v1`; na Vercel, não defina) |
| `VITE_UPLOAD_MAX_FILE_SIZE_MB` | `10` | Limite exibido na tela de anexos |

A lista completa, com os valores recomendados para Vercel + Aiven, está em
[`docs/DEPLOY.md`](docs/DEPLOY.md#variáveis-de-ambiente).

A configuração é validada com Zod na inicialização: um ambiente mal configurado falha
imediatamente, em vez de quebrar na primeira requisição que precisar do valor ausente.

---

## Scripts

```bash
# backend/
npm run dev              # servidor com reload
npm run build            # compila para dist/
npm run start            # executa o build
npm run typecheck        # tsc --noEmit
npm run lint             # ESLint
npm run test             # Vitest (domínio + aplicação + API)
npm run db:migrate       # prisma migrate dev
npm run db:migrate:deploy# prisma migrate deploy (produção, com TLS do DATABASE_CA_CERT)
npm run db:seed          # seed idempotente
npm run db:deploy        # migrate deploy + seed
npm run vercel-build     # build do projeto da API na Vercel (generate, migrate, seed)
npm run db:reset         # recria a base e roda a seed

# frontend/
npm run dev              # Vite dev server
npm run build            # build de produção
npm run vercel-build     # build do projeto do frontend na Vercel (valida API_ORIGIN)
npm run typecheck        # tsc --noEmit
npm run lint             # ESLint
npm run test             # Vitest + Testing Library
```

---

## Usuários e perfis para avaliação

O login é por **seleção de usuário**, sem senha, conforme o escopo do teste.

| Usuário | Perfil | Projetos |
|---|---|---|
| **Mariana Alves** | Administrador | todos (via `PROJECT_ACCESS_ALL`) |
| **Roberto Dias** | Administrador | todos |
| **Joana Martins** | Agilista | todos (via `PROJECT_ACCESS_ALL`); alocada em Portal do Cliente e Plataforma de Dados |
| **Caio Ferreira** | Agilista | todos (via `PROJECT_ACCESS_ALL`); alocado em App de Logística |
| **Lucas Barbosa** | Desenvolvedor | Portal do Cliente, App de Logística |
| **Beatriz Ramos** | Desenvolvedor | Portal do Cliente, App de Logística |
| **André Carvalho** | Desenvolvedor | Portal do Cliente |
| **Sofia Lima Braga** | Desenvolvedor | Plataforma de Dados |

A matriz completa de permissões está em [`docs/PERMISSIONS.md`](docs/PERMISSIONS.md).

---

## Roteiro de avaliação

Sugestão de percurso para verificar os pontos centrais do teste:

**1. Permissões escondem ações proibidas**
Entre como **Mariana Alves** (Administrador). No Kanban não há botão de editar nem de
excluir, e os cards não têm alça de arraste — o Administrador não possui `DEMAND_UPDATE`
nem `DEMAND_DELETE` (mover um card também exige `DEMAND_UPDATE`). Entre como **Joana
Martins** (Agilista) e todos eles aparecem.

**2. O backend também bloqueia**
As ações escondidas não são apenas invisíveis. Com a sessão do Administrador aberta,
chame `PATCH /api/v1/demands/{uuid}/status` pelo Swagger: retorna `403 PERMISSION_DENIED`.

**3. Produção é terminal — exceto para quem gerencia**
Como **Lucas Barbosa** (Desenvolvedor), arraste o card *"Central de notificações do
cliente"* (coluna Em Produção) para qualquer outra coluna. O card sequer oferece alça de
arraste, e a API responde `403 DEMAND_IN_PRODUCTION_IS_TERMINAL` a qualquer tentativa
direta. Agora entre como **Joana Martins** (Agilista): o mesmo card pode ser arrastado
para fora e de volta livremente — ela possui `DEMAND_MANAGE_PRODUCTION`, a permissão que
reabre justamente essa porta. Ainda como Joana, arraste qualquer outro card **para**
produção: nenhum aviso aparece, porque ela sabe que pode reverter. Repita como Lucas e o
mesmo movimento pede confirmação antes, avisando que o card trava para sempre.

**4. Isolamento por projeto**
Entre como **Sofia Lima Braga**: ela participa apenas da *Plataforma de Dados* e vê
somente as demandas desse projeto. Como **Mariana Alves**, os três projetos aparecem.
Uma demanda de projeto alheio responde `404`, não `403` — confirmar a existência já
vazaria informação através da fronteira de isolamento.

**5. Responsável elegível**
Em *Cadastro de Demanda*, escolha o projeto **Portal do Cliente** e abra o combobox de
responsável: nenhum Administrador aparece, porque o perfil deles não concede
`DEMAND_BE_ASSIGNEE`. Digite `zzz` e a mensagem é *"Usuário não encontrado"*.

**6. Hierarquia ACCESS**
Em *Perfis*, edite qualquer perfil e desmarque `DEMAND_ACCESS`: as permissões filhas do
módulo são limpas e desabilitadas na hora. Marque `DEMAND_CREATE` com `DEMAND_ACCESS`
desmarcada e o pai é habilitado automaticamente.

**7. Perfis customizados**
Crie um perfil novo em *Perfis → Novo perfil*, atribua-o a um usuário em
*Cadastrar usuário* e entre com ele. O menu lateral e as ações refletem exatamente as
permissões escolhidas — nada é hardcoded por nome de perfil.

**8. Tema claro/escuro**
Alterne pelo item no rodapé do menu lateral. A preferência persiste; sem preferência
salva, segue `prefers-color-scheme`.

**9. Assistente de IA — Ação rápida**
No Kanban ou na Dashboard, clique em **Ação rápida** (ou `Ctrl+K`). Como **Joana Martins**,
use *Nova demanda* com *"Recuperação de senha no Portal do Cliente para a Beatriz até
sexta, com checklist"*: o rascunho volta com projeto, responsável, prazo e checklist
preenchidos e só vira demanda ao clicar em *Criar demanda*. Gere o *Relatório executivo* e
clique numa demanda citada para abrir os detalhes. Como **Lucas Barbosa** (Desenvolvedor),
*Nova demanda* nem aparece — o perfil não tem `DEMAND_CREATE` — e as respostas só citam
demandas dos projetos dele. Como **Mariana Alves**, *Configurar* desativa o assistente,
troca o modelo ou substitui a chave, e a alteração aparece em *Logs*.

**10. Adicionar demanda direto na coluna**
Como **Joana Martins** (Agilista — tem `DEMAND_CREATE_WITH_STATUS`), clique no "+"
pontilhado ao pé da coluna *Em andamento*: o cadastro abre com o projeto do filtro e
"Será criada em: Em andamento" já marcados, e a demanda nasce naquela coluna. Como
**Mariana Alves** (Administrador — não tem essa permissão), nenhuma coluna mostra o "+";
só resta o botão "Nova Demanda", sempre em *Não iniciada*. Em *Perfis*, conceda
`DEMAND_CREATE_WITH_STATUS` a outro perfil e o "+" aparece para ele também — quem
manipula cards diretamente por status é uma decisão do administrador, não uma regra
fixa no código.

> Os perfis de sistema podem ter suas permissões editadas livremente para exploração.
> `npm run db:seed` restaura a matriz original a qualquer momento.

---

## Swagger

Documentação interativa em **http://localhost:3333/docs** (OpenAPI cru em `/openapi.json`).

Para testar endpoints protegidos pelo Swagger, faça primeiro `POST /auth/login` com um
`userUuid` obtido em `GET /auth/candidates`. O cookie de sessão é definido pelo navegador
e enviado automaticamente nas chamadas seguintes.

---

## Testes

```bash
cd backend  && npm test    # 364 testes
cd frontend && npm test    # 203 testes
```

Os testes de API sobem o app Express real contra o MySQL e assumem que
`npm run db:migrate && npm run db:seed` já rodaram. A cobertura prioriza comportamento
crítico em vez de percentual: transições de status, hierarquia de permissões,
elegibilidade de responsável, isolamento de projeto e a garantia de que nenhum id
numérico atravessa a fronteira da API.

---

## Documentação

| Documento | Conteúdo |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Modular Monolith, DDD, camadas, State Pattern, identificadores |
| [`docs/DATABASE.md`](docs/DATABASE.md) | ERD, índices, decisões de modelagem e performance |
| [`docs/PERMISSIONS.md`](docs/PERMISSIONS.md) | Catálogo de permissões, matriz dos perfis, hierarquia ACCESS |
| [`docs/ADDED_REQUIREMENTS.md`](docs/ADDED_REQUIREMENTS.md) | Tudo que foi acrescentado além do escopo original |
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | Deploy na Vercel + Aiven, variáveis, segurança, operação |
| [`docs/IMPROVEMENTS.md`](docs/IMPROVEMENTS.md) | Evoluções futuras deliberadamente não implementadas |

---

## Deploy

O guia completo está em [`docs/DEPLOY.md`](docs/DEPLOY.md). Em resumo, a referência é:

- **Dois projetos na Vercel** a partir deste repositório: `frontend/` (build estático) e
  `backend/` (Express como função). O frontend encaminha `/api/*` para a API por uma
  rewrite de mesma origem (`API_ORIGIN`), então o cookie de sessão é *first-party* e
  `SameSite=Lax` funciona em qualquer navegador.
- **MySQL no Aiven**, com TLS verificado pelo certificado CA em `DATABASE_CA_CERT`.
- **Anexos no Vercel Blob** (`STORAGE_DRIVER=vercel-blob`), mesma porta `FileStoragePort`
  do disco local.
- **Migrations e seed no build da API**, antes de o deploy receber tráfego — a primeira
  versão consolidou o histórico numa única migration de inicialização; mudanças
  posteriores entram como novas migrations a partir dela.
