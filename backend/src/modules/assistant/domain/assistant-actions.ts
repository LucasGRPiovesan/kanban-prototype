import { type PermissionCode } from '../../iam/domain/permission';

/**
 * Everything the assistant can be asked for. Closed on purpose: a free-form agent that
 * "does whatever the model decides" cannot be authorized, tested or explained.
 */
export const ASSISTANT_ACTIONS = [
  'CREATE_DEMAND',
  'EXECUTIVE_REPORT',
  'DAILY_SUMMARY',
  'RISK_ANALYSIS',
  'PLAN_CHECKLIST',
  'ASK_BOARD',
] as const;

export type AssistantAction = (typeof ASSISTANT_ACTIONS)[number];

/** Actions whose answer is a written text, as opposed to a structured proposal. */
export const WRITTEN_ACTIONS = ['EXECUTIVE_REPORT', 'DAILY_SUMMARY', 'RISK_ANALYSIS', 'ASK_BOARD'] as const;
export type WrittenAction = (typeof WRITTEN_ACTIONS)[number];

export function isWrittenAction(action: AssistantAction): action is WrittenAction {
  return (WRITTEN_ACTIONS as readonly string[]).includes(action);
}

/**
 * What each action needs beyond ASSISTANT_ACCESS: the permission its result will be
 * applied under. Reading needs DEMAND_ACCESS, like the board; a draft is only worth
 * producing for someone who may save it, and a checklist plan for someone who may edit.
 * The assistant never grants itself more than the person asking holds.
 */
export const ACTION_PERMISSIONS: Record<AssistantAction, readonly PermissionCode[]> = {
  CREATE_DEMAND: ['DEMAND_ACCESS', 'DEMAND_CREATE'],
  EXECUTIVE_REPORT: ['DEMAND_ACCESS'],
  DAILY_SUMMARY: ['DEMAND_ACCESS'],
  RISK_ANALYSIS: ['DEMAND_ACCESS'],
  PLAN_CHECKLIST: ['DEMAND_ACCESS', 'DEMAND_UPDATE'],
  ASK_BOARD: ['DEMAND_ACCESS'],
};

export const ACTION_LABELS: Record<AssistantAction, string> = {
  CREATE_DEMAND: 'Nova demanda',
  EXECUTIVE_REPORT: 'Relatório executivo',
  DAILY_SUMMARY: 'Resumo da daily',
  RISK_ANALYSIS: 'Riscos e prioridades',
  PLAN_CHECKLIST: 'Planejar checklist',
  ASK_BOARD: 'Pergunta ao quadro',
};
