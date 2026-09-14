import { PERMISSION_CATALOG } from '../src/modules/iam/domain/permission';

/**
 * Fixed public UUIDs.
 *
 * Determinism matters for two reasons: re-running the seed must converge on the same
 * rows rather than duplicating them, and evaluators can bookmark a demand URL or paste
 * a uuid into Swagger and have it keep working across a `db:reset`.
 * These are hand-authored v4 uuids — never derived from a numeric id.
 */
export const SEED_UUIDS = {
  roles: {
    administrador: '0f9c2c4e-1b6a-4a51-9d3e-2c7f4a5b6c01',
    agilista: '0f9c2c4e-1b6a-4a51-9d3e-2c7f4a5b6c02',
    desenvolvedor: '0f9c2c4e-1b6a-4a51-9d3e-2c7f4a5b6c03',
  },
  users: {
    marianaAlves: '1a2b3c4d-0001-4a51-9d3e-2c7f4a5b6c01',
    robertoDias: '1a2b3c4d-0002-4a51-9d3e-2c7f4a5b6c02',
    joanaMartins: '1a2b3c4d-0003-4a51-9d3e-2c7f4a5b6c03',
    caioFerreira: '1a2b3c4d-0004-4a51-9d3e-2c7f4a5b6c04',
    lucasBarbosa: '1a2b3c4d-0005-4a51-9d3e-2c7f4a5b6c05',
    beatrizRamos: '1a2b3c4d-0006-4a51-9d3e-2c7f4a5b6c06',
    andreCarvalho: '1a2b3c4d-0007-4a51-9d3e-2c7f4a5b6c07',
    sofiaLimaBraga: '1a2b3c4d-0008-4a51-9d3e-2c7f4a5b6c08',
  },
  projects: {
    portalCliente: '2b3c4d5e-0001-4a51-9d3e-2c7f4a5b6c01',
    appLogistica: '2b3c4d5e-0002-4a51-9d3e-2c7f4a5b6c02',
    dataPlatform: '2b3c4d5e-0003-4a51-9d3e-2c7f4a5b6c03',
  },
} as const;

/**
 * Permission matrix of the three system profiles.
 *
 * This is the seed's most important asset: it reproduces the functional rules of the
 * specification exactly, expressed as data rather than as code. The Administrador, for
 * instance, deliberately lacks DEMAND_UPDATE / DEMAND_DELETE, which is what the original
 * document requires.
 */
