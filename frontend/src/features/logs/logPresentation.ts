import {
  AlertTriangle,
  ArrowRightLeft,
  Ban,
  Bug,
  CheckSquare,
  FolderInput,
  FolderKanban,
  HardDrive,
  Image,
  KeyRound,
  ListPlus,
  ListX,
  LogIn,
  LogOut,
  type LucideIcon,
  MessageSquare,
  MessageSquareX,
  Paperclip,
  Pencil,
  Plus,
  Power,
  PowerOff,
  ScrollText,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  UserMinus,
  UserPlus,
  UserRound,
} from 'lucide-react';
import { STATUS_PRESENTATION } from '@/features/demands/status';
import { formatFileSize, isoToBr } from '@/lib/format';
import { dayKey, dayLabel } from '@/lib/relativeTime';
import type {
  DemandStatus,
  LogEntry,
  LogFieldChange,
  LogLevel,
  LogSubjectType,
} from '@/lib/api/types';

/*
 * How a log entry reads and looks.
 *
 * The server stores a finished sentence for every entry (`summary`), and that stays the
 * fallback for anything unknown here — an action added to the catalog later still reads
 * correctly without a frontend release. What this module adds is what a sentence cannot
 * carry: an icon and a tone per action, status pills, before/after values, and phrasing
 * that drops the demand's name when the timeline is already inside that demand.
 */

export type LogTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

export const TONE_CLASSES: Record<LogTone, string> = {
  neutral: 'border-line bg-surface-muted text-muted',
  brand: 'border-brand-300 bg-brand-100 text-brand-800',
  success: 'border-success/30 bg-success-surface text-success',
  warning: 'border-warning/40 bg-warning-surface text-warning',
  danger: 'border-danger-border bg-danger-surface text-danger',
  info: 'border-status-in-progress-border bg-status-in-progress-surface text-status-in-progress',
};

interface ActionVisual {
  icon: LucideIcon;
  tone: LogTone;
}

/** Tone encodes the kind of change: creation, removal, a refusal, a failure. */
const ACTION_VISUALS: Record<string, ActionVisual> = {
  'demand.created': { icon: Plus, tone: 'success' },
  'demand.updated': { icon: Pencil, tone: 'brand' },
  'demand.responsible_changed': { icon: UserRound, tone: 'brand' },
  'demand.transferred': { icon: FolderInput, tone: 'info' },
  'demand.status_changed': { icon: ArrowRightLeft, tone: 'info' },
  'demand.deleted': { icon: Trash2, tone: 'danger' },
  'demand.checklist_item_added': { icon: ListPlus, tone: 'neutral' },
  'demand.checklist_item_checked': { icon: CheckSquare, tone: 'success' },
  'demand.checklist_item_unchecked': { icon: Square, tone: 'neutral' },
  'demand.checklist_item_renamed': { icon: Pencil, tone: 'neutral' },
  'demand.checklist_item_removed': { icon: ListX, tone: 'neutral' },
  'demand.attachment_added': { icon: Paperclip, tone: 'neutral' },
  'demand.attachment_removed': { icon: Paperclip, tone: 'neutral' },
  'demand.comment_added': { icon: MessageSquare, tone: 'brand' },
  'demand.comment_edited': { icon: MessageSquare, tone: 'neutral' },
  'demand.comment_deleted': { icon: MessageSquareX, tone: 'neutral' },

  'project.created': { icon: FolderKanban, tone: 'success' },
  'project.updated': { icon: Pencil, tone: 'brand' },
  'project.activated': { icon: Power, tone: 'success' },
  'project.deactivated': { icon: PowerOff, tone: 'warning' },
  'project.member_added': { icon: UserPlus, tone: 'success' },
  'project.member_removed': { icon: UserMinus, tone: 'warning' },
  'project.integration_credential_generated': { icon: KeyRound, tone: 'brand' },
  'project.integration_credential_revoked': { icon: KeyRound, tone: 'warning' },

  'user.created': { icon: UserPlus, tone: 'success' },
  'user.updated': { icon: Pencil, tone: 'brand' },
  'user.activated': { icon: Power, tone: 'success' },
  'user.deactivated': { icon: PowerOff, tone: 'warning' },
  'session.started': { icon: LogIn, tone: 'neutral' },
  'session.ended': { icon: LogOut, tone: 'neutral' },

  'role.created': { icon: ShieldCheck, tone: 'success' },
  'role.updated': { icon: Pencil, tone: 'brand' },
  'role.permissions_changed': { icon: KeyRound, tone: 'info' },
  'role.activated': { icon: Power, tone: 'success' },
  'role.deactivated': { icon: PowerOff, tone: 'warning' },

  'app.started': { icon: Power, tone: 'neutral' },
  'security.permission_denied': { icon: ShieldAlert, tone: 'warning' },
  'domain.rule_rejected': { icon: Ban, tone: 'warning' },
  'domain.invariant_violated': { icon: AlertTriangle, tone: 'danger' },
  'http.unhandled_error': { icon: Bug, tone: 'danger' },
  'storage.cleanup_failed': { icon: HardDrive, tone: 'warning' },

  'assistant.settings_updated': { icon: Settings2, tone: 'brand' },
  'assistant.request_completed': { icon: Sparkles, tone: 'neutral' },
  'assistant.request_failed': { icon: Sparkles, tone: 'warning' },

  'branding.logo_updated': { icon: Image, tone: 'brand' },
  'branding.logo_reset': { icon: Image, tone: 'neutral' },
};

