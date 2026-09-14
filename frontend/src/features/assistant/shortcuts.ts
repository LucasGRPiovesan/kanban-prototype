import { CalendarClock, FileText, ListChecks, type LucideIcon, ShieldAlert, SquarePen } from 'lucide-react';
import type { AssistantAction, AssistantCommand, PermissionCode } from '@/lib/api/types';

export type ComposeAction = 'CREATE_DEMAND' | 'PLAN_CHECKLIST';

export interface Shortcut {
  action: AssistantAction;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Mirrors the server: the permission the action's result is applied under. */
  permissions: PermissionCode[];
  /** `none` runs on click; the others open a composer first. */
  input: 'none' | 'prompt' | 'demand';
  placeholder?: string;
  examples?: string[];
}

/**
 * The quick actions, in the order a manager's day asks for them: capture new work, report
 * on it, run the daily, decide what to attack, break work down, and ask anything else.
 */
export const SHORTCUTS: Shortcut[] = [
  {
    action: 'CREATE_DEMAND',
    label: 'Nova demanda',
    description: 'Descreva em uma frase; a IA preenche o cadastro para você revisar.',
    icon: SquarePen,
    permissions: ['DEMAND_ACCESS', 'DEMAND_CREATE'],
    input: 'prompt',
    placeholder:
      'Ex.: Criar a recuperação de senha no Portal do Cliente para a Beatriz até sexta, com validação de e-mail e token.',
    examples: [
      'Recuperação de senha no Portal do Cliente para a Beatriz até sexta, com checklist.',
      'Bug urgente no App de Logística: a foto do comprovante não sobe no Android. Para o Lucas, até amanhã.',
      'Relatório de SLA por transportadora na Plataforma de Dados até o fim do mês.',
    ],
  },
  {
    action: 'EXECUTIVE_REPORT',
    label: 'Relatório executivo',
    description: 'Situação, entregas, riscos e recomendações, pronto para a liderança.',
    icon: FileText,
    permissions: ['DEMAND_ACCESS'],
    input: 'none',
  },
  {
    action: 'DAILY_SUMMARY',
    label: 'Resumo da daily',
    description: 'O que mudou desde o último dia útil, o foco de hoje e os impedimentos.',
    icon: CalendarClock,
    permissions: ['DEMAND_ACCESS'],
    input: 'none',
  },
  {
    action: 'RISK_ANALYSIS',
    label: 'Riscos e prioridades',
    description: 'O que atacar primeiro, por quê, e quem está sobrecarregado.',
    icon: ShieldAlert,
    permissions: ['DEMAND_ACCESS'],
    input: 'none',
  },
  {
    action: 'PLAN_CHECKLIST',
    label: 'Planejar checklist',
    description: 'Quebre uma demanda em passos verificáveis e escolha quais adicionar.',
    icon: ListChecks,
    permissions: ['DEMAND_ACCESS', 'DEMAND_UPDATE'],
    input: 'demand',
  },
];

export function shortcutFor(action: AssistantAction): Shortcut {
  return SHORTCUTS.find((shortcut) => shortcut.action === action)!;
}

export function availableShortcuts(can: (permission: PermissionCode) => boolean): Shortcut[] {
  return SHORTCUTS.filter((shortcut) => shortcut.permissions.every(can));
}

/** What the waiting screen says, step by step, while a command runs. */
export function progressSteps(command: AssistantCommand | undefined): string[] {
  switch (command?.action) {
    case undefined:
      return ['Entendendo o pedido', 'Lendo as demandas que você pode ver', 'Consultando o Gemini', 'Conferindo a resposta'];
    case 'CREATE_DEMAND':
      return ['Lendo projetos e pessoas elegíveis', 'Interpretando o pedido', 'Conferindo projeto, responsável e prazo'];
    case 'PLAN_CHECKLIST':
      return ['Lendo a demanda e o checklist atual', 'Quebrando em passos', 'Removendo o que já existe'];
    default:
      return ['Lendo as demandas que você pode ver', 'Cruzando prazos, status e histórico', 'Consultando o Gemini', 'Conferindo as citações'];
  }
}
