import { describe, expect, it } from 'vitest';
import type { LogEntry } from '@/lib/api/types';
import {
  actionVisual,
  formatChangeValue,
  groupByDay,
  hasDetails,
  metadataItems,
  sentenceFor,
  statusOf,
} from './logPresentation';

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    uuid: crypto.randomUUID(),
    occurredAt: new Date(2026, 8, 10, 14, 30).toISOString(),
    category: 'ACTIVITY',
    level: 'INFO',
    action: 'demand.updated',
    summary: 'Editou o título da demanda "Portal"',
    actor: { uuid: crypto.randomUUID(), name: 'Joana Lima' },
    subject: { type: 'DEMAND', uuid: crypto.randomUUID(), label: 'Portal' },
    project: { uuid: crypto.randomUUID(), name: 'Portal do Cliente' },
    changes: [],
    metadata: null,
    requestId: null,
    ...overrides,
  };
}

describe('sentenceFor', () => {
  it('drops the demand name inside the demand, where it is already on screen', () => {
    const edit = entry({
      changes: [
        { field: 'title', from: 'A', to: 'B' },
        { field: 'dueDate', from: '2026-09-01', to: '2026-09-30' },
      ],
    });
    expect(sentenceFor(edit, 'subject')).toBe('editou o título e o prazo');
    expect(sentenceFor(edit, 'full')).toBe('editou o título da demanda "Portal"');
  });

  it('names checklist items from the captured metadata', () => {
    const checked = entry({
      action: 'demand.checklist_item_checked',
      metadata: { item: { uuid: crypto.randomUUID(), title: 'Revisar contraste' } },
    });
    expect(sentenceFor(checked, 'subject')).toBe('concluiu "Revisar contraste"');
  });

  it('leaves a status change to the pills and keeps only the subject in words', () => {
    const moved = entry({
      action: 'demand.status_changed',
      summary: 'Moveu a demanda "Portal" de Em andamento para Pausada',
      changes: [{ field: 'status', from: 'IN_PROGRESS', to: 'PAUSED' }],
    });
    expect(sentenceFor(moved, 'subject')).toBe('moveu a demanda');
    expect(sentenceFor(moved, 'full')).toBe('moveu a demanda "Portal"');
  });

  it('falls back to the server sentence for an action it does not know', () => {
    const unknown = entry({ action: 'demand.archived', summary: 'Arquivou a demanda "Portal"' });
    expect(sentenceFor(unknown, 'subject')).toBe('arquivou a demanda "Portal"');
  });

  it('shows a system event message as written', () => {
    const refused = entry({
      category: 'SYSTEM',
      level: 'WARNING',
      action: 'domain.rule_rejected',
      summary: 'Demanda em produção não pode mudar de status.',
    });
    expect(sentenceFor(refused, 'full')).toBe('Demanda em produção não pode mudar de status.');
  });
});

describe('formatChangeValue', () => {
  it('reads statuses and dates the way the rest of the interface does', () => {
    expect(formatChangeValue('status', 'IN_REVIEW')).toBe('Em homologação');
    expect(formatChangeValue('dueDate', '2026-09-30')).toBe('30/09/2026');
    expect(formatChangeValue('responsible', null)).toBe('—');
  });

  it('does not treat an arbitrary string as a status', () => {
    expect(statusOf('toString')).toBeNull();
    expect(formatChangeValue('status', 'ARCHIVED')).toBe('ARCHIVED');
  });
});

describe('metadataItems', () => {
  it('reduces references to their captured names and never shows identifiers', () => {
    const items = metadataItems({
      member: { uuid: crypto.randomUUID(), name: 'Caio Ramos' },
      attachment: { uuid: crypto.randomUUID(), name: 'print.png', mimeType: 'image/png', sizeBytes: 2048 },
      granted: ['DEMAND_COMMENT', 'LOG_ACCESS'],
      http: { method: 'PATCH', path: '/api/demands/x/status', status: 403 },
      stack: 'Error: boom',
    });

    expect(items.map((item) => item.key)).toEqual(['member', 'attachment', 'granted']);
    expect(items[0]).toMatchObject({ label: 'Pessoa', value: 'Caio Ramos' });
    expect(items[1]!.value).toMatch(/^print\.png \(/);
    expect(items[2]!.value).toEqual(['DEMAND_COMMENT', 'LOG_ACCESS']);
    expect(JSON.stringify(items)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it('skips empty lists', () => {
    expect(metadataItems({ revoked: [] })).toEqual([]);
  });
});

describe('actionVisual', () => {
  it('uses the catalog tone, and the level for anything unknown', () => {
    expect(actionVisual({ action: 'demand.deleted', level: 'INFO' }).tone).toBe('danger');
    expect(actionVisual({ action: 'queue.stalled', level: 'ERROR' }).tone).toBe('danger');
    expect(actionVisual({ action: 'queue.slow', level: 'WARNING' }).tone).toBe('warning');
    expect(actionVisual({ action: 'queue.ok', level: 'INFO' }).tone).toBe('neutral');
  });
});

describe('hasDetails', () => {
  it('is false only when there is nothing to expand', () => {
    expect(hasDetails(entry({ action: 'demand.created' }))).toBe(false);
    expect(hasDetails(entry({ requestId: 'req-1' }))).toBe(true);
    expect(hasDetails(entry({ changes: [{ field: 'title', from: 'A', to: 'B' }] }))).toBe(true);
  });
});

describe('groupByDay', () => {
  it('groups the newest-first stream into contiguous days', () => {
    const now = new Date(2026, 8, 10, 18, 0);
    const groups = groupByDay(
      [
        entry({ occurredAt: new Date(2026, 8, 10, 17, 0).toISOString() }),
        entry({ occurredAt: new Date(2026, 8, 10, 9, 0).toISOString() }),
        entry({ occurredAt: new Date(2026, 8, 9, 22, 0).toISOString() }),
      ],
      now,
    );
    expect(groups.map((group) => [group.label, group.entries.length])).toEqual([
      ['Hoje', 2],
      ['Ontem', 1],
    ]);
  });
});
