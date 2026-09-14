import { type ActivityRecord, type FieldChange } from '../../../shared/application/activity-log.port';

const SUMMARY_MAX = 500;

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'Não iniciada',
  IN_PROGRESS: 'Em andamento',
  PAUSED: 'Pausada',
  IN_REVIEW: 'Em homologação',
  PRODUCTION: 'Em produção',
};

const FIELD_LABELS: Record<string, string> = {
  title: 'título',
  description: 'descrição',
  dueDate: 'prazo',
  responsible: 'responsável',
  project: 'projeto',
  name: 'nome',
  role: 'perfil',
  enabled: 'situação',
  model: 'modelo',
  apiKey: 'chave de API',
};

/**
 * One readable sentence per entry, generated once, at write time.
 *
 * Stored rather than rendered on read for two reasons. It is what the Logs screen's text
 * search matches against, so it has to exist as a column. And it freezes the wording of
 * the moment: the labels it quotes are the snapshots taken when the event happened.
 *
 * The frontend renders a richer version from the structured fields — status badges,
 * before/after values — and falls back to this text for anything it does not know.
 */
export function summarizeActivity(record: ActivityRecord): string {
  const label = quote(record.subject.label);
  return truncate(sentence(record, label));
}

function sentence(record: ActivityRecord, label: string): string {
  switch (record.action) {
    case 'demand.created':
      return `Criou a demanda ${label}`;
    case 'demand.updated':
      return `Editou ${fieldList(record.changes)} da demanda ${label}`;
    case 'demand.responsible_changed': {
      const change = changeOf(record, 'responsible');
      return `Alterou o responsável da demanda ${label} de ${change.from ?? '—'} para ${change.to ?? '—'}`;
    }
    case 'demand.transferred': {
      const change = changeOf(record, 'project');
      return `Transferiu a demanda ${label} de ${change.from ?? '—'} para ${change.to ?? '—'}`;
    }
    case 'demand.status_changed': {
      const change = changeOf(record, 'status');
      return `Moveu a demanda ${label} de ${statusLabel(change.from)} para ${statusLabel(change.to)}`;
    }
    case 'demand.deleted':
      return `Excluiu a demanda ${label}`;
    case 'demand.archived':
      return `Arquivou a demanda ${label}`;
    case 'demand.unarchived':
      return `Desarquivou a demanda ${label}`;
    case 'demand.checklist_item_added':
      return `Adicionou o item ${quote(nested(record, 'item', 'title'))} ao checklist de ${label}`;
    case 'demand.checklist_item_checked':
      return `Concluiu o item ${quote(nested(record, 'item', 'title'))} de ${label}`;
    case 'demand.checklist_item_unchecked':
      return `Reabriu o item ${quote(nested(record, 'item', 'title'))} de ${label}`;
    case 'demand.checklist_item_renamed': {
      const change = changeOf(record, 'title');
      return `Renomeou o item ${quote(change.from)} para ${quote(change.to)} em ${label}`;
    }
    case 'demand.checklist_item_removed':
      return `Removeu o item ${quote(nested(record, 'item', 'title'))} do checklist de ${label}`;
    case 'demand.attachment_added':
      return `Anexou ${quote(nested(record, 'attachment', 'name'))} à demanda ${label}`;
    case 'demand.attachment_removed':
      return `Removeu o anexo ${quote(nested(record, 'attachment', 'name'))} da demanda ${label}`;
    case 'demand.comment_added':
      return `Comentou na demanda ${label}`;
    case 'demand.comment_edited':
      return `Editou um comentário na demanda ${label}`;
    case 'demand.comment_deleted':
      return `Excluiu um comentário da demanda ${label}`;

    case 'project.created':
      return `Criou o projeto ${label}`;
    case 'project.updated':
      return `Editou ${fieldList(record.changes)} do projeto ${label}`;
    case 'project.activated':
      return `Reativou o projeto ${label}`;
    case 'project.deactivated':
      return `Desativou o projeto ${label}`;
    case 'project.member_added':
      return `Alocou ${nested(record, 'member', 'name') ?? 'um usuário'} no projeto ${label}`;
    case 'project.member_removed':
      return `Removeu ${nested(record, 'member', 'name') ?? 'um usuário'} do projeto ${label}`;
    case 'project.integration_credential_generated':
      return `Gerou credenciais de integração para o projeto ${label} (${apiKeyOf(record)})`;
    case 'project.integration_credential_revoked':
      return `Revogou as credenciais de integração do projeto ${label} (${apiKeyOf(record)})`;

    case 'user.created':
      return `Cadastrou o usuário ${label}`;
    case 'user.updated':
      return `Editou ${fieldList(record.changes)} do usuário ${label}`;
    case 'user.activated':
      return `Reativou o usuário ${label}`;
    case 'user.deactivated':
      return `Desativou o usuário ${label}`;
    case 'user.deleted':
      return `Excluiu o usuário ${label}`;
    case 'user.restored':
      return `Reverteu a exclusão do usuário ${label}`;
    case 'session.started':
      return 'Iniciou uma sessão';
    case 'session.ended':
      return 'Encerrou a sessão';

    case 'role.created':
      return `Criou o perfil ${label}`;
    case 'role.updated':
      return `Editou ${fieldList(record.changes)} do perfil ${label}`;
    case 'role.permissions_changed': {
      const granted = listOf(record, 'granted').length;
      const revoked = listOf(record, 'revoked').length;
      return `Alterou as permissões do perfil ${label} (+${granted} concedidas, −${revoked} revogadas)`;
    }
    case 'role.activated':
      return `Reativou o perfil ${label}`;
    case 'role.deactivated':
      return `Desativou o perfil ${label}`;

    case 'assistant.settings_updated':
      return `Alterou ${fieldList(record.changes)} do assistente de IA`;
  }
}

function changeOf(record: ActivityRecord, field: string): FieldChange {
  return record.changes?.find((change) => change.field === field) ?? { field, from: null, to: null };
}

function apiKeyOf(record: ActivityRecord): string {
  const value = record.metadata?.apiKey;
  return typeof value === 'string' ? value : 'uma credencial';
}

function nested(record: ActivityRecord, key: string, property: string): string | null {
  const value = record.metadata?.[key];
  if (value && typeof value === 'object' && property in value) {
    const inner = (value as Record<string, unknown>)[property];
    return typeof inner === 'string' ? inner : null;
  }
  return null;
}

function listOf(record: ActivityRecord, key: string): unknown[] {
  const value = record.metadata?.[key];
  return Array.isArray(value) ? value : [];
}

function fieldList(changes: FieldChange[] | undefined): string {
  const names = (changes ?? []).map((change) => FIELD_LABELS[change.field] ?? change.field);
  if (names.length === 0) {
    return 'os dados';
  }
  if (names.length === 1) {
    return `o ${names[0]}`;
  }
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

function statusLabel(value: string | null): string {
  return value ? (STATUS_LABELS[value] ?? value) : '—';
}

function quote(value: string | null | undefined): string {
  return value ? `"${value.length > 120 ? `${value.slice(0, 117)}...` : value}"` : '""';
}

function truncate(text: string): string {
  return text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX - 3)}...` : text;
}
