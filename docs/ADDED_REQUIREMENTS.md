# Requisitos Adicionados

O escopo original permite acrescentar requisitos que tornem a aplicação melhor, desde que
documentados. Este é o registro completo de tudo que foi adicionado, com a justificativa
de cada item.

Tudo aqui é **adição**; nenhum requisito original foi alterado ou substituído — com uma
única exceção, marcada explicitamente onde acontece: o [item 41](#41-produção-reversível-para-quem-gerencia),
que torna "produção é terminal" condicional a uma permissão em vez de absoluto para todos.

---

## Sumário

| # | Requisito | Natureza |
|---|---|---|
| 1 | [Projetos](#1-projetos) | Modelagem |
| 2 | [Alocação N:N de usuários em projetos](#2-alocação-nn-de-usuários-em-projetos) | Modelagem |
| 3 | [Gestão de perfis com permissões editáveis](#3-gestão-de-perfis-com-permissões-editáveis) | Funcionalidade |
| 4 | [RBAC data-driven com hierarquia ACCESS](#4-rbac-data-driven-com-hierarquia-access) | Segurança |
| 5 | [Anexos com miniatura no card](#5-anexos-com-miniatura-no-card) | Funcionalidade |
| 6 | [Identificadores públicos por UUID](#6-identificadores-públicos-por-uuid) | Segurança |
| 7 | [Tema claro/escuro](#7-tema-claroescuro) | UX |
| 8 | [Tela de listagem de demandas](#8-tela-de-listagem-de-demandas) | UX |
| 9 | [Elegibilidade do responsável](#9-elegibilidade-do-responsável) | Regra de negócio |
| 10 | [Acessibilidade](#10-acessibilidade) | UX |
| 11 | [Swagger / OpenAPI](#11-swagger--openapi) | Suporte |
| 12 | [Observabilidade básica](#12-observabilidade-básica) | Suporte |
| 13 | [Docker Compose completo](#13-docker-compose-completo) | Infra |
| 14 | [Seed determinística e idempotente](#14-seed-determinística-e-idempotente) | Suporte |
| 15 | [Testes automatizados](#15-testes-automatizados) | Qualidade |
| 16 | [Sistema de movimento](#16-sistema-de-movimento) | UX |
| 17 | [Encerramento de sessão resiliente](#17-encerramento-de-sessão-resiliente) | Segurança |
| 18 | [Quadro em tela cheia e arraste no card inteiro](#18-quadro-em-tela-cheia-e-arraste-no-card-inteiro) | UX |
| 19 | [Tela dedicada de permissões, com autosave](#19-tela-dedicada-de-permissões-com-autosave) | UX |
| 20 | [Visualização em lista do quadro](#20-visualização-em-lista-do-quadro) | UX |
| 21 | [Um único select, com busca](#21-um-único-select-com-busca) | UX |
| 22 | [Checklist na demanda](#22-checklist-na-demanda) | Modelagem |
| 23 | [Descrição em rich text](#23-descrição-em-rich-text) | Segurança |
| 24 | [Edição no próprio painel de detalhes](#24-edição-no-próprio-painel-de-detalhes) | UX |
| 25 | [Transferência de demanda entre projetos](#25-transferência-de-demanda-entre-projetos) | Regra de negócio |
| 26 | [Checklist criado junto com a demanda](#26-checklist-criado-junto-com-a-demanda) | Regra de negócio |
| 27 | [Indicadores opcionais no card](#27-indicadores-opcionais-no-card) | UX |
| 28 | [Anexos geridos sem sair do painel](#28-anexos-geridos-sem-sair-do-painel) | UX |
| 29 | [Visualizador de anexos embutido](#29-visualizador-de-anexos-embutido) | UX |
| 30 | [Módulo de Logs: atividade e sistema](#30-módulo-de-logs-atividade-e-sistema) | Auditoria |
| 31 | [Histórico da demanda (aba Atualizações)](#31-histórico-da-demanda-aba-atualizações) | Funcionalidade |
| 32 | [Comentários nas demandas](#32-comentários-nas-demandas) | Funcionalidade |
| 33 | [Painel de detalhes reorganizado em abas](#33-painel-de-detalhes-reorganizado-em-abas) | UX |
| 34 | [Selo "Melhoria" nos módulos adicionados](#34-selo-melhoria-nos-módulos-adicionados) | UX |
| 35 | [Telas de listagem ocupam a largura disponível](#35-telas-de-listagem-ocupam-a-largura-disponível) | UX |
| 36 | [Integração: criação e atualização de demandas via API](#36-integração-criação-e-atualização-de-demandas-via-api) | Funcionalidade |
| 37 | [Documentação do projeto navegável no sistema](#37-documentação-do-projeto-navegável-no-sistema) | Suporte |
| 38 | [Dashboard estratégica das demandas](#38-dashboard-estratégica-das-demandas) | Gestão |
| 39 | [Assistente de IA: Ação rápida](#39-assistente-de-ia-ação-rápida) | Funcionalidade |
| 40 | [Adicionar demanda direto na coluna do Kanban](#40-adicionar-demanda-direto-na-coluna-do-kanban) | UX |
| 41 | [Produção reversível para quem gerencia](#41-produção-reversível-para-quem-gerencia) | Regra de negócio |
| 42 | [Prioridade da demanda](#42-prioridade-da-demanda) | Modelagem |
| 43 | [Preview da descrição na listagem](#43-preview-da-descrição-na-listagem) | UX |
| 44 | [Demandas como histórico paginado](#44-demandas-como-histórico-paginado) | UX |
| 45 | [Chat da IA e detalhes da demanda lado a lado](#45-chat-da-ia-e-detalhes-da-demanda-lado-a-lado) | UX |
| 46 | [Menu fechado no assistente, prioridade e exportação em PDF](#46-menu-fechado-no-assistente-prioridade-na-criação-e-no-relatório-exportação-em-pdf) | Funcionalidade |
| 47 | [Navegação, badges e polimento visual](#47-navegação-badges-e-polimento-visual--rodada-de-ajustes-de-ui) | UX |
| 48 | [Projeto opcional, visibilidade por responsável e pessoas em toda parte](#48-projeto-opcional-na-demanda-visibilidade-por-responsável-e-pessoas-em-toda-parte) | Regra de negócio |
| 49 | [Topbar, sidebar recolhível e edição do próprio perfil](#49-topbar-sidebar-recolhível-e-edição-do-próprio-perfil) | UX |
| 50 | [Permissões próprias para prioridade, prazo, responsável e projeto](#50-permissões-próprias-para-prioridade-prazo-responsável-e-projeto) | Regra de negócio |

---

## 1. Projetos

**O que:** entidade `Project`, com CRUD (criação e edição) e listagem. Toda demanda
pertence a um projeto — desde o [item 48](#48-projeto-opcional-na-demanda-visibilidade-por-responsável-e-pessoas-em-toda-parte),
o vínculo é opcional: uma demanda pode ser registrada antes de se decidir onde ela entra,
e é o projeto que passa a governar quem pode ser seu responsável.

**Por quê:** o escopo original pede um "Quadro kanban de **Projetos**", mas não modela o
projeto em si. Sem ele, todas as demandas existiriam em um espaço único e global — e não
haveria como implementar isolamento de acesso, que é a base de qualquer sistema
multiusuário real.

**Impacto:** o campo Projeto passa a ser obrigatório no cadastro de demanda, e o Kanban
ganha um filtro por projeto.

---

## 2. Alocação N:N de usuários em projetos

**O que:** relacionamento `User N ↔ N Project` via `ProjectMember`. O administrador
gerencia as alocações. Usuários comuns acessam apenas os projetos de que participam e,
consequentemente, apenas as demandas desses projetos.

**Por quê:** é o que dá sentido prático aos projetos. Sem isolamento, todo usuário veria
tudo, e "projeto" seria apenas um rótulo.

**Decisão de modelagem:** `ProjectMember` **não** possui `role`. Autoridade é global
(perfil do usuário); localidade é a alocação. Um papel por projeto criaria uma segunda
fonte de verdade sobre o que a pessoa pode fazer, e as duas divergiriam.

**Proteção:** remover alguém de um projeto é recusado se essa pessoa ainda for
responsável por demandas ali (`MEMBER_HAS_DEMANDS`), o que impede quebrar a invariante
`responsible ∈ project.members` por fora.

---

## 3. Gestão de perfis com permissões editáveis

**O que:** telas de listagem, cadastro e edição de perfis, com configuração de
permissões. Os três perfis originais (Administrador, Agilista, Desenvolvedor) permanecem
obrigatórios e marcados como `is_system`.

**Por quê:** o escopo fixa três perfis com regras específicas. Tratá-los como constantes
de código tornaria qualquer perfil novo impossível sem alterar o sistema. Como dados, os
três originais continuam existindo exatamente com as mesmas regras — mas agora são um
caso particular de um modelo geral.

**Perfis de sistema:** nome imutável e não desativáveis, mas com **permissões
editáveis**, para que o avaliador possa experimentar a matriz. `npm run db:seed` restaura
a configuração original.

**Não implementado:** exclusão de perfis — ver [`IMPROVEMENTS.md`](IMPROVEMENTS.md).

---

## 4. RBAC data-driven com hierarquia ACCESS

**O que:** catálogo de 24 permissões semânticas, com `<MÓDULO>_ACCESS` soberana sobre as
demais permissões do módulo.

**Por quê:** o escopo descreve as regras em prosa ("pode editar demandas", "não pode
cadastrar usuários"). Traduzi-las em permissões nomeadas as torna verificáveis,
testáveis e editáveis, em vez de espalhadas em condicionais.

A hierarquia ACCESS resolve uma ambiguidade concreta: o que significa "pode excluir
demandas" para alguém que não pode nem acessá-las? A resposta é: nada. `ACCESS` soberana
torna isso explícito e impede que uma inconsistência gravada no banco amplie autoridade.

**Detalhe importante:** permissões são **semânticas**, não CRUD genérico. `DEMAND_BE_ASSIGNEE`
é uma ação de domínio própria — não é um "update". Mover um card, por outro lado, **é**
uma edição de escopo sobre uma demanda existente, e por isso vive sob `DEMAND_UPDATE`
junto com o resto — ver a nota sobre a fusão do Kanban em
[`PERMISSIONS.md`](PERMISSIONS.md#catálogo-de-permissões).

Detalhes completos em [`PERMISSIONS.md`](PERMISSIONS.md).

---

## 5. Anexos com miniatura no card

**O que:** N anexos por demanda, com upload multipart, allowlist de MIME types, limite de
tamanho configurável, chave de armazenamento gerada pela aplicação e miniatura otimizada
gerada com Sharp para imagens.

**Por quê:** o escopo lista título, responsável e data no card. Uma referência visual
comunica o estado de uma demanda mais rápido do que texto — e demandas de software
frequentemente carregam um print, um mockup ou um documento.

**Comportamento:** o card exibe a miniatura da **primeira imagem válida anexada**; os
detalhes listam todos os arquivos. Arquivos não-imagem recebem um ícone Lucide
semanticamente apropriado.

**Segurança:** o nome original do arquivo nunca vira caminho — é preservado apenas como
metadado. A chave é gerada pela aplicação, validada contra path traversal, e a
consistência entre MIME declarado e extensão é verificada antes de qualquer escrita.

**Extensibilidade:** `FileStoragePort` abstrai o provider. Disco local hoje;
S3-compatible amanhã com uma linha no Composition Root.

---

## 6. Identificadores públicos por UUID

**O que:** ids numéricos existem apenas na persistência. API, JWT, DTOs, URLs e frontend
usam exclusivamente UUID v7.

**Por quê:** ids sequenciais expostos permitem enumeração de recursos e revelam volume de
negócio. Além disso, acoplam contratos públicos a uma decisão de persistência.

**Verificação:** há um teste de API que serializa cada endpoint de coleção e falha se
encontrar qualquer campo no formato `"id": <número>` ou nomes como `projectId`/`userId`.

Detalhes e o trade-off `CHAR(36)` vs `BINARY(16)` em [`DATABASE.md`](DATABASE.md).

---

## 7. Tema claro/escuro

**O que:** temas Light e Dark com Tailwind + CSS variables. Preferência persistida
localmente; na ausência de preferência, segue `prefers-color-scheme`.

**Por quê:** um quadro Kanban é uma tela de trabalho olhada por horas.

**Decisão visual:** o tema escuro é uma interpretação escura da **mesma identidade**, não
uma paleta diferente. O lime da marca continua sendo o acento e continua marcando o item
ativo e as ações primárias; o que muda é a superfície sobre a qual ele aparece — uma
barra lateral inteiramente lime brilharia à noite.

---

## 8. Tela de listagem de demandas

**O que:** visão em lista das mesmas demandas do quadro, ordenada por prazo.

**Por quê:** o quadro responde "onde está cada coisa no fluxo". A lista responde "o que
vence primeiro". São perguntas diferentes, e a segunda é difícil de ler em cinco colunas
paralelas.

**Evoluiu para tabela paginada** — ver
[item 44](#44-demandas-como-histórico-paginado): a tela passou a ser tratada como o
histórico completo de demandas do sistema, não mais uma segunda leitura do quadro atual.

---

## 9. Elegibilidade do responsável

**O que:** um usuário só pode ser responsável por uma demanda quando está ativo, pertence
ao projeto da demanda e possui `DEMAND_BE_ASSIGNEE`.

**Por quê:** o escopo pede que o campo responsável liste "todos os desenvolvedores e
agilistas da base". Com projetos e perfis customizados, essa regra precisa ser expressa
como capability e escopo, não como lista de nomes de perfil — caso contrário, todo perfil
novo seria cidadão de segunda classe.

A regra existe no backend e é verificada na criação **e** na edição, não apenas na
montagem do combobox.

---

## 10. Acessibilidade

**O que:** drag-and-drop operável por teclado (dnd-kit `KeyboardSensor` com anúncios em
região `aria-live`), combobox seguindo o padrão ARIA de combobox/listbox, foco preso e
restaurado no modal de detalhes, `aria-label` em todos os ícones sem texto, mensagens de
erro ligadas aos campos via `aria-describedby` e anunciadas com `role="alert"`, foco
visível em todas as superfícies, e `prefers-reduced-motion` respeitado.

**Por quê:** o escopo exige mensagens indicando o campo não preenchido — o que é, em
essência, um requisito de acessibilidade. Cumprir isso corretamente significa que a
mensagem precisa ser localizável por quem usa leitor de tela, não apenas visível.

---

## 11. Swagger / OpenAPI

**O que:** documentação interativa em `/docs`, documento cru em `/openapi.json`.

**Por quê:** o escopo exige que "todas as funções e todos os perfis possam ser utilizados
pelos avaliadores". O Swagger permite verificar que a API bloqueia o que a interface
esconde — sem ele, seria preciso confiar apenas no que a tela mostra.

---

## 12. Observabilidade básica

**O que:** `requestId` por requisição (aceito de proxy quando bem formado), logging HTTP
com Morgan incluindo método, rota, status, tempo e `requestId`, e tratamento global de
erros com envelope consistente. Healthcheck em `/health`.

**Por quê:** correlacionar uma linha de log, uma resposta de erro e um stack trace é o
mínimo para diagnosticar qualquer problema. JWT e cookies nunca são logados.

Esse log HTTP é efêmero (stdout) e serve à operação. O registro persistente e consultável
do que acontece no sistema é o [módulo de Logs](#30-módulo-de-logs-atividade-e-sistema),
que reaproveita o mesmo `requestId` para ligar as duas pontas.

---

## 13. Docker Compose completo

**O que:** MySQL com volume e healthcheck, API e frontend, subindo com um único
`docker compose up --build`. Migrations e seed rodam automaticamente no entrypoint.

**Por quê:** "a aplicação precisa estar funcional, podendo ser utilizada para os testes
do processo". Zero passos manuais entre clonar e usar.

---

## 14. Seed determinística e idempotente

**O que:** 3 perfis de sistema, 8 usuários, 3 projetos com relação N:N real (usuário em
um projeto, usuário em dois, projeto com vários usuários), 13 demandas distribuídas entre
todos os cinco status, incluindo duas em produção.

**Por quê:** a seed é parte da entrega. Dados profissionais e coerentes tornam a
avaliação possível sem cadastro manual.

**Decisões:**
- **Idempotente** — todo write é um upsert por chave natural estável. Rodar duas vezes
  converge em vez de duplicar; rodar sobre uma base existente corrige desvios.
- **Determinística** — UUIDs públicos fixos, para que uma URL ou um uuid colado no
  Swagger continuem funcionando após `db:reset`.
- **Prazos relativos** — `hoje`, `+1`, `+3`, `+7`, `+15` dias a partir da execução, para
  que o quadro continue significativo semanas depois do setup. Três prazos são
  **negativos de propósito**: duas demandas em aberto já atrasadas e uma entregue depois
  do prazo, para que a [Dashboard](#38-dashboard-estratégica-das-demandas) mostre
  atraso, atenção e taxa de entrega no prazo com dados reais, e não só zeros.
- **Autovalidante** — a seed verifica `responsible ∈ project.members` e falha se os dados
  violarem a invariante que a aplicação impõe em runtime.
- **Assistente de IA pronto para uso** — a seed grava a configuração do
  [assistente](#39-assistente-de-ia-ação-rápida) ativa, com Gemini 3.5 Flash-Lite e a chave
  de `SEED_ASSISTANT_API_KEY` (variável de ambiente — a chave nunca fica no código; sem ela,
  a configuração nasce sem chave e é completada na tela), **uma única vez**. É a única parte da seed que não é
  corretiva: a seed roda a cada `docker compose up`, e reaplicá-la desfaria em silêncio uma
  chave ou um modelo trocados na tela.

---

## 15. Testes automatizados

**O que:** 392 testes — 263 no backend (domínio, aplicação e API de ponta a ponta) e 129
no frontend.

**Por quê:** as propriedades mais importantes deste sistema são invisíveis na tela:
produção é terminal, ACCESS é soberana, um projeto alheio não vaza, um id interno nunca
atravessa a fronteira. São exatamente as que precisam de teste.

A cobertura prioriza comportamento crítico em vez de percentual — não há busca por 100%
artificial.

---

## 16. Sistema de movimento

**O que:** um conjunto pequeno e reutilizado de animações, declarado uma única vez em
`tailwind.config.ts` e `styles/index.css`, em vez de transições avulsas por componente.

| Primitiva | Onde é usada | O que comunica |
|---|---|---|
| `rise-in` | troca de rota, colunas, estados vazios | o conteúdo chegou |
| `.stagger` / `.stagger-tight` | menu, cards, listas, projetos, perfis | há uma ordem entre os itens |
| `pop-in` | contador da coluna, ícone de estado vazio | um número mudou |
| `pulse-ring` | ponto da coluna sob o cursor no arraste | é aqui que vai cair |
| `.lift` / `hover:-translate-y-0.5` | tudo que abre ou navega | isto é clicável |
| `.press` / `active:scale` | botões e ações | o clique foi registrado |

**Por quê:** a interface anterior era correta e estática — cada mudança de estado
acontecia em um único quadro, sem nada ligando o antes ao depois. O custo disso não é
estético: quando um card muda de coluna, um contador incrementa e um painel abre sem
transição, o usuário precisa reconstruir sozinho o que aconteceu.

**Decisões que a mantêm disciplinada:**

- **Uma entrada só.** Tudo que aparece usa `rise-in` — 8px e 320ms. Direções e durações
  diferentes por tela leem como inconsistência, não como variedade.
- **Movimento responde a ação.** A única animação contínua é o ponto da coluna sob o
  cursor durante o arraste, e apenas nela. Nada pulsa sozinho.
- **Nenhuma transformação no alvo do arraste.** Um `scale` na coluna sob o cursor
  deslocaria o espaço de coordenadas que o dnd-kit usa para medir o card, e ele
  descolaria do ponteiro. O destaque é feito com sombra e anel.
- **A transição de cor é nominal.** `transition-property` lista as propriedades de cor
  explicitamente; um `transition: all` global animaria também propriedades de layout
  durante o arraste.
- **`prefers-reduced-motion` zera duração *e* atraso.** Sem zerar o atraso, uma lista
  com `animation-fill-mode: backwards` ficaria invisível pelo tempo do stagger.
- **O fill-mode é `backwards`, não `both`.** `backwards` segura o estado inicial durante
  o atraso do stagger, que é a única razão de existir um fill-mode aqui. `both` fixaria
  também o estado final, deixando um `transform: translateY(0)` permanente no elemento —
  e um ancestral transformado vira o bloco de contenção de descendentes `position: fixed`,
  que é exatamente como o `DragOverlay` do dnd-kit se posiciona. O card arrastado
  descolaria do ponteiro.

---

## 17. Encerramento de sessão resiliente

**O que:** a sessão termina de forma confiável em dois caminhos — o botão *Sair* e a
expiração do cookie no meio do uso.

**O defeito que originou isto:** `logout()` chamava `queryClient.clear()`, que remove do
cache o objeto de query que o `AuthProvider` observa. O observer montado continuava
servindo o último resultado e não era reinscrito pelo `setQueryData` seguinte. O
resultado eram três sintomas de uma causa só: o app seguia acreditando que o usuário
anterior estava presente, a tela de login devolvia a pessoa ao quadro, e todas as demais
queries — essas sim removidas — refaziam fetch sem cookie e exibiam erro.

**Como ficou:**

1. A query de sessão é **liquidada para `null`**, nunca destruída. Só as demais são
   removidas, para que nenhum dado sobreviva à fronteira da sessão.
2. O encerramento local acontece em `finally`: se a chamada ao servidor falhar, a sessão
   termina mesmo assim. Manter a pessoa dentro da aplicação com um cookie que o servidor
   talvez já rejeite é pior do que sair otimisticamente.
3. Qualquer **401 de qualquer endpoint** é tratado como fim de sessão, através de um
   listener central no transporte. É assim que um cookie expirado se manifesta: alguma
   query não relacionada é quem descobre.

Três testes de regressão cobrem os três caminhos, e todos falham contra a implementação
anterior.

---

## 18. Quadro em tela cheia e arraste no card inteiro

**O que:** três mudanças no Kanban que andam juntas.

**Aproveitamento de tela.** A casca da aplicação passou a ocupar a viewport
(`h-screen` + `overflow-hidden`), com `main` como contêiner de rolagem. Isso permite que
uma tela peça a altura inteira: o quadro entrega o excedente às colunas, que agora têm a
altura da tela em vez da altura dos seus cards. As colunas dividem a largura igualmente
(`flex-1 basis-0`) com `min-width: 15.5rem` — abaixo disso a régua rola lateralmente em
vez de espremer o conteúdo.

O detalhe que faz funcionar é `min-h-0` nos contêineres flex: sem ele, um filho flex se
recusa a encolher abaixo do seu tamanho intrínseco e o quadro escaparia pela base da tela.

**Projeto no card.** `project: { uuid, name }` já fazia parte do DTO da demanda, então
não houve mudança de contrato. O rótulo aparece **apenas quando o quadro atravessa vários
projetos**; filtrado a um único projeto ele seria ruído repetido em cada card.

**Arraste no card inteiro.** O handle isolado saiu. Isso força três decisões:

1. **O `<button>` que envolvia o card teve de sair.** Um botão engole o gesto de ponteiro
   antes do dnd-kit vê-lo. O `<article>` assumiu o `role`, o tab stop e o teclado.
2. **Um clique que percorreu distância não é um clique.** O gesto de arraste termina com
   um evento `click` na maioria dos navegadores. Comparar a distância percorrida contra
   uma folga de 6px separa "abri o card" de "movi o card" sem depender da contabilidade
   interna de eventos do dnd-kit.
3. **Mouse e toque passaram a ter sensores separados.** Um `PointerSensor` único exigiria
   `touch-action: none` no card inteiro, o que torna a coluna impossível de rolar com o
   dedo. O mouse ativa por distância; o toque, por pressionar-e-segurar (220ms) — o que
   deixa o swipe livre para rolar.

No teclado, **Enter abre** e **espaço pega** o card: o `keyboardCodes` do sensor foi
reduzido para não disputar o Enter.

---

## 19. Tela dedicada de permissões, com autosave

**O que:** a matriz de permissões saiu do modal e virou a rota
`/perfis/:uuid/permissoes`, com botão *Voltar* e **gravação no próprio clique do
checkbox**.

**Por quê:** a matriz tem sete módulos e vinte e seis permissões. Dentro de um diálogo ela
virava uma caixa rolante sobre a página que estava sendo alterada, escurecida ao fundo.
Uma rota também dá endereço à tela: dá para linkar direto as permissões de um perfil.

**O que o autosave obriga a resolver:**

1. **Uma escrita em voo por vez, com a intenção mais recente enfileirada atrás.** Como
   cada requisição carrega o **conjunto inteiro** de permissões e não um delta, uma fila
   de um só elemento basta — o último clique é o que chega ao servidor, e uma rajada de
   oito cliques colapsa em duas requisições.
2. **Escrita recusada devolve o checkbox.** Sem botão *Salvar*, a única falha realmente
   grave é o operador ficar olhando para um checkbox que diz o oposto do que o servidor
   guardou. Em erro, a seleção volta ao último estado confirmado.
3. **O estado precisa ser dito.** Um indicador `aria-live` no cabeçalho reporta
   *Salvando… / Alterações salvas / Alteração não salva*, porque sem botão ele é a única
   confirmação existente — inclusive para leitor de tela.

**O que continuou modal:** a **criação** de perfil. Um perfil que ainda não existe não
tem a que salvar alterações: nome e conjunto inicial precisam chegar juntos, numa
requisição só. É um formulário de verdade, com submit — diferente do editor, onde cada
toggle se sustenta sozinho.

Três testes cobrem o autosave: grava no clique, reverte quando recusado, e desligar o
ACCESS do módulo leva os filhos junto na mesma escrita.

---

## 20. Visualização em lista do quadro

**O que:** o Kanban ganhou abas — **Kanban** e **Lista** — sobre exatamente os mesmos
dados, filtros e busca. A lista agrupa por status, em seções recolhíveis, com as colunas
alinhadas (responsável, anexos, prazo).

**Por quê:** o quadro responde "onde está tudo?"; a lista responde "o que existe, em
ordem?". Um backlog longo se lê melhor em linhas do que arrastando cinco colunas pela
tela — e as colunas alinhadas à direita permitem varrer prazos verticalmente, coisa que
o card não permite.

**Decisões:**

- **A aba fica na URL** (`?visao=lista`), como todo o resto do contexto do quadro, para
  que um colega abra a visão que você estava olhando.
- **A lista não arrasta, de propósito.** Mover trabalho entre etapas é um ato espacial e
  o quadro já faz isso bem; repetir aqui significaria duas implementações da mesma regra.
  Esta visão serve para ler.
- **`role="tablist"` de verdade** — setas navegam entre as abas e só a selecionada é tab
  stop, que é o padrão que um usuário de leitor de tela já conhece.

---

## 21. Um único select, com busca

**O que:** o `<select>` nativo saiu do sistema. Todo dropdown — filtro de projeto,
escolha de perfil, escolha de responsável — passa pelo mesmo `Combobox`, com filtragem
conforme se digita.

**Por quê:** havia dois controles fazendo o mesmo trabalho. O `<select>` nativo não
aceita estilo consistente entre navegadores, não busca, e num quadro com muitos projetos
obriga a rolar uma lista sem filtro. Manter os dois significava duas aparências e dois
contratos de teclado na mesma tela.

**Comportamento:** fechado, lê-se como um select — rótulo à esquerda, chevron à direita.
Aberto, é um campo de busca: a lupa aparece, o placeholder vira "Buscar...", e a lista
filtra sem acento (`normalize('NFD')` + remoção de `p{M}`), tanto no rótulo quanto na
linha secundária. Setas movem, Enter confirma, Escape fecha, `aria-activedescendant`
mantém o leitor de tela em sincronia com o destaque visual.

**Dois defeitos que a unificação expôs e corrigiu:**

1. **A lista era recortada dentro de modais.** Um dropdown posicionado com `absolute` é
   cortado por qualquer ancestral com `overflow`, e estes selects vivem dentro do corpo
   rolante de diálogos — as opções sumiam atrás da borda justamente onde mais importam.
   A lista passou a ser renderizada em portal, medida contra a viewport, com reposição em
   `scroll` de **qualquer** ancestral (listener em fase de captura) e inversão para cima
   quando não há espaço abaixo.
2. **O Escape fechava o diálogo inteiro.** O focus trap do `Modal` escuta em fase de
   captura no `document`, então vencia qualquer handler interno. Agora ele devolve o
   Escape a um combobox com a lista aberta: a primeira tecla fecha a lista, a segunda
   fecha o diálogo.

O `Select` nativo foi removido de `components/ui/Field.tsx` — sem usos restantes, ficaria
como um segundo caminho convidando a divergência.

---

## 22. Checklist na demanda

**O que:** cada demanda tem uma lista de itens verificáveis, com criação, marcação,
renomeação e remoção.

**Modelagem:** `demand_checklist_items` é **parte do agregado Demand**, não uma entidade
própria. Um item não existe sem sua demanda, nunca é alcançado sem passar por ela, e some
com ela — que é exatamente a fronteira que um agregado desenha. Consequências práticas:

- Toda escrita passa pela raiz. É isso que mantém o teto de 50 itens, a ordenação e
  "demanda em produção está congelada" **em um lugar só**, em vez de repetidos por
  endpoint.
- `PrismaDemandRepository.update` salva demanda e checklist **na mesma transação**. Uma
  demanda gravada com metade da lista aplicada é um estado que as invariantes dizem não
  existir, e o banco é o único que ainda garante isso quando o processo sai de cena.
- Os itens são reconciliados por `uuid`, não apagados e reinseridos, para que
  identificadores permaneçam estáveis.
- `position` é explícita e com folgas: ordem de inserção não é contrato, e reordenar não
  deve reescrever a tabela inteira.

**Permissão:** `DEMAND_UPDATE`. Um item de checklist faz parte do escopo da demanda, e
editar escopo é o que essa permissão significa.

---

## 23. Descrição em rich text

**O que:** a descrição passou a ser texto formatado, editada com **Quill** na criação e na
edição.

**O problema que isso cria:** markup escrito num navegador, guardado, e renderizado como
HTML na sessão de outra pessoa. Qualquer coisa que sobreviver a esse caminho **executa
lá**. A resposta é uma allowlist em duas pontas independentes:

| Ponta | O que protege | Como |
|---|---|---|
| Servidor (`sanitize-html`) | o que é **armazenado** | allowlist de tags, `href` restrito a http/https/mailto, `rel="noopener noreferrer"` forçado |
| Navegador (`DOMPurify`) | o que é **executado nesta aba** | mesma allowlist, aplicada imediatamente antes do `dangerouslySetInnerHTML` |

Não é redundância decorativa: a API é uma superfície pública e aceita uma requisição
escrita à mão que nunca passou pelo editor, e uma linha gravada sobrevive à allowlist
vigente quando ela foi escrita.

**Onde a regra mora.** O `RichText` é um value object do domínio que guarda markup **já
sanitizado** e valida o comprimento sobre o **texto**, não sobre o markup — quinhentas
tags `<em>` em volta de três palavras continuam sendo três palavras, e um limite aplicado
ao markup rejeitaria um parágrafo perfeitamente comum só por estar formatado. A
sanitização em si é uma preocupação de fronteira com biblioteca atrás, então vive na
camada de aplicação via a porta `HtmlSanitizer`: o domínio não importa um parser, e uma
decisão de segurança não passa a depender silenciosamente de uma versão de dependência.

**A barra de ferramentas oferece só o que a allowlist mantém.** Um botão cuja saída é
removida no salvamento é pior do que botão nenhum: a pessoa formata, salva, e vê sumir sem
explicação.

**Um defeito encontrado e corrigido no caminho.** A primeira versão do renderizador
adivinhava se o valor "parecia HTML" para lidar com descrições antigas em texto puro. Isso
**destrói conteúdo**: uma descrição contendo `a < b` perde tudo depois do `<`, porque um
sanitizador não distingue isso de uma tag malformada. A correção não foi um heurístico
melhor — foi uma **migration** que converteu as linhas legadas uma única vez, escapando e
envolvendo em `<p>`. Sem dado ambíguo, não há o que adivinhar.

---

## 24. Edição no próprio painel de detalhes

**O que:** todos os campos da demanda são editáveis direto no painel — título,
responsável, projeto, prazo, descrição, status e checklist — clicando sobre o valor.

**A afordância é o ponto.** Edição inline tem uma falha recorrente: nada indica que o
valor é editável, então ninguém edita. Um lápis acompanha cada campo editável, discreto
até o hover mas **sempre ocupando seu espaço**, para que o layout não salte quando o
ponteiro chega.

**Permissão por campo, não por tela.** Cada campo é governado por `DEMAND_UPDATE` —
inclusive o status, que é uma edição de escopo como qualquer outra. Um campo que a pessoa
não pode alterar renderiza como **texto puro, sem controle nenhum** — exibir um controle
desabilitado anunciaria uma ação que a permissão não concede.

Nada disso é fixo no código: conceder `DEMAND_UPDATE` a um perfil na tela de Perfis liga
os lápis para seus membros sem uma linha mudar, porque a verificação é sobre a capability
e nunca sobre o nome do perfil.

**Status muda por seleção, não por rascunho.** É uma escolha única sem nada a confirmar,
então comete na hora — o mesmo que arrastar o card faz, alcançável pelo teclado.

---

## 25. Transferência de demanda entre projetos

**O que:** o projeto de uma demanda passou a ser editável. Na V1 anterior isso era
recusado explicitamente.

**O risco não é a mudança, é o que ela faz com o responsável.** Alocação é por projeto,
então quem estava atribuído pode simplesmente não ser membro do destino. Em vez de limpar
o campo silenciosamente ou deixar sobreviver uma atribuição inválida, a operação valida as
duas decisões juntas:

1. O destino exige **sua própria verificação de acesso** — alcançar esta demanda não diz
   nada sobre o direito de colocá-la em outro lugar.
2. O projeto é aplicado **primeiro**, para que o responsável — tenha ele vindo nesta
   requisição ou já estivesse na demanda — seja validado contra o projeto onde ela vai
   realmente viver.
3. Uma transferência **reabre a pergunta da elegibilidade** mesmo quando o chamador não
   disse nada sobre o responsável.

Na interface, escolher outro projeto revela o seletor de responsável do destino antes de
salvar, e os dois vão numa requisição só — a mesma forma que a API valida.

---

## 26. Checklist criado junto com a demanda

**O que:** `POST /demands` aceita `checklist: string[]`, e o formulário de cadastro tem a
lista já na criação — não só depois que a demanda existe.

**Por que não bastava criar os itens depois.** A primeira tentativa escrevia o rascunho em
requisições de follow-up, o que exigia `DEMAND_UPDATE`. Um **Administrador cria demandas
mas não as edita** pela matriz da spec — ele digitaria a lista, salvaria, e veria os itens
serem recusados com 403 sem explicação. Criar o agregado inteiro coloca a lista sob
`DEMAND_CREATE`, que é a permissão do ato que está de fato acontecendo: **autoria**.

Ganho secundário, não menos importante: é **uma escrita**. Não existe janela em que a
demanda exista com metade do seu checklist — o `create` aninhado do Prisma entra na mesma
transação do pai.

**Na edição** o agregado já existe, então a lista salva item a item, exatamente como no
painel de detalhes. Duas telas, um componente.

---

## 27. Indicadores opcionais no card

**O que:** o card ganhou três camadas — projeto sussurrado, título, e um rodapé de fatos —
e os dados opcionais aparecem como ícone + contagem com tooltip: checklist
(`concluídos/total`) e número de anexos.

**Só aparece quando tem o que dizer.** Um card sem checklist e sem anexo não mostra
nenhum dos dois, para que os que carregam se destaquem em vez de se diluírem numa fileira
de marcadores vazios. Checklist completo muda para verde: é a informação que o olho quer
sem contar.

**O tooltip é portalizado**, pelo mesmo motivo da lista do select: a coluna do Kanban rola,
e um balão posicionado com `absolute` seria recortado por ela — pior no topo e na base da
coluna, que é justamente onde os cards ficam.

**O tooltip nunca é a única fonte.** Cada indicador carrega `aria-label` com o mesmo texto,
então a contagem não é informação que exige ponteiro para alcançar.

**Status com a cor do quadro.** O seletor no painel de detalhes deixou de ser um dropdown
neutro: o gatilho **é** o badge, e cada opção é o mesmo badge. Ler "Em homologação" em
cinza obrigava o olho a re-derivar das palavras o que a cor já dizia. Construído como
`listbox` e não `combobox` — cinco opções fixas não têm o que buscar, e um campo de busca
sobre uma enumeração é mobília.

---

## 28. Anexos geridos sem sair do painel

**O que:** o botão "Anexos" no rodapé do painel de detalhes, que redirecionava para
`/demandas/:uuid/editar`, saiu. Enviar e remover arquivos agora acontece **dentro** do
próprio painel, como qualquer outro campo.

**Por quê:** a demanda que o painel mostra já existe. Enviar um arquivo e remover um
arquivo são, cada um, uma única requisição contra um agregado que já tem identidade —
exatamente a mesma situação do checklist depois que a demanda foi criada. Não havia
nenhuma razão técnica para essa ação em particular exigir uma página inteira e uma
navegação; era um resquício de quando o formulário de edição era o único lugar que sabia
enviar arquivos.

`DemandAttachments` segue o mesmo molde do `DemandChecklist`: mutações vivas via
`useAttachments`, sem estado de rascunho. Cada envio e cada remoção invalida o detalhe
**e** a listagem do quadro — a miniatura do card é o primeiro anexo de imagem, então um
upload ou uma remoção precisam refletir lá também, não só no painel.

O formulário de cadastro continua com seu próprio seletor de arquivos, e por um motivo
que não se aplica aqui: durante a **criação** a demanda ainda não existe, então não há
`demandUuid` para receber o upload — os arquivos ficam numa fila local e sobem depois que
a demanda é criada, o mesmo padrão do `ChecklistDraft`.

A rota `/demandas/:uuid/editar` continua registrada, mas nenhum link do produto aponta
mais para ela numa demanda existente — hoje é alcançável apenas por URL direta.

---

## 29. Visualizador de anexos embutido

**O que:** três ajustes no ciclo de vida de um anexo.

1. **A miniatura saiu do card do Kanban.** Ela permanece nos detalhes da demanda, que é
   onde o anexo é de fato examinado; no card ela competia com o título pelo mesmo espaço
   de 40×40px sem acrescentar nada que o ícone de clipe com a contagem já não dissesse.
2. **Clicar num anexo abre um visualizador embutido, não uma nova guia.** O
   `target="_blank"` era a única forma de alcançar um arquivo — abria uma aba
   desconectada da demanda a que ele pertencia. Uma imagem aparece em tamanho real; um
   PDF é embutido num `<iframe>`, que é o próprio visualizador nativo do navegador,
   zoom e impressão inclusos, sem nada construído para isso. Baixar continua possível,
   mas como uma ação explícita no rodapé — um botão, não o clique que abre o
   visualizador.
3. **PDFs (e os demais tipos não-imagem) ganharam um selo de formato no ícone.** Um
   ícone genérico de documento não dizia se era PDF, planilha ou texto. O selo usa
   convenções que já existem fora do produto — vermelho para PDF, o azul de "em
   andamento" do próprio Kanban para Word, verde para planilha — reaproveitando os
   tokens existentes em vez de inventar uma paleta paralela só para isto.

**Um bug descoberto ao usar a própria funcionalidade: `X-Frame-Options` bloqueava o
iframe.** O `helmet()` aplica por padrão `X-Frame-Options: SAMEORIGIN`, invisível para
uma miniatura em `<img>` mas fatal para um `<iframe>` entre origens — exatamente a
mensagem do Firefox: *"won't allow ... to display the page if another site has embedded
it"*. A API já desabilitava a Content-Security-Policy por servir anexos entre origens
(`localhost:3333` ↔ `localhost:8080`), mas `X-Frame-Options` é um header separado que
continuava ativo. Desligado explicitamente (`xFrameOptions: false`) — seguro
especificamente porque esta origem nunca renderiza uma página interativa própria para
proteger: serve apenas JSON e arquivos enviados pelo usuário, nenhum dos dois
sequestrável por clickjacking. Preso por teste que sobe um PDF real e verifica a ausência
do header na resposta; revertido manualmente, o teste falha reproduzindo a mensagem
exata do navegador.

**Um tipo sem pré-visualização possível** (`.docx`, `.xlsx`, `.zip`) recebe um estado
honesto — "Pré-visualização não disponível" — em vez de um `<iframe>` em branco ou
quebrado.

**Por que o download precisou de um utilitário próprio.** Um `<a download>` simples
falha entre origens diferentes: o navegador só honra `download` em links do mesmo
domínio, ou quando a resposta carrega `Content-Disposition: attachment`, que o endpoint
de arquivos não envia — e a API e a SPA são, deliberadamente, duas origens aqui. Sem
tratar isso, o botão "Baixar" cairia de volta para navegar a aba até o arquivo cru,
exatamente o comportamento que esta mudança existe para remover. `downloadFile` busca os
bytes e entrega ao navegador uma `blob:` URL do mesmo domínio, onde `download` sempre
funciona.

**Escopo deliberadamente contido ao card do Kanban.** A miniatura de imagem continua
aparecendo na tela "Demandas" e na aba "Lista" do quadro — telas diferentes, não citadas
no pedido.

---

## 30. Módulo de Logs: atividade e sistema

**O que:** um registro persistente e consultável de tudo que acontece no sistema, com tela
própria em `/logs`.

**O ponto de partida.** Antes disto o sistema só "registrava" no sentido operacional: uma
linha do Morgan por requisição no stdout e um `console.error` em erro 500. Nada era
persistido, nada era pesquisável, e nada respondia "quem mudou o prazo desta demanda?".

### Duas categorias, separadas pelo leitor

| Categoria | O que é | Quem pergunta | Exemplos |
|---|---|---|---|
| **Atividade** | uma mudança de estado **bem-sucedida**, feita por alguém | coordenação | demanda criada, movida, editada, transferida; item de checklist; anexo; comentário; projeto e alocação; usuário; perfil e permissões; sessão |
| **Sistema** | o que o servidor registrou **por conta própria** — o que não virou mudança, ou o que ninguém pediu | operação | permissão negada, operação barrada por regra de negócio, invariante violada, erro 500 não tratado, falha ao remover arquivo do armazenamento, aplicação iniciada |

O critério é deliberadamente objetivo: se o estado mudou por ação de alguém, é atividade;
todo o resto é sistema. Uma tentativa de tirar uma demanda de produção **não é atividade**
— nada mudou — mas é exatamente o tipo de coisa que alguém quer encontrar depois.

### O que não é persistido, de propósito

- **401 de qualquer tipo.** Uma requisição sem sessão é gratuita para quem a envia;
  gravá-la transformaria o banco num alvo de *flood* não autenticado.
- **422, 404 e 409.** São o uso normal da aplicação (um formulário incompleto, um link
  antigo) e não dizem nada sobre segurança nem sobre defeito. Continuam no log HTTP.

### Modelagem

- **Uma tabela, append-only** (`logs`). Uma tabela por categoria duplicaria índices,
  consultas e paginação para separar o que uma coluna `category` separa.
- **Sem chave estrangeira.** Um registro sobre uma demanda excluída precisa sobreviver à
  demanda — é para isso que ele existe. Referências são `uuid` + **nome capturado no
  momento** (`actor_name`, `subject_label`, `project_name`), então o registro continua
  legível depois que o original muda de nome ou deixa de existir.
- **`changes`** guarda antes/depois como valores de exibição; **`metadata`** guarda o
  contexto (item do checklist, arquivo, permissões concedidas/revogadas, rota e código de
  erro). A descrição em rich text entra só como "alterada", nunca com o conteúdo.
- **`summary`** é uma frase pronta, escrita na gravação: é sobre ela que a busca textual
  opera, e ela congela a redação do momento. A interface renderiza uma versão mais rica a
  partir dos campos estruturados e recorre a ela para qualquer ação que não conheça.
- **Catálogo de ações** em `shared/domain/activity-catalog.ts`, como linguagem publicada:
  código, categoria, grupo, rótulo e a permissão que torna o evento legítimo.

### Gravação: atômica para atividade, independente para sistema

- **Atividade é gravada na mesma transação da mudança.** Os casos de uso rodam dentro de
  um `UnitOfWork`; os repositórios pegam o cliente transacional corrente de um
  `AsyncLocalStorage`, sem que o Prisma vaze para a camada de aplicação. Consequência:
  não existe mudança sem registro, nem registro de mudança desfeita. Se gravar o log
  falhar, a operação falha.
- **Eventos de sistema são gravados fora dela**, sem aguardar e sem nunca lançar. Uma
  recusa é justamente uma transação que fez *rollback* — dentro dela, o registro da recusa
  seria desfeito junto.
- Todo registro carrega o **`requestId`** da requisição, o mesmo do header `x-request-id`
  e do log HTTP.

### Visibilidade

Capabilities, nunca nomes de perfil:

| Permissão | Abre |
|---|---|
| `LOG_ACCESS` | o módulo; atividade de demandas e projetos, **seguindo a visibilidade de projetos** (alocação ou `PROJECT_ACCESS_ALL`) |
| `LOG_VIEW_ORGANIZATION` | atividade sem projeto: usuários, perfis, sessões |
| `LOG_VIEW_SYSTEM` | a aba **Sistema** (`category=SYSTEM` responde 403 sem ela) |

Na matriz da seed, o Administrador tem as três; a Agilista tem `LOG_ACCESS` e vê apenas os
projetos em que está alocada; o Desenvolvedor não acessa o módulo. Filtros só estreitam o
conjunto visível, nunca o ampliam — um `projectUuid` de projeto alheio responde 404, como
em qualquer outro endpoint.

### Filtros

Busca textual, período, tipo de evento (agrupado por módulo), pessoa, projeto (na aba
Atividade) ou nível (na aba Sistema), e requisição — alcançável a partir de qualquer
registro, em "Ver tudo desta requisição". **Todos ficam na URL**: um link para "as recusas
de ontem no projeto X" é algo que se manda para alguém quando algo deu errado. As opções
vêm de `GET /logs/filters`, já recortadas pelo que a pessoa pode ver.

### Indexação e paginação

- Índices compostos por forma de consulta, todos terminando em `(occurred_at, uuid)`:
  por assunto (o histórico de uma demanda), por categoria, por projeto, por autor, e por
  `request_id`.
- **Paginação por offset** (`skip`/`take` + `count()` sobre o mesmo `where`), revisada
  depois de uma primeira versão por cursor (keyset) — ver
  [item 44](#44-demandas-como-histórico-paginado) para a razão completa da troca: um
  histórico de porte modesto ganha mais com "quantas páginas existem, e posso pular direto
  para qualquer uma" do que perde com o custo do `count()`.

### Apresentação: tabela indexada, não lista infinita

A tela dedicada renderiza os resultados como **tabela** — colunas fixas (Quando, Pessoa,
Evento, Projeto/Assunto, e Nível na aba Sistema), com **Anterior/Próxima** por índice de
página em vez de um botão "carregar mais" que só cresce. Cada linha expande sob demanda
para o antes/depois, o contexto HTTP e a pilha de erro, sem inflar a leitura das outras.

Foi a primeira versão a acumular tudo numa linha do tempo com "carregar mais" — legível
para uma dúzia de eventos, mas o exato oposto de prático quando a tela existe para varrer
centenas deles. `LogsTable` é a tabela; `LogTimeline` continua servindo à aba
**Atualizações** de uma demanda, onde o volume é pequeno e o formato narrativo (dia a dia,
sem repetir o nome da demanda) é o que faz sentido.

A paginação é por número de página (`GET /logs?page=&limit=`), não mais por cursor —
ver [item 44](#44-demandas-como-histórico-paginado) para a correção completa e por quê:
com cursor, o paginador só conseguia numerar páginas já visitadas, então os índices só
apareciam conforme alguém clicava "Próxima" repetidamente — lia como quebrado, não como
limite assumido. `total`/`totalPages` vêm na mesma resposta que os itens, então o número
real de páginas — e o salto direto para qualquer uma delas — está disponível desde a
primeira renderização.

### Seed

70 registros e 7 comentários **derivados das seeds existentes**, não inventados à parte:
criação de perfis e usuários, alocações, criação de cada demanda, o caminho de status até
o status atual, itens de checklist concluídos, comentários, e dois eventos de sistema
(um administrador sem `DEMAND_UPDATE` tentando mover um card; um desenvolvedor tentando tirar
uma demanda de produção). A seed **valida o próprio histórico** antes de gravar: cada
evento precisa ser permitido pelo perfil do autor, o autor precisa estar alocado no
projeto, cada transição precisa ser válida na máquina de estados, o caminho precisa
terminar no status real da demanda, e nada pode ser anterior à criação do que descreve.
UUIDs determinísticos com prefixo `5eed` — que um UUID v7 nunca produz — tornam a
re-execução idempotente.

---

## 31. Histórico da demanda (aba Atualizações)

**O que:** todos os registros de uma demanda aparecem no seu painel de detalhes, na aba
**Atualizações**, do mais recente ao mais antigo, agrupados por dia.

**Decisões:**

- **`DEMAND_ACCESS` basta.** Quem pode abrir uma demanda pode saber como ela chegou onde
  está, sem precisar do módulo de Logs — e sem ver o resto do registro do sistema.
  `GET /demands/{uuid}/history` passa pela mesma guarda de acesso ao projeto que todo
  endpoint de demanda.
- **Comentários aparecem aqui também**, ao lado da própria aba **Comentários**. As duas
  abas respondem perguntas diferentes: Comentários mostra a conversa em si, pronta para
  responder; Atualizações mostra que ela aconteceu, no seu lugar cronológico entre a
  edição do prazo e a mudança de status — sem isso, comentar seria a única ação sobre a
  demanda invisível na sua própria linha do tempo.
- **Eventos de sistema** sobre a demanda aparecem apenas para quem tem `LOG_VIEW_SYSTEM`.
- **Um componente de linha do tempo** serve ao painel e à tela de Logs, então um registro
  tem a mesma aparência onde quer que apareça. Dentro da demanda as frases omitem o nome
  dela ("moveu a demanda", "concluiu 'Revisar layout'"), porque ele já está na tela.
- A consulta do histórico fica sob a chave de cache do detalhe da demanda: toda escrita
  que invalida a demanda atualiza a aba junto.

---

## 32. Comentários nas demandas

**O que:** conversa sobre a demanda, na aba **Comentários** do painel.

**Modelagem:** `DemandComment` é um **agregado próprio**, não parte de `Demand`. Uma
conversa é ilimitada e escrita por várias pessoas ao mesmo tempo; nenhuma invariante da
demanda depende dela; e passar cada nova linha pela raiz da demanda exigiria carregar a
demanda — e todos os outros comentários — para acrescentar uma frase. Contraste com o
checklist (#22), que é escopo e por isso vive dentro do agregado.

**Regras:**

- **Texto puro**, de 1 a 5000 caracteres. A descrição é o documento rico; comentário é a
  conversa em volta dele, rápida de escrever e impossível de usar como vetor de markup.
- **`DEMAND_COMMENT`**, independente de `DEMAND_UPDATE`: pela matriz da seed todos que
  alcançam uma demanda podem comentar, mas um perfil pode ser tornado somente-leitura aqui
  sem mexer no que ele pode alterar.
- **Só o autor edita ou exclui** (`403 COMMENT_NOT_AUTHOR`). A regra mora no agregado, não
  no controller, para que nenhum endpoint futuro a pule.
- **Permitido em demanda em produção.** Produção congela o *escopo* — o que a demanda é e
  entrega. Conversa sobre algo entregue não é escopo, e proibi-la empurraria o feedback
  pós-publicação para fora do sistema.
- Adicionar, editar e excluir geram atividade no módulo de Logs, com um **trecho** de 140
  caracteres — não o corpo inteiro, que já está onde deve estar.

**Na interface:** campo no topo e mais recentes primeiro; `Ctrl + Enter` envia; contador
só perto do limite; edição no próprio lugar, com `Esc` para cancelar; exclusão confirmada;
seus próprios comentários com o tom da marca; a aba mostra a contagem.

---

## 33. Painel de detalhes reorganizado em abas

**O que:** o painel ficou mais largo (30rem → 44rem) e passou a seguir a ordem em que é
lido:

1. **O que é** — título e procedência ("Criada por Mariana Alves em 12/08/2026 ·
   Atualizada há 3 horas").
2. **Onde está** — status, prazo, responsável e projeto numa grade de duas colunas, que
   se lê de uma olhada em vez de rolando uma coluna de campos.
3. **O material longo, em abas** — *Detalhes* (descrição, checklist, anexos),
   *Comentários* e *Atualizações*.

As abas são um `tablist` real (setas, Home/End, só a selecionada no tab order) e voltam
para *Detalhes* ao abrir outra demanda. A edição inline, as permissões por campo e o
congelamento em produção seguem exatamente como em #24.

**Um defeito corrigido no caminho:** `Esc` dentro de um editor inline fechava o painel
inteiro, pela mesma causa do combobox em #21 — o `Modal` escuta em fase de captura. Um
editor marcado com `data-owns-escape` agora recebe a tecla primeiro: o primeiro `Esc`
descarta o rascunho, o segundo fecha o painel.

---

## 34. Selo "Melhoria" nos módulos adicionados

**O que:** os módulos que não fazem parte do escopo original exibem um selo **Melhoria**
no menu lateral, nos atalhos da tela inicial e no título da própria página.

| Módulo | Selo | Motivo |
|---|---|---|
| Dashboard | Melhoria | #38 |
| Kanban | — | escopo original |
| Usuários | — | escopo original (cadastro de usuário) |
| Demandas (listagem) | Melhoria | #8 |
| Projetos | Melhoria | #1, #2 |
| Perfis | Melhoria | #3, #19 |
| Logs | Melhoria | #30 |
| Integração | Melhoria | #36 |
| Documentação | Melhoria | #37 |

**Por quê:** este documento declara as adições; o selo faz a mesma declaração onde a
avaliação de fato acontece, sem exigir que alguém cruze a tela com a documentação.

**Visual:** uma pílula nas cores da própria marca — tinta escura com letras lime no tema
claro, o lime puro no escuro —, com um ícone de brilho e um reflexo que atravessa o selo
**uma vez** ao aparecer e de novo ao passar o mouse sobre o item. Nunca em loop: um selo
que se mexe o tempo todo compete com o conteúdo que ele marca. Respeita
`prefers-reduced-motion` e tem `title` explicando o que significa.

**A lista é uma marcação explícita** nas definições do menu e dos atalhos, mantida em
sincronia com esta tabela — nunca inferida em tempo de execução.

---

## 35. Telas de listagem ocupam a largura disponível

**O que:** Demandas (listagem), Projetos, Usuários, Perfis, a edição de permissões e Logs
deixaram de ficar centralizados numa coluna de largura fixa e passam a usar a largura real
da viewport, com apenas a margem lateral do shell.

**O defeito.** `PageShell` já oferecia uma variante `wide` para isso, mas a maioria das
telas nunca a pedia — usava a variante padrão, que aplica `max-w-5xl` (64rem) por
desenho, pensada para uma página de texto corrido. Numa tela de 1920px, com a barra
lateral de 260px, isso deixava por volta de **550px de vazio de cada lado** do conteúdo —
exatamente o espaço demarcado que motivou este item. Duas telas (`Demandas`, `Logs`) já
usavam `wide`, mas repetiam o mesmo `max-w-5xl` por dentro, como um wrapper redundante que
cancelava a variante.

**A correção:**

- `ProjectsPage`, `UsersPage`, `RolesPage` e `RolePermissionsPage` passaram a usar
  `<PageShell wide>`.
- `DemandsListPage` e `LogsPage` tiveram o wrapper interno `max-w-5xl` removido — já
  usavam `wide`, só não aproveitavam.
- As grades de cartões (Projetos, Usuários) e de perfis ganharam mais colunas nos
  breakpoints largos (`xl:`, `2xl:`) em vez de uma única coluna esticada até a borda, que
  deixaria cada cartão absurdamente largo sem nenhum conteúdo a mais para preencher.
- A matriz de permissões (`RolePermissionsPage`) foi para duas colunas em telas largas
  (`xl:grid-cols-2`); o campo "Nome do perfil" manteve uma largura de leitura razoável
  (`max-w-2xl`) porque um campo de texto de página inteira não ajuda ninguém a digitar.
- O Kanban não precisou de mudança: já ocupava a tela inteira desde o item 18.

**O que não mudou de propósito.** A tela inicial (`HomePage`) e os formulários de
cadastro/edição (`DemandFormPage`, `UserFormPage`) mantêm uma largura de leitura
contida — um formulário de coluna única se beneficia de um comprimento de linha
previsível entre rótulo e campo; esticá-lo à largura da tela pioraria a leitura sem
acrescentar nada ao que ele mostra.

---

## 36. Integração: criação e atualização de demandas via API

**O que:** um recurso **exclusivo de cada projeto** para criar, editar e movimentar
demandas por um sistema externo — um ERP, um formulário de suporte, um pipeline de
automação — sem passar pela interface e sem uma sessão de usuário. Uma tela própria,
`/integracao`, documenta a API de forma navegável, com exemplos em formato de código
prontos para copiar; a configuração em si — gerar e revogar credenciais — vive **na
tela de Projetos**, porque é ali que o recurso realmente pertence.

### Duas credenciais, nunca uma só

O desenho segue o mesmo padrão de um OAuth2 *Client Credentials Grant* — o que
plataformas como Stripe e Twilio usam para dar acesso de máquina a máquina:

| Credencial | Papel | Visibilidade |
|---|---|---|
| **API key** (`csp_key_...`) | identifica o projeto | pública — pode aparecer em logs, em código, num ticket de suporte |
| **Secret** (`csp_secret_...`) | autentica a API key | mostrado **uma única vez**, no momento em que é gerado |
| **Access token** (JWT, ~1h) | autoriza cada chamada de escrita | obtido trocando API key + secret em `POST /integration/auth/token` |

Nenhum endpoint de escrita aceita a API key/secret diretamente — sempre o token de
acesso. Um token vazado expira sozinho em pouco tempo; um secret vazado exigiria trocar
a credencial inteira a cada chamada, o que ninguém faria na prática, tornando a
"expiração automática" apenas teórica.

### Por que regenerar substitui tudo, e não apenas o secret

Gerar novas credenciais troca API key, secret **e** um identificador interno da
credencial (`uuid`) juntos, nunca um secret novo sob a mesma API key. A razão é o que
isso permite: o token de acesso carrega esse `uuid` em suas claims, e
`AuthenticateIntegrationRequest` **relê a credencial atual do projeto a cada
requisição**, comparando o `uuid` do token com o da credencial hoje válida — o mesmo
princípio que já rege a sessão de usuário (permissões nunca embutidas no JWT,
resolvidas a cada requisição; ver `ARCHITECTURE.md`). Resultado: regenerar ou revogar
invalida **imediatamente** qualquer token já emitido, sem precisar de uma lista de
revogação — só é preciso checar se a credencial referenciada ainda é a mesma.

### Por que o secret nunca é armazenado, nem devolvido

`secretHash` é um digest **scrypt com salt próprio** (`sal:digest`, em
`ProjectIntegrationCredential`), verificado por comparação de tempo constante
(`timingSafeEqual`) — a mesma postura que uma coluna de senha exigiria, se este sistema
tivesse senhas. O endpoint de geração devolve o secret em texto plano **uma única vez**,
na própria resposta da chamada que o criou; depois disso, `GET
/projects/{uuid}/integration` mostra apenas os últimos 4 caracteres
(`secretPreview`) — o suficiente para reconhecer qual credencial está ativa, nunca para
reconstituí-la.

### Isolamento e o que a integração deliberadamente não faz

Um token só alcança demandas do projeto para o qual foi emitido — uma demanda de outro
projeto responde `404`, nunca `403`, seguindo a mesma regra de isolamento que rege um
usuário sem acesso ao projeto (`docs/PERMISSIONS.md`). O conjunto de campos aceito é um
subconjunto deliberado da API de sessão: sem anexos, sem checklist, sem transferência
entre projetos — nada disso foi pedido, e cada um exigiria decisões de design próprias
(um arquivo enviado "por quem", uma transferência autorizada "por qual critério") que
não valem a pena antecipar sem um caso de uso real.

**Nenhuma demanda nasce em produção.** A criação pela integração aceita os quatro status
de trabalho, mas recusa `PRODUCTION` (`INTEGRATION_CANNOT_CREATE_IN_PRODUCTION`, `422`).
Produção é terminal: uma demanda criada já congelada não poderia ser corrigida por
ninguém, e não teria a movimentação registrada que dá a data de entrega às métricas da
[Dashboard](#38-dashboard-estratégica-das-demandas). Para registrar algo já entregue, o
sistema externo cria e depois move — e o histórico fica honesto.

### Sem uma pessoa por trás da chamada

Uma demanda criada pela integração não tem um usuário autor de verdade. Em vez de
inventar um usuário de sistema ou tornar `createdByUserId` opcional — o que exigiria
revisitar toda leitura que hoje assume um autor real —, a demanda é registrada como
tendo o **responsável informado** também como autora, a mesma convenção que sistemas de
chamados usam para um ticket aberto "em nome de" alguém. O rastro de auditoria continua
honesto: toda entrada de log gerada pela integração usa como ator `Integração
(<api key mascarada>)`, nunca o nome de uma pessoa — reaproveitando a `uuid` da própria
credencial como identificador do ator no log, o que torna possível filtrar "tudo que
esta credencial fez" em [Logs](#30-módulo-de-logs-atividade-e-sistema) sem precisar de
uma tabela nova.

### O que é deliberadamente silencioso

Uma tentativa de autenticação de integração recusada (`INTEGRATION_INVALID_CREDENTIALS`,
`INTEGRATION_TOKEN_INVALID`) **não gera registro em Logs** — a mesma política já aplicada
a um `401` de sessão, pelo mesmo motivo: transformar o próprio módulo de auditoria em
alvo de uma varredura por tentativa e erro seria o oposto do que a auditoria existe para
evitar.

### Permissão

`PROJECT_MANAGE_INTEGRATION`, no módulo Projetos, concedida apenas ao Administrador na
seed — gerar e revogar credenciais é uma ação administrativa, no mesmo nível de
`PROJECT_MANAGE_MEMBERS`.

---

## 37. Documentação do projeto navegável no sistema

**O que:** a tela `/documentacao` renderiza **os próprios arquivos** `docs/*.md` e o
`README.md` do repositório, navegáveis, com um índice de documentos e um sumário por
página — a mesma documentação que um desenvolvedor lê no repositório, sem uma segunda
cópia para desatualizar.

### Por que ler os arquivos reais, e não reescrever um resumo

Duas cópias do mesmo conteúdo divergem — é uma questão de tempo, não de cuidado. A
alternativa adotada, `?raw` do Vite lendo `../docs/*.md` e `../README.md` em tempo de
build (`features/docs/content.ts`), garante que o que aparece na tela é literalmente o
que está versionado no repositório. O custo é um ajuste de configuração —
`server.fs.allow` em `vite.config.ts`, porque os arquivos vivem um nível acima da raiz
do projeto Vite — nenhuma duplicação de conteúdo.

### Por que um renderizador de markdown escrito à mão

`lib/markdown.ts` é um renderizador pequeno e específico para o que estes cinco
documentos realmente usam — títulos, parágrafos, **negrito**/*itálico*/`código`,
blocos de código (com tratamento especial para blocos `mermaid`), tabelas, citações e
listas de um nível — em vez de uma dependência genérica de mercado. Duas razões, não
uma questão de gosto:

1. **O conteúdo é inteiramente autoral** — nenhuma entrada de usuário passa por aqui —
   então a superfície de recursos necessária é exatamente a que os documentos usam, não
   a especificação inteira do CommonMark/GFM.
2. **O algoritmo de slug precisa casar com as âncoras que os próprios documentos já
   usam.** `ADDED_REQUIREMENTS.md` e `DATABASE.md` têm sumários internos como
   `[Por que `CHAR(36)`...](#por-que-char36-e-não-binary16)`, escritos assumindo o
   algoritmo de slug do GitHub. `slugify()` foi implementado e testado especificamente
   contra esses casos reais (`lib/markdown.test.ts`) — uma biblioteca genérica não dá
   essa garantia sem inspecionar sua implementação interna.

A saída ainda passa por `DOMPurify` antes de `dangerouslySetInnerHTML`, a mesma
disciplina de fronteira que `RichTextView` já aplica ao conteúdo de uma descrição de
demanda: nunca confiar no próprio renderizador, mesmo quando a entrada é seguramente
autoral.

### Links entre documentos

Os documentos se referenciam como num repositório (`[índices](DATABASE.md#...)`), o que
é o certo no GitHub e um beco sem saída dentro da aplicação. Antes de renderizar, esses
links são reescritos para o endereço do mesmo documento e da mesma âncora no sistema
(`/documentacao?doc=banco-de-dados#...`, em `features/docs/docLinks.ts`), navegados sem
recarregar a página; ao abrir um endereço com âncora, a tela rola até ela depois de
renderizar o documento. O renderizador aceita caminhos internos (`/...`), mas continua
recusando `//host`, que sairia da origem parecendo um caminho local.

### Diagramas de verdade, não blocos de código

Um bloco ```` ```mermaid ```` vira um `<div class="mermaid">`, renderizado pela
biblioteca `mermaid` — o ERD de `DATABASE.md`, o diagrama de estados da demanda e os
grafos de arquitetura aparecem como diagramas reais, não como texto ASCII. Isolada em
sua própria rota com `React.lazy` (`AppRouter.tsx`) — é a única tela que paga o custo
dessa biblioteca, e ninguém abrindo o Kanban ou uma demanda a carrega sem querer.

### Layout: três colunas, a mesma forma de um site de referência

Índice de documentos à esquerda, o documento ao centro, "Nesta página" à direita —
o mesmo layout que a documentação da Stripe ou o MDN usam, porque um documento longo o
bastante para ter seu próprio "Sumário" se beneficia do mesmo sumário permanentemente
visível, em vez de exigir rolar de volta ao topo.

### Acesso

Sem permissão dedicada — qualquer perfil autenticado acessa. É documentação, não uma
capacidade de negócio, e o objetivo do módulo inclui explicar o "porquê" das decisões a
qualquer pessoa avaliando o sistema, independente do perfil com que ela entrou.

---

## 38. Dashboard estratégica das demandas

**O que:** a tela `/dashboard`, primeira do menu, responde em poucos segundos à pergunta
de quem responde pela entrega: **como estão as demandas, e como elas estão chegando à
produção?** Filtrável por projeto e por período (últimos 30 ou 90 dias), com o recorte
na URL — um link compartilhado abre exatamente a mesma leitura.

### A ordem é a das perguntas, não a dos dados

A tela é organizada na sequência em que um gestor pergunta, e cada bloco responde a uma:

| # | Pergunta | Bloco |
|---|---|---|
| 1 | O que está atrasado agora? | Número em destaque: demandas atrasadas, sobre o total em aberto |
| 2 | O que vai atrasar, e o que parou? | Barra de prazos (atrasadas · hoje · 1–7 · 8–30 · +30 dias), "vencem em até 7 dias", "paradas há 7+ dias" |
| 3 | Estamos entregando? Em quanto tempo? Com previsibilidade? | Entregas, entradas, lead time, cycle time, entregas no prazo — no período, contra o período anterior |
| 4 | Onde está o trabalho, e há gargalo? | Demandas por status; entradas × entregas por semana |
| 5 | Quais demandas exatamente? | "Precisam de atenção" e "Paradas há mais tempo", com um clique até o painel de detalhes |
| 6 | Quem está sobrecarregado? Qual projeto preocupa? | Carga por responsável; tabela por projeto (o clique filtra a tela) |

Só **atrasadas** ganha tamanho de destaque: é o único número que exige ação hoje. Um
dashboard em que tudo tem o mesmo peso obriga a ler tudo; aqui o olhar cai primeiro onde
deve.

### Por que estas métricas

São as métricas de fluxo do Método Kanban (Vacanti, *Actionable Agile Metrics*), que é
o método que o próprio quadro implementa, mais as de prazo, que o escopo torna centrais
ao ordenar os cards por data prevista.

| Métrica | Definição exata | Por que ela, e não outra |
|---|---|---|
| **Atrasadas** | Em aberto (não em produção) com prazo anterior a hoje | O risco já materializado. Uma demanda entregue depois do prazo não conta — ela aparece em "entregas no prazo" |
| **Vencem em até 7 dias** | Em aberto, prazo entre hoje e daqui a 7 dias | O risco da próxima semana — o que ainda dá para salvar |
| **Paradas (idade do item)** | Em andamento, pausada ou em homologação sem mudar de status há 7 dias ou mais | *Work item age* é o indicador antecedente do atraso: a demanda para antes de atrasar. Não conta "a desenvolver", que ainda não começou — não é trabalho parado, é fila |
| **Entregas (vazão)** | Demandas movidas para produção no período | A capacidade real do time, medida, não estimada |
| **Entradas** | Demandas criadas no período | Sozinha não diz nada; ao lado das entregas, diz se o backlog cresce |
| **Lead time** | Da criação até a chegada em produção, das entregas do período | O tempo que quem pediu espera |
| **Cycle time** | Da primeira entrada em andamento até a produção | O tempo que o time leva trabalhando — a diferença para o lead time é fila |
| **Entregas no prazo** | Entregues até a data prevista ÷ entregas do período | Previsibilidade: o compromisso de data é cumprido? |

**Mediana e percentil 85, nunca média.** Tempos de entrega têm cauda longa: uma única
demanda esquecida por dois meses faz a média descrever uma demanda que não existe. A
mediana diz "metade sai em até N dias" e o p85 diz "85% saem em até N dias" — é a frase
que se usa para responder "quando fica pronto?". O percentil usa o método *nearest-rank*,
e cada cartão mostra a base (quantas entregas entraram na conta), para que 2 entregas
não sejam lidas com a confiança de 200.

**Comparação com o período anterior, de mesmo tamanho.** Entregas e entradas mostram a
diferença contra os N dias anteriores. A cor só aparece onde a direção tem significado:
mais entregas é bom (verde), menos é ruim (vermelho); mais entradas não é bom nem ruim —
fica neutro. Seta e sinal carregam a informação sem depender da cor.

**O que ficou de fora de propósito.** Nada de "total de demandas cadastradas" em
destaque (não leva a nenhuma decisão), nem de *story points* ou horas (o sistema não os
coleta, e inventá-los seria número sem lastro), nem de diagrama de fluxo cumulativo
(exige o status de cada demanda em cada dia, que só o histórico completo reconstrói —
ver [Melhorias Futuras](IMPROVEMENTS.md)).

### De onde vêm as datas

- **Data de entrega** é a última movimentação registrada para produção no módulo de
  [Logs](#30-módulo-de-logs-atividade-e-sistema) (`demand.status_changed`), lida pelo
  índice `ix_logs_subject_time`. Nenhuma coluna nova em `demands`: a trilha de auditoria
  já é a fonte fiel de *quando* algo aconteceu.
- Uma demanda em produção sem essa movimentação registrada (dados anteriores ao módulo
  de Logs) **conta como entregue**, mas fica fora das métricas de tempo — é melhor
  uma base menor e correta do que um tempo inventado.
- **"Hoje" segue o calendário do negócio**, não o UTC do servidor: a variável
  `APP_TIMEZONE` (padrão `America/Sao_Paulo`) define o dia. Sem isso, às 22h em São Paulo
  uma demanda que vence hoje já apareceria como atrasada.
- **Semanas** começam na segunda-feira; a semana corrente aparece marcada como "atual",
  com fundo próprio, para não ser lida como uma queda nas entregas.

### Permissão

Governada por `DEMAND_ACCESS`, **sem permissão nova**. A dashboard não revela nada que o
usuário já não possa ver na listagem de demandas: ela lê as mesmas demandas, recortadas
pela mesma visibilidade por projeto (`ProjectAccessResolver`). Um desenvolvedor vê os
números dos projetos em que está alocado; o administrador, de todos. Um projeto fora do
alcance, pedido pela URL, responde `404` — a mesma regra de isolamento do resto da API.
Criar uma `DASHBOARD_ACCESS` separada só abriria a possibilidade incoerente de ver os
agregados sem poder ver as demandas que os compõem.

### Visualização

- **Gráficos feitos com os tokens do design system**, sem biblioteca: são quatro formas
  simples (barra de proporção, barras por status, colunas agrupadas, barras empilhadas),
  e construí-las sobre os tokens mantém os temas claro e escuro automaticamente.
- **A cor tem uma função por vez.** Vermelho e âmbar são reservados para atraso e prazo
  próximo, e sempre acompanhados de rótulo; cada status usa a mesma cor da sua coluna no
  Kanban; entradas e entregas usam um par azul/verde validado para daltonismo, com passos
  próprios no tema escuro.
- **Nenhum valor depende do hover.** Toda barra tem tooltip no mouse *e* no foco do
  teclado, mas o valor também está impresso na legenda ou ao lado da barra, e o gráfico
  semanal tem uma tabela equivalente ("Ver dados em tabela").
- **Uma troca de filtro mantém os números na tela**, esmaecidos, até os novos chegarem —
  o layout não pula sob o leitor.
- Fechar o painel de uma demanda aberta pela dashboard atualiza os números: o que foi
  mudado no painel muda a leitura.

**Testes:** o cálculo é uma função pura de domínio (`computeDashboard`), coberta por um
cenário com datas fixas que confere cada métrica, incluindo fuso horário, período
anterior e semanas parciais (`tests/domain/dashboard-metrics.test.ts`); os testes de API
conferem que os totais batem com `/demands` para cada perfil, o isolamento por projeto e
a ausência de ids numéricos (`tests/api/dashboard.test.ts`).

---

## 39. Assistente de IA: Ação rápida

**O que:** um assistente de IA integrado ao Kanban e à Dashboard, aberto pelo botão
**Ação rápida** (ou `Ctrl/⌘ + K`). Atende pedidos em linguagem natural e oferece seis
atalhos de gestão. Usa o Google Gemini 3.5 Flash-Lite, vem **ativo por padrão** e a seed
grava a chave informada em `SEED_ASSISTANT_API_KEY` ([item 14](#14-seed-determinística-e-idempotente)).

**Por quê:** as tarefas que mais consomem o tempo de quem gere demandas não são as de
cadastro, e sim as de leitura: montar o status report, preparar a daily, decidir o que
atacar primeiro, responder "o que está com a Beatriz?". A Dashboard ([#38](#38-dashboard-estratégica-das-demandas))
mostra os números; o assistente os transforma no texto e na decisão que alguém
escreveria à mão — e tira o atrito de registrar trabalho novo.

### Os atalhos, e por que estes

| Atalho | O que entrega | O trabalho que substitui |
|---|---|---|
| **Nova demanda** | Uma frase ("recuperação de senha no portal para a Beatriz até sexta, com checklist") vira um rascunho com título, descrição com critérios de aceite, projeto, responsável, prazo e checklist | O cadastro é o atrito que deixa trabalho fora do quadro. O rascunho é o próprio formulário, revisado e criado com um clique |
| **Relatório executivo** | Leitura geral, entregas e previsibilidade, riscos e recomendações, citando as demandas | O status report semanal montado copiando números |
| **Resumo da daily** | O que mudou desde o último dia útil, por pessoa; o que vence hoje; impedimentos | A preparação da daily — na segunda-feira, olhando para a sexta |
| **Riscos e prioridades** | Até cinco demandas na ordem de ataque, cada uma com o motivo; concentração de carga; ações sugeridas | "O que eu ataco primeiro?", respondido com prazo, tempo parado e checklist em vez de impressão |
| **Planejar checklist** | Passos verificáveis para uma demanda existente, sem repetir os que ela já tem; a pessoa marca quais adicionar | Quebrar uma demanda grande é o primeiro passo para ela andar |
| **Perguntar ao quadro** | Qualquer pergunta ("o que vence esta semana?", "quem está com mais atrasos?") respondida com links para as demandas | Montar filtros para responder a uma pergunta pontual |

Sem atalho, o texto livre é **classificado** pelo modelo e encaminhado à ação certa. Um
pedido fora do escopo ("apague as demandas atrasadas") recebe uma explicação do que o
assistente faz, não uma tentativa.

### A IA propõe, a pessoa confirma

O assistente **não grava nada**. Um rascunho só vira demanda quando alguém clica em
*Criar demanda*, que chama o `POST /demands` comum; um plano só vira checklist quando
alguém marca os itens e confirma, pelo `POST /demands/{uuid}/checklist` comum. As
permissões, a visibilidade por projeto, a elegibilidade do responsável e as invariantes do
agregado são verificadas de novo nesse momento — exatamente como se a pessoa tivesse
digitado tudo.

### Como a resposta fica confiável

1. **Contexto calculado, não estimado.** O modelo recebe cada demanda com os dias até o
   prazo, os dias parada no status e o progresso do checklist já calculados, e os
   indicadores da Dashboard prontos. A aritmética é do servidor — é justamente o que um
   modelo de linguagem erra.
2. **Saída estruturada.** Rascunho, plano e classificação usam JSON Schema no próprio
   provedor (`responseJsonSchema`) e são validados de novo com Zod. Uma resposta fora do
   formato vira `503 ASSISTANT_INVALID_RESPONSE`, nunca um rascunho pela metade.
3. **Referências curtas, resolvidas no servidor.** O modelo cita `[[D4]]`, `P1`, `U3` em
   vez de uuids, que poderia errar ou inventar. O servidor resolve cada referência contra a
   lista que ele próprio enviou; o que não existe é descartado.
4. **Rascunho conferido contra os fatos.** Projeto fora da lista, responsável que não é
   elegível no projeto escolhido e prazo no passado voltam em branco, com uma nota do motivo
   — *"Sofia Lima Braga não pode ser responsável em Portal do Cliente"*.
5. **Checklist sem repetição**, comparando os itens sem diferenciar caixa, acento e
   pontuação ("Validar e-mail" e "validar email" são o mesmo passo).

### Segurança

- **Visibilidade.** O contexto é montado pelas mesmas portas das telas: os cards
  recortados pela `ProjectAccessPolicy`, o `GetDashboard`, o `DemandAccessGuard`. O
  histórico da daily é filtrado pelas demandas visíveis — o mesmo que a aba *Atualizações*
  de cada uma já mostra. Um teste de API confere que o prompt montado para um
  desenvolvedor não contém demandas de projetos em que ele não está.
- **Permissões.** `ASSISTANT_ACCESS` para usar; cada ação exige ainda a permissão sob a
  qual o resultado seria aplicado. Uma ação sem essa permissão responde `403` antes de
  qualquer chamada ao modelo. Detalhes em
  [`PERMISSIONS.md`](PERMISSIONS.md#o-assistente-de-ia-e-as-permissões).
- **Prompt injection.** Títulos e descrições são dados digitados por usuários. Vão num
  bloco `<dados>` que as regras declaram não ser instrução, com quebras de linha, `|` e
  `< >` neutralizados — um título não forja um registro nem fecha o bloco. Mais importante
  que o texto das regras, o dano possível é limitado **por construção**: o modelo não tem
  nenhuma ferramenta de escrita, e todo link ou imagem que ele escrever é removido. Os
  únicos links que chegam à tela são os que o servidor montou para demandas visíveis.
- **Chave de API.** Nunca volta ao navegador. Fica cifrada em repouso com AES-256-GCM
  (chave derivada do `JWT_SECRET` por HKDF) e é enviada ao Google em header, nunca na URL.
  A tela de configuração mostra só os últimos 4 caracteres.
- **Custo e abuso.** No máximo 20 pedidos a cada 5 minutos por usuário
  (`429 ASSISTANT_RATE_LIMITED`, com `Retry-After`); a cota do provedor esgotada vira
  `429 ASSISTANT_QUOTA_EXCEEDED`.
- **Falhas com mensagem acionável.** Chave recusada, modelo indisponível, tempo esgotado
  (25 s), bloqueio por política de conteúdo e resposta fora do formato têm código e
  mensagem próprios. A mensagem do provedor nunca chega ao usuário; fica no log de sistema.
  Uma sobrecarga momentânea do provedor (um 5xx, como o *"model is experiencing high
  demand"* do Gemini) ganha **uma** nova tentativa, dentro do mesmo prazo; cota, bloqueio e
  chave recusada, nunca.

### Configuração e auditoria

- Quem tem `ASSISTANT_MANAGE` ativa ou desativa o assistente, escolhe o modelo numa lista
  fechada (Gemini 3.5 Flash-Lite, 3.1 Flash-Lite e 3.5 Flash) e substitui a chave, pela
  engrenagem do próprio painel. Desativado, o botão some para quem não pode reativá-lo.
- Cada alteração vira `assistant.settings_updated` nos Logs de atividade, com a chave
  identificada só pelos últimos 4 caracteres.
- Cada uso vira `assistant.request_completed` ou `assistant.request_failed` nos Logs de
  sistema: ação, modelo, tempo de resposta e tokens — **nunca o texto do pedido**, que
  pode citar qualquer demanda.
- Se o `JWT_SECRET` mudar, a seed cifra de novo a chave de `SEED_ASSISTANT_API_KEY`; uma chave cadastrada
  na tela precisa ser cadastrada outra vez, e o assistente diz isso
  (`409 ASSISTANT_KEY_UNREADABLE`).

### Por que Gemini Flash-Lite, e sem SDK

É rápido — cerca de um segundo com `thinkingLevel: minimal` — e tem cota gratuita, o que
basta para respostas curtas sobre dados já calculados, em que raciocínio longo não
acrescenta. A lista de modelos é fechada porque modelos são aposentados: o
`gemini-2.5-flash-lite` já não aceita chaves novas. A integração é um adapter pequeno
sobre `fetch`, atrás da porta `LanguageModelProvider`; trocar de provedor é escrever outro
adapter, sem tocar nos casos de uso.

### Interface

- **Ação rápida** é o único elemento da tela que se move sozinho: um cometa de luz lime
  percorre a borda do botão, que acelera no hover, e o ícone cintila a cada poucos
  segundos. Tudo para com `prefers-reduced-motion`.
- Painel lateral com o pedido livre, os atalhos filtrados pelas permissões do perfil e o
  escopo explícito (o projeto filtrado na tela, ou todos). A espera narra as etapas reais,
  sem barra de progresso inventada.
- Relatórios e respostas citam as demandas como links que abrem o painel de detalhes na
  própria tela; *Copiar texto* troca os links pelos títulos, pronto para e-mail ou chat.
- O rascunho chega como o formulário editável, com um aviso *Confira antes de criar*
  listando o que ficou em aberto; o plano chega como caixas marcáveis.

**Testes:** `tests/domain/assistant.test.ts` cobre citações, validação do rascunho e do
plano, contexto calculado, dia útil e fuso, neutralização do texto do usuário, limitador,
cifra (adulteração e segredo errado) e o adapter do Gemini com um `fetch` falso — chave no
header, JSON Schema, nova tentativa só para sobrecarga, cota, chave recusada, modelo
indisponível, bloqueio e timeout.
`tests/api/assistant.test.ts` usa um modelo roteirizado, sem rede, para conferir a
visibilidade do contexto, links só para demandas visíveis, rascunho validado sem criar
nada, `403` antes do modelo, classificação e `CLARIFY`, `404` para demanda e projeto
alheios, falhas do provedor, configuração restrita a `ASSISTANT_MANAGE` com auditoria e o
assistente desativado. No frontend, `QuickAction.test.tsx` e `assistantText.test.ts`.

---

## 40. Adicionar demanda direto na coluna do Kanban

**O que:** abaixo do último card de cada coluna, um "+" pontilhado — o mesmo padrão do
Trello — abre o cadastro já com o projeto do filtro atual e a coluna clicada
pré-selecionados. A demanda nasce direto ali, sem precisar arrastá-la depois.

**Por quê:** cadastrar uma demanda que já se sabe "em andamento" ou "pausada" e movê-la
manualmente em seguida é trabalho redundante — o pedido do usuário identificou exatamente
essa fricção.

**Como funciona:**
- O formulário não ganhou um campo de status. A coluna já foi escolhida no clique — a
  mesma razão pela qual o Trello nunca pergunta "em que lista?" no modal de novo card —
  e aparece de volta como uma etiqueta somente leitura ("Será criada em: Em andamento"),
  para confirmar a escolha sem oferecer uma segunda forma de defini-la.
- **Uma permissão própria: `DEMAND_CREATE_WITH_STATUS`.** Criar uma demanda já numa
  coluna específica é uma decisão de gestão de fluxo, não apenas um cadastro — por isso
  ganhou capability própria em vez de reaproveitar `DEMAND_UPDATE`.
  `POST /demands` aceita `status` opcional (sem o campo, é sempre `NOT_STARTED`, como
  sempre foi); **enviar o campo, com qualquer valor — inclusive `NOT_STARTED`
  explícito —** passa a exigir essa permissão além de `DEMAND_CREATE`. Sem ela, o "+"
  simplesmente não aparece em nenhuma coluna: quem não a tem cadastra pelo caminho de
  sempre, o botão **"Nova Demanda"**, sempre em "Não iniciada". Quem administra perfis
  decide quem manipula cards diretamente por status, pela tela de Perfis — nenhuma regra
  de negócio fixa isso a um perfil por nome.
- **Concedida à Agilista na seed**, o único perfil de sistema que reúne `DEMAND_CREATE`
  e as demais capabilities de manipular o fluxo (`DEMAND_UPDATE`, `DEMAND_DELETE`). O
  Administrador tem `DEMAND_CREATE` mas não esta — a mesma fronteira que já o mantém sem
  `DEMAND_UPDATE` — e o Desenvolvedor nem cadastra demandas, então a permissão não teria
  efeito ali.
- Se alguém colar uma URL com `?status=` sem ter a permissão — o "+" nunca ofereceria
  esse link, mas nada impede digitar um endereço à mão —, o formulário não tenta o
  cadastro fadado a um `403`: mostra a etiqueta da coluna que a demanda vai realmente
  ocupar ("Não iniciada") com um aviso explicando por quê, e o `POST` sai sem o campo.
- **Nenhuma demanda nasce em produção**, nem por aqui, nem com a permissão: `PRODUCTION`
  é sempre recusado com `403 DEMAND_CANNOT_CREATE_IN_PRODUCTION`, a mesma regra e o mesmo
  motivo do requisito [#36](#36-integração-criação-e-atualização-de-demandas-via-api)
  para a API de integração — se nem um sistema externo pode fazer uma demanda nascer já
  entregue, a interface também não. O "+" da própria coluna "Em produção" nem existe.
- O botão **"Nova Demanda"** do cabeçalho e o da tela de quadro vazio passaram a levar o
  projeto do filtro atual junto (sem status, criando em "Não iniciada" como sempre) —
  consequência natural de expor o mesmo mecanismo de pré-preenchimento a eles.

**Testes:** `demand.use-cases.test.ts` cobre o `CreateDemand` com status (nasce na
coluna pedida com a permissão; recusa qualquer status sem ela, inclusive `NOT_STARTED`
explícito; recusa `PRODUCTION` mesmo com a permissão);
`tests/api/api.test.ts > Creating directly into a column` confere o mesmo fim a fim,
incluindo que nenhuma linha é gravada quando a criação é recusada. No frontend,
`KanbanBoard.test.tsx` confere que o "+" aparece em toda coluna menos "Em produção" só
com a permissão, e desaparece de todas sem ela; `DemandFormPage.test.tsx` confere a
etiqueta, o pré-preenchimento do projeto, o aviso de fallback e que `status` só chega no
`POST /demands` para quem tem a permissão.

---

## 41. Produção reversível para quem gerencia

**O que:** uma permissão nova, `DEMAND_MANAGE_PRODUCTION`, torna a regra "produção é
terminal" condicional em vez de absoluta. Sem ela, mover uma demanda para produção pede
confirmação antes — avisando que o registro trava para sempre — e uma vez lá, ninguém sem
a permissão tira a demanda de lá, exatamente como a V1 sempre se comportou. Com ela, a
pessoa entra em produção sem nenhum aviso (ela sabe que pode reverter) e move a demanda
para fora quando quiser, quantas vezes quiser.

**Esta é a única exceção do documento a "nenhum requisito original foi alterado".** O
escopo original diz, sem condição: "cards que estão em produção não podem mudar de
status". Esta permissão não adiciona uma capability ao lado da regra — ela reescreve a
regra para quem a possui. Registrado aqui, explicitamente, em vez de escondido como mais
um item de "adição", porque fingir que é aditivo seria impreciso.

**Por quê:** pedido explícito — produção sem qualquer via de volta significa que um erro
operacional (mover o card errado, uma entrega que precisa ser revertida) fica permanente
até alguém editar o banco diretamente. A resposta não é remover a trava — ela continua
sendo o padrão, e é o que protege a maioria dos perfis de reabrir por engano um registro
que já foi entregue — é dar a quem gerencia o fluxo uma chave explícita para essa porta
específica.

**Onde a regra vive.** `demand-status.ts` (a State Pattern do status) ganhou um parâmetro
`override` em `canTransitionTo`/`transitionTo`, usado **somente** por `ProductionState`;
toda outra transição o ignora, porque nada mais é terminal. O parâmetro nunca é decidido
pelo domínio — `MoveDemand.execute()` é quem lê `actor.can('DEMAND_MANAGE_PRODUCTION')`
e entrega um booleano simples ao agregado. A separação é deliberada: "o que a permissão
significa" fica na aplicação, "o que um override faz a uma transição" fica inteiramente no
domínio.

**O que a permissão NÃO reabre.** Apenas o status. `assertMutable()` — o freio que protege
título, descrição, prazo, responsável, projeto, checklist e anexos de uma demanda em
produção — continua irrestrito, mesmo para quem tem `DEMAND_MANAGE_PRODUCTION`. Editar o
conteúdo de um registro já entregue reescreveria silenciosamente o que foi de fato
entregue; isso nunca foi pedido e continua sendo protegido pela mesma razão do requisito
original de que produção congela o registro.

**Entrar em produção nunca precisou de permissão própria.** A restrição do escopo sempre
foi sobre *sair* de produção, nunca sobre entrar — qualquer perfil com `DEMAND_UPDATE`
sempre pôde mover uma demanda para lá. O que muda é só a experiência: sem
`DEMAND_MANAGE_PRODUCTION`, um diálogo de confirmação aparece antes (arrastando o card ou
pelo seletor de status no painel), avisando que a ação tranca o registro; com a
permissão, a mudança comete direto, sem diálogo algum — a mesma UX que qualquer outra
opção do seletor já tinha.

**Concedida apenas à Agilista** na matriz da seed — o perfil que já reúne
`DEMAND_CREATE_WITH_STATUS` e `DEMAND_DELETE`, ou seja, quem já gerencia o fluxo do
quadro como um todo. O Desenvolvedor mantém a trava exatamente como o escopo original
determina: pode mover e editar demandas, mas produção continua sendo uma via de mão
única para ele. Como toda permissão do catálogo, é editável por completo na tela de
Perfis — não há nada fixo no nome do perfil.

**Testes:** `demand-status.test.ts` cobre `override` isoladamente no domínio (sai de
produção para qualquer alvo quando `override: true`; é no-op em estados não-terminais;
same-status continua no-op independente do override). `demand.use-cases.test.ts` cobre o
`MoveDemand` de ponta a ponta com e sem a permissão. `tests/api/api.test.ts` confere as
duas pontas via HTTP: Desenvolvedor (sem a permissão) recusado em toda tentativa de sair
de produção; Agilista (com a permissão) movendo uma demanda para fora e de volta para
produção na mesma sessão.

---

## 42. Prioridade da demanda

**O que:** um campo `priority` (`LOW` / `MEDIUM` / `HIGH` / `URGENT`) em toda demanda,
selecionável no cadastro e na edição, exibido como ícone colorido no card do Kanban, na
Lista e no painel de detalhes.

**Por quê:** categorizar por prioridade é praticamente universal em ferramentas Kanban —
o escopo original descreve status, responsável e prazo, mas não dá nenhum jeito de dizer
"isto é mais urgente que aquilo" dentro de uma mesma coluna.

**Decisão de modelagem: prioridade não é status.** Diferente de status, prioridade não
tem ciclo de vida — qualquer valor pode seguir qualquer outro, a qualquer momento, sem
transição ilegal nenhuma. `demand-priority.ts` reflete isso: é um enum simples com um
validador, sem o *State Pattern* que `demand-status.ts` precisa. `Demand.changePriority()`
passa pelo mesmo `assertMutable()` de qualquer outro campo — uma demanda em produção
continua congelada, prioridade inclusive.

**Sem permissão própria.** Mover o card é ação de domínio distinta (por isso
`DEMAND_MANAGE_PRODUCTION` existe); mudar a prioridade é só mais um atributo do escopo da
demanda, coberto por `DEMAND_UPDATE` como título, prazo ou responsável.

**Default é MEDIUM, nunca vazio.** Omitido na criação — pela sessão, pela integração ou
pela seed —, o agregado aplica `MEDIUM` sozinho, o mesmo raciocínio de `NOT_STARTED` ser o
status padrão: uma demanda sem opinião declarada sobre urgência deve ler como "normal",
não como um campo em branco.

**Ícones semânticos, paleta reaproveitada.** `PRIORITY_PRESENTATION`
(`features/demands/priority.ts`) segue a mesma escala do resto do produto —
cinza → lime → âmbar → vermelho — para não introduzir uma quinta paleta de cores só para
quatro valores: `ArrowDown`/cinza (Baixa), `Minus`/lime (Média), `ArrowUp`/âmbar (Alta),
`Flame`/vermelho (Urgente). `PrioritySelect` é a `StatusSelect` sem a máquina de estados:
mesmo listbox colorido, mesma interação, sem transição a recusar.

**Integração também ganhou o campo** — `POST` e `PATCH /integration/demands`
aceitam `priority` opcional, o mesmo subconjunto de campos-escalares que já aceitavam
título, descrição e prazo.

**Legenda no próprio quadro.** Quatro ícones coloridos não se explicam sozinhos na
primeira vez que alguém olha o quadro, e não há onde encaixar `aria-label` para quem
enxerga a tela. `PriorityLegend` é um botão discreto ao lado das abas Kanban/Lista —
`features/kanban/KanbanPage.tsx`, ao alcance de ambas as visões, sem competir por espaço
com busca, filtro de projeto ou os botões de ação à direita — que abre um painel estático
listando as quatro prioridades com o mesmo ícone e cor que aparecem nos cards. Fecha com
Escape ou clique fora, como os demais menus flutuantes do produto.

**Testes:** `demand-priority.test.ts` cobre o domínio (default MEDIUM, mudança livre em
qualquer direção, congelamento em produção, rejeição de valor desconhecido).
`tests/api/api.test.ts` cobre criação com prioridade explícita, edição e rejeição de um
valor inválido via HTTP.

---

## 43. Preview da descrição na listagem

**O que:** um ícone de descrição ao lado do título, na aba Lista do Kanban, que mostra um
preview flutuante em texto simples ao passar o mouse — sem precisar abrir a demanda para
saber do que ela trata.

**Por quê:** a Lista mostra responsável e prazo lado a lado, mas nunca revelou a descrição
— para lê-la era preciso abrir cada card, um por um. Um preview sob demanda responde "do
que se trata" sem competir por espaço na linha.

**Não é o `Tooltip` existente, de propósito.** O `Tooltip` do design system é uma linha só,
`white-space: nowrap`, pensado para rótulos curtos como "3 de 5 concluídos". Uma descrição
precisa de largura real e quebra de linha, então `DescriptionPreview` reaproveita o mesmo
mecanismo de posicionamento em portal — necessário pelo mesmo motivo em ambos: uma linha
da lista vive dentro de um contêiner com scroll que recortaria uma bolha posicionada
`absolute` — mas com sua própria caixa, mais larga e com texto quebrando em várias linhas.

**Reaproveita o sanitizador já carregado, não um segundo parser.** O preview roda
`DOMPurify.sanitize(html, { ALLOWED_TAGS: [] })` — a mesma biblioteca que `RichTextView`
já usa para renderizar a descrição — para reduzir o markup a texto puro, e decodifica as
entidades que sobram (`&nbsp;` etc.) com a mesma tabela que `RichText.toPlainText` usa no
servidor. Truncado em 240 caracteres com reticências.

**Testes:** `DescriptionPreview.test.tsx` cobre a extração de texto puro a partir de
markup, o truncamento com reticências, mostrar/esconder no hover e o caso de uma
descrição que se reduz a nada (`&nbsp;` sozinho) não renderizar ícone algum.

---

## 44. Demandas como histórico paginado

**O que:** a tela **Demandas** deixou de ser uma lista de cartões e virou uma tabela
paginada por índice — o mesmo padrão do módulo de Logs — tratando o conjunto como o que
ele é: o histórico de toda demanda que já passou pelo sistema, não uma segunda leitura do
quadro. `GET /demands` (usado pelo Kanban) continua devolvendo a lista inteira; esta tela
consome um endpoint novo, `GET /demands/history`, que nunca devolve mais do que uma página.

**Por quê:** uma lista de cartões cresce sem limite e é honesta até uma dúzia de linhas;
um histórico de verdade — que só cresce, nunca encolhe — precisa de páginas reais desde o
primeiro dia, não de um "carregar mais" que eventualmente carrega tudo de qualquer jeito.

**Paginação por offset, não por keyset — revisado depois do primeiro round.** A primeira
versão usava keyset (cursor opaco, `dueDate` + `uuid`), pelo mesmo raciocínio que o módulo
de Logs sempre usou: estável sob inserção concorrente, custo constante em qualquer
profundidade. Na prática isso significava que o paginador só sabia numerar as páginas já
visitadas — pular direto para uma página nunca alcançada não tinha cursor para chegar lá,
então os índices só apareciam conforme alguém clicava "Próxima" repetidamente, o que lia
como paginação quebrada, não como um limite técnico assumido de propósito. Para um
histórico de porte modesto — uma ferramenta interna, não um fluxo de alto volume — o
`count()` que o offset exige é barato o bastante para não pesar essa troca: `GET
/demands/history` aceita `page` (1-based) e `limit`, e `ListDemandsPage.execute` devolve
`total`/`totalPages` junto com os itens, então o número real de páginas — e a capacidade
de pular para qualquer uma delas com uma única requisição — está disponível desde a
primeira resposta, nunca descoberto aos poucos. `PrismaDemandRepository.listCardsPage`
roda `findMany({ skip, take })` e `count()` em paralelo sobre o mesmo `where`. O módulo de
Logs recebeu a mesma correção, pela mesma razão — ver a atualização abaixo.

**Um endpoint novo, não o mesmo `GET /demands` sobrecarregado.** O quadro Kanban agrupa o
conjunto *inteiro* de demandas visíveis em cinco colunas — paginar essa consulta faria
cards desaparecerem de colunas que ninguém pediu para folhear. Por isso `ListDemands`
(usado pelo board) e `ListDemandsPage` (usado por esta tela) são casos de uso distintos
sobre o mesmo `DemandQueries`: `listCards` continua sem limite, de propósito;
`listCardsPage` é a mesma consulta, com fronteira.

**Registrado em `/demands/history`, não em `/demands/{uuid}/history`.** O segundo já
existia — é o histórico de atividade de *uma* demanda (`GetDemandHistory`). Para o literal
`history` nunca ser engolido pela rota `/demands/:uuid`, a nova rota precisa estar
registrada **antes** dela no router — Express resolve por ordem de registro, e um `:uuid`
casaria com a string "history" como se fosse um uuid, respondendo 400 em vez de servir a
página.

**Seja estratégico com as colunas, o pedido explícito.** A tabela mostra prioridade
(ícone), título com o mesmo ícone de preview de descrição da Lista do Kanban, projeto,
responsável, status e prazo — o que identifica uma demanda de relance.

**Sem expandir a linha — abre o painel lateral, igual ao Kanban, revisado depois do
primeiro round.** A primeira versão espelhava `LogsTable` também nisso: um toggle que
expandia a própria linha com data de criação, autor, checklist e anexos. Mas uma demanda
já tem uma tela de detalhes completa — `DemandDetailsPanel`, a mesma barra lateral que um
card do Kanban abre — e duplicar um subconjunto dela dentro da linha criava duas
superfícies de "detalhes" para a mesma demanda, uma mais pobre que a outra. Clicar no
título ou no chevron à direita agora abre exatamente esse painel, o único lugar no produto
onde os detalhes de uma demanda vivem. `LogsTable` continua expandindo a própria linha, e
com razão — um registro de log não tem outra tela de detalhes para reaproveitar.

**Filtros estratégicos, não só busca livre e projeto.** Status e prioridade são catálogos
fechados que o frontend já possui (`STATUS_PRESENTATION`/`PRIORITY_PRESENTATION`), então
não pedem consulta alguma; responsável é o único filtro que precisa de uma pergunta ao
servidor — "quem já foi responsável por algo que este ator enxerga" não é algo o cliente
pode adivinhar. Por isso um endpoint novo, `GET /demands/filters`, devolve a lista de
responsáveis distintos já recortada pela mesma visibilidade de projeto que
`GET /demands/history` aplica — o mesmo desenho de `GetLogFilters`/`actorsSeen` no módulo
de Logs, aplicado ao módulo de Demandas. Os quatro filtros (Projeto, Status, Prioridade,
Responsável) mais a busca cobrem exatamente as colunas que a tabela mostra: nunca um
filtro por algo que a linha não deixa conferir.

**Layout da paginação: dois cantos acima da tabela, índices abaixo dela — pedido
explícito, aplicado também aos Logs.** Registros por página migrou do rodapé para uma
linha própria acima da tabela, no canto **esquerdo**; "Página X · N registros" subiu para
o canto **direito** da mesma linha, saindo do rodapé onde vivia ao lado de
Anterior/Próxima. Mínimo (e padrão) de 10 por página em vez de 30 —
`DEFAULT_PAGE_SIZE` do módulo de Logs também mudou de 30 para 10, para as duas telas
ficarem consistentes uma com a outra.

**Índices de página, não só Anterior/Próxima — e todos disponíveis de saída.**
`components/ui/Pagination.tsx`, compartilhado pelas duas telas, numera as páginas a partir
do `pageCount` real que o servidor devolve, não de quantas já foram visitadas. Qualquer
número é clicável desde o primeiro carregamento — inclusive um nunca visto — e cada clique
é exatamente uma requisição para aquela página, a mesma garantia que "Próxima" e
"Anterior" sempre tiveram. Uma janela de páginas ao redor da atual, mais a primeira e a
última, com reticências no meio, evita quarenta botões numa história longa sem esconder
onde ela começa e até onde já foi mapeada.

**Ordenação: prazo continua padrão, mais duas opções ao lado.** `GET /demands/history`
aceita `sort` — `dueDate` (padrão, o que já era), `createdAt` ou `priority`. `createdAt`
lê "Mais recentes" na interface, não "Data de criação": é a pergunta prática que alguém
ordenando um histórico por criação está fazendo — "o que entrou primeiro" — e isso lê mais
rápido do que o nome da coluna de onde vem. `priority` ordena do mais urgente para o mais
brando aproveitando um detalhe do MySQL: um `ENUM` é ordenado pelo índice **declarado**,
não alfabeticamente, e `DemandPriority` é declarado `LOW, MEDIUM, HIGH, URGENT` em
`schema.prisma` exatamente por isso — `ORDER BY priority DESC` já lê como "mais urgente
primeiro" sem `CASE` nem mapeamento numérico algum. Todo `orderBy` termina em `uuid` como
desempate final, a mesma razão de sempre: duas linhas podem empatar na coluna principal, e
um desempate estável é o que impede a paginação de embaralhar entre uma página e a
seguinte.

**Testes:** `tests/api/api.test.ts` cobre os dois endpoints de página (Demandas e Logs) —
sem sobreposição entre páginas, ordem preservada, `total`/`totalPages` estáveis entre
requisições, isolamento por projeto, nenhum id numérico exposto —, as três ordenações de
Demandas (prazo crescente, criação decrescente, prioridade decrescente), os três filtros
(status, prioridade, responsável), cada um restringindo o resultado, além do endpoint de
filtros (lista de responsáveis ordenada, recortada pela visibilidade do ator).
`Pagination.test.tsx` cobre a janela de páginas exibidas, o estado `aria-current`, o
colapso com reticências numa história longa, e os limites de Anterior/Próxima.

---

## 45. Chat da IA e detalhes da demanda lado a lado

**O que:** clicar no link de uma demanda citada dentro do chat "Ação rápida" agora abre o
`DemandDetailsPanel` empurrando o painel do chat para o lado, em vez de fechá-lo. Os dois
painéis laterais ficam abertos ao mesmo tempo: o chat encolhe para a esquerda, os detalhes
ocupam a borda direita.

**Por quê:** o assistente frequentemente responde citando demandas (relatório executivo,
resumo diário, análise de risco); fechar o chat para consultar cada citação e precisar
reabri-lo — perdendo a resposta gerada — quebrava o próprio propósito da citação, que é
deixar a resposta e o registro citado abertos ao mesmo tempo.

**Um backdrop só, não dois empilhados.** Antes desta mudança, `QuickAction` fechava o chat
(`setOpen(false)`) assim que `onOpenDemand` era chamado — daí o comportamento antigo.
Como `AssistantPanel` e `DemandDetailsPanel` são dois `Modal variant="panel"`
independentes, cada um portalizado para `document.body` com seu próprio fundo escurecido,
simplesmente deixar os dois abertos ao mesmo tempo sobrepunha um fundo escuro (`bg-black/40`)
sobre o outro painel, e o painel montado por último cobria o outro por inteiro na mesma
borda direita. `Modal` ganhou três props para resolver isso sem fundir os dois componentes:
`backdrop` (desliga o fundo escurecido e passa a deixar cliques atravessarem para o que
estiver por baixo), `zIndexClassName` (permite um painel ficar acima do fundo do outro) e
`panelClassName` (desloca o painel para a esquerda). Quando o painel de detalhes está
aberto, `AssistantPanel` recebe `pushedAside`: seu fundo é desligado, sua camada sobe para
`z-[60]` — acima do fundo escurecido do painel de detalhes, que continua em `z-50` — e uma
margem direita de `min(44rem, 100vw)` (a mesma largura do painel de detalhes, `size="lg"`)
o desloca para a esquerda. O painel de detalhes continua exatamente como antes: fundo
próprio, sem alterações, é ele quem "empurra".

**A resposta do chat não se perde.** `QuickAction` não fecha mais o chat ao abrir uma
demanda — `onOpenDemand` é repassado direto para `AssistantPanel`, sem o `setOpen(false)`
que existia antes. A view do assistente (a resposta com as citações) permanece exatamente
onde estava; só o painel de detalhes some ao ser fechado, devolvendo a tela ao estado
"só o chat aberto".

**Testes:** suíte de tipos (`tsc --noEmit`) e a suíte existente de `QuickAction.test.tsx`
seguem verdes sem alteração — nenhum teste dependia do fechamento automático que foi
removido. Verificado manualmente em Docker: citação aberta com o chat já aberto mantém as
duas barras visíveis lado a lado; fechar os detalhes devolve o chat à largura cheia.

---

## 46. Menu fechado no assistente, prioridade na criação e no relatório, exportação em PDF

**O que:** uma rodada de ajustes na "Ação rápida", a partir de testes reais do usuário:

- A caixa de pedido livre no topo da tela inicial do chat foi removida — o assistente
  agora só é acionado pelas opções do menu, nunca por um texto solto digitado ali. "Atalhos"
  virou "Menu" em toda a interface (título da seção, rótulo do link "voltar").
- A opção "Perguntar ao quadro" (`ASK_BOARD`) foi retirada do menu. O backend continua
  aceitando a ação — a classificação automática de texto livre existe para quando alguém
  descreve um pedido sem escolher uma opção do menu primeiro, um caminho que a interface
  não oferece mais, mas que não há razão para fechar na API.
- **Prioridade agora é editável no rascunho de "Nova demanda"** e é o que faltava para o
  formulário do assistente cobrir os mesmos campos do cadastro manual: o mesmo
  `PrioritySelect` usado no formulário comum foi adicionado ao lado do campo Prazo. O
  modelo já propõe uma prioridade — ver abaixo — e a pessoa revisando pode trocá-la antes
  de criar, como qualquer outro campo do rascunho.
- **A criação de uma demanda não fecha mais o chat sem aviso.** Antes, `onCreated` levava
  direto para a tela inicial (`go({ kind: 'home' })`) e abria o painel de detalhes por
  cima — com o painel de detalhes agora [empurrando o chat para o lado](#45-chat-da-ia-e-detalhes-da-demanda-lado-a-lado)
  em vez de substituí-lo, isso lia como "a IA esqueceu o que acabou de fazer", exatamente
  o relato do teste. Uma view nova, `{ kind: 'created' }`, mantém uma confirmação visível
  — título, projeto, um ícone de sucesso — com dois botões: "Ver detalhes" (abre o painel,
  chat continua ao lado) e "Nova demanda" (volta ao formulário em branco). Nada mais leva
  implicitamente de volta ao menu.

**Prioridade na análise da IA, não só no cadastro.** A prioridade foi adicionada depois do
assistente já estar pronto, então nenhum prompt ou contexto a mencionava — o modelo via as
mesmas demandas que o board mostra, mas sem esse campo. Agora:
- `BoardContext`/`ContextDemandInput` carregam `priority`, e `describeDemand` inclui a
  prioridade (rótulo em português) na linha de cada demanda que o modelo lê, no mesmo lugar
  usado por relatório executivo, resumo da daily, riscos e planejamento de checklist.
- A tarefa de **Riscos e prioridades** (`RISK_ANALYSIS`) e a seção "Riscos" do relatório
  executivo agora instruem explicitamente o modelo a pesar a prioridade cadastrada — uma
  demanda urgente ou alta sobe para o topo mesmo sem atraso, e só entre demandas de mesma
  prioridade os outros fatores (atraso, tempo parado, prazo) desempatam.
- No rascunho de **Nova demanda**, o campo `priority` foi adicionado ao `DRAFT_SCHEMA` e ao
  prompt (`draftSystem`): o modelo infere pela linguagem do pedido — "urgente", "crítico",
  "produção parada" → URGENT; "bug", "o quanto antes" → HIGH; "sem pressa", "quando der" →
  LOW; sem indício, MEDIUM (o mesmo padrão que o cadastro manual já usa). Uma prioridade
  fora do catálogo, ou ausente, cai em MEDIUM — a mesma postura defensiva que já existia
  para projeto, responsável e prazo.

**Validado com dados reais, não só com mocks.** Com a chave do Gemini já configurada no
ambiente, rodei os três comandos diretamente contra a API em Docker e conferi cada
afirmação contra o banco: o relatório executivo citou como "urgente atrasada" e "urgente
parada" exatamente as duas demandas cuja `priority` no banco é `URGENT`, e como "alta
prioridade estagnada" a única `HIGH` entre as citadas — nenhuma prioridade inventada.
"Riscos e prioridades" ordenou as duas `URGENT` antes da `HIGH`, antes das demais, mesmo
sem serem as mais atrasadas. Um rascunho de demanda com "bug urgente e crítico... produção
parada" voltou com `priority: "URGENT"`; um pedido "quando der, sem pressa" voltou com
`priority: "LOW"`. Todos os outros números do relatório (14 em aberto, 2 atrasadas, 7
paradas, taxa de entrega no prazo de 50%, lead/cycle time) também bateram exatamente com
`GET /dashboard` no mesmo instante.

**Exportar em PDF, só no relatório executivo.** Um botão "Exportar em PDF" aparece nas
ações da resposta quando `answer.action === 'EXECUTIVE_REPORT'` — os demais textos
(resumo da daily, riscos) não o têm, por não terem sido pedidos. A geração é 100%
client-side, com `jsPDF` (novo pacote no frontend): `exportExecutiveReportPdf` interpreta
o mesmo dialeto de markdown que o chat já renderiza (`### ` para seções, `- ` para listas,
`**negrito**`, `[texto](link)` para citações) e desenha um documento com timbre (barra de
cor da marca, título, escopo, data/hora e quem gerou), aviso de que o conteúdo foi gerado
por IA e deve ser revisado, seções com marcador colorido, listas com marcadores,
quebra de página automática, rodapé com "Página X de Y" em todas as páginas, e um apêndice
"Demandas citadas" com link (`/kanban?demanda=<uuid>`) para cada uma. Nenhuma requisição
nova ao servidor — o PDF é construído a partir da mesma resposta já recebida e sanitizada.

**Testes:** `exportExecutiveReportPdf.test.ts` cobre um relatório completo (títulos,
listas, negrito, citações), um relatório vazio sem citações, e um relatório longo o
bastante para forçar quebra de página — as três rodam a geração real do PDF em jsdom sem
lançar exceção. `assistant.test.ts` (domínio, backend) cobre o novo campo `priority` no
rascunho — mantido quando reconhecido, revertido para `MEDIUM` quando ausente ou
desconhecido — e a nova coluna de prioridade em `describeDemand`. `assistantText.test.ts`
(frontend) foi ajustado para as cinco opções de menu remanescentes, sem `ASK_BOARD`.

---

## 47. Navegação, badges e polimento visual — rodada de ajustes de UI

**O que:** uma bateria de ajustes pequenos e independentes na navegação e em três telas,
todos reportados como pendências depois de uso real do painel:

- **"Ação rápida" só no Kanban.** O botão foi removido do cabeçalho do Dashboard
  (`DashboardPage.tsx`) — `QuickAction` agora só é montado em `KanbanPage.tsx`. A leitura
  dos demais indicadores citados no Dashboard (atenção, parados) continua abrindo
  `DemandDetailsPanel` normalmente, por `openDetails`, que não dependia do assistente.
- **"Ação rápida" já era exclusiva de quem tem permissão.** `ASSISTANT_ACCESS` — "Usar o
  assistente de IA (Ação rápida)" no catálogo — já controlava o botão inteiro
  (`QuickAction.tsx`: `if (!allowed) return null`) e já aparecia como qualquer outro
  módulo na tela de Perfis. Verificado, não uma lacuna nova.
- **Navbar reordenada.** `NAV_ITEMS` em `AppLayout.tsx` passou a abrir com Kanban,
  Demandas e Usuários — o fluxo central do escopo original — antes do restante
  (Dashboard, Projetos, Perfis, Logs, Integração, Documentação), que mantém a ordem em
  que foi acrescentado.
- **Badge "Melhoria" fora de Demandas.** O item de navegação e o cabeçalho da tela
  (`DemandsListPage.tsx`) pararam de carregar o selo — Demandas é o histórico do que já
  existe no escopo original (demandas cadastradas), não um módulo à parte.
- **Badge do módulo Integração virou "Sugestão".** `EnhancementBadge` ganhou um prop
  `label: 'Melhoria' | 'Sugestão'` (era fixo em "Melhoria"); `NavItem`/`Shortcut` trocaram
  `enhancement?: boolean` por `badge?: 'Melhoria' | 'Sugestão'` em `AppLayout.tsx` e
  `HomePage.tsx`, e `IntegrationDocsPage.tsx` passa `label="Sugestão"` no cabeçalho.
  Integração é o único módulo com essa marca — é o único oferecido como proposta, não
  como parte do escopo cumprido.

**Perfis: parou de mostrar o enum ao usuário.** `RolesPage.tsx` listava
`role.permissions.map((code) => <li>{code}</li>)` — códigos como `DEMAND_MANAGE_PRODUCTION`
direto na tela, o próprio identificador do banco. Trocado por uma leitura por módulo: um
mapa `código → módulo`, construído a partir do catálogo (`GET /roles/permissions/catalog`,
já carregado nesta tela), reduz as permissões do perfil a um conjunto de módulos únicos
(`modulesOf`), exibidos como "Demandas", "Usuários", "Assistente de IA" etc. via o mesmo
`moduleLabel` que o editor de permissões já usa — nunca mais o código cru.

**Demandas: rótulo "Ordenar por".** O combobox de ordenação só tinha `aria-label`,
invisível para quem enxerga a tela. Ganhou um `<label>` visível, no mesmo padrão do
`FilterField` já usado nos filtros da mesma tela.

**Kanban, visualização em lista: elementos espalhados, não nos dois extremos.** A linha
de cada demanda dava `flex-1` ao bloco do título, que se esticava até onde os campos
fixos (responsável, prazo) começavam — o texto do título ficava colado à esquerda dentro
de uma caixa larga, e a caixa terminava exatamente onde os campos da direita começavam:
visualmente, título numa ponta, responsável e prazo grudados na outra, e nada preenchendo
o meio.

A primeira tentativa — trocar `flex-1` por `shrink` no título e pôr `justify-between` na
linha — espalhou os elementos e **quebrou o alinhamento das colunas**: `justify-between`
distribui a sobra entre os filhos que existem, e checklist e anexos são renderizados por
demanda, então cada linha tinha um número diferente de lacunas e responsável e prazo
passavam a começar em posições diferentes de linha para linha. O mesmo vale para o
projeto quando ele foi inserido logo depois do título: espremido entre o item flexível e
outros filhos opcionais, sua posição continuava variando.

Correção final: o meio vazio é preenchido com **conteúdo real**, não com espaçamento. O
título voltou a ser o único item flexível da linha (`flex-1`) — é justamente ele que
absorve toda a sobra e, com isso, ancora tudo que vem depois numa posição determinística
— e o projeto virou uma coluna própria de largura fixa (`w-32`), posicionada **logo antes
do responsável**, depois dos badges opcionais. Assim projeto, responsável e prazo formam
uma cauda de larguras fixas com nada variável entre eles, e as três colunas se alinham
por toda a lista.

**Kanban, quadro de cards: título da coluna movido para cima, na cor do status.** Antes o
cabeçalho (bolinha + nome + contagem) vivia dentro da própria superfície colorida da
coluna, em cinza neutro (`text-body`/`text-muted`). Agora `Column` (`KanbanBoard.tsx`)
renderiza um `<header>` separado, acima da caixa com borda e fundo (`<section>`), com o
nome e a contagem na cor do próprio status (`presentation.accentClass` — o mesmo token
`text-status-*` que a legenda de prioridade e os badges já usam), então a identidade da
coluna é lida antes mesmo de olhar para dentro dela. A barra colorida de 1px no topo da
caixa, redundante com o título agora colorido logo acima, foi removida.

**Combobox: parava de reabrir sem um clique fora primeiro — o de maior impacto desta
rodada, presente em todo select com busca do painel.** `onFocus={() => setOpen(true)}`
era o único gatilho para abrir a lista. Mas escolher uma opção (ou apertar Escape) fecha
a lista sem tirar o foco do campo — de propósito, para que a próxima busca não precise de
um clique extra — e um elemento que **já está focado** não dispara `focus` de novo ao ser
clicado. Resultado: depois de escolher algo (ou de um Escape), clicar de volta no mesmo
campo não reabria nada, e só um clique em outro lugar — perdendo o foco e recuperando —
destravava. Corrigido com um `onClick={() => setOpen(true)}` no input, independente do
estado de foco: cobre exatamente o caso que `onFocus` não cobre, sem alterar nenhum outro
comportamento (busca, teclado, Escape dentro de diálogo, seleção).

**Testes:** `Combobox.test.tsx` ganhou dois casos que reproduzem exatamente o travamento
relatado — reabrir com um segundo clique depois de escolher uma opção, e depois de um
Escape — e falhavam antes da correção. `KanbanBoard.test.tsx` e a suíte de `roles/`
seguem verdes sem alteração, confirmando que o reposicionamento do título da coluna e a
troca da listagem de permissões por módulos não mudaram nenhum comportamento que os
testes existentes já cobriam.

---

## 48. Projeto opcional na demanda, visibilidade por responsável e pessoas em toda parte

Uma rodada em torno de uma única pergunta — **a quem uma demanda pertence** — e das telas
que dependem da resposta.

### Projeto deixou de ser obrigatório

Uma demanda pode ser escrita antes de alguém decidir onde ela entra. `demands.project_id`
virou anulável, a FK permanece, e nenhuma linha existente mudou. (O histórico de
migrations foi consolidado numa única migration de inicialização para a primeira versão
publicada — ver `docs/DEPLOY.md`.)

O que o projeto realmente governa não é a existência da demanda, e sim **quem pode ser o
responsável**:

- **Com projeto:** apenas usuários ativos alocados nele e cujo perfil concede
  `DEMAND_BE_ASSIGNEE` — exatamente a regra que já existia.
- **Sem projeto:** não há alocação a verificar, então qualquer usuário ativo com
  `DEMAND_BE_ASSIGNEE` pode assumir.

Isso virou explícito no domínio em vez de implícito: `AssigneeCandidate` ganhou
`requiresMembership`, e `AssigneeEligibility` só cobra participação quando ele é `true`.
A alternativa — o diretório devolver `isProjectMember: true` para uma demanda sem projeto
— afirmaria algo falso sobre a pessoa e passaria a valer silenciosamente no momento em
que um projeto fosse atrelado depois.

**Atrelar o projeto depois.** É a ordem em que se trabalha de verdade: primeiro se sabe
quem faz, depois onde entra. No formulário, escolher um projeto dispara uma nova consulta
ao servidor (`GET /demands/assignees?projectUuid=…`) e, **só quando a lista chega**, o
responsável é comparado com ela. Se não estiver lá, o campo é limpo e um aviso em linha
diz por quê — "O responsável que estava selecionado não faz parte do projeto escolhido".
Se estiver, nada acontece: limpar sempre que o projeto muda jogaria fora uma escolha
válida toda vez que alguém corrigisse o projeto para outro em que a mesma pessoa também
está. O painel de detalhes segue a mesma regra ao transferir. O servidor continua sendo a
autoridade: atrelar com um responsável de fora é recusado com `422
RESPONSIBLE_NOT_PROJECT_MEMBER`, e a recusa é total — o projeto também não se move.

`PATCH /demands/{uuid}` aceita `projectUuid: null` para desatrelar; omitir o campo mantém
o que está. Na UI, "Sem projeto" é uma **opção do select**, não um campo vazio:
desatrelar é uma decisão que alguém toma, e um controle que diz o que é lê melhor que um
em branco. A mesma vocabulário aparece em card, lista, tabela, painel e dashboard através
de uma única constante (`features/demands/project.ts`), para as cinco cópias não
divergirem na primeira vez que o texto mudar.

**Log.** Entradas sobre demandas são de escopo `PROJECT`, e o `PrismaActivityRecorder`
exigia o projeto — corretamente, porque uma entrada de projeto sem projeto ficaria
invisível para quem ela concerne. A exceção agora é explícita e estreita: quando o
*subject* é `DEMAND`, o projeto pode faltar. A entrada cai onde toda linha de `ACTIVITY`
sem projeto cai (a visão organizacional) e a aba de histórico da própria demanda consulta
por subject, não por projeto, então nada se perde ali. A regra continua valendo integral
para entradas sobre projetos, onde um projeto ausente seria de fato um defeito.

### Permissão `DEMAND_VIEW_ALL`

Nova permissão do módulo Demandas: **"Visualizar todas as demandas, e não apenas as suas"**.
Sem ela, o Kanban vira a fila de trabalho da própria pessoa.

A regra é aplicada num único lugar por leitura, não espalhada por endpoint:
`ownerRestrictionOf(actor)` devolve `undefined` para quem tem a permissão e o próprio
uuid para quem não tem, e vira `restrictToOwnerUuid` no filtro do repositório. Ela vale
para o quadro, para o histórico de Demandas, para o Dashboard — que resume exatamente o
que o quadro listaria, e mentiria se somasse trabalho que a pessoa não pode abrir — e
para o contexto do assistente de IA, que nunca pode enxergar mais do que quem pergunta.
`DemandAccessGuard` aplica a mesma regra ao abrir uma demanda pelo uuid, respondendo
**"não encontrada"** e não "proibido", pela mesma razão que um projeto fora das alocações
responde assim: confirmar que algo existe já é o vazamento.

"Sua" demanda inclui **as que a pessoa criou**, não só as que ela é responsável —
senão quem pode cadastrar mas não pode assumir perderia de vista a demanda no instante em
que a salvasse.

Ela é ortogonal a `PROJECT_ACCESS_ALL`: aquela decide **em que projetos** se pode agir,
esta decide **de quem** são as demandas visíveis dentro deles. Demandas sem projeto estão
fora da fronteira de alocação por definição — não há projeto cuja participação verificar
—, então é `DEMAND_VIEW_ALL` que as delimita.

**Na seed, os três perfis recebem a permissão.** O escopo original descreve um quadro
compartilhado, e a seed existe para reproduzir o escopo original; a permissão existe para
que uma instalação **possa** estreitar isso. Basta desmarcá-la em Perfis para que aquele
perfil passe a ver só o que é seu — sem mudança de código e sem re-seed.

### Fotos de perfil

`users.avatar_url` (opcional) e retratos públicos do randomuser.me na seed, escolhidos
respeitando o gênero que cada nome carrega em português. O `Avatar` passou a renderizar
`<img>` quando há URL e a cair para as iniciais **quando não há e também quando a imagem
falha** (`onError`): a foto vem de fora deste sistema, então "não chegou" é um evento
comum, não um caso de borda, e a interface precisa continuar legível quando acontece. Um
`useEffect` zera o estado de falha quando o `src` muda, para que a pessoa seguinte ganhe
uma tentativa nova.

Novo `AvatarGroup`, com sobreposição e corte em `max` — passando disso ele conta o resto
("+7"), porque doze círculos sobrepostos dizem "muita gente" pior do que o número. As
faces são decorativas (`aria-hidden`); o grupo carrega um texto só para leitores de tela
com todos os nomes, inclusive os que não desenhou.

- **Card do projeto:** o avatargroup dos alocados, no rodapé do card (`mt-auto`, para
  alinhar entre cards de descrição desigual). Um card de projeto sem as pessoas esconde
  justamente o que torna a tela acionável. `GET /projects` passou a trazer os membros de
  todos os projetos numa **única** consulta (`listMemberSummaries`), não uma por card.
- **Kanban:** ao filtrar por um projeto, o avatargroup do time aparece ao lado do título
  — descreve o *escopo* do quadro, não uma coluna — e sem custo extra de rede, já que a
  listagem de projetos já carrega os membros.

### Usuários: cards viraram tabela paginada

Mesmo padrão de Logs e Demandas: `GET /users/page`, paginação por número com o total
conhecido de antemão, tabela de colunas fixas e `Pagination`. Grade de cards lê bem para
as oito pessoas de uma instalação semeada e deixa de ser honesta bem antes do efetivo
real.

Três filtros, e só três, porque são os únicos atributos que um usuário tem aqui: busca
por nome (com debounce de 300 ms, estado na URL), perfil e situação. **Situação é
tri-estado** — "ativos e inativos", "somente ativos", "somente inativos" — e não um
checkbox "incluir inativos": a pergunta que se chega fazendo é "quem está inativo?", e um
checkbox só sabe ampliar a lista, nunca isolar a resposta. O `GET /users` sem paginação
continua existindo: é dele que os seletores de membro precisam.

### Filtro por usuário no Kanban

Combobox "Todos os usuários", estado na URL (`?usuario=`) como o filtro de projeto, então
"o quadro da Beatriz" é um link que se manda. As opções saem dos **responsáveis das
demandas carregadas**, não de "todos os usuários" (listaria nomes que só podem produzir
um quadro vazio) nem do time do projeto (listaria quem não tem nada atribuído). O filtro
roda sobre o conjunto já em memória, como a busca por texto.

### Testes

- **Domínio:** elegibilidade ignora participação quando não há projeto, mas continua
  cobrando a capacidade.
- **Aplicação:** um bloco novo para `DEMAND_VIEW_ALL` — demanda de outra pessoa recusada
  dentro de um projeto do qual o ator participa, demanda própria aceita, demanda **criada**
  pelo ator aceita, demanda sem projeto de outra pessoa recusada e a mesma aceita assim
  que a permissão é concedida.
- **API:** lista de responsáveis com e sem escopo de projeto; criação sem projeto com um
  responsável que nenhum projeto compartilhado permitiria; recusa ao atrelar um projeto
  que exclui o responsável, com o estado preservado; transferência aceita quando o novo
  responsável vem junto; desatrelar de volta. Paginação, filtros e `avatarUrl` de
  `/users/page`, mais o 403 sem `USER_ACCESS`. As demandas sem projeto criadas nesses
  testes são apagadas ao final, porque estão fora de toda fronteira de projeto e, se
  ficassem, ampliariam silenciosamente os dados contra os quais as outras suítes afirmam
  isolamento.
- **Frontend:** `Avatar.test.tsx` fixa a queda para as iniciais nos dois casos (sem URL e
  com URL que falha) e o corte do `AvatarGroup`; `DemandFormPage.test.tsx` ganhou os dois
  lados do reset — projeto que exclui o responsável limpa o campo e explica, projeto que
  o inclui preserva a escolha.

Suítes: **297** no backend, **159** no frontend, todas verdes.

---

## 49. Topbar, sidebar recolhível e edição do próprio perfil

**Topbar em vez de rodapé da sidebar.** O que antes vivia no rodapé fixo da sidebar
(avatar + nome, tema claro/escuro, sair) migrou para uma barra superior própria
(`Topbar`, em `AppLayout.tsx`), presente em toda tela do painel — a mesma faixa que antes
só existia em versão mobile (`MobileTopBar`) ganhou esse papel também no desktop. A
sidebar fica dedicada exclusivamente à navegação entre módulos.

**Recolher a sidebar.** Um ícone (`ChevronsLeft`/`ChevronsRight`) na ponta esquerda da
Topbar, bem ao lado de onde a sidebar termina — exatamente onde o pedido colocou. Recolhida,
a sidebar vira uma coluna de ícones (`4.5rem`) com a marca compacta no topo; cada item
ganha um `Tooltip` com o rótulo que o texto deixou de mostrar, então a navegação continua
legível sem depender de memorizar ícones. A escolha persiste em `localStorage`
(`csp.sidebar.collapsed`), do mesmo jeito que o tema já persistia — reabrir o painel depois
mantém a sidebar do jeito que foi deixada. Em telas pequenas o recolhimento não se aplica:
a sidebar já é uma gaveta sobreposta (`Drawer`) que abre e fecha por completo, então o
controle de recolher aparece só a partir do breakpoint `lg`.

**Avatar e nome clicáveis → tela de edição do próprio perfil.** O bloco de identidade na
Topbar é agora um link para `/perfil`, sem exigir nenhuma permissão além de estar
autenticado — o mesmo padrão de "clique no seu nome para gerenciar sua conta" de qualquer
produto com login.

**CRUD completo do usuário logado (`ProfilePage`, `PATCH /users/me`).** Deliberadamente
mais estreito que a tela administrativa de Usuários: sem perfil, sem
ativar/desativar — são decisões de terceiros sobre a pessoa, não algo que ela corrige em
si mesma. O que o usuário logado gerencia:

- **Nome**, com a mesma regra de domínio da tela administrativa (`User.assertName`) —
  validada tanto no formulário quanto no servidor.
- **Foto de perfil**, por URL http(s); em branco remove a foto e volta às iniciais.
  Um botão "Remover" some o campo sem exigir apagar o texto manualmente, e uma prévia ao
  lado do formulário mostra o `Avatar` como ele vai aparecer.

Novo endpoint `PATCH /users/me`, registrado antes de `/:uuid` na mesma ordem que
`/demands/history` já segue, para "me" nunca ser engolido por um parâmetro de uuid. Não
exige nenhuma `requirePermission` — a única barreira é estar autenticado — e seu próprio
formato de entrada é o que impede alcançar `roleUuid` ou `active` por ali: o schema
(`updateOwnProfileSchema`) simplesmente não declara esses campos, então não há como a
requisição de autoatendimento se promover a administrador ou reativar a própria conta por
engano. Um novo `UpdateOwnProfile` (`user.use-cases.ts`) resolve o próprio ator sem
depender de `USER_UPDATE`, reaproveitando `existsByName`/`rename` do agregado `User`, que
ganhou `avatarUrl` e `changeAvatar()` — validando forma de URL (`http`/`https`, até 500
caracteres) da mesma maneira que qualquer outro campo do domínio se valida a si mesmo.

**Sessão carrega a própria foto.** `Actor` ganhou `avatarUrl` (parâmetro opcional, para
não quebrar nenhuma construção existente em teste), `EffectivePermissionsResolver` passou
a selecioná-lo, e tanto `POST /auth/login` quanto `GET /auth/me` devolvem
`user.avatarUrl` na sessão — é dali que a Topbar e a própria `ProfilePage` leem o valor
atual, sem uma segunda chamada. Ao salvar, a resposta de `PATCH /users/me` já atualiza o
cache da sessão (`queryClient.setQueryData(['session'], …)`) diretamente, então a Topbar
reflete o novo nome/foto no mesmo instante, sem esperar o próximo `GET /auth/me`.

### Testes

- **Backend:** suíte nova em `PATCH /users/me` — atualiza nome e foto sem exigir
  permissão além de sessão válida, `''` limpa a foto do mesmo jeito que `null`, o
  endpoint ignora silenciosamente `roleUuid`/`active` enviados por engano, rejeita uma
  URL que não é `http(s)`, e recusa renomear para um nome já em uso.
- **Frontend:** `AppLayout.test.tsx` fixa que identidade, tema e sair migraram para a
  Topbar (`role="banner"`), que o nome é um link para `/perfil`, que "Sair" ainda
  funciona dali, e que o botão de recolher alterna o rótulo e grava a preferência.
  `ProfilePage.test.tsx` cobre o formulário pré-preenchido com os dados da sessão, o
  salvamento atualizando a sessão em cache, a rejeição de um link que não é `http(s)`
  antes mesmo de chamar a API, e o botão "Remover" limpando o campo de foto.

Suítes: **302** no backend, **167** no frontend, todas verdes.

---

## 50. Permissões próprias para prioridade, prazo, responsável e projeto

`DEMAND_UPDATE` governava, sozinho, todo atributo editável de uma demanda — título,
descrição, status, prioridade, prazo, responsável e projeto, todos atrás do mesmo
interruptor. Um perfil com acesso mais restrito não tinha como gerenciar uma demanda
(renomeá-la, ajustar sua descrição, movê-la pelo quadro) sem também poder repriorizá-la,
adiar seu prazo, reatribuí-la a outra pessoa ou transferi-la para outro projeto — as
quatro decisões ficavam ou todas juntas ou nenhuma.

Quatro novas permissões, cada uma filha de `DEMAND_UPDATE` do mesmo jeito que
`DEMAND_CREATE_WITH_STATUS` é filha de `DEMAND_CREATE`: inertes sem o pai, e verificadas
explicitamente no caso de uso (`UpdateDemand`), não pela cascata automática de ACCESS do
`PermissionSet` — essa cascata só alcança a ACCESS do módulo, nunca uma permissão
específica como `DEMAND_UPDATE`.

- `DEMAND_UPDATE_PRIORITY` — alterar a prioridade;
- `DEMAND_UPDATE_DUE_DATE` — alterar o prazo;
- `DEMAND_UPDATE_RESPONSIBLE` — alterar o responsável;
- `DEMAND_UPDATE_PROJECT` — transferir para outro projeto.

`DEMAND_UPDATE` sozinho continua cobrindo título, descrição e status — o "gerenciar" no
sentido mais estrito do enunciado do escopo. As quatro filhas só entram em jogo quando a
requisição realmente toca aquele campo: `UpdateDemand.execute()` verifica
`priority !== undefined`, `dueDate !== undefined`, `responsibleUuid !== undefined` e
`projectUuid !== undefined` independentemente, cada um exigindo sua própria permissão
antes de qualquer escrita acontecer — falha-rápido e tudo-ou-nada, o mesmo formato da
verificação de `DEMAND_CREATE_WITH_STATUS` na criação.

**A transferência de projeto sem trocar o responsável explicitamente não exige
`DEMAND_UPDATE_RESPONSIBLE`.** Mover uma demanda para outro projeto sempre revalida o
responsável atual contra o destino (alocação é por projeto), mas essa revalidação não é
uma escolha do ator — é uma consequência de mover o projeto, já coberta por
`DEMAND_UPDATE_PROJECT`. A permissão de responsável só é cobrada quando o próprio pedido
inclui um `responsibleUuid` novo.

### Seed

O Agilista recebe as quatro; o Desenvolvedor tem `DEMAND_UPDATE` mas nenhuma delas —
pode renomear uma demanda, reescrever sua descrição e movê-la pelo quadro, mas
repriorizar, adiar o prazo, reatribuir ou transferir de projeto ficam com o Agilista. É
exatamente o "acesso mais restrito" que gerou o pedido: antes desta mudança, qualquer um
com `DEMAND_UPDATE` podia mexer nos quatro campos livremente.

### Painel de detalhes e formulário de edição

No painel de detalhes (`DemandDetailsPanel.tsx`), cada um dos quatro campos passou a
computar sua própria condição de edição (`canEditFields && can('DEMAND_UPDATE_X')`) em
vez de compartilhar `canEditFields`. O ícone de cadeado que já existia para "demanda em
produção" ganhou uma terceira explicação: uma função `fieldLockReason` decide, nessa
ordem, se o campo está travado por produção, por falta de `DEMAND_UPDATE` inteiro, ou
por faltar a permissão daquele campo especificamente — e mostra a frase certa em cada
caso, em vez de sempre dizer "Demanda em produção" mesmo quando não é disso que se trata.

O formulário de edição (`/demandas/:uuid/editar`, hoje sem link em nenhum lugar da
interface — o painel de detalhes é o caminho real de edição) recebeu a mesma regra nos
mesmos quatro campos, para não deixar uma rota alcançável por URL direta contornando o
que o painel já impõe visualmente. A tela de criação não muda: prioridade, prazo,
responsável e projeto de uma demanda **nova** continuam sob `DEMAND_CREATE` apenas.

### Testes

- **Backend:** um bloco de testes por caso — recusa cada um dos quatro campos com
  `DEMAND_UPDATE` sozinho, aceita assim que a permissão específica é concedida, confirma
  que título e descrição continuam livres com `DEMAND_UPDATE` puro, e confirma que mover
  o projeto sem trocar o responsável explicitamente pede só `DEMAND_UPDATE_PROJECT`. Os
  testes de API de transferência de projeto passaram a rodar como Agilista (que detém as
  quatro permissões), não mais como Desenvolvedor.
- **Frontend:** `fieldLockReason` testada isoladamente nas suas três prioridades de
  motivo (produção > `DEMAND_UPDATE` ausente > permissão do campo ausente), sem precisar
  montar o painel inteiro.

Suítes: **312** no backend, **176** no frontend, todas verdes.

---

## Requisitos originais preservados

Para clareza, todo o escopo original foi implementado sem alteração — com a única
exceção do [item 41](#41-produção-reversível-para-quem-gerencia), registrada ali:

- Login por seleção de usuário, com sessão persistente
- Segunda tela inicial com acesso a Kanban, cadastro de usuário e cadastro de demanda
- Menu lateral com item atual realçado
- Cadastro de demanda: campos obrigatórios com mensagem por campo, data apenas numérica
  com máscara, responsável em combobox pesquisável com "Usuário não encontrado"
- Cadastro de usuário: campos obrigatórios, nome apenas letras com e sem acentuação,
  perfil em dropdown
- Kanban com as cinco colunas, drag-and-drop com atualização automática de status,
  card em produção retornando à coluna **para quem não tem `DEMAND_MANAGE_PRODUCTION`**,
  busca filtrando enquanto digita, botão para cadastro de demanda, cards ordenados por
  prazo crescente, card com título, responsável e data
- Detalhes da demanda sobrepondo o Kanban, com título, responsável, status, prazo e
  descrição, botões de editar e excluir, e retorno ao quadro ao fechar
- Perfis com visibilidade condicionada: ação não permitida não é visível