export function actionVisual(entry: Pick<LogEntry, 'action' | 'level'>): ActionVisual {
  const known = ACTION_VISUALS[entry.action];
  if (known) {
    return known;
  }
  if (entry.level === 'ERROR') {
    return { icon: Bug, tone: 'danger' };
  }
  if (entry.level === 'WARNING') {
    return { icon: AlertTriangle, tone: 'warning' };
  }
  return { icon: ScrollText, tone: 'neutral' };
}

/**
 * Titles for system events where the filter catalog is not at hand — the demand panel
 * shows them to administrators without loading the Logs screen's filter options.
 */
export const SYSTEM_EVENT_LABELS: Record<string, string> = {
  'app.started': 'Aplicação iniciada',
  'security.permission_denied': 'Permissão negada',
  'domain.rule_rejected': 'Operação recusada por regra de negócio',
  'domain.invariant_violated': 'Invariante de domínio violada',
  'http.unhandled_error': 'Erro interno não tratado',
  'storage.cleanup_failed': 'Falha ao remover arquivo',
  'assistant.request_completed': 'Consulta ao assistente de IA',
  'assistant.request_failed': 'Falha no assistente de IA',
};

export const LEVEL_PRESENTATION: Record<LogLevel, { label: string; tone: LogTone }> = {
  INFO: { label: 'Informação', tone: 'neutral' },
  WARNING: { label: 'Alerta', tone: 'warning' },
  ERROR: { label: 'Erro', tone: 'danger' },
};

export const SUBJECT_LABELS: Record<LogSubjectType, string> = {
  DEMAND: 'Demanda',
  PROJECT: 'Projeto',
  USER: 'Usuário',
  ROLE: 'Perfil',
  SETTING: 'Configuração',
};

const FIELDS: Record<string, { label: string; phrase: string }> = {
  title: { label: 'Título', phrase: 'o título' },
  description: { label: 'Descrição', phrase: 'a descrição' },
  dueDate: { label: 'Prazo', phrase: 'o prazo' },
  responsible: { label: 'Responsável', phrase: 'o responsável' },
  project: { label: 'Projeto', phrase: 'o projeto' },
  status: { label: 'Status', phrase: 'o status' },
  name: { label: 'Nome', phrase: 'o nome' },
  role: { label: 'Perfil', phrase: 'o perfil' },
  enabled: { label: 'Situação', phrase: 'a situação' },
  model: { label: 'Modelo', phrase: 'o modelo' },
  apiKey: { label: 'Chave de API', phrase: 'a chave de API' },
};

export function fieldLabel(field: string): string {
  return FIELDS[field]?.label ?? field;
}

export function statusOf(value: string | null | undefined): DemandStatus | null {
  return value && Object.prototype.hasOwnProperty.call(STATUS_PRESENTATION, value)
    ? (value as DemandStatus)
    : null;
}

/** A change whose values were deliberately not kept — a rich-text description, say. */
export function isOpaqueChange(change: LogFieldChange): boolean {
  return change.from === null && change.to === null;
}

export function formatChangeValue(field: string, value: string | null): string {
  if (value === null || value === '') {
    return '—';
  }
  if (field === 'status') {
    const status = statusOf(value);
    return status ? STATUS_PRESENTATION[status].label : value;
  }
  if (field === 'dueDate' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return isoToBr(value.slice(0, 10));
  }
  return value;
}

