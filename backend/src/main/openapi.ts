import { PERMISSION_CODES } from '../modules/iam/domain/permission';
import { ASSISTANT_ACTIONS } from '../modules/assistant/domain/assistant-actions';
import { ASSISTANT_MODELS } from '../modules/assistant/domain/assistant-settings';
import { DEMAND_PRIORITIES } from '../modules/demands/domain/demand-priority';
import { DEMAND_STATUSES } from '../modules/demands/domain/demand-status';
import { LOG_CATEGORIES, LOG_LEVELS, LOG_SUBJECT_TYPES } from '../shared/domain/activity-catalog';

const errorResponse = {
  type: 'object',
  properties: {
    error: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        details: {},
        requestId: { type: 'string' },
      },
      required: ['code', 'message', 'requestId'],
    },
  },
} as const;

function data(schema: object) {
  return {
    type: 'object',
    properties: { data: schema },
    required: ['data'],
  };
}

const commonResponses = {
  401: { description: 'Não autenticado', content: { 'application/json': { schema: errorResponse } } },
  403: { description: 'Sem permissão', content: { 'application/json': { schema: errorResponse } } },
  404: { description: 'Não encontrado', content: { 'application/json': { schema: errorResponse } } },
  422: { description: 'Erro de validação', content: { 'application/json': { schema: errorResponse } } },
};

const uuidPath = {
  name: 'uuid',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};

const demandSchema = {
  type: 'object',
  properties: {
    uuid: { type: 'string', format: 'uuid' },
    title: { type: 'string' },
    description: { type: 'string' },
    status: { type: 'string', enum: DEMAND_STATUSES },
    priority: { type: 'string', enum: DEMAND_PRIORITIES },
    dueDate: { type: 'string', format: 'date', example: '2026-03-14' },
    isTerminal: { type: 'boolean' },
    archived: { type: 'boolean' },
    project: {
      type: 'object',
      nullable: true,
      description: 'null quando a demanda não está atrelada a projeto algum.',
      properties: { uuid: { type: 'string' }, name: { type: 'string' } },
    },
    responsible: {
      type: 'object',
      properties: {
        uuid: { type: 'string' },
        name: { type: 'string' },
        avatarUrl: { type: 'string', nullable: true },
      },
    },
    attachmentCount: { type: 'integer' },
    previewThumbnailUrl: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const namedRef = {
  type: 'object',
  properties: { uuid: { type: 'string', format: 'uuid' }, name: { type: 'string' } },
};

const logEntrySchema = {
  type: 'object',
  description:
    'Registro imutável. Nomes e rótulos são capturados no momento do evento, então continuam legíveis depois que o registro original muda ou é excluído.',
  properties: {
    uuid: { type: 'string', format: 'uuid' },
    occurredAt: { type: 'string', format: 'date-time' },
    category: { type: 'string', enum: LOG_CATEGORIES },
    level: { type: 'string', enum: LOG_LEVELS },
    action: { type: 'string', example: 'demand.status_changed' },
    summary: { type: 'string', example: 'Moveu a demanda "Tela de login" de Em andamento para Em homologação' },
    actor: { ...namedRef, nullable: true },
    subject: {
      type: 'object',
      nullable: true,
      properties: {
        type: { type: 'string', enum: LOG_SUBJECT_TYPES },
        uuid: { type: 'string', format: 'uuid' },
        label: { type: 'string', nullable: true },
      },
    },
    project: { ...namedRef, nullable: true },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          field: { type: 'string' },
          from: { type: 'string', nullable: true },
          to: { type: 'string', nullable: true },
        },
      },
    },
    metadata: { type: 'object', nullable: true, additionalProperties: true },
    requestId: { type: 'string', nullable: true },
  },
};

const logPageSchema = {
  type: 'object',
  properties: {
    items: { type: 'array', items: logEntrySchema },
    nextCursor: {
      type: 'string',
      nullable: true,
      description: 'Opaco. Envie de volta em `cursor` para a próxima página; `null` quando não há mais.',
    },
  },
};

const commentSchema = {
  type: 'object',
  properties: {
    uuid: { type: 'string', format: 'uuid' },
    parentUuid: {
      type: 'string',
      format: 'uuid',
      nullable: true,
      description: 'Comentário de nível superior ao qual este responde. `null` num comentário raiz.',
    },
    body: { type: 'string', description: 'Texto puro, 1 a 5000 caracteres.' },
    author: {
      type: 'object',
      properties: {
        uuid: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        avatarUrl: { type: 'string', nullable: true },
      },
    },
    createdAt: { type: 'string', format: 'date-time' },
    editedAt: { type: 'string', format: 'date-time', nullable: true },
    canEdit: { type: 'boolean', description: 'Verdadeiro apenas para o autor.' },
  },
};

const commentBody = {
  required: true,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['body'],
        properties: {
          body: { type: 'string', minLength: 1, maxLength: 5000 },
          parentCommentUuid: {
            type: 'string',
            format: 'uuid',
            description:
              'Só na criação. Responder a uma resposta reata na raiz — a indentação vai só um nível.',
          },
        },
      },
    },
  },
};