export const SYSTEM_ROLES = [
  {
    uuid: SEED_UUIDS.roles.administrador,
    name: 'Administrador',
    slug: 'administrador',
    permissions: [
      'DEMAND_ACCESS',
      'DEMAND_KANBAN',
      'DEMAND_LIST',
      'DEMAND_VIEW_ALL',
      'DEMAND_CREATE',
      'USER_ACCESS',
      'USER_CREATE',
      'USER_UPDATE',
      'USER_DELETE',
      'PROJECT_ACCESS',
      'PROJECT_ACCESS_ALL',
      'PROJECT_CREATE',
      'PROJECT_UPDATE',
      'PROJECT_MANAGE_MEMBERS',
      'PROJECT_MANAGE_INTEGRATION',
      'ROLE_ACCESS',
      'ROLE_CREATE',
      'ROLE_UPDATE',
      'DEMAND_COMMENT',
      'DEMAND_WATCH',
      'LOG_ACCESS',
      'LOG_VIEW_ORGANIZATION',
      'LOG_VIEW_SYSTEM',
      'ASSISTANT_ACCESS',
      'ASSISTANT_MANAGE',
    ],
  },
  {
    uuid: SEED_UUIDS.roles.agilista,
    name: 'Agilista',
    slug: 'agilista',
    permissions: [
      'DEMAND_ACCESS',
      'DEMAND_KANBAN',
      'DEMAND_LIST',
      /*
       * Unlike the Desenvolvedor's DEMAND_VIEW_ALL below, this one is paired with
       * PROJECT_ACCESS_ALL: an Agilista oversees delivery across every team's board, not
       * only the projects they happen to be allocated to. Without PROJECT_ACCESS_ALL,
       * DEMAND_VIEW_ALL alone only widens *whose* demands show up inside the projects the
       * actor can already reach (ProjectAccessPolicy) — allocation still bounds *which*
       * projects that is, which is what left an Agilista with no allocation of their own
       * (e.g. added to a project after the fact) seeing an all-but-empty Kanban despite
       * holding every Demands permission there is.
       */
      'DEMAND_VIEW_ALL',
      'DEMAND_CREATE',
      'DEMAND_CREATE_WITH_STATUS',
      'DEMAND_UPDATE',
      /*
       * Without this, DEMAND_UPDATE (and everything below that depends on it) would only
       * reach demands the Agilista is responsible for or created — the same restriction
       * DEMAND_VIEW_ALL alone leaves a Desenvolvedor under. An Agilista coordinates the
       * whole team's board, so managing work that belongs to someone else is exactly the
       * job, not an oversight to close.
       */
      'DEMAND_MANAGE_ALL',
      'DEMAND_UPDATE_PRIORITY',
      'DEMAND_UPDATE_DUE_DATE',
      'DEMAND_UPDATE_RESPONSIBLE',
      'DEMAND_UPDATE_PROJECT',
      'DEMAND_MANAGE_PRODUCTION',
      'DEMAND_ARCHIVE',
      'DEMAND_DELETE',
      'DEMAND_BE_ASSIGNEE',
      'PROJECT_ACCESS',
      'PROJECT_ACCESS_ALL',
      'DEMAND_COMMENT',
      'DEMAND_WATCH',
      'LOG_ACCESS',
      'ASSISTANT_ACCESS',
    ],
  },
  {
    uuid: SEED_UUIDS.roles.desenvolvedor,
    name: 'Desenvolvedor',
    slug: 'desenvolvedor',
    permissions: [
      'DEMAND_ACCESS',
      'DEMAND_KANBAN',
      'DEMAND_LIST',
      /*
       * Granted to all three seeded profiles on purpose.
       *
       * The original specification describes a shared board — everyone allocated to a
       * project sees that project's work — so the seed, whose job is to reproduce the
       * specification exactly, keeps that behaviour. DEMAND_VIEW_ALL exists so an
       * installation *can* narrow it: revoke it from a profile in Perfis and that
       * profile's Kanban becomes its own queue, demands it is responsible for or
       * created, with no code change and no re-seed.
       */
      'DEMAND_VIEW_ALL',
      // DEMAND_UPDATE without DEMAND_MANAGE_ALL or any of the four field-level children,
      // on purpose. Without DEMAND_MANAGE_ALL, this only reaches demands the
      // Desenvolvedor is responsible for or created — DEMAND_VIEW_ALL widens what the
      // shared board *shows*, not whose cards may be worked, so seeing the whole team's
      // Kanban does not also mean managing it. On their own demands, a Desenvolvedor can
      // rename, rewrite the description and move it through the board, but
      // reprioritizing it, pushing its deadline, handing it to someone else, or moving it
      // to another project are left to the Agilista — the "acesso mais restrito" the
      // specification's own division of labour implies for this profile.
      'DEMAND_UPDATE',
      'DEMAND_BE_ASSIGNEE',
      'PROJECT_ACCESS',
      'DEMAND_COMMENT',
      'ASSISTANT_ACCESS',
    ],
  },
] as const;

export const ALL_PERMISSIONS = PERMISSION_CATALOG;

/**
 * The AI assistant ships enabled, on Gemini Flash-Lite.
 *
 * Written only when the installation has no configuration yet — see seed.ts. The seed runs
 * on every container start, and re-applying this would silently undo a key or a model an
 * administrator changed on screen.
 *
 * The API key is never part of the source: it comes from `SEED_ASSISTANT_API_KEY` (a
 * secret of the environment running the seed). Without it the configuration is created
 * keyless, and an administrator registers a key on the Ação rápida settings screen.
 */
export const SEED_ASSISTANT = {
  uuid: '5e6f7081-0001-4a51-9d3e-2c7f4a5b6c01',
  enabled: true,
} as const;

export function seedAssistantApiKey(): string | null {
  return process.env.SEED_ASSISTANT_API_KEY?.trim() || null;
}

/**
 * Profile pictures.
 *
 * Served by randomuser.me, a free portrait set published for exactly this use: seeding
 * demo data with faces instead of placeholders. The path itself carries the set
 * (`men`/`women`), so each picture is picked to match the gender its holder's name
 * reads as in Portuguese — a woman's name with a man's portrait is the kind of detail
 * that makes seeded data look careless.
 *
 * Nothing depends on these loading. The Avatar component falls back to the person's
 * monogram when the URL is absent *and* when the request fails, so an offline
 * evaluation shows exactly the interface this project had before them.
 */