/**
 * The words after the actor's name.
 *
 * `subject` is the timeline inside a demand's own panel: the demand is already on screen,
 * so repeating its title on every line would be noise. `full` is the Logs screen, where
 * the subject is exactly what the reader needs.
 */
export function sentenceFor(entry: LogEntry, variant: 'full' | 'subject'): string {
  if (entry.category === 'SYSTEM') {
    return entry.summary;
  }
  if (variant === 'subject' && entry.subject?.type === 'DEMAND') {
    const inside = describeInsideDemand(entry);
    if (inside) {
      return inside;
    }
  }
  if (entry.action === 'demand.status_changed') {
    // The pills under the sentence carry the from/to; the words only need the subject.
    return `moveu a demanda ${quote(entry.subject?.label)}`;
  }
  return lowerFirst(entry.summary);
}

function describeInsideDemand(entry: LogEntry): string | null {
  switch (entry.action) {
    case 'demand.created':
      return 'criou a demanda';
    case 'demand.updated':
      return `editou ${phraseList(entry.changes)}`;
    case 'demand.responsible_changed': {
      const change = changeOf(entry, 'responsible');
      return `trocou o responsável de ${change.from ?? '—'} para ${change.to ?? '—'}`;
    }
    case 'demand.transferred': {
      const change = changeOf(entry, 'project');
      return `transferiu a demanda de ${change.from ?? '—'} para ${change.to ?? '—'}`;
    }
    case 'demand.status_changed':
      return 'moveu a demanda';
    case 'demand.deleted':
      return 'excluiu a demanda';
    case 'demand.checklist_item_added':
      return `adicionou ${quote(metaText(entry, 'item', 'title'))} ao checklist`;
    case 'demand.checklist_item_checked':
      return `concluiu ${quote(metaText(entry, 'item', 'title'))}`;
    case 'demand.checklist_item_unchecked':
      return `reabriu ${quote(metaText(entry, 'item', 'title'))}`;
    case 'demand.checklist_item_renamed': {
      const change = changeOf(entry, 'title');
      return `renomeou ${quote(change.from)} para ${quote(change.to)} no checklist`;
    }
    case 'demand.checklist_item_removed':
      return `removeu ${quote(metaText(entry, 'item', 'title'))} do checklist`;
    case 'demand.attachment_added':
      return `anexou ${quote(metaText(entry, 'attachment', 'name'))}`;
    case 'demand.attachment_removed':
      return `removeu o anexo ${quote(metaText(entry, 'attachment', 'name'))}`;
    case 'demand.comment_added':
      return 'comentou';
    case 'demand.comment_edited':
      return 'editou um comentário';
    case 'demand.comment_deleted':
      return 'excluiu um comentário';
    default:
      return null;
  }
}

export interface MetadataItem {
  key: string;
  label: string;
  /** A list renders as chips; a string as plain text. */
  value: string | string[];
}

const METADATA_LABELS: Record<string, string> = {
  status: 'Status',
  responsible: 'Responsável',
  dueDate: 'Prazo',
  checklistItems: 'Itens de checklist',
  attachments: 'Anexos',
  role: 'Perfil',
  description: 'Descrição',
  storageKey: 'Arquivo',
  reason: 'Motivo',
  fromProject: 'Projeto de origem',
  member: 'Pessoa',
  item: 'Item',
  attachment: 'Anexo',
  comment: 'Comentário',
  permissions: 'Permissões',
  granted: 'Concedidas',
  revoked: 'Revogadas',
  apiKey: 'API key',
  source: 'Origem',
  action: 'Ação',
  model: 'Modelo',
  latencyMs: 'Tempo de resposta (ms)',
  calls: 'Chamadas ao modelo',
  inputTokens: 'Tokens de entrada',
  outputTokens: 'Tokens de saída',
  classified: 'Pedido em texto livre',
  providerStatus: 'Status HTTP do provedor',
};

const SOURCE_LABELS: Record<string, string> = { integration: 'API de integração' };

/** Keys with a dedicated rendering in the details view, kept out of the generic list. */
const STRUCTURED_METADATA_KEYS = new Set(['http', 'error', 'stack']);

/**
 * Metadata as label/value pairs a person can read.
 *
 * Nested references are reduced to the name they were captured with: `{ uuid, name }`
 * reads as the name. Identifiers are left out — they mean nothing on screen, and what the
 * entry is about is already linked from the entry itself.
 */