const pagingParameters = [
  { name: 'cursor', in: 'query', schema: { type: 'string' } },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 30 } },
];

const integrationStatusSchema = {
  type: 'object',
  properties: {
    configured: { type: 'boolean' },
    apiKey: { type: 'string', nullable: true },
    secretPreview: { type: 'string', nullable: true, description: 'Últimos 4 caracteres do secret — nunca o valor completo.' },
    createdAt: { type: 'string', format: 'date-time', nullable: true },
    rotatedAt: { type: 'string', format: 'date-time', nullable: true },
  },
};

const generatedCredentialSchema = {
  type: 'object',
  properties: {
    ...integrationStatusSchema.properties,
    apiSecret: { type: 'string', description: 'Retornado apenas nesta resposta. Guarde-o agora — não é recuperável depois.' },
  },
};

const accessTokenSchema = {
  type: 'object',
  properties: {
    accessToken: { type: 'string' },
    tokenType: { type: 'string', enum: ['Bearer'] },
    expiresIn: { type: 'integer', description: 'Segundos até a expiração.' },
  },
};

const commentPath = {
  name: 'commentUuid',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};

/**
 * Hand-written OpenAPI document.
 *
 * Kept deliberately as a single reviewed artifact rather than generated from Zod: the
 * schemas here are the *published contract*, and pinning them by hand makes an
 * accidental breaking change visible in a diff instead of silently regenerated.
 */
