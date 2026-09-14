import { describe, expect, it } from 'vitest';
import { CalendarDate } from '../../src/shared/domain/calendar-date';
import { Uuid } from '../../src/shared/domain/identifier';
import { ChecklistItem } from '../../src/modules/demands/domain/checklist-item';
import { Demand } from '../../src/modules/demands/domain/demand';
import { type DEMAND_STATUSES } from '../../src/modules/demands/domain/demand-status';
import { RichText } from '../../src/modules/demands/domain/rich-text';

function makeDemand(status: (typeof DEMAND_STATUSES)[number] = 'NOT_STARTED'): Demand {
  return Demand.create({
    projectUuid: Uuid.generate(),
    title: 'Revisar fluxo de cadastro',
    description: RichText.fromSanitizedHtml('<p>Reduzir o formulário para uma etapa.</p>'),
    dueDate: CalendarDate.fromISO('2026-12-01'),
    responsibleUserUuid: Uuid.generate(),
    createdByUserUuid: Uuid.generate(),
    status,
  });
}

function add(demand: Demand, title: string): ChecklistItem {
  const item = ChecklistItem.create({ title, position: demand.nextChecklistPosition() });
  demand.addChecklistItem(item);
  return item;
}

describe('Demand checklist', () => {
  it('keeps items in the order they were added', () => {
    const demand = makeDemand();
    add(demand, 'Primeiro');
    add(demand, 'Segundo');
    add(demand, 'Terceiro');

    expect(demand.checklist.map((item) => item.title)).toEqual([
      'Primeiro',
      'Segundo',
      'Terceiro',
    ]);
  });

  it('ticks and unticks an item', () => {
    const demand = makeDemand();
    const item = add(demand, 'Integrar consulta de CEP');

    demand.setChecklistItemDone(item.uuid, true);
    expect(demand.checklist[0]?.done).toBe(true);

    demand.setChecklistItemDone(item.uuid, false);
    expect(demand.checklist[0]?.done).toBe(false);
  });

  it('renames and removes items', () => {
    const demand = makeDemand();
    const first = add(demand, 'Rascunho');
    add(demand, 'Outro item');

    demand.renameChecklistItem(first.uuid, 'Título revisado');
    expect(demand.checklist[0]?.title).toBe('Título revisado');

    demand.removeChecklistItem(first.uuid);
    expect(demand.checklist.map((item) => item.title)).toEqual(['Outro item']);
  });

  it('rejects an empty item', () => {
    const demand = makeDemand();
    expect(() => add(demand, '   ')).toThrowError(/checklist/i);
  });

  it('reports an unknown item as not found rather than ignoring it', () => {
    const demand = makeDemand();
    expect(() => demand.setChecklistItemDone(Uuid.generate(), true)).toThrowError(
      /não encontrado/i,
    );
    expect(() => demand.removeChecklistItem(Uuid.generate())).toThrowError(/não encontrado/i);
  });

  /** The cap is what keeps a checklist from turning into a second backlog. */
  it('caps the list', () => {
    const demand = makeDemand();
    for (let index = 0; index < 50; index += 1) {
      add(demand, `Item ${index}`);
    }
    expect(() => add(demand, 'Um a mais')).toThrowError(/50 itens/i);
  });

  /**
   * Production freezes the whole record, and the checklist is part of it. Allowing a
   * tick here would let the delivered scope be rewritten after release.
   */
  it('refuses every checklist change on a demand in production', () => {
    const demand = makeDemand('IN_PROGRESS');
    const item = add(demand, 'Item existente');
    demand.moveTo('PRODUCTION');

    expect(() => add(demand, 'Novo item')).toThrowError(/produção/i);
    expect(() => demand.setChecklistItemDone(item.uuid, true)).toThrowError(/produção/i);
    expect(() => demand.renameChecklistItem(item.uuid, 'Outro')).toThrowError(/produção/i);
    expect(() => demand.removeChecklistItem(item.uuid)).toThrowError(/produção/i);
  });
});
