/**
 * The published language between the modules and the Logs module.
 *
 * Every event the system can record is named here, once: its category, the group it is
 * filtered under, what kind of subject it is about, its default severity, and the
 * permission an actor must hold for the event to be legitimate. The modules that emit
 * events and the module that stores and displays them both speak this vocabulary, so
 * neither has to know about the other.
 *
 * It lives in `shared/domain` for that reason: it is a contract, not a feature of any
 * single module, and nothing in it depends on infrastructure.
 */

export const LOG_CATEGORIES = ['ACTIVITY', 'SYSTEM'] as const;
export type LogCategory = (typeof LOG_CATEGORIES)[number];

export const LOG_LEVELS = ['INFO', 'WARNING', 'ERROR'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** `SETTING`: an installation-wide configuration, such as the assistant's. */
export const LOG_SUBJECT_TYPES = ['DEMAND', 'PROJECT', 'USER', 'ROLE', 'SETTING'] as const;
export type LogSubjectType = (typeof LOG_SUBJECT_TYPES)[number];

export type LogGroup =
  | 'DEMAND'
  | 'PROJECT'
  | 'USER'
  | 'ROLE'
  | 'SESSION'
  | 'ASSISTANT'
  | 'SECURITY'
  | 'APPLICATION';

/**
 * Who may see an entry, derived from what it is about rather than stored separately:
 * - PROJECT: follows project visibility — the same rule as the demands themselves.
 * - ORGANIZATION: administrative activity with no project (users, roles, sessions).
 * - SYSTEM: technical events.
 */
export type LogScope = 'PROJECT' | 'ORGANIZATION' | 'SYSTEM';

export interface LogActionDefinition {
  readonly code: string;
  readonly category: LogCategory;
  readonly group: LogGroup;
  readonly subjectType: LogSubjectType | null;
  readonly level: LogLevel;
  readonly label: string;
  /**
   * Permission that makes the event legitimate, as a permission code. Not enforced here
   * — use cases enforce it — but it documents the rule and lets the seed prove that its
   * invented history only contains things the seeded profiles could actually do.
   */
  readonly requiredPermission: string | null;
}

export const LOG_ACTIONS = [
  // --- Demands ------------------------------------------------------------------
  { code: 'demand.created', category: 'ACTIVITY', group: 'DEMAND', subjectType: 'DEMAND', level: 'INFO', label: 'Demanda criada', requiredPermission: 'DEMAND_CREATE' },
  { code: 'demand.updated', category: 'ACTIVITY', group: 'DEMAND', subjectType: 'DEMAND', level: 'INFO', label: 'Demanda editada', requiredPermission: 'DEMAND_UPDATE' },
  { code: 'demand.responsible_changed', category: 'ACTIVITY', group: 'DEMAND', subjectType: 'DEMAND', level: 'INFO', label: 'Responsável alterado', requiredPermission: 'DEMAND_UPDATE' },
  { code: 'demand.transferred', category: 'ACTIVITY', group: 'DEMAND', subjectType: 'DEMAND', level: 'INFO', label: 'Demanda transferida de projeto', requiredPermission: 'DEMAND_UPDATE' },
  { code: 'demand.status_changed', category: 'ACTIVITY', group: 'DEMAND', subjectType: 'DEMAND', level: 'INFO', label: 'Status alterado', requiredPermission: 'DEMAND_UPDATE' },
  { code: 'demand.deleted', category: 'ACTIVITY', group: 'DEMAND', subjectType: 'DEMAND', level: 'INFO', label: 'Demanda excluída', requiredPermission: 'DEMAND_DELETE' },
  { code: 'demand.archived', category: 'ACTIVITY', group: 'DEMAND', subjectType: 'DEMAND', level: 'INFO', label: 'Demanda arquivada', requiredPermission: 'DEMAND_ARCHIVE' },
  { code: 'demand.unarchived', category: 'ACTIVITY', group: 'DEMAND', subjectType: 'DEMAND', level: 'INFO', label: 'Demanda desarquivada', requiredPermission: 'DEMAND_ARCHIVE' },
  { code: 'demand.checklist_item_added', category: 'ACTIVITY', group: 'DEMAND', subjectType: 'DEMAND', level: 'INFO', label: 'Item de checklist adicionado', requiredPermission: 'DEMAND_UPDATE' },
  { code: 'demand.checklist_item_checked', category: 'ACTIVITY', group: 'DEMAND', subjectType: 'DEMAND', level: 'INFO', label: 'Item de checklist concluído', requiredPermission: 'DEMAND_UPDATE' },
  { code: 'demand.checklist_item_unchecked', category: 'ACTIVITY', group: 'DEMAND', subjectType: 'DEMAND', level: 'INFO', label: 'Item de checklist reaberto', requiredPermission: 'DEMAND_UPDATE' },
  { code: 'demand.checklist_item_renamed', category: 'ACTIVITY', group: 'DEMAND', subjectType: 'DEMAND', level: 'INFO', label: 'Item de checklist renomeado', requiredPermission: 'DEMAND_UPDATE' },
  { code: 'demand.checklist_item_removed', category: 'ACTIVITY', group: 'DEMAND', subjectType: 'DEMAND', level: 'INFO', label: 'Item de checklist removido', requiredPermission: 'DEMAND_UPDATE' },
  { code: 'demand.attachment_added', category: 'ACTIVITY', group: 'DEMAND', subjectType: 'DEMAND', level: 'INFO', label: 'Anexo adicionado', requiredPermission: 'DEMAND_UPDATE' },
  { code: 'demand.attachment_removed', category: 'ACTIVITY', group: 'DEMAND', subjectType: 'DEMAND', level: 'INFO', label: 'Anexo removido', requiredPermission: 'DEMAND_UPDATE' },
  { code: 'demand.comment_added', category: 'ACTIVITY', group: 'DEMAND', subjectType: 'DEMAND', level: 'INFO', label: 'Comentário adicionado', requiredPermission: 'DEMAND_COMMENT' },
  { code: 'demand.comment_edited', category: 'ACTIVITY', group: 'DEMAND', subjectType: 'DEMAND', level: 'INFO', label: 'Comentário editado', requiredPermission: 'DEMAND_COMMENT' },
  { code: 'demand.comment_deleted', category: 'ACTIVITY', group: 'DEMAND', subjectType: 'DEMAND', level: 'INFO', label: 'Comentário excluído', requiredPermission: 'DEMAND_COMMENT' },

  // --- Projects -----------------------------------------------------------------
  { code: 'project.created', category: 'ACTIVITY', group: 'PROJECT', subjectType: 'PROJECT', level: 'INFO', label: 'Projeto criado', requiredPermission: 'PROJECT_CREATE' },
  { code: 'project.updated', category: 'ACTIVITY', group: 'PROJECT', subjectType: 'PROJECT', level: 'INFO', label: 'Projeto editado', requiredPermission: 'PROJECT_UPDATE' },
  { code: 'project.activated', category: 'ACTIVITY', group: 'PROJECT', subjectType: 'PROJECT', level: 'INFO', label: 'Projeto reativado', requiredPermission: 'PROJECT_UPDATE' },
  { code: 'project.deactivated', category: 'ACTIVITY', group: 'PROJECT', subjectType: 'PROJECT', level: 'INFO', label: 'Projeto desativado', requiredPermission: 'PROJECT_UPDATE' },
  { code: 'project.member_added', category: 'ACTIVITY', group: 'PROJECT', subjectType: 'PROJECT', level: 'INFO', label: 'Membro alocado', requiredPermission: 'PROJECT_MANAGE_MEMBERS' },
  { code: 'project.member_removed', category: 'ACTIVITY', group: 'PROJECT', subjectType: 'PROJECT', level: 'INFO', label: 'Membro removido', requiredPermission: 'PROJECT_MANAGE_MEMBERS' },
  { code: 'project.integration_credential_generated', category: 'ACTIVITY', group: 'PROJECT', subjectType: 'PROJECT', level: 'INFO', label: 'Credencial de integração gerada', requiredPermission: 'PROJECT_MANAGE_INTEGRATION' },
  { code: 'project.integration_credential_revoked', category: 'ACTIVITY', group: 'PROJECT', subjectType: 'PROJECT', level: 'INFO', label: 'Credencial de integração revogada', requiredPermission: 'PROJECT_MANAGE_INTEGRATION' },

  // --- Users and sessions ---------------------------------------------------------
  { code: 'user.created', category: 'ACTIVITY', group: 'USER', subjectType: 'USER', level: 'INFO', label: 'Usuário criado', requiredPermission: 'USER_CREATE' },
  { code: 'user.updated', category: 'ACTIVITY', group: 'USER', subjectType: 'USER', level: 'INFO', label: 'Usuário editado', requiredPermission: 'USER_UPDATE' },
  { code: 'user.activated', category: 'ACTIVITY', group: 'USER', subjectType: 'USER', level: 'INFO', label: 'Usuário reativado', requiredPermission: 'USER_UPDATE' },
  { code: 'user.deactivated', category: 'ACTIVITY', group: 'USER', subjectType: 'USER', level: 'INFO', label: 'Usuário desativado', requiredPermission: 'USER_UPDATE' },
  { code: 'user.deleted', category: 'ACTIVITY', group: 'USER', subjectType: 'USER', level: 'INFO', label: 'Usuário excluído', requiredPermission: 'USER_DELETE' },
  { code: 'user.restored', category: 'ACTIVITY', group: 'USER', subjectType: 'USER', level: 'INFO', label: 'Exclusão de usuário revertida', requiredPermission: 'USER_DELETE' },
  { code: 'session.started', category: 'ACTIVITY', group: 'SESSION', subjectType: 'USER', level: 'INFO', label: 'Sessão iniciada', requiredPermission: null },
  { code: 'session.ended', category: 'ACTIVITY', group: 'SESSION', subjectType: 'USER', level: 'INFO', label: 'Sessão encerrada', requiredPermission: null },

  // --- Roles ----------------------------------------------------------------------
  { code: 'role.created', category: 'ACTIVITY', group: 'ROLE', subjectType: 'ROLE', level: 'INFO', label: 'Perfil criado', requiredPermission: 'ROLE_CREATE' },
  { code: 'role.updated', category: 'ACTIVITY', group: 'ROLE', subjectType: 'ROLE', level: 'INFO', label: 'Perfil editado', requiredPermission: 'ROLE_UPDATE' },
  { code: 'role.permissions_changed', category: 'ACTIVITY', group: 'ROLE', subjectType: 'ROLE', level: 'INFO', label: 'Permissões alteradas', requiredPermission: 'ROLE_UPDATE' },
  { code: 'role.activated', category: 'ACTIVITY', group: 'ROLE', subjectType: 'ROLE', level: 'INFO', label: 'Perfil reativado', requiredPermission: 'ROLE_UPDATE' },
  { code: 'role.deactivated', category: 'ACTIVITY', group: 'ROLE', subjectType: 'ROLE', level: 'INFO', label: 'Perfil desativado', requiredPermission: 'ROLE_UPDATE' },

  // --- Assistant ------------------------------------------------------------------
  { code: 'assistant.settings_updated', category: 'ACTIVITY', group: 'ASSISTANT', subjectType: 'SETTING', level: 'INFO', label: 'Assistente de IA reconfigurado', requiredPermission: 'ASSISTANT_MANAGE' },
  // Usage is telemetry, not a business fact: which action, which model, how long, how
  // many tokens — never the request's text, which may quote any demand on the board.
  { code: 'assistant.request_completed', category: 'SYSTEM', group: 'ASSISTANT', subjectType: null, level: 'INFO', label: 'Consulta ao assistente de IA', requiredPermission: null },
  { code: 'assistant.request_failed', category: 'SYSTEM', group: 'ASSISTANT', subjectType: null, level: 'WARNING', label: 'Falha no assistente de IA', requiredPermission: null },

  // --- System ---------------------------------------------------------------------
  { code: 'app.started', category: 'SYSTEM', group: 'APPLICATION', subjectType: null, level: 'INFO', label: 'Aplicação iniciada', requiredPermission: null },
  { code: 'security.permission_denied', category: 'SYSTEM', group: 'SECURITY', subjectType: null, level: 'WARNING', label: 'Acesso negado por permissão', requiredPermission: null },
  { code: 'domain.rule_rejected', category: 'SYSTEM', group: 'APPLICATION', subjectType: null, level: 'WARNING', label: 'Operação recusada por regra de negócio', requiredPermission: null },
  { code: 'domain.invariant_violated', category: 'SYSTEM', group: 'APPLICATION', subjectType: null, level: 'ERROR', label: 'Invariante violada', requiredPermission: null },
  { code: 'http.unhandled_error', category: 'SYSTEM', group: 'APPLICATION', subjectType: null, level: 'ERROR', label: 'Erro interno não tratado', requiredPermission: null },
  { code: 'storage.cleanup_failed', category: 'SYSTEM', group: 'APPLICATION', subjectType: null, level: 'WARNING', label: 'Falha ao remover arquivo do armazenamento', requiredPermission: null },
] as const satisfies readonly LogActionDefinition[];

type Definition = (typeof LOG_ACTIONS)[number];
export type LogAction = Definition['code'];
export type ActivityAction = Extract<Definition, { category: 'ACTIVITY' }>['code'];
export type SystemEventCode = Extract<Definition, { category: 'SYSTEM' }>['code'];

export const LOG_GROUP_LABELS: Record<LogGroup, string> = {
  DEMAND: 'Demandas',
  PROJECT: 'Projetos',
  USER: 'Usuários',
  ROLE: 'Perfis',
  SESSION: 'Sessões',
  ASSISTANT: 'Assistente de IA',
  SECURITY: 'Segurança',
  APPLICATION: 'Aplicação',
};

const BY_CODE = new Map<string, LogActionDefinition>(LOG_ACTIONS.map((def) => [def.code, def]));

export function logActionDefinition(code: string): LogActionDefinition | undefined {
  return BY_CODE.get(code);
}

export function isLogAction(code: string): code is LogAction {
  return BY_CODE.has(code);
}

export function scopeOf(definition: LogActionDefinition): LogScope {
  if (definition.category === 'SYSTEM') {
    return 'SYSTEM';
  }
  return definition.subjectType === 'DEMAND' || definition.subjectType === 'PROJECT'
    ? 'PROJECT'
    : 'ORGANIZATION';
}