export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Kanban de Projetos — API',
    version: '1.0.0',
    description: [
      'API do quadro Kanban.',
      '',
      '**Identificadores:** todos os recursos são endereçados exclusivamente por UUID.',
      'IDs numéricos existem apenas na persistência e nunca são expostos.',
      '',
      '**Autenticação:** cookie HttpOnly emitido por `POST /auth/login`.',
      'O header `Authorization: Bearer <token>` é aceito como alternativa para testes.',
      '',
      '**Autorização:** permissões são resolvidas no servidor a cada requisição.',
      '`<MODULO>_ACCESS` é soberana: sem ela, as demais permissões do módulo não têm efeito.',
    ].join('\n'),
  },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: {
      cookieAuth: { type: 'apiKey', in: 'cookie', name: 'kanban_session' },
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      integrationBearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token obtido em POST /integration/auth/token — nunca o cookie ou o token de sessão.',
      },
    },
  },
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  // Integration endpoints override this with their own integrationBearerAuth (or
  // security: [] for the public token exchange) — the two credentials are never
  // interchangeable, see docs/ADDED_REQUIREMENTS.md.
  tags: [
    { name: 'Auth', description: 'Sessão e identidade' },
    { name: 'Users', description: 'Cadastro de usuários' },
    { name: 'Roles', description: 'Perfis e permissões' },
    { name: 'Projects', description: 'Projetos e alocação de membros' },
    { name: 'Demands', description: 'Demandas, Kanban, anexos, comentários e histórico' },
    { name: 'Notifications', description: 'Notificações de mudanças em demandas, em tempo real (SSE)' },
    { name: 'Logs', description: 'Atividade e eventos de sistema (requisito adicionado)' },
    { name: 'Dashboard', description: 'Métricas de situação e fluxo das demandas visíveis (requisito adicionado)' },
    { name: 'Integration', description: 'API de integração para criação e atualização de demandas por sistemas externos (requisito adicionado)' },
  ],
  paths: {
    '/auth/candidates': {
      get: {
        tags: ['Auth'],
        security: [],
        summary: 'Lista usuários ativos para a tela de login',
        responses: {
          200: {
            description: 'OK',
            content: {
              'application/json': {
                schema: data({
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      uuid: { type: 'string', format: 'uuid' },
                      name: { type: 'string' },
                      role: { type: 'object' },
                    },
                  },
                }),
              },
            },
          },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        security: [],
        summary: 'Autentica por seleção de usuário e emite o cookie de sessão',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['userUuid'],
                properties: { userUuid: { type: 'string', format: 'uuid' } },
              },
            },
          },
        },
        responses: {
          200: { description: 'Sessão criada' },
          ...commonResponses,
        },
      },
    },
    '/auth/logout': {
      post: { tags: ['Auth'], summary: 'Encerra a sessão', responses: { 204: { description: 'OK' } } },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Sessão atual com permissões efetivas',
        responses: {
          200: {
            description: 'OK',
            content: {
              'application/json': {
                schema: data({
                  type: 'object',
                  properties: {
                    user: { type: 'object' },
                    role: { type: 'object' },
                    permissions: { type: 'array', items: { type: 'string', enum: PERMISSION_CODES } },
                  },
                }),
              },
            },
          },
          ...commonResponses,
        },
      },
    },
    '/users': {
      get: {
        tags: ['Users'],
        summary: 'Lista usuários (requer USER_ACCESS)',
        parameters: [
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'activeOnly', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
        ],
        responses: { 200: { description: 'OK' }, ...commonResponses },
      },
      post: {
        tags: ['Users'],
        summary: 'Cadastra usuário (requer USER_CREATE)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'roleUuid'],
                properties: {
                  name: { type: 'string', description: 'Apenas letras, com ou sem acentuação' },
                  roleUuid: { type: 'string', format: 'uuid' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Criado' }, ...commonResponses },
      },
    },
    '/users/page': {
      get: {
        tags: ['Users'],
        summary: 'Lista usuários paginados, para a tela de Usuários (requer USER_ACCESS)',
        description:
          'Paginação por número de página, com o total conhecido de antemão — o mesmo formato de /demands/history e /logs. `active` é tri-estado: ausente traz ativos e inativos.',
        parameters: [
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'roleUuid', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'active', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
        ],
        responses: { 200: { description: 'OK' }, ...commonResponses },
      },
    },
    '/users/me': {
      patch: {
        tags: ['Users'],
        summary: 'Edita o próprio nome e/ou foto de perfil — sem permissão além de estar autenticado',
        description:
          'Não aceita `roleUuid` nem `active`: aqueles pertencem exclusivamente à tela administrativa (PATCH /users/{uuid}, requer USER_UPDATE). `avatarUrl` aceita uma URL http(s), string vazia ou `null` para remover a foto.',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  avatarUrl: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'OK' }, ...commonResponses },
      },
    },
    '/users/me/avatar': {
      post: {
        tags: ['Users'],
        summary: 'Envia uma foto de perfil — sem permissão além de estar autenticado',
        description:
          'Multipart, campo `file`. JPEG, PNG ou WEBP; mesmo limite de tamanho dos anexos de demanda (`UPLOAD_MAX_FILE_SIZE_MB`, 4 MB na Vercel). Armazenada pela mesma `FileStoragePort` dos anexos (disco local ou Vercel Blob) e define `avatarUrl` para a URL resultante — equivalente a colar essa URL em `PATCH /users/me`.',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: { file: { type: 'string', format: 'binary' } },
              },
            },
          },
        },
        responses: { 200: { description: 'OK' }, ...commonResponses },
      },
    },
    '/users/{uuid}': {
      patch: {
        tags: ['Users'],
        summary: 'Atualiza usuário (requer USER_UPDATE)',
        description:
          'Aceita `roleUuid` e `active` — as decisões organizacionais sobre a conta. Não aceita `name`: mesmo com USER_UPDATE, ninguém renomeia outra pessoa por aqui (403 CANNOT_CHANGE_OTHERS_NAME) — nome e foto só mudam pela própria pessoa, em PATCH /users/me.',
        parameters: [uuidPath],
        responses: { 200: { description: 'OK' }, ...commonResponses },
      },
    },
    '/roles': {
      get: {
        tags: ['Roles'],
        summary: 'Lista perfis (requer ROLE_ACCESS)',
        responses: { 200: { description: 'OK' }, ...commonResponses },
      },
      post: {
        tags: ['Roles'],
        summary: 'Cadastra perfil customizado (requer ROLE_CREATE)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string' },
                  permissions: { type: 'array', items: { type: 'string', enum: PERMISSION_CODES } },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Criado' }, ...commonResponses },
      },
    },
    '/roles/assignable': {
      get: {
        tags: ['Roles'],
        summary: 'Perfis ativos para o combobox de cadastro de usuário',
        responses: { 200: { description: 'OK' }, ...commonResponses },
      },
    },
    '/roles/permissions/catalog': {
      get: {
        tags: ['Roles'],
        summary: 'Catálogo de permissões agrupado por módulo',
        responses: { 200: { description: 'OK' }, ...commonResponses },
      },
    },
    '/roles/permissions/normalize': {
      post: {
        tags: ['Roles'],
        summary: 'Normaliza uma seleção aplicando a hierarquia ACCESS',
        responses: { 200: { description: 'OK' }, ...commonResponses },
      },
    },
    '/roles/{uuid}': {
      patch: {
        tags: ['Roles'],
        summary: 'Atualiza perfil e suas permissões (requer ROLE_UPDATE)',
        parameters: [uuidPath],
        responses: { 200: { description: 'OK' }, ...commonResponses },
      },
    },
    '/projects': {
      get: {
        tags: ['Projects'],
        summary: 'Lista projetos visíveis ao usuário',
        description:
          'Sem PROJECT_ACCESS_ALL, retorna apenas projetos aos quais o usuário está alocado.',
        responses: { 200: { description: 'OK' }, ...commonResponses },
      },
      post: {
        tags: ['Projects'],
        summary: 'Cadastra projeto (requer PROJECT_CREATE)',
        responses: { 201: { description: 'Criado' }, ...commonResponses },
      },
    },
    '/projects/{uuid}': {
      get: { tags: ['Projects'], parameters: [uuidPath], summary: 'Detalhe do projeto', responses: { 200: { description: 'OK' }, ...commonResponses } },
      patch: { tags: ['Projects'], parameters: [uuidPath], summary: 'Atualiza projeto', responses: { 200: { description: 'OK' }, ...commonResponses } },
    },
    '/projects/{uuid}/members': {
      get: { tags: ['Projects'], parameters: [uuidPath], summary: 'Lista membros', responses: { 200: { description: 'OK' }, ...commonResponses } },
      post: { tags: ['Projects'], parameters: [uuidPath], summary: 'Aloca usuário (requer PROJECT_MANAGE_MEMBERS)', responses: { 204: { description: 'OK' }, ...commonResponses } },
    },
    '/projects/{uuid}/members/{userUuid}': {
      delete: {
        tags: ['Projects'],
        parameters: [uuidPath, { name: 'userUuid', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        summary: 'Remove alocação',
        responses: { 204: { description: 'OK' }, 409: { description: 'Usuário é responsável por demandas do projeto' }, ...commonResponses },
      },
    },
    '/projects/{uuid}/demands': {
      get: { tags: ['Demands'], parameters: [uuidPath], summary: 'Demandas do projeto (ordenadas por prazo)', responses: { 200: { description: 'OK' }, ...commonResponses } },
      post: { tags: ['Demands'], parameters: [uuidPath], summary: 'Cadastra demanda no projeto', responses: { 201: { description: 'Criado' }, ...commonResponses } },
    },
    '/projects/{uuid}/integration': {
      get: {
        tags: ['Integration'],
        parameters: [uuidPath],
        summary: 'Status da integração do projeto (requer PROJECT_MANAGE_INTEGRATION)',
        description: 'Nunca retorna o secret — apenas se há credencial configurada, a apiKey pública e as datas de criação/rotação.',
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: data(integrationStatusSchema) } } },
          ...commonResponses,
        },
      },
    },
    '/projects/{uuid}/integration/credentials': {
      post: {
        tags: ['Integration'],
        parameters: [uuidPath],
        summary: 'Gera (ou regenera) as credenciais de integração do projeto (requer PROJECT_MANAGE_INTEGRATION)',
        description: [
          'Substitui qualquer credencial existente por uma nova — apiKey, secret e identidade interna trocam juntos.',
          '**O `apiSecret` desta resposta é a única vez em que ele é retornado.** Guarde-o imediatamente; o servidor não o recupera depois, apenas verifica.',
          'Como o par antigo deixa de existir, qualquer token de acesso emitido a partir dele para de funcionar no mesmo instante — não é preciso esperar sua expiração.',
        ].join('\n'),
        responses: {
          201: { description: 'Criado', content: { 'application/json': { schema: data(generatedCredentialSchema) } } },
          ...commonResponses,
        },
      },
      delete: {
        tags: ['Integration'],
        parameters: [uuidPath],
        summary: 'Revoga a credencial de integração do projeto (requer PROJECT_MANAGE_INTEGRATION)',
        description: 'Idempotente: revogar um projeto sem credencial configurada responde 204 normalmente.',
        responses: { 204: { description: 'OK' }, ...commonResponses },
      },
    },
    '/projects/{uuid}/eligible-assignees': {
      get: {
        tags: ['Demands'],
        parameters: [uuidPath, { name: 'search', in: 'query', schema: { type: 'string' } }],
        summary: 'Usuários elegíveis a responsável',
        description: 'Ativos, alocados no projeto e cujo perfil concede DEMAND_BE_ASSIGNEE.',
        responses: { 200: { description: 'OK' }, ...commonResponses },
      },
    },
    '/demands/assignees': {
      get: {
        tags: ['Demands'],
        parameters: [
          { name: 'projectUuid', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        summary: 'Usuários elegíveis a responsável, com o projeto como escopo opcional',
        description:
          'Com `projectUuid`, o mesmo resultado de /projects/{uuid}/eligible-assignees. Sem ele, todos os usuários ativos cujo perfil concede DEMAND_BE_ASSIGNEE — a lista que uma demanda sem projeto precisa oferecer, já que não há alocação que a restrinja.',
        responses: { 200: { description: 'OK' }, ...commonResponses },
      },
    },
    '/demands': {
      get: {
        tags: ['Demands'],
        summary: 'Lista demandas acessíveis, ordenadas por prazo ascendente',
        description:
          'Sem DEMAND_VIEW_ALL, a lista traz apenas as demandas das quais o ator é responsável ou autor. Demandas sem projeto não são filtradas pela alocação — não há projeto cuja participação pudesse ser verificada —, mas continuam sujeitas a essa mesma regra.',
        parameters: [
          { name: 'projectUuid', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: DEMAND_STATUSES } },
          { name: 'archived', in: 'query', description: 'true lista apenas as arquivadas; omitido lista apenas as ativas.', schema: { type: 'boolean' } },
        ],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: data({ type: 'array', items: demandSchema }) } } },
          ...commonResponses,
        },
      },
      post: {
        tags: ['Demands'],
        summary: 'Cadastra demanda (requer DEMAND_CREATE)',
        description:
          '`projectUuid` é opcional: omitido (ou `null`), a demanda não pertence a projeto algum e qualquer usuário com DEMAND_BE_ASSIGNEE pode ser seu responsável. Informado, vale a alocação — o responsável precisa participar do projeto. ' +
          '`status` é opcional e por padrão NOT_STARTED — o "+" de cada coluna do Kanban a envia para nascer já ali. ' +
          'Informar o campo, com qualquer valor, exige também DEMAND_CREATE_WITH_STATUS; sem essa permissão, 403 PERMISSION_DENIED. ' +
          'PRODUCTION é sempre recusado com 403 DEMAND_CANNOT_CREATE_IN_PRODUCTION, mesmo com a permissão.',
        requestBody: {
          content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', enum: DEMAND_STATUSES } } } } },
        },
        responses: { 201: { description: 'Criado' }, ...commonResponses },
      },
    },
    '/demands/{uuid}': {
      get: { tags: ['Demands'], parameters: [uuidPath], summary: 'Detalhes da demanda com anexos', responses: { 200: { description: 'OK', content: { 'application/json': { schema: data(demandSchema) } } }, ...commonResponses } },
      patch: {
        tags: ['Demands'],
        parameters: [uuidPath],
        summary: 'Edita demanda (requer DEMAND_UPDATE)',
        description:
          '`projectUuid: null` desatrela a demanda do projeto; omitir o campo mantém o que está. Atrelar a um projeto do qual o responsável atual não participa é recusado com 422 RESPONSIBLE_NOT_PROJECT_MEMBER — envie o novo responsável junto na mesma requisição. ' +
          'Título, descrição e status exigem apenas DEMAND_UPDATE; `priority`, `dueDate`, `responsibleUuid` e `projectUuid` exigem também a permissão específica do campo (DEMAND_UPDATE_PRIORITY, DEMAND_UPDATE_DUE_DATE, DEMAND_UPDATE_RESPONSIBLE, DEMAND_UPDATE_PROJECT) — sem ela, 403 PERMISSION_DENIED. ' +
          'DEMAND_UPDATE sozinho só alcança demandas das quais o ator é responsável ou autor; gerenciar uma demanda de outra pessoa exige também DEMAND_MANAGE_ALL — sem ela, 403 DEMAND_NOT_OWN. `status`, quando enviado, aplica a mesma máquina de estados de PATCH /demands/{uuid}/status (produção é terminal sem DEMAND_MANAGE_PRODUCTION) no mesmo request, registrando um único evento de auditoria e uma única notificação junto com os demais campos.',
        responses: { 200: { description: 'OK' }, ...commonResponses },
      },
      delete: { tags: ['Demands'], parameters: [uuidPath], summary: 'Exclui demanda (requer DEMAND_DELETE)', responses: { 204: { description: 'OK' }, ...commonResponses } },
    },
    '/demands/{uuid}/archive': {
      patch: {
        tags: ['Demands'],
        parameters: [uuidPath],
        summary: 'Arquiva ou desarquiva a demanda (requer DEMAND_ARCHIVE)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['archived'], properties: { archived: { type: 'boolean' } } },
            },
          },
        },
        responses: { 200: { description: 'OK' }, ...commonResponses },
      },
    },
    '/demands/watching': {
      get: {
        tags: ['Notifications'],
        summary: 'Demandas que o usuário acompanha (vazio sem DEMAND_WATCH)',
        responses: { 200: { description: 'OK' }, ...commonResponses },
      },
    },
    '/demands/{uuid}/watch': {
      put: {
        tags: ['Notifications'],
        parameters: [uuidPath],
        summary: 'Ativa as notificações desta demanda para o usuário (requer DEMAND_WATCH)',
        description:
          'Individual por usuário. O responsável já é notificado por padrão e recebe 409 DEMAND_WATCH_RESPONSIBLE.',
        responses: { 200: { description: 'OK' }, ...commonResponses },
      },
      delete: {
        tags: ['Notifications'],
        parameters: [uuidPath],
        summary: 'Desativa as notificações desta demanda para o usuário (requer DEMAND_WATCH)',
        responses: { 200: { description: 'OK' }, ...commonResponses },
      },
    },
    '/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'Caixa de notificações do usuário, mais recentes primeiro (paginação por cursor)',
        parameters: [
          { name: 'unreadOnly', in: 'query', schema: { type: 'boolean' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50 } },
          { name: 'before', in: 'query', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'OK' }, ...commonResponses },
      },
    },
    '/notifications/unread-count': {
      get: {
        tags: ['Notifications'],
        summary: 'Quantidade de notificações não lidas',
        responses: { 200: { description: 'OK' }, ...commonResponses },
      },
    },
    '/notifications/read': {
      post: {
        tags: ['Notifications'],
        summary: 'Marca notificações do próprio usuário como lidas',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['uuids'],
                properties: { uuids: { type: 'array', items: { type: 'string', format: 'uuid' } } },
              },
            },
          },
        },
        responses: { 200: { description: 'OK' }, ...commonResponses },
      },
    },
    '/notifications/read-all': {
      post: {
        tags: ['Notifications'],
        summary: 'Marca todas as notificações do usuário como lidas',
        responses: { 200: { description: 'OK' }, ...commonResponses },
      },
    },
    '/notifications/stream': {
      get: {
        tags: ['Notifications'],
        summary: 'Stream Server-Sent Events: evento `notification` a cada nova notificação',
        responses: { 200: { description: 'text/event-stream' }, ...commonResponses },
      },
    },
    '/demands/{uuid}/status': {
      patch: {
        tags: ['Demands'],
        parameters: [uuidPath],
        summary: 'Move a demanda entre colunas do Kanban (requer DEMAND_UPDATE)',
        description:
          'PRODUCTION é terminal: qualquer transição a partir dele é rejeitada com 403 DEMAND_IN_PRODUCTION_IS_TERMINAL, a menos que o ator possua DEMAND_MANAGE_PRODUCTION.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: DEMAND_STATUSES } } },
            },
          },
        },
        responses: { 200: { description: 'OK' }, ...commonResponses },
      },
    },
    '/demands/{uuid}/attachments': {
      post: {
        tags: ['Demands'],
        parameters: [uuidPath],
        summary: 'Envia anexos (multipart, campo "files")',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } },
              },
            },
          },
        },
        responses: { 201: { description: 'Criado' }, ...commonResponses },
      },
    },
    '/demands/{uuid}/attachments/{attachmentUuid}': {
      delete: {
        tags: ['Demands'],
        parameters: [uuidPath, { name: 'attachmentUuid', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        summary: 'Remove anexo',
        responses: { 204: { description: 'OK' }, ...commonResponses },
      },
    },
    '/demands/{uuid}/history': {
      get: {
        tags: ['Demands'],
        parameters: [uuidPath, ...pagingParameters],
        summary: 'Histórico de atualizações da demanda (requer DEMAND_ACCESS)',
        description:
          'Registros cujo assunto é a demanda, do mais recente ao mais antigo. Não exige LOG_ACCESS: quem acessa a demanda pode ver como ela chegou ao estado atual. Inclui a atividade de comentários (adicionados, editados, excluídos); eventos de sistema só aparecem para quem tem LOG_VIEW_SYSTEM.',
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: data(logPageSchema) } } },
          ...commonResponses,
        },
      },
    },
    '/demands/{uuid}/comments': {
      get: {
        tags: ['Demands'],
        parameters: [uuidPath],
        summary: 'Comentários da demanda, do mais recente ao mais antigo (requer DEMAND_ACCESS)',
        responses: {
          200: {
            description: 'OK',
            content: { 'application/json': { schema: data({ type: 'array', items: commentSchema }) } },
          },
          ...commonResponses,
        },
      },
      post: {
        tags: ['Demands'],
        parameters: [uuidPath],
        summary: 'Comenta na demanda (requer DEMAND_COMMENT)',
        description: 'Permitido também em demandas em produção: produção congela o escopo, não a conversa.',
        requestBody: commentBody,
        responses: {
          201: { description: 'Criado', content: { 'application/json': { schema: data(commentSchema) } } },
          ...commonResponses,
        },
      },
    },
    '/demands/{uuid}/comments/{commentUuid}': {
      patch: {
        tags: ['Demands'],
        parameters: [uuidPath, commentPath],
        summary: 'Edita o próprio comentário (requer DEMAND_COMMENT)',
        description: 'Apenas o autor: qualquer outra pessoa recebe 403 COMMENT_NOT_AUTHOR.',
        requestBody: commentBody,
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: data(commentSchema) } } },
          ...commonResponses,
        },
      },
      delete: {
        tags: ['Demands'],
        parameters: [uuidPath, commentPath],
        summary: 'Exclui o próprio comentário (requer DEMAND_COMMENT)',
        responses: { 204: { description: 'OK' }, ...commonResponses },
      },
    },
    '/dashboard': {
      get: {
        tags: ['Dashboard'],
        summary: 'Indicadores de situação e fluxo das demandas (requer DEMAND_ACCESS + DASHBOARD_ACCESS)',
        description: [
          'Escopo team (DASHBOARD_VIEW_ALL): as mesmas demandas não arquivadas que GET /demands retornaria ao usuário. Escopo personal (DASHBOARD_VIEW_OWN): apenas as demandas sob responsabilidade do usuário. Sem scope, usa o mais amplo permitido; escopo não permitido responde 403 DASHBOARD_SCOPE_DENIED, e nenhum escopo, 403 DASHBOARD_NO_SCOPE.',
          'Datas contadas no fuso APP_TIMEZONE. Tempos de entrega em dias, como mediana e percentil 85 (nearest-rank), nunca média.',
          '- summary: em aberto, atrasadas, vencendo hoje / em até 7 dias, paradas (iniciadas e sem mudar de status há 7+ dias).',
          '- flow: entregas e entradas no período vs. período anterior, lead time (criação → produção), cycle time (início → produção), entregas no prazo.',
          '- statusDistribution, dueBuckets, weekly (8 semanas ISO), workload, projects, attention, stalled.',
        ].join('\n'),
        parameters: [
          { name: 'projectUuid', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'period', in: 'query', schema: { type: 'string', enum: ['30', '90'], default: '30' } },
          { name: 'scope', in: 'query', schema: { type: 'string', enum: ['team', 'personal'] } },
        ],
        responses: { 200: { description: 'OK' }, ...commonResponses },
      },
    },
    '/assistant': {
      get: {
        tags: ['Assistant'],
        summary: 'Estado do assistente de IA (requer ASSISTANT_ACCESS)',
        description:
          'Se está ativo, se há chave configurada e qual modelo responde. `management` — chave mascarada (últimos 4 caracteres), modelos disponíveis e última alteração — só vem para quem tem ASSISTANT_MANAGE. A chave nunca é devolvida.',
        responses: { 200: { description: 'OK' }, ...commonResponses },
      },
    },
    '/assistant/settings': {
      patch: {
        tags: ['Assistant'],
        summary: 'Reconfigura o assistente de IA (requer ASSISTANT_MANAGE)',
        description: 'Cada mudança vira uma entrada `assistant.settings_updated` nos logs de atividade, com a chave identificada só pelos últimos 4 caracteres.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  enabled: { type: 'boolean' },
                  model: { type: 'string', enum: ASSISTANT_MODELS.map((model) => model.id) },
                  apiKey: { type: 'string', description: 'Nova chave. Vazia ou omitida mantém a atual. Guardada cifrada (AES-256-GCM).' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'OK' }, ...commonResponses },
      },
    },
    '/assistant/commands': {
      post: {
        tags: ['Assistant'],
        summary: 'Executa uma ação rápida do assistente (requer ASSISTANT_ACCESS e a permissão da ação)',
        description: [
          'Sem `action`, o pedido em `prompt` é classificado pelo modelo antes de ser atendido.',
          '- CREATE_DEMAND (DEMAND_CREATE): rascunho de demanda com projeto, responsável e prazo validados. **Nada é criado** — o cadastro é feito por POST /demands.',
          '- PLAN_CHECKLIST (DEMAND_UPDATE, requer `demandUuid`): passos sugeridos, sem repetir os existentes. Aplicados por POST /demands/{uuid}/checklist.',
          '- EXECUTIVE_REPORT, DAILY_SUMMARY, RISK_ANALYSIS, ASK_BOARD (DEMAND_ACCESS): texto em Markdown com as demandas citadas como links.',
          '- CLARIFY: resposta quando o pedido não corresponde a uma ação que o perfil pode executar.',
          'O modelo recebe apenas as demandas visíveis ao usuário. Limite de 20 pedidos a cada 5 minutos por usuário.',
        ].join('\n'),
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  action: { type: 'string', enum: ASSISTANT_ACTIONS },
                  prompt: { type: 'string', maxLength: 2000 },
                  projectUuid: { type: 'string', format: 'uuid' },
                  demandUuid: { type: 'string', format: 'uuid' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'OK' },
          409: { description: 'Assistente desativado ou sem chave configurada', content: { 'application/json': { schema: errorResponse } } },
          429: { description: 'Limite de pedidos do usuário ou cota do provedor atingidos (header Retry-After)', content: { 'application/json': { schema: errorResponse } } },
          503: { description: 'Provedor de IA indisponível, chave recusada ou resposta fora do formato', content: { 'application/json': { schema: errorResponse } } },
          ...commonResponses,
        },
      },
    },
    '/logs': {
      get: {
        tags: ['Logs'],
        summary: 'Pesquisa os registros visíveis ao usuário (requer LOG_ACCESS)',
        description: [
          'Visibilidade calculada no servidor a partir das permissões:',
          '- atividade de demandas e projetos segue a visibilidade de projetos (alocação ou PROJECT_ACCESS_ALL);',
          '- atividade de usuários, perfis e sessões exige LOG_VIEW_ORGANIZATION;',
          '- `category=SYSTEM` exige LOG_VIEW_SYSTEM (403 sem ela).',
          '',
          'Filtros apenas estreitam esse conjunto. Paginação por cursor, do mais recente ao mais antigo.',
        ].join('\n'),
        parameters: [
          { name: 'category', in: 'query', schema: { type: 'string', enum: LOG_CATEGORIES } },
          { name: 'level', in: 'query', schema: { type: 'string', enum: LOG_LEVELS } },
          { name: 'action', in: 'query', schema: { type: 'string' }, example: 'demand.status_changed' },
          { name: 'actorUuid', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'projectUuid', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'subjectType', in: 'query', schema: { type: 'string', enum: LOG_SUBJECT_TYPES } },
          { name: 'subjectUuid', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'search', in: 'query', schema: { type: 'string', maxLength: 120 } },
          { name: 'requestId', in: 'query', schema: { type: 'string' } },
          ...pagingParameters,
        ],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: data(logPageSchema) } } },
          ...commonResponses,
        },
      },
    },
    '/logs/filters': {
      get: {
        tags: ['Logs'],
        summary: 'Opções de filtro recortadas pela visibilidade do usuário (requer LOG_ACCESS)',
        responses: {
          200: {
            description: 'OK',
            content: {
              'application/json': {
                schema: data({
                  type: 'object',
                  properties: {
                    categories: { type: 'array', items: { type: 'string', enum: LOG_CATEGORIES } },
                    canViewOrganization: { type: 'boolean' },
                    actions: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          code: { type: 'string' },
                          label: { type: 'string' },
                          category: { type: 'string', enum: LOG_CATEGORIES },
                          group: { type: 'string' },
                          groupLabel: { type: 'string' },
                        },
                      },
                    },
                    actors: { type: 'array', items: namedRef },
                    projects: { type: 'array', items: namedRef },
                  },
                }),
              },
            },
          },
          ...commonResponses,
        },
      },
    },
    '/integration/auth/token': {
      post: {
        tags: ['Integration'],
        security: [],
        summary: 'Troca uma API key + secret de projeto por um token de acesso de integração',
        description: [
          'Sem sessão de usuário — a própria API key/secret é a credencial, o mesmo desenho de um OAuth2 Client Credentials Grant.',
          'Uma API key ou um secret incorretos produzem o mesmo erro 401 `INTEGRATION_INVALID_CREDENTIALS`, para não revelar qual dos dois está errado.',
          'O token expira em pouco tempo (padrão 1 hora) e para de funcionar imediatamente se a credencial for rotacionada ou revogada antes disso.',
        ].join('\n'),
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['apiKey', 'apiSecret'],
                properties: {
                  apiKey: { type: 'string', example: 'csp_key_1a2b3c4d5e6f7890abcd1a2b3c4d5e6f7890abcd' },
                  apiSecret: { type: 'string', example: 'csp_secret_9f8e7d6c5b4a...' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: data(accessTokenSchema) } } },
          401: { description: 'Credenciais inválidas', content: { 'application/json': { schema: errorResponse } } },
          422: { description: 'Erro de validação', content: { 'application/json': { schema: errorResponse } } },
        },
      },
    },
    '/integration/demands': {
      post: {
        tags: ['Integration'],
        security: [{ integrationBearerAuth: [] }],
        summary: 'Cria uma demanda no projeto do token de integração',
        description: 'O projeto nunca vem do corpo da requisição — é sempre o do token apresentado em `Authorization: Bearer`.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title', 'description', 'dueDate', 'responsibleUuid'],
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  dueDate: { type: 'string', format: 'date', example: '2026-12-31' },
                  responsibleUuid: { type: 'string', format: 'uuid' },
                  status: {
                    type: 'string',
                    enum: DEMAND_STATUSES.filter((status) => status !== 'PRODUCTION'),
                    description: 'Qualquer status exceto PRODUCTION: uma demanda percorre o fluxo até a produção, não nasce nela (422 INTEGRATION_CANNOT_CREATE_IN_PRODUCTION).',
                  },
                  priority: { type: 'string', enum: DEMAND_PRIORITIES, description: 'Omitida, é MEDIUM.' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Criado', content: { 'application/json': { schema: data({ type: 'object', properties: { uuid: { type: 'string', format: 'uuid' } } }) } } },
          401: { description: 'Token de integração ausente, inválido ou revogado', content: { 'application/json': { schema: errorResponse } } },
          422: { description: 'Erro de validação', content: { 'application/json': { schema: errorResponse } } },
        },
      },
    },
    '/integration/demands/{uuid}': {
      patch: {
        tags: ['Integration'],
        security: [{ integrationBearerAuth: [] }],
        parameters: [uuidPath],
        summary: 'Edita uma demanda do projeto do token de integração',
        description: 'Uma demanda de outro projeto — mesmo existente — responde 404, nunca 403: o isolamento não confirma que o uuid existe em outro lugar.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  dueDate: { type: 'string', format: 'date' },
                  responsibleUuid: { type: 'string', format: 'uuid' },
                  priority: { type: 'string', enum: DEMAND_PRIORITIES },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: data({ type: 'object', properties: { uuid: { type: 'string', format: 'uuid' } } }) } } },
          ...commonResponses,
        },
      },
    },
    '/integration/demands/{uuid}/status': {
      patch: {
        tags: ['Integration'],
        security: [{ integrationBearerAuth: [] }],
        parameters: [uuidPath],
        summary: 'Move a demanda entre colunas (requisito adicionado à integração)',
        description: 'Mesma máquina de estados da sessão: produção é terminal e a resposta é 403 `DEMAND_IN_PRODUCTION_IS_TERMINAL`.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: DEMAND_STATUSES } } },
            },
          },
        },
        responses: { 200: { description: 'OK' }, ...commonResponses },
      },
    },
  },
};
