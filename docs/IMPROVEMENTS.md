# Melhorias Futuras

Registro do que foi **deliberadamente não implementado** nesta versão, com o motivo e o
caminho de evolução.

O princípio que governa esta lista:

> Preparar para escala não significa adicionar infraestrutura antecipadamente.

Nada aqui foi antecipado. A escalabilidade desta versão vem de boa modelagem, bounded
contexts claros, índices adequados, contratos, isolamento, inversão de dependência,
domínio consistente e baixo acoplamento.

---

## Prioridade Futura 1 — Múltiplos responsáveis por demanda

**Hoje:** uma demanda possui exatamente **um** responsável
(`demands.responsible_user_id`), conforme a V1 do escopo.

**Evolução:** `Demand N ↔ N User` através de uma tabela `demand_assignees`, permitindo
responsável principal e participantes secundários.

```sql
demand_assignees
  demand_id   BIGINT FK
  user_id     BIGINT FK
  is_primary  BOOLEAN
  created_at  DATETIME
  PRIMARY KEY (demand_id, user_id)
  INDEX (user_id, demand_id)
```

**Por que não agora:** o escopo pede um responsável. Modelar N:N antecipadamente
adicionaria uma tabela, uma tela de gestão e a pergunta "quem é o dono?" em toda
consulta, sem nenhum requisito que a justifique.

**Por que a migração será barata:** o agregado `Demand` já encapsula a atribuição em
`assignResponsible()`, e a elegibilidade já está isolada em `AssigneeEligibility`.
A mudança seria interna ao agregado e ao mapper — nem os controllers nem o State Pattern
seriam afetados. O DTO ganharia um array ao lado do campo atual, mantendo compatibilidade
durante a transição.

---

## Prioridade Futura 2 — Exclusão de perfis

**Hoje:** perfis podem ser criados e atualizados, mas não excluídos.

**Antes de implementar, é preciso tratar:**

1. **Usuários associados** — o que acontece com quem tem o perfil excluído? As opções
   são bloquear a exclusão, exigir reatribuição explícita, ou migrar para um perfil
   padrão. A escolha é de produto, não técnica.
2. **Reatribuição** — se houver migração, ela precisa ser transacional junto da exclusão.
3. **Perfis de sistema** — Administrador, Agilista e Desenvolvedor nunca podem ser
   excluídos; a seed depende deles.
4. **Integridade referencial** — `users.role_id` é `RESTRICT` justamente para impedir
   usuários órfãos. A exclusão precisaria de um fluxo explícito, não de um `CASCADE`.
5. **Último administrador** — excluir o perfil do único administrador do sistema deixaria
   a instalação sem ninguém capaz de gerenciá-la.

**Por que não agora:** uma exclusão implementada sem essas cinco decisões produz dados
inconsistentes ou um sistema inacessível. Desativar o perfil (`active = false`) já cobre
o caso de uso real de "parar de usar este perfil" sem nenhum desses riscos.

---

## Outras evoluções possíveis

Nenhuma delas foi antecipada. Cada uma aguarda um requisito concreto.

### Domínio e auditoria