const PORTRAIT = (set: 'men' | 'women', index: number) =>
  `https://randomuser.me/api/portraits/${set}/${index}.jpg`;

export const SEED_USERS = [
  { uuid: SEED_UUIDS.users.marianaAlves, name: 'Mariana Alves', role: 'administrador', avatarUrl: PORTRAIT('women', 44) },
  { uuid: SEED_UUIDS.users.robertoDias, name: 'Roberto Dias', role: 'administrador', avatarUrl: PORTRAIT('men', 32) },
  { uuid: SEED_UUIDS.users.joanaMartins, name: 'Joana Martins', role: 'agilista', avatarUrl: PORTRAIT('women', 68) },
  { uuid: SEED_UUIDS.users.caioFerreira, name: 'Caio Ferreira', role: 'agilista', avatarUrl: PORTRAIT('men', 75) },
  { uuid: SEED_UUIDS.users.lucasBarbosa, name: 'Lucas Barbosa', role: 'desenvolvedor', avatarUrl: PORTRAIT('men', 11) },
  { uuid: SEED_UUIDS.users.beatrizRamos, name: 'Beatriz Ramos', role: 'desenvolvedor', avatarUrl: PORTRAIT('women', 21) },
  { uuid: SEED_UUIDS.users.andreCarvalho, name: 'André Carvalho', role: 'desenvolvedor', avatarUrl: PORTRAIT('men', 54) },
  { uuid: SEED_UUIDS.users.sofiaLimaBraga, name: 'Sofia Lima Braga', role: 'desenvolvedor', avatarUrl: PORTRAIT('women', 9) },
] as const;

export const SEED_PROJECTS = [
  {
    uuid: SEED_UUIDS.projects.portalCliente,
    name: 'Portal do Cliente',
    description:
      'Reformulação da área logada do cliente, com autenticação, autoatendimento e segunda via de faturas.',
    // Joana (agilista) + três desenvolvedores: um projeto com vários usuários.
    members: ['joanaMartins', 'lucasBarbosa', 'beatrizRamos', 'andreCarvalho'],
  },
  {
    uuid: SEED_UUIDS.projects.appLogistica,
    name: 'App de Logística',
    description:
      'Aplicativo de roteirização e comprovação de entrega para a frota própria e transportadoras parceiras.',
    // Lucas e Beatriz participam de dois projetos; Caio atua apenas aqui.
    members: ['caioFerreira', 'lucasBarbosa', 'beatrizRamos'],
  },
  {
    uuid: SEED_UUIDS.projects.dataPlatform,
    name: 'Plataforma de Dados',
    description:
      'Consolidação do data warehouse corporativo e criação dos painéis executivos de acompanhamento.',
    // Sofia participa de um único projeto — o caso mínimo do N:N.
    members: ['joanaMartins', 'sofiaLimaBraga'],
  },
] as const;

/**
 * Due dates are relative to the moment the seed runs, so the board stays meaningful
 * however long after setup it is opened — a fixed date would show every demand overdue
 * a month later.
 */
export interface SeedDemand {
  key: string;
  project: keyof typeof SEED_UUIDS.projects;
  title: string;
  /**
   * Written as plain sentences and wrapped in a paragraph at seed time.
   *
   * The stored column holds sanitized markup, but authoring HTML by hand here would
   * make the data file harder to read and review for no gain — the seed is meant to be
   * skimmed as content, not parsed as a document.
   */
  description: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'PAUSED' | 'IN_REVIEW' | 'PRODUCTION';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  responsible: keyof typeof SEED_UUIDS.users;
  dueInDays: number;
  /** `[title, done]` pairs, in display order. */
  checklist?: [string, boolean][];
}