export function metadataItems(metadata: Record<string, unknown> | null): MetadataItem[] {
  if (!metadata) {
    return [];
  }
  const items: MetadataItem[] = [];
  for (const [key, raw] of Object.entries(metadata)) {
    if (STRUCTURED_METADATA_KEYS.has(key) || raw === null || raw === undefined) {
      continue;
    }
    const value = readableValue(key, raw);
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }
    items.push({ key, label: METADATA_LABELS[key] ?? key, value });
  }
  return items;
}

function readableValue(key: string, raw: unknown): string | string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => (typeof item === 'string' ? item : JSON.stringify(item)));
  }
  if (typeof raw === 'object' && raw !== null) {
    const record = raw as Record<string, unknown>;
    if (key === 'attachment' && typeof record.name === 'string') {
      return typeof record.sizeBytes === 'number'
        ? `${record.name} (${formatFileSize(record.sizeBytes)})`
        : record.name;
    }
    for (const property of ['name', 'title', 'excerpt']) {
      const value = record[property];
      if (typeof value === 'string') {
        return value;
      }
    }
    return JSON.stringify(record);
  }
  if (typeof raw === 'string') {
    if (key === 'source') {
      return SOURCE_LABELS[raw] ?? raw;
    }
    return formatChangeValue(key, raw);
  }
  return String(raw);
}

export interface HttpContext {
  method: string;
  path: string;
  status: number | null;
}

export function httpContextOf(entry: LogEntry): HttpContext | null {
  const http = entry.metadata?.http;
  if (!http || typeof http !== 'object') {
    return null;
  }
  const record = http as Record<string, unknown>;
  if (typeof record.method !== 'string' || typeof record.path !== 'string') {
    return null;
  }
  return {
    method: record.method,
    path: record.path,
    status: typeof record.status === 'number' ? record.status : null,
  };
}

export function errorContextOf(
  entry: LogEntry,
): { code: string | null; detail: string | null } | null {
  const error = entry.metadata?.error;
  if (!error || typeof error !== 'object') {
    return null;
  }
  const record = error as Record<string, unknown>;
  const code =
    typeof record.code === 'string' ? record.code : typeof record.name === 'string' ? record.name : null;
  const detail = typeof record.message === 'string' ? record.message : null;
  return code || detail ? { code, detail } : null;
}

export function stackOf(entry: LogEntry): string | null {
  const stack = entry.metadata?.stack;
  return typeof stack === 'string' && stack.length > 0 ? stack : null;
}

export function hasDetails(entry: LogEntry): boolean {
  return (
    entry.changes.length > 0 ||
    metadataItems(entry.metadata).length > 0 ||
    httpContextOf(entry) !== null ||
    errorContextOf(entry) !== null ||
    entry.requestId !== null
  );
}

export interface DayGroup {
  key: string;
  label: string;
  entries: LogEntry[];
}

/** Entries arrive newest first, so a day's entries are always contiguous. */
export function groupByDay(entries: LogEntry[], now: Date = new Date()): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const entry of entries) {
    const key = dayKey(entry.occurredAt);
    const current = groups[groups.length - 1];
    if (current && current.key === key) {
      current.entries.push(entry);
    } else {
      groups.push({ key, label: dayLabel(entry.occurredAt, now), entries: [entry] });
    }
  }
  return groups;
}

function changeOf(entry: LogEntry, field: string): LogFieldChange {
  return entry.changes.find((change) => change.field === field) ?? { field, from: null, to: null };
}

function metaText(entry: LogEntry, key: string, property: string): string | null {
  const value = entry.metadata?.[key];
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const inner = (value as Record<string, unknown>)[property];
    return typeof inner === 'string' ? inner : null;
  }
  return null;
}

function phraseList(changes: LogFieldChange[]): string {
  const phrases = changes.map((change) => FIELDS[change.field]?.phrase ?? change.field);
  if (phrases.length === 0) {
    return 'os dados';
  }
  if (phrases.length === 1) {
    return phrases[0]!;
  }
  return `${phrases.slice(0, -1).join(', ')} e ${phrases[phrases.length - 1]}`;
}

function quote(value: string | null | undefined): string {
  if (!value) {
    return 'um item';
  }
  return `"${value.length > 80 ? `${value.slice(0, 77)}...` : value}"`;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