| Evolução | O que resolve | Por que ainda não |
|---|---|---|
| **Retenção e expurgo de `logs`** | Uma tabela append-only sem limite cresce para sempre | O módulo de Logs (item 30) foi adicionado nesta rodada; uma política de retenção (arquivar/expurgar linhas com mais de N meses) é uma decisão operacional, não técnica, e depende de requisito de compliance que não existe aqui |
| **Busca full-text em `logs`** | `search` hoje é `LIKE '%termo%'` sobre `summary`/`subjectLabel`/`actorName`/`projectName` — não usa índice | Volume atual (dezenas a centenas de milhares de linhas) não justifica; o caminho é `FULLTEXT` sobre as mesmas colunas, mesmo raciocínio de `demands(title, description)` abaixo |
| **Envio de logs para um sistema externo** | Hoje `logs` vive só no MySQL da aplicação; um incidente que derrube o banco leva o histórico junto | Exigiria um sink externo (ELK, Datadog, etc.) sem requisito que o justifique; `SystemLogger` já é uma porta — trocar ou duplicar o adapter não tocaria os use cases |
| **Domain Events** | `DemandMovedToProduction`, `DemandAssigned` etc., desacoplando efeitos colaterais do use case | O módulo de Logs cobre o caso concreto de "algo aconteceu, registre" sem precisar de barramento de eventos; um Domain Event só ganharia sobre isso se surgisse um segundo consumidor real |
| **Outbox Pattern** | Entrega confiável de eventos a consumidores externos | Só faz sentido quando existirem Domain Events *e* consumidores externos |
| **Menções e moderação em comentários** | `@usuário` com notificação, edição de comentário de terceiros por um administrador | O escopo de comentários (item 32) é conversa simples; menção exigiria parsing e um canal de notificação que não existe, e moderação por terceiro contradiria a regra "só o autor" sem um caso de uso que a peça |
| **Webhooks de saída na integração** | Notificar o sistema externo quando algo muda *na interface* (hoje o fluxo só vai integração → sistema) | Exigiria assinatura de payload, retentativa e um painel de configuração de destino — nenhum consumidor real pediu ainda |
| **Múltiplas credenciais por projeto** | Revogar o acesso de um único integrador sem afetar outros | O item 36 modela uma credencial por projeto de propósito — é o caso de uso pedido; a coluna `project_id` já é `UNIQUE` por essa razão, e virar N:N é uma migração aditiva simples quando houver necessidade real |

### Experiência

| Evolução | O que resolve | Por que ainda não |
|---|---|---|
| **Notificações por e-mail/push e lembrete de prazo** | Avisar fora da aplicação, ou quando o prazo se aproxima | As notificações dentro do painel (tempo real via SSE) já existem; um canal externo exige template, preferências por usuário e um agendador para os lembretes |
| **Filtros salvos** | Recuperar recortes usados com frequência | Filtros atuais já vivem na URL e são compartilháveis |
| **Diagrama de fluxo cumulativo e previsão por Monte Carlo na Dashboard** | Ver gargalos se formando ao longo do tempo e responder "quando fica pronto?" com probabilidade | O CFD exige o status de cada demanda em cada dia; a previsão exige um histórico de vazão com semanas suficientes. Os dois ficam confiáveis com mais meses de `logs` do que existem hoje |

### Assistente de IA

| Evolução | O que resolve | Por que ainda não |
|---|---|---|
| **Respostas em streaming (SSE)** | O texto aparece enquanto é gerado, em vez de chegar inteiro | Com Flash-Lite e respostas de até ~260 palavras, a espera fica em poucos segundos; em streaming, citações e links teriam de ser validados sobre um texto ainda incompleto |
| **Avaliação automatizada dos prompts (evals)** | Medir, a cada troca de prompt ou de modelo, se rascunhos e relatórios continuam corretos | Exige um conjunto de casos rotulados e chamadas reais ao modelo no CI. Os testes atuais cobrem a parte determinística: validação das propostas, citações, permissões, visibilidade e mapeamento de falhas |
| **Agente com ferramentas e confirmação por etapa** | Pedidos de várias etapas ("passe as atrasadas da Beatriz para o Lucas") | Cada ferramenta de escrita precisaria de pré-visualização e confirmação próprias. Hoje as ações são um catálogo fechado — autorizável, testável e explicável |
| **Limite de uso distribuído** | O limite de 20 pedidos por 5 minutos vale por processo | Há uma única instância da API; com várias, `RateLimiter` ganha um adapter Redis sem tocar no caso de uso |
| **Chave de cifragem em cofre (KMS / Secrets Manager)** | Deixar de derivar do `JWT_SECRET` a chave que protege a chave do provedor, e rotacionar as duas separadamente | Pertence à infraestrutura de produção; `SecretCipher` já é a porta, e o formato `v1:` do texto cifrado já prevê a rotação |
| **Histórico de conversas** | Retomar uma análise dias depois | Um pedido pode citar qualquer demanda; guardar conversas exige política própria de retenção e de visibilidade |

### Performance e escala