export const SEED_DEMANDS: SeedDemand[] = [
  // --- Portal do Cliente ---
  {
    key: 'portal-login',
    project: 'portalCliente',
    title: 'Implementar tela de login',
    description:
      'Desenvolver a tela de login seguindo o layout definido no protótipo, contemplando validação de campos, mensagens de erro acessíveis e redirecionamento após a autenticação.',
    status: 'NOT_STARTED',
    priority: 'MEDIUM',
    responsible: 'lucasBarbosa',
    dueInDays: 0,
    checklist: [
      ['Revisar layout com o time de design', true],
      ['Implementar validação dos campos', false],
      ['Cobrir mensagens de erro com teste', false],
    ],
  },
  {
    key: 'portal-segunda-via',
    project: 'portalCliente',
    title: 'Emissão de segunda via de fatura',
    description:
      'Permitir que o cliente emita a segunda via da fatura em PDF diretamente pelo portal, com histórico das últimas doze competências.',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    responsible: 'beatrizRamos',
    dueInDays: 3,
    checklist: [
      ['Levantar competências disponíveis na base', true],
      ['Gerar o PDF a partir do template aprovado', true],
      ['Publicar o histórico das últimas doze faturas', false],
    ],
  },
  {
    key: 'portal-cadastro',
    project: 'portalCliente',
    title: 'Revisar fluxo de cadastro',
    description:
      'Reduzir o formulário de cadastro para uma única etapa, aproveitando a consulta automática de endereço por CEP e a validação de documento em tempo real.',
    status: 'IN_REVIEW',
    priority: 'MEDIUM',
    responsible: 'andreCarvalho',
    dueInDays: 7,
    checklist: [
      ['Unificar as três etapas em um formulário', true],
      ['Integrar consulta de endereço por CEP', true],
      ['Validar documento em tempo real', true],
      ['Medir a taxa de conclusão após a mudança', false],
    ],
  },
  {
    key: 'portal-acessibilidade',
    project: 'portalCliente',
    title: 'Auditoria de acessibilidade WCAG',
    description:
      'Avaliar contraste, navegação por teclado e leitura por leitores de tela nas telas críticas, registrando as correções necessárias.',
    status: 'PAUSED',
    priority: 'LOW',
    responsible: 'joanaMartins',
    dueInDays: 15,
  },
  {
    key: 'portal-notificacoes',
    project: 'portalCliente',
    title: 'Central de notificações do cliente',
    description:
      'Publicada em produção: painel que consolida avisos de vencimento, protocolos e mudanças contratuais em um único lugar.',
    status: 'PRODUCTION',
    priority: 'HIGH',
    responsible: 'lucasBarbosa',
    dueInDays: 1,
  },

  // --- App de Logística ---
  {
    key: 'logistica-roteirizacao',
    project: 'appLogistica',
    title: 'Motor de roteirização por janela de entrega',
    description:
      'Calcular a melhor sequência de paradas considerando janelas de entrega contratadas, capacidade do veículo e restrições de circulação.',
    status: 'IN_PROGRESS',
    priority: 'URGENT',
    responsible: 'lucasBarbosa',
    // Overdue on purpose: a board with nothing late shows the Dashboard's most important
    // number as a zero, and a real portfolio rarely looks like that.
    dueInDays: -3,
  },
  {
    key: 'logistica-comprovacao',
    project: 'appLogistica',
    title: 'Comprovação de entrega com foto',
    description:
      'Registrar assinatura e foto no momento da entrega, com sincronização posterior quando o dispositivo estiver sem conectividade.',
    status: 'NOT_STARTED',
    priority: 'LOW',
    responsible: 'beatrizRamos',
    dueInDays: 7,
  },
  {
    key: 'logistica-rastreio',
    project: 'appLogistica',
    title: 'Rastreio público do pedido',
    description:
      'Disponibilizar uma página pública de acompanhamento por código de rastreio, sem exigir autenticação do destinatário.',
    status: 'IN_REVIEW',
    priority: 'MEDIUM',
    responsible: 'caioFerreira',
    dueInDays: 15,
  },
  {
    key: 'logistica-offline',
    project: 'appLogistica',
    title: 'Modo offline para regiões sem cobertura',
    description:
      'Persistir localmente as rotas do dia e enfileirar os eventos gerados enquanto o aplicativo estiver sem rede.',
    status: 'PAUSED',
    priority: 'MEDIUM',
    responsible: 'lucasBarbosa',
    dueInDays: 3,
  },

  // --- Plataforma de Dados ---
  {
    key: 'dados-ingestao',
    project: 'dataPlatform',
    title: 'Ingestão incremental do ERP',
    description:
      'Substituir a carga integral diária por captura incremental, reduzindo a janela de processamento noturna.',
    status: 'IN_PROGRESS',
    priority: 'URGENT',
    responsible: 'sofiaLimaBraga',
    dueInDays: -2,
  },
  {
    key: 'dados-painel',
    project: 'dataPlatform',
    title: 'Painel executivo de faturamento',
    description:
      'Consolidar receita por linha de produto, região e canal, com comparativo do mesmo período do ano anterior.',
    status: 'NOT_STARTED',
    priority: 'LOW',
    responsible: 'sofiaLimaBraga',
    dueInDays: 7,
  },
  {
    key: 'dados-catalogo',
    project: 'dataPlatform',
    title: 'Catálogo de dados e dicionário de métricas',
    description:
      'Documentar origem, responsável e regra de cálculo de cada métrica publicada, evitando divergências entre áreas.',
    status: 'IN_REVIEW',
    priority: 'LOW',
    responsible: 'joanaMartins',
    dueInDays: 15,
  },
  {
    key: 'dados-qualidade',
    project: 'dataPlatform',
    title: 'Monitoramento de qualidade dos dados',
    description:
      'Em produção: verificações automáticas de completude e integridade referencial, com alerta em caso de desvio.',
    status: 'PRODUCTION',
    priority: 'HIGH',
    responsible: 'sofiaLimaBraga',
    // Due before its seeded release date — delivered late — so the on-time delivery rate
    // has a miss to count instead of a trivially perfect score.
    dueInDays: -10,
  },
];

