# Banco de Dados

MySQL 8, `utf8mb4` / `utf8mb4_unicode_ci`. Schema gerenciado por migrations Prisma
(`backend/prisma/migrations/`). `prisma db push` **não** é usado como estratégia oficial.

Para a primeira versão publicada, o histórico de desenvolvimento foi consolidado numa
única migration de inicialização (`20260913000000_init`), gerada a partir do
`schema.prisma` e verificada como idêntica ao resultado da cadeia anterior — mesmas
colunas, tipos, defaults, collations, 89 índices e 20 chaves estrangeiras. Mudanças
futuras entram como novas migrations a partir dela (`npm run db:migrate`).

## Sumário

- [ERD](#erd)
- [Estratégia de identificadores](#estratégia-de-identificadores)
- [Tabelas](#tabelas)
- [Por que `logs` não tem FK](#por-que-logs-não-tem-fk)
- [Índices e por que existem](#índices-e-por-que-existem)
- [Integridade referencial](#integridade-referencial)
- [Decisões de performance](#decisões-de-performance)

---

## ERD

```mermaid
erDiagram
    ROLES ||--o{ USERS : "define perfil de"
    ROLES ||--o{ ROLE_PERMISSIONS : concede
    PERMISSIONS ||--o{ ROLE_PERMISSIONS : "concedida em"

    USERS ||--o{ PROJECT_MEMBERS : "aloca-se em"
    PROJECTS ||--o{ PROJECT_MEMBERS : "possui"

    PROJECTS ||--o{ DEMANDS : contém
    USERS ||--o{ DEMANDS : "é responsável por"
    USERS ||--o{ DEMANDS : criou
    USERS ||--o{ PROJECTS : criou

    DEMANDS ||--o{ DEMAND_ATTACHMENTS : possui
    USERS ||--o{ DEMAND_ATTACHMENTS : enviou

    DEMANDS ||--o{ DEMAND_COMMENTS : recebe
    USERS ||--o{ DEMAND_COMMENTS : escreveu

    PROJECTS ||--o| PROJECT_INTEGRATION_CREDENTIALS : possui
    USERS ||--o{ PROJECT_INTEGRATION_CREDENTIALS : gerou

    USERS |o--o{ ASSISTANT_SETTINGS : "alterou por último"

    ROLES {
        bigint id PK
        char36 uuid UK
        varchar name
        varchar slug UK
        bool is_system
        bool active
        datetime created_at
        datetime updated_at
    }

    PERMISSIONS {
        bigint id PK
        varchar code UK
        varchar module
        varchar action
        varchar description
    }

    ROLE_PERMISSIONS {
        bigint role_id PK_FK
        bigint permission_id PK_FK
        datetime created_at
    }

    USERS {
        bigint id PK
        char36 uuid UK
        varchar name
        varchar avatar_url "nullable"
        bigint role_id FK
        bool active
        datetime created_at
        datetime updated_at
    }

    PROJECTS {
        bigint id PK
        char36 uuid UK
        varchar name
        varchar description
        bool active
        bigint created_by_user_id FK
        datetime created_at
        datetime updated_at
    }

    PROJECT_MEMBERS {
        bigint project_id PK_FK
        bigint user_id PK_FK
        datetime created_at
    }

    DEMANDS {
        bigint id PK
        char36 uuid UK
        bigint project_id FK "nullable"
        varchar title
        text description
        date due_date
        enum status
        bigint responsible_user_id FK
        bigint created_by_user_id FK
        datetime created_at
        datetime updated_at
    }

    DEMAND_ATTACHMENTS {
        bigint id PK
        char36 uuid UK
        bigint demand_id FK
        varchar original_name
        varchar mime_type
        int size_bytes
        varchar storage_key
        varchar thumbnail_key
        bigint created_by_user_id FK
        datetime created_at
    }

    DEMAND_COMMENTS {
        bigint id PK
        char36 uuid UK
        bigint demand_id FK
        bigint author_user_id FK
        text body
        datetime created_at
        datetime edited_at
    }

    PROJECT_INTEGRATION_CREDENTIALS {
        bigint id PK
        char36 uuid UK
        bigint project_id FK_UK
        varchar api_key UK
        varchar secret_hash
        varchar secret_preview
        bigint created_by_user_id FK
        datetime created_at
        datetime rotated_at
    }

    ASSISTANT_SETTINGS {
        bigint id PK
        char36 uuid UK
        varchar scope UK
        bool enabled
        varchar provider
        varchar model
        varchar api_key_ciphertext
        varchar api_key_preview
        bigint updated_by_user_id FK
        datetime created_at
        datetime updated_at
    }
```

`LOGS` não aparece no ERD acima: não tem chave estrangeira para nenhuma outra tabela —
ver [Por que `logs` não tem FK](#por-que-logs-não-tem-fk) — e um relacionamento pontilhado
sem cardinalidade real só acrescentaria ruído ao diagrama.

---

## Estratégia de identificadores

Cada agregado carrega dois identificadores completamente independentes:

| Campo | Tipo | Uso |
|---|---|---|
| `id` | `BIGINT UNSIGNED AUTO_INCREMENT` | chave primária, FKs, índices — **nunca sai da persistência** |
| `uuid` | `CHAR(36)` UUID v7 | identificador público — API, DTOs, URLs, frontend |

O UUID **nunca** é derivado do id. Relacionamentos internos usam o id numérico, o que
mantém as FKs em 8 bytes e os índices secundários compactos.

### Por que UUID v7

UUID v7 é ordenável no tempo. Como os UUIDs são gerados em ordem aproximadamente
crescente, as inserções no índice `uq_*_uuid` acontecem no fim da árvore B+, preservando
localidade de página. Com UUID v4 cada inserção cai em uma posição aleatória, fragmentando
páginas e inflando o índice — o problema de performance real deste tipo de chave.

### Por que `CHAR(36)` e não `BINARY(16)`

`BINARY(16)` foi avaliado e não adotado nesta versão. O trade-off:

| | `CHAR(36)` | `BINARY(16)` |
|---|---|---|
| Bytes por valor | 36 | 16 |
| Legível em `SELECT`, logs, seeds | sim | não |
| Conversão na aplicação | nenhuma | `string ↔ Buffer` em toda leitura/escrita |
| Inspeção manual / debug | direta | exige `HEX()` / `UNHEX()` |
| Suporte natural no Prisma | sim | `Bytes`, com atrito em filtros e `in` |

Os ~20 bytes economizados por linha importariam em escala de milhões de registros com
pressão de buffer pool. Como o UUID v7 já resolve o problema de localidade de índice —
que é o gargalo real —, a legibilidade durante o desenvolvimento e a avaliação vale mais
neste volume.

A decisão é reversível a baixo custo: a conversão ficaria inteiramente encapsulada na
camada de Infrastructure (mappers e repositórios). Domínio, aplicação, DTOs e frontend
não sabem como o UUID é armazenado e não precisariam mudar.

---

## Tabelas

### `roles`
Perfil global do usuário. `is_system = true` nos três perfis originais (Administrador,
Agilista, Desenvolvedor), que têm UUIDs determinísticos na seed. `slug` é derivado do
nome e serve como chave natural estável para a seed reencontrar a linha.

### `permissions`
Catálogo de capacidades. `code` é a chave natural (`DEMAND_CREATE`, `DEMAND_UPDATE`, …).
`module` + `action` decompõem o código para agrupamento na interface de gestão de perfis.

O catálogo é **code-first**: as permissões são o vocabulário contra o qual o código
verifica autorização, então não podem ser criadas por usuário. O que é data-driven é
*quais* permissões cada perfil possui.

### `role_permissions`
N:N entre perfis e permissões. PK composta `(role_id, permission_id)` — a própria chave
primária garante a unicidade exigida.

### `users`
Sem senha: o escopo define autenticação por seleção de usuário. `name` é validado no
domínio (apenas letras, acentuação permitida, espaços entre palavras).

### `projects`
Requisito adicional que sustenta o isolamento. Toda demanda pertence obrigatoriamente a
um projeto.

### `project_members`
N:N puro entre usuários e projetos. PK composta `(project_id, user_id)`.

**Deliberadamente não possui `role`.** Autoridade é global (perfil do usuário);
localidade é a alocação. Um papel por projeto criaria uma segunda fonte de verdade sobre
o que a pessoa pode fazer, e as duas divergiriam.

### `demands`
Agregado central. `due_date` é `DATE`, não `DATETIME`: um prazo é uma data de calendário,
e armazená-lo como timestamp o faz deslizar um dia entre fusos. `status` é `ENUM` nativo,
espelhando os cinco estados do domínio. `priority` é outro `ENUM` nativo (`LOW`, `MEDIUM`,
`HIGH`, `URGENT`), com `DEFAULT 'MEDIUM'` — ao contrário de `status`, não carrega
transição alguma, é uma classificação livre ([requisito adicionado
#42](ADDED_REQUIREMENTS.md#42-prioridade-da-demanda)).

Nesta versão, **um** responsável por demanda (`responsible_user_id`).

### `demand_attachments`
Metadados dos anexos. **O binário nunca é armazenado no MySQL** — `storage_key` e
`thumbnail_key` referenciam o `FileStoragePort` (disco local hoje, S3-compatible depois).
A chave é gerada pela aplicação e nunca deriva do nome original do arquivo.

### `demand_comments`
Conversa sobre uma demanda — agregado próprio, não parte de `Demand`. `body` é texto
puro, 1 a 5000 caracteres; `edited_at` é `NULL` até a primeira edição. Só o autor
(`author_user_id`) pode editar ou excluir a própria linha — regra aplicada no domínio
(`DemandComment.assertCanDelete`), não pela tabela.

### `project_integration_credentials`
Uma linha por projeto (`project_id` é `UNIQUE`) — a credencial de API que autoriza um
sistema externo a criar e atualizar demandas daquele projeto. Ver
[requisito adicionado #36](ADDED_REQUIREMENTS.md#36-integração-criação-e-atualização-de-demandas-via-api).
`secret_hash` guarda um digest scrypt salgado (`sal:digest`), nunca o segredo em si;
`secret_preview` guarda só os últimos 4 caracteres, para a tela de gestão mostrar qual
credencial está ativa sem poder reconstituí-la. Regenerar substitui `uuid`, `api_key`,
`secret_hash` e `secret_preview` juntos, mantendo `created_at` original e atualizando
`rotated_at` — é o que invalida instantaneamente qualquer token emitido a partir do par
anterior, sem precisar de uma lista de revogação (ver a seção de arquitetura da
integração no mesmo requisito).

### `assistant_settings`
A configuração do assistente de IA — uma única linha para a instalação, garantida pelo
`UNIQUE` em `scope` (`GLOBAL`). Ver
[requisito adicionado #39](ADDED_REQUIREMENTS.md#39-assistente-de-ia-ação-rápida).
`api_key_ciphertext` guarda a chave do provedor cifrada com AES-256-GCM
(`v1:iv:tag:dados`), com a chave de cifragem derivada do `JWT_SECRET` por HKDF.
Diferente de `secret_hash` das credenciais de integração, ela precisa ser lida de volta a
cada chamada ao modelo, então não pode ser um hash; o GCM autentica, e um valor editado no
banco falha ao decifrar em vez de virar lixo. `api_key_preview` guarda só os últimos 4
caracteres, para a tela de configuração. `model` é validado contra uma lista fechada no
domínio. `updated_by_user_id` é `ON DELETE SET NULL`: a configuração sobrevive a quem a
alterou por último, e o histórico de cada mudança fica em `logs`
(`assistant.settings_updated`, com `subject_type = 'SETTING'`).

### `logs`
Registro append-only de toda atividade e todo evento de sistema. Ver detalhes completos
em [Por que `logs` não tem FK](#por-que-logs-não-tem-fk) e no
[requisito adicionado #30](ADDED_REQUIREMENTS.md#30-módulo-de-logs-atividade-e-sistema).

```sql
CREATE TABLE logs (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid         CHAR(36)     NOT NULL,
  occurred_at  DATETIME(3)  NOT NULL,
  category     ENUM('ACTIVITY','SYSTEM') NOT NULL,
  level        ENUM('INFO','WARNING','ERROR') NOT NULL,
  action       VARCHAR(64)  NOT NULL,
  summary      VARCHAR(500) NOT NULL,
  actor_uuid   CHAR(36)     NULL,
  actor_name   VARCHAR(255) NULL,
  subject_type ENUM('DEMAND','PROJECT','USER','ROLE','SETTING') NULL,
  subject_uuid CHAR(36)     NULL,
  subject_label VARCHAR(255) NULL,
  project_uuid CHAR(36)     NULL,
  project_name VARCHAR(255) NULL,
  changes      JSON NULL,
  metadata     JSON NULL,
  request_id   VARCHAR(128) NULL
);
```

Nenhuma coluna `*_uuid` acima é uma foreign key. É a decisão de modelagem central desta
tabela — ver a seção dedicada logo abaixo.

---

## Por que `logs` não tem FK

Toda outra tabela deste schema referencia sua vizinha por `id` numérico com `FOREIGN KEY`.
`logs` referencia por `uuid` **sem** constraint, de propósito, por três razões que se
reforçam:

1. **Um registro precisa sobreviver ao que ele descreve.** `demand.deleted` é o próprio
   ato de a demanda deixar de existir. Uma FK `ON DELETE CASCADE` apagaria o registro
   junto — o oposto do que uma auditoria existe para fazer. `ON DELETE SET NULL` também
   não serve: perderia a identidade do assunto, não só a linha.
2. **Um registro precisa continuar legível depois que o nome do que ele descreve muda.**
   `actor_name`, `subject_label` e `project_name` são **snapshots** tirados no momento do
   evento. Se uma demanda for renomeada dez vezes, cada entrada de log continua mostrando
   o título de quando aconteceu — o mesmo raciocínio de uma nota fiscal, que registra o
   preço do dia da venda e não segue o preço atual do produto. Uma FK não armazenaria
   isso; um `JOIN` para "buscar o nome atual" estaria errado por definição.
3. **`id` numérico nunca atravessa a fronteira da API** (ver
   [Estratégia de identificadores](#estratégia-de-identificadores)). Uma FK exigiria a
   coluna `id` do lado referenciado, e o `uuid` sozinho — sem `UNIQUE` correspondente
   praticado como FK — não é o que uma foreign key do MySQL aceita como alvo sem também
   ser chave. Manter `logs` inteiramente por `uuid` solto evita reintroduzir o `id`
   numérico por uma porta lateral.

O custo aceito: a aplicação, não o banco, garante que um `subject_uuid` referencie algo
que existiu. Isso é seguro porque **nada lê `logs` como fonte de verdade sobre o estado
atual** — só a demanda, o projeto etc. respondem "existe e vale isto hoje". `logs`
responde apenas "isto aconteceu, e era assim quando aconteceu".

**Retenção:** não há expiração ou expurgo nesta versão — ver
[`IMPROVEMENTS.md`](IMPROVEMENTS.md). Uma tabela append-only sem retenção cresce sem
limite; o caminho natural é uma rotina periódica que arquiva ou remove linhas mais
antigas que um período de retenção definido por política, fora do escopo de um teste
técnico.

---

## Índices e por que existem

Cada índice foi criado a partir de um padrão de consulta real, não por precaução.

### `demands`

```sql
UNIQUE uq_demands_uuid           (uuid)
INDEX  ix_demands_project_status_due (project_id, status, due_date)
INDEX  ix_demands_responsible     (responsible_user_id)
INDEX  ix_demands_created_by      (created_by_user_id)
```

**`(project_id, status, due_date)` é o índice estratégico do sistema.** Ele atende
exatamente o padrão dominante do Kanban:

> "buscar as demandas de determinado projeto, agrupadas/filtradas por status e ordenadas
> pelo prazo."

A ordem das colunas segue a regra do prefixo mais seletivo primeiro combinada com o uso:

- `project_id` — primeiro porque **toda** consulta de demanda é filtrada por projeto: é
  assim que o isolamento funciona. Nenhuma query legítima omite esse filtro.
- `status` — segundo porque o board consulta por coluna, e porque um filtro de igualdade
  antes de um range preserva a utilidade do índice para a ordenação seguinte.
- `due_date` — terceiro porque é a chave de ordenação obrigatória do escopo. Estando no
  índice, o MySQL entrega as linhas já ordenadas e evita `filesort`.

O mesmo índice serve à listagem sem filtro de status: o prefixo `(project_id)` continua
utilizável, e `(project_id, status)` cobre a contagem por coluna.

`ix_demands_responsible` atende "demandas de uma pessoa" e, mais importante,
`countDemandsOfMember` — a checagem que impede remover do projeto alguém que ainda é
responsável por demandas.

### `project_members`

```sql
PRIMARY KEY (project_id, user_id)
INDEX ix_project_members_user_project (user_id, project_id)
```

A PK composta atende "quem está neste projeto"; o índice invertido atende
"de quais projetos este usuário participa" — a consulta que constrói a
`ProjectAccessPolicy` em **toda requisição** de usuário sem `PROJECT_ACCESS_ALL`. Sem ele,
essa verificação faria varredura da tabela a cada chamada.

Ambos são índices *covering* para suas consultas: nenhum acesso à linha é necessário.

### `users`

```sql
UNIQUE uq_users_uuid          (uuid)
INDEX  ix_users_role_active_name (role_id, active, name)
INDEX  ix_users_active_name      (active, name)
```

`(role_id, active, name)` atende a filtragem por perfil já ordenada por nome.
`(active, name)` atende a tela de login (usuários ativos, em ordem alfabética) e a busca
de usuários — o caminho mais chamado da aplicação, já que é a primeira tela.

### `roles` e `permissions`

```sql
UNIQUE uq_roles_uuid        (uuid)
UNIQUE uq_roles_slug        (slug)
INDEX  ix_roles_active_name (active, name)
UNIQUE uq_permissions_code  (code)
INDEX  ix_permissions_module_action (module, action)
```

`uq_roles_slug` é o que torna a seed idempotente: o upsert reencontra o perfil pela chave
natural. `ix_permissions_module_action` atende o catálogo agrupado por módulo da tela de
gestão de perfis.

### `role_permissions`

```sql
PRIMARY KEY (role_id, permission_id)
INDEX ix_role_permissions_permission_role (permission_id, role_id)
```

A PK resolve "quais permissões este perfil tem" — a consulta feita a cada requisição
autenticada. O índice invertido resolve "quais perfis concedem esta permissão", usado pela
listagem de responsáveis elegíveis, que filtra por `DEMAND_BE_ASSIGNEE`.

### `projects` e `demand_attachments`

```sql
UNIQUE uq_projects_uuid       (uuid)
INDEX  ix_projects_active_name (active, name)
INDEX  ix_projects_created_by  (created_by_user_id)

UNIQUE uq_demand_attachments_uuid (uuid)
INDEX  ix_demand_attachments_demand_created (demand_id, created_at)
```

`(demand_id, created_at)` entrega os anexos de uma demanda já em ordem cronológica — que
é como o card escolhe a "primeira imagem anexada" para a miniatura.

### `demand_comments`

```sql
UNIQUE uq_demand_comments_uuid (uuid)
INDEX  ix_demand_comments_demand_created (demand_id, created_at)
INDEX  ix_demand_comments_author (author_user_id)
```

`(demand_id, created_at)` entrega a conversa de uma demanda em ordem — a aba
Comentários lista do mais recente ao mais antigo sobre este índice.

### `project_integration_credentials`

```sql
UNIQUE uq_project_integration_uuid    (uuid)
UNIQUE uq_project_integration_project (project_id)
UNIQUE uq_project_integration_api_key (api_key)
```

Três índices, três consultas: `uuid` é o identificador público, `project_id` é o que
garante **uma credencial por projeto** no próprio banco (não só na aplicação), e
`api_key` é o que resolve `POST /integration/auth/token` — a única leitura desta tabela
fora da tela de gestão, e a que precisa ser mais rápida, pois acontece sem sessão.

### `logs`

```sql
INDEX ix_logs_subject_time  (subject_type, subject_uuid, occurred_at, uuid)
INDEX ix_logs_category_time (category, occurred_at, uuid)
INDEX ix_logs_project_time  (project_uuid, occurred_at, uuid)
INDEX ix_logs_actor_time    (actor_uuid, occurred_at, uuid)
INDEX ix_logs_request       (request_id)
```

Um índice por forma de consulta, e todos os que ordenam terminam em `(occurred_at, uuid)`
— nunca só `occurred_at`. `uuid` é o desempate porque `occurred_at` sozinho não é único —
duas linhas no mesmo milissegundo existem — e uma ordenação sem desempate estável muda de
posição entre uma página e a seguinte. Com paginação por offset (`ORDER BY occurred_at
DESC, uuid DESC` + `LIMIT`/`OFFSET`), o par completo no índice é o que deixa o banco
percorrer o índice já na ordem pedida em vez de ordenar as linhas encontradas depois de
buscá-las.

- `ix_logs_subject_time` atende a aba **Atualizações** de uma demanda — de longe a
  consulta mais repetida, uma por abertura de painel. O mesmo índice atende a
  Dashboard, que lê as movimentações de status das demandas visíveis (em lotes de 500
  `subject_uuid`) para obter a data de entrega e de início de cada uma.
- `ix_logs_category_time` atende as abas Atividade/Sistema da tela de Logs sem filtro
  adicional.
- `ix_logs_project_time` e `ix_logs_actor_time` atendem os filtros de projeto e de pessoa.
- `ix_logs_request` correlaciona todos os registros de uma requisição — o botão
  "Ver tudo desta requisição" na interface, e o mesmo `requestId` do log HTTP efêmero.

---

## Integridade referencial

| Relação | `ON DELETE` | Justificativa |
|---|---|---|
| `role_permissions → roles` | `CASCADE` | As concessões não existem sem o perfil |
| `role_permissions → permissions` | `CASCADE` | Idem |
| `project_members → projects` | `CASCADE` | Alocação não sobrevive ao projeto |
| `project_members → users` | `CASCADE` | Idem |
| `demands → projects` | `CASCADE` | A demanda vai junto com o projeto que a contém (`project_id` é anulável: uma demanda pode não pertencer a projeto algum) |
| `demand_attachments → demands` | `CASCADE` | Anexo pertence à demanda |
| `users → roles` | `RESTRICT` | Impede deixar usuários sem perfil |
| `demands → users` (responsável/criador) | `RESTRICT` | Preserva a autoria e a responsabilidade |
| `demand_comments → demands` | `CASCADE` | Comentário não sobrevive à demanda |
| `demand_comments → users` | `RESTRICT` | Preserva a autoria do comentário |
| `project_integration_credentials → projects` | `CASCADE` | Credencial não sobrevive ao projeto |
| `project_integration_credentials → users` | `RESTRICT` | Preserva quem gerou a credencial |
| `logs → (qualquer tabela)` | *(nenhuma FK)* | Ver [Por que `logs` não tem FK](#por-que-logs-não-tem-fk) |

A invariante **`responsible ∈ project.members`** não é expressável como constraint em
MySQL (exigiria uma FK composta com uma coluna redundante). É garantida pela aplicação em
`AssigneeEligibility`, verificada na criação e na edição, e protegida pelo outro lado por
`RemoveProjectMember`, que recusa remover alguém que ainda seja responsável por demandas
no projeto. A própria seed valida essa condição e falha se os dados a violarem.

---

## Decisões de performance

**Sem paginação no Kanban.** O quadro carrega o projeto inteiro porque é isso que um
quadro é: as cinco colunas visíveis ao mesmo tempo. Paginar destruiria a funcionalidade.
Para volumes que justifiquem, `IMPROVEMENTS.md` registra virtualização das colunas.

**Paginação por offset em `logs` e em `demands/history`.** Ao contrário do quadro, um
registro de atividade — ou o histórico de demandas — cresce sem teto natural. A primeira
versão usava cursor (keyset): estável sob escrita concorrente e com custo constante em
qualquer profundidade, mas incapaz de responder "quantas páginas existem" ou "pule para a
página 7" sem andar por elas uma de cada vez — exatamente a capacidade que as telas de
Logs e Demandas pedem. `LIMIT`/`OFFSET` degrada em profundidade extrema e pode reordenar
sob escrita concorrente muito intensa, mas nesta escala — uma ferramenta interna, não um
fluxo de alto volume — o `count()` que o offset exige ao lado de cada página é barato o
bastante para não pesar essa troca. Ver
[`ADDED_REQUIREMENTS.md`, item 44](ADDED_REQUIREMENTS.md#44-demandas-como-histórico-paginado)
para o relato completo da correção.

**Sem N+1.** Cada consulta de demanda traz projeto, responsável, criador e anexos em uma
única query com `include`. O card view é montado no repositório, sem viagens adicionais.

**Miniaturas geradas uma vez, no upload.** O board renderiza dezenas de cards
simultaneamente; servir a imagem original em um preview de 44px dominaria o peso da
página. A miniatura é WebP, 320×200, gerada com Sharp e armazenada ao lado do original.

**Sem cache.** Não há requisito que o justifique, e um cache introduz invalidação — que é
exatamente onde erros de autorização costumam nascer. As permissões são deliberadamente
lidas do banco a cada requisição para que uma alteração de perfil surta efeito imediato.

**Busca com `contains`.** Gera `LIKE '%termo%'`, que não usa índice. É aceitável no volume
desta versão e o filtro principal do Kanban acontece no cliente. Para volumes maiores, o
caminho é `FULLTEXT` em `demands(title, description)`.