| Evolução | O que resolve | Por que ainda não |
|---|---|---|
| **Paginação no quadro Kanban** | Um projeto com milhares de demandas | Um quadro Kanban mostra as cinco colunas simultaneamente — paginar destruiria a funcionalidade. O índice `(project_id, status, due_date)` já suporta a evolução, incluindo uma futura troca para cursor caso o volume do offset atual (Logs e Demandas — ver `DATABASE.md`) deixe de compensar. |
| **Métricas da Dashboard pré-agregadas** | A Dashboard calcula a cada requisição, sobre todas as demandas visíveis e suas movimentações | Com dezenas de milhares de demandas, o caminho é um snapshot diário por projeto (uma tabela de agregados alimentada pelos eventos de status). Hoje o cálculo em memória leva milissegundos, e um agregado traria invalidação sem necessidade |
| **Virtualização das colunas** | Colunas com centenas de cards | Renderizar tudo é mais rápido do que virtualizar até algumas centenas de itens |
| **Busca full-text** | `LIKE '%termo%'` não usa índice | Volume atual não justifica; o caminho é `FULLTEXT` em `demands(title, description)` |
| **Cache (Redis)** | Reduzir carga de leitura | Introduz invalidação, que é onde erros de autorização nascem. Permissões são lidas do banco de propósito, para refletir mudanças de perfil imediatamente |
| **Storage S3-compatible** | Anexos em outro provedor de objetos | Já existem dois adapters de `FileStoragePort` — disco local e Vercel Blob (`STORAGE_DRIVER`); um terceiro para S3 seria mais uma classe no Composition Root |
| **Barramento distribuído para notificações (Redis pub/sub)** | Push instantâneo entre várias instâncias da API | Hoje o push em memória é instantâneo numa instância e as demais recebem pela verificação periódica no banco (`NOTIFICATION_POLL_INTERVAL_SECONDS`); um barramento só compensa com tráfego que torne esse intervalo perceptível |

### Operação

| Evolução | O que resolve | Por que ainda não |
|---|---|---|
| **Métricas (Prometheus)** | Latência, taxa de erro, throughput | Sem SLO definido, seriam números sem decisão associada |
| **Tracing distribuído** | Seguir uma requisição entre serviços | Há um único serviço; o `requestId` já correlaciona tudo |
| **Rate limiting geral e distribuído** | Proteger contra abuso em todas as rotas, com contagem compartilhada entre instâncias | Hoje há limite por IP nas rotas públicas (login e troca de token de integração) e por usuário no assistente de IA, em memória por instância. O restante exige sessão; um limite global e compartilhado entraria com Redis |
| **Content-Security-Policy no frontend** | Defesa extra contra XSS | O frontend já sanitiza todo HTML (servidor + DOMPurify) e envia `X-Frame-Options`, `nosniff`, `Referrer-Policy` e `Permissions-Policy`; uma CSP estrita precisa ser calibrada contra Quill, mermaid, fontes externas e avatares antes de ser aplicada sem quebrar telas |
| **`prisma.config.ts`** | Remove o aviso de depreciação de `package.json#prisma` | Com o arquivo de configuração, o Prisma deixa de carregar o `.env` sozinho; a troca deve vir junto da atualização para o Prisma 7 |
| **Autenticação por senha / SSO** | Credenciais reais | O escopo define explicitamente seleção de usuário sem senha. `TokenService` e o fluxo de sessão já estão isolados, então adicionar um verificador de credencial não tocaria o resto |

---

## Explicitamente **não** adotados

Sem um requisito concreto que os justifique, os seguintes itens seriam complexidade sem
benefício atual e **não** foram introduzidos:

- **Microserviços** — não há necessidade de escala independente, times separados por
  serviço ou tecnologias heterogêneas. As fronteiras de módulo permitem a extração
  futura, se um dia houver motivo.
- **Kafka / RabbitMQ** — não há comunicação assíncrona nem consumidores externos.
- **Kubernetes** — dois contêineres e um banco não justificam um orquestrador.
- **CQRS** — os read models (`DemandQueries`, `UserQueries`) já separam leitura de
  escrita onde isso paga; separar os *stores* exigiria sincronização e consistência
  eventual sem ganho.
- **Event Sourcing** — o estado atual é a fonte de verdade e nenhum requisito pede
  reconstrução histórica. Se surgir, "histórico de status" resolve o caso concreto a uma
  fração do custo.
- **Redis** — ver cache acima.
