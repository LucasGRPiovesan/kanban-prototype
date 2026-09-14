import { DomainError } from '../../../shared/domain/errors';

/**
 * The permission catalog is a closed, code-first enumeration: permissions are the
 * vocabulary the source code checks against, so they cannot be user-created data.
 * What IS data-driven is which permissions a role holds — that is fully editable.
 */
export const PERMISSION_CODES = [
  // Demands (covers the Kanban board — it is a view over demands, not a module of its own)
  'DEMAND_ACCESS',
  'DEMAND_VIEW_ALL',
  'DEMAND_CREATE',
  'DEMAND_CREATE_WITH_STATUS',
  'DEMAND_UPDATE',
  'DEMAND_UPDATE_PRIORITY',
  'DEMAND_UPDATE_DUE_DATE',
  'DEMAND_UPDATE_RESPONSIBLE',
  'DEMAND_UPDATE_PROJECT',
  'DEMAND_MANAGE_PRODUCTION',
  'DEMAND_ARCHIVE',
  'DEMAND_DELETE',
  'DEMAND_BE_ASSIGNEE',
  'DEMAND_COMMENT',
  'DEMAND_WATCH',
  // Users
  'USER_ACCESS',
  'USER_CREATE',
  'USER_UPDATE',
  'USER_DELETE',
  // Projects
  'PROJECT_ACCESS',
  'PROJECT_ACCESS_ALL',
  'PROJECT_CREATE',
  'PROJECT_UPDATE',
  'PROJECT_MANAGE_MEMBERS',
  'PROJECT_MANAGE_INTEGRATION',
  // Roles
  'ROLE_ACCESS',
  'ROLE_CREATE',
  'ROLE_UPDATE',
  // Logs
  'LOG_ACCESS',
  'LOG_VIEW_ORGANIZATION',
  'LOG_VIEW_SYSTEM',
  // Assistant
  'ASSISTANT_ACCESS',
  'ASSISTANT_MANAGE',
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

export const PERMISSION_MODULES = [
  'DEMAND',
  'USER',
  'PROJECT',
  'ROLE',
  'LOG',
  'ASSISTANT',
] as const;
export type PermissionModule = (typeof PERMISSION_MODULES)[number];

export interface PermissionDefinition {
  readonly code: PermissionCode;
  readonly module: PermissionModule;
  readonly action: string;
  readonly description: string;
  /**
   * The permission this one is inert without, beyond the module's own `ACCESS` — e.g.
   * `DEMAND_UPDATE_PRIORITY` depends on `DEMAND_UPDATE`. `ACCESS` is every permission's
   * implicit root and is never named here; omitted, a permission's only dependency is its
   * module's `ACCESS`, enforced generically by `PermissionSet` (see below). A stated
   * `dependsOn` is instead asserted explicitly by whichever use case checks it — the same
   * "inert without the parent" relationship, one level deeper than ACCESS reaches on its
   * own. This is also what the role editor renders as indentation, so it doubles as the
   * UI's only source of the hierarchy: adding a dependency here without asserting it in
   * the matching use case would show a relationship the server does not actually enforce.
   */
  readonly dependsOn?: PermissionCode;
}

/**
 * `ACCESS` is the sovereign permission of each module. Every other permission in
 * that module is a child of it and is inert without it — see PermissionSet.
 */
export const PERMISSION_CATALOG: readonly PermissionDefinition[] = [
  // Acessar demandas e seus detalhes covers both the Kanban board and the demand list —
  // the board is a view over demands, not a capability of its own. Splitting them used
  // to require both to be granted together for the board route to do anything, which was
  // a distinction without a difference.
  { code: 'DEMAND_ACCESS', module: 'DEMAND', action: 'ACCESS', description: 'Acessar demandas e seus detalhes, incluindo o quadro Kanban' },
  // Widens *what* is listed, never *where*: project allocation still applies on top of
  // it. Without this permission the actor reads exactly the demands assigned to them —
  // the board becomes their own work queue rather than the team's. It is deliberately
  // not implied by DEMAND_UPDATE: being able to move a card you were given says nothing
  // about being entitled to read everyone else's.
  { code: 'DEMAND_VIEW_ALL', module: 'DEMAND', action: 'VIEW_ALL', description: 'Visualizar todas as demandas, e não apenas as que são suas' },
  { code: 'DEMAND_CREATE', module: 'DEMAND', action: 'CREATE', description: 'Cadastrar novas demandas' },
  // Independent of DEMAND_UPDATE on purpose: this is a create-time capability (the
  // Kanban's per-column "+"), not the power to edit or move a demand that already
  // exists. Off, the "+" does not appear anywhere on the board — every demand is created
  // in NOT_STARTED, exactly as if this permission never existed.
  { code: 'DEMAND_CREATE_WITH_STATUS', module: 'DEMAND', action: 'CREATE_WITH_STATUS', description: 'Criação de demanda por status', dependsOn: 'DEMAND_CREATE' },
  // Covers editing every attribute of an existing demand, including its status — moving
  // a card (drag-and-drop or the status selector) is a scope change on an existing
  // demand, not a distinct domain action. Splitting the two forced whoever could edit a
  // demand to also need a second, separately-granted permission just to change where it
  // sits on the board.
  { code: 'DEMAND_UPDATE', module: 'DEMAND', action: 'UPDATE', description: 'Gerenciar demandas existentes (editar e alterar status)' },
  // Children of DEMAND_UPDATE, the same way DEMAND_CREATE_WITH_STATUS is a child of
  // DEMAND_CREATE: PermissionSet's own ACCESS cascade only reaches as far as a module's
  // ACCESS, so the "inert without DEMAND_UPDATE" half of that relationship is asserted
  // explicitly in UpdateDemand, not derived automatically the way ACCESS-sovereignty is.
  // DEMAND_UPDATE alone still covers title, description and status — the specification's
  // own idea of "gerenciar" — while these gate the four attributes a more restricted
  // profile can be trusted to leave alone: holding DEMAND_UPDATE with none of them lets
  // someone work a demand (rename it, rewrite its description, move it through the
  // board) without also being able to reprioritize it, push its deadline, hand it to
  // someone else, or move it to another project's board entirely.
  { code: 'DEMAND_UPDATE_PRIORITY', module: 'DEMAND', action: 'UPDATE_PRIORITY', description: 'Alterar a prioridade de uma demanda', dependsOn: 'DEMAND_UPDATE' },
  { code: 'DEMAND_UPDATE_DUE_DATE', module: 'DEMAND', action: 'UPDATE_DUE_DATE', description: 'Alterar o prazo de uma demanda', dependsOn: 'DEMAND_UPDATE' },
  { code: 'DEMAND_UPDATE_RESPONSIBLE', module: 'DEMAND', action: 'UPDATE_RESPONSIBLE', description: 'Alterar o responsável por uma demanda', dependsOn: 'DEMAND_UPDATE' },
  { code: 'DEMAND_UPDATE_PROJECT', module: 'DEMAND', action: 'UPDATE_PROJECT', description: 'Transferir uma demanda para outro projeto', dependsOn: 'DEMAND_UPDATE' },
  // PRODUCTION is terminal by default (see demand-status.ts) — the specification's own
  // rule. This permission is the one controlled exception: without it, moving a demand
  // to produção locks it for good, exactly as the scope requires. With it, produção is
  // just another column — the holder moves a demand in and out freely, no confirmation
  // asked, because they are trusted to know it is reversible for them.
  { code: 'DEMAND_MANAGE_PRODUCTION', module: 'DEMAND', action: 'MANAGE_PRODUCTION', description: 'Gerenciar demandas em produção (reabrir e mudar o status de novo)', dependsOn: 'DEMAND_UPDATE' },
  // Distinct from DEMAND_DELETE on purpose: archiving hides a demand from the board
  // without destroying it, so it is granted separately from the power to delete it
  // permanently. But it does depend on DEMAND_UPDATE: archiving is a decision about a
  // demand someone is trusted to manage, so a profile that can only read, comment or
  // delete has no business hiding one from the board either — see ArchiveDemand.
  { code: 'DEMAND_ARCHIVE', module: 'DEMAND', action: 'ARCHIVE', description: 'Arquivar e desarquivar demandas', dependsOn: 'DEMAND_UPDATE' },
  // Also a child of DEMAND_UPDATE: deleting is a decision about a demand someone is
  // trusted to manage, the same reasoning DEMAND_ARCHIVE follows — see DeleteDemand.
  { code: 'DEMAND_DELETE', module: 'DEMAND', action: 'DELETE', description: 'Excluir demandas', dependsOn: 'DEMAND_UPDATE' },
  { code: 'DEMAND_BE_ASSIGNEE', module: 'DEMAND', action: 'BE_ASSIGNEE', description: 'Poder ser responsável por uma demanda' },
  { code: 'DEMAND_COMMENT', module: 'DEMAND', action: 'COMMENT', description: 'Comentar em demandas' },
  // Only the ability to opt in: which demands someone actually follows is a personal
  // choice stored per user (demand_watchers), so two people with this same permission can
  // follow entirely different cards. The responsible needs none of it — they are notified
  // of changes to their own demands by default.
  { code: 'DEMAND_WATCH', module: 'DEMAND', action: 'WATCH', description: 'Ativar notificações de qualquer demanda que puder acessar' },

  { code: 'USER_ACCESS', module: 'USER', action: 'ACCESS', description: 'Acessar a gestão de usuários' },
  { code: 'USER_CREATE', module: 'USER', action: 'CREATE', description: 'Cadastrar novos usuários' },
  { code: 'USER_UPDATE', module: 'USER', action: 'UPDATE', description: 'Editar usuários existentes' },
  // A child of USER_UPDATE, the same shape as DEMAND_ARCHIVE/DEMAND_DELETE: excluding
  // someone is a decision about a user's account a profile is trusted to manage, and it
  // is a soft delete — the row survives with `active: false` — so it is really one more
  // administrative edit, just one that also asks what happens to their demands.
  { code: 'USER_DELETE', module: 'USER', action: 'DELETE', description: 'Excluir usuários (soft delete)', dependsOn: 'USER_UPDATE' },

  { code: 'PROJECT_ACCESS', module: 'PROJECT', action: 'ACCESS', description: 'Acessar projetos dos quais participa' },
  { code: 'PROJECT_ACCESS_ALL', module: 'PROJECT', action: 'ACCESS_ALL', description: 'Acessar todos os projetos, independente de alocação' },
  { code: 'PROJECT_CREATE', module: 'PROJECT', action: 'CREATE', description: 'Cadastrar novos projetos' },
  { code: 'PROJECT_UPDATE', module: 'PROJECT', action: 'UPDATE', description: 'Editar projetos existentes' },
  { code: 'PROJECT_MANAGE_MEMBERS', module: 'PROJECT', action: 'MANAGE_MEMBERS', description: 'Gerenciar alocação de usuários em projetos' },
  { code: 'PROJECT_MANAGE_INTEGRATION', module: 'PROJECT', action: 'MANAGE_INTEGRATION', description: 'Gerar e revogar credenciais de integração do projeto' },

  { code: 'ROLE_ACCESS', module: 'ROLE', action: 'ACCESS', description: 'Acessar a gestão de perfis' },
  { code: 'ROLE_CREATE', module: 'ROLE', action: 'CREATE', description: 'Cadastrar novos perfis' },
  { code: 'ROLE_UPDATE', module: 'ROLE', action: 'UPDATE', description: 'Editar perfis e suas permissões' },

  // Visibility is layered by what an entry is about, never by who holds a role: project
  // activity follows project access, and the two children widen the view to
  // administrative activity and to technical events.
  { code: 'LOG_ACCESS', module: 'LOG', action: 'ACCESS', description: 'Acessar os logs de atividade dos projetos visíveis' },
  { code: 'LOG_VIEW_ORGANIZATION', module: 'LOG', action: 'VIEW_ORGANIZATION', description: 'Ver atividade administrativa: usuários, perfis e sessões' },
  { code: 'LOG_VIEW_SYSTEM', module: 'LOG', action: 'VIEW_SYSTEM', description: 'Ver logs de sistema: acessos negados, regras recusadas e erros' },

  // Using the assistant sends what the actor can already see to an external model and
  // spends a shared quota — a capability worth granting on purpose. What a suggestion may
  // become stays governed by the demand permissions: a draft turns into a demand only
  // through DEMAND_CREATE, a planned checklist only through DEMAND_UPDATE.
  { code: 'ASSISTANT_ACCESS', module: 'ASSISTANT', action: 'ACCESS', description: 'Usar o assistente de IA (Ação rápida)' },
  { code: 'ASSISTANT_MANAGE', module: 'ASSISTANT', action: 'MANAGE', description: 'Ativar o assistente de IA, escolher o modelo e trocar a chave da API' },
];

const BY_CODE = new Map<PermissionCode, PermissionDefinition>(
  PERMISSION_CATALOG.map((p) => [p.code, p]),
);

export function isPermissionCode(value: string): value is PermissionCode {
  return BY_CODE.has(value as PermissionCode);
}

export function permissionDefinition(code: PermissionCode): PermissionDefinition {
  const found = BY_CODE.get(code);
  if (!found) {
    throw DomainError.invariant('UNKNOWN_PERMISSION', `Permissão desconhecida: ${code}`);
  }
  return found;
}

export function accessPermissionOf(module: PermissionModule): PermissionCode {
  return `${module}_ACCESS` as PermissionCode;
}

export function moduleOf(code: PermissionCode): PermissionModule {
  return permissionDefinition(code).module;
}