/** Stable uuid per demand key, hand-namespaced so re-seeds hit the same rows. */
export function demandUuidOf(key: string): string {
  const index = SEED_DEMANDS.findIndex((demand) => demand.key === key) + 1;
  if (index === 0) {
    throw new Error(`Demanda desconhecida na seed: "${key}".`);
  }
  const suffix = index.toString(16).padStart(4, '0');
  return `3c4d5e6f-${suffix}-4a51-9d3e-2c7f4a5b6c01`;
}

export interface SeedCommentData {
  key: string;
  demand: string;
  author: keyof typeof SEED_UUIDS.users;
  body: string;
  hoursAgo: number;
}

/**
 * A few conversations, each consistent with the demand it sits on.
 *
 * Every author is allocated to the demand's project and holds DEMAND_COMMENT under the
 * seeded matrix, and every comment is dated after its demand was created — the seed
 * verifies all three before writing, the same way it verifies responsibles.
 */
export const SEED_COMMENTS: SeedCommentData[] = [
  {
    key: 'acessibilidade-pausa',
    demand: 'portal-acessibilidade',
    author: 'joanaMartins',
    body: 'Pausada até o fornecedor do leitor de tela devolver o relatório de compatibilidade. Retomo assim que chegar.',
    hoursAgo: 30,
  },
  {
    key: 'acessibilidade-contraste',
    demand: 'portal-acessibilidade',
    author: 'andreCarvalho',
    body: 'Enquanto isso, posso adiantar a revisão de contraste das telas de cadastro.',
    hoursAgo: 26,
  },
  {
    key: 'cadastro-homologacao',
    demand: 'portal-cadastro',
    author: 'joanaMartins',
    body: 'Consulta de CEP validada em homologação. Falta só medir a taxa de conclusão antes de liberar.',
    hoursAgo: 20,
  },
  {
    key: 'cadastro-metricas',
    demand: 'portal-cadastro',
    author: 'andreCarvalho',
    body: 'Painel de conversão configurado. Os números da primeira semana saem na segunda-feira.',
    hoursAgo: 5,
  },
  {
    key: 'offline-definicao',
    demand: 'logistica-offline',
    author: 'caioFerreira',
    body: 'Pausada: aguardando a definição de quanto histórico o aplicativo guarda sem conexão.',
    hoursAgo: 48,
  },
  {
    key: 'notificacoes-publicada',
    demand: 'portal-notificacoes',
    author: 'joanaMartins',
    body: 'Publicada. Vamos acompanhar a abertura dos avisos de vencimento por duas semanas.',
    hoursAgo: 12,
  },
  {
    key: 'ingestao-homologacao',
    demand: 'dados-ingestao',
    author: 'sofiaLimaBraga',
    body: 'Carga incremental rodando em homologação com janela de 15 minutos.',
    hoursAgo: 8,
  },
];
