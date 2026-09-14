import { describe, expect, it } from 'vitest';
import { CalendarDate } from '../../src/shared/domain/calendar-date';
import { DomainError } from '../../src/shared/domain/errors';
import { Uuid } from '../../src/shared/domain/identifier';
import { Demand } from '../../src/modules/demands/domain/demand';
import { DEMAND_STATUSES, demandState } from '../../src/modules/demands/domain/demand-status';
import { RichText } from '../../src/modules/demands/domain/rich-text';

function makeDemand(status: (typeof DEMAND_STATUSES)[number] = 'NOT_STARTED'): Demand {
  return Demand.create({
    projectUuid: Uuid.generate(),
    title: 'Implementar tela de login',
    description: RichText.fromSanitizedHtml('<p>Desenvolver a tela de login conforme o protótipo.</p>'),
    dueDate: CalendarDate.fromISO('2026-12-01'),
    responsibleUserUuid: Uuid.generate(),
    createdByUserUuid: Uuid.generate(),
    status,
  });
}

describe('Demand lifecycle (State Pattern)', () => {
  it('allows every transition between non-terminal states', () => {
    const nonTerminal = DEMAND_STATUSES.filter((status) => status !== 'PRODUCTION');

    for (const from of nonTerminal) {
      for (const to of nonTerminal) {
        const demand = makeDemand(from);
        expect(() => demand.moveTo(to)).not.toThrow();
        expect(demand.status).toBe(to);
      }
    }
  });

  it('allows entering production from any non-terminal state', () => {
    for (const from of DEMAND_STATUSES.filter((s) => s !== 'PRODUCTION')) {
      const demand = makeDemand(from);
      demand.moveTo('PRODUCTION');
      expect(demand.status).toBe('PRODUCTION');
      expect(demand.isTerminal).toBe(true);
    }
  });

  // The rule the specification singles out.
  it('refuses to leave production, whatever the target', () => {
    for (const target of DEMAND_STATUSES.filter((s) => s !== 'PRODUCTION')) {
      const demand = makeDemand('PRODUCTION');
      expect(() => demand.moveTo(target)).toThrowError(DomainError);

      try {
        demand.moveTo(target);
      } catch (error) {
        expect((error as DomainError).code).toBe('DEMAND_IN_PRODUCTION_IS_TERMINAL');
        expect((error as DomainError).kind).toBe('FORBIDDEN');
      }
      // The aggregate is unchanged by the rejected attempt.
      expect(demand.status).toBe('PRODUCTION');
    }
  });

  it('treats a move to the current status as a no-op, including in production', () => {
    const demand = makeDemand('PRODUCTION');
    expect(() => demand.moveTo('PRODUCTION')).not.toThrow();
    expect(demand.status).toBe('PRODUCTION');
  });

  it('reports terminality through canMoveTo without throwing', () => {
    expect(makeDemand('PRODUCTION').canMoveTo('IN_PROGRESS')).toBe(false);
    expect(makeDemand('IN_PROGRESS').canMoveTo('PRODUCTION')).toBe(true);
  });

  // DEMAND_MANAGE_PRODUCTION's whole effect on the domain: one boolean, handed in by
  // the use case, that only ProductionState ever looks at.
  describe('override — the DEMAND_MANAGE_PRODUCTION exception', () => {
    it('leaves production for any target when overridden', () => {
      for (const target of DEMAND_STATUSES.filter((s) => s !== 'PRODUCTION')) {
        const demand = makeDemand('PRODUCTION');
        expect(() => demand.moveTo(target, { override: true })).not.toThrow();
        expect(demand.status).toBe(target);
      }
    });

    it('reports the override through canMoveTo', () => {
      expect(makeDemand('PRODUCTION').canMoveTo('IN_PROGRESS', { override: true })).toBe(true);
    });

    it('is a no-op on non-terminal states — nothing else in the lifecycle cares about it', () => {
      const demand = makeDemand('NOT_STARTED');
      demand.moveTo('IN_PROGRESS', { override: true });
      expect(demand.status).toBe('IN_PROGRESS');
    });

    it('still treats same-status as a no-op regardless of override', () => {
      const demand = makeDemand('PRODUCTION');
      expect(() => demand.moveTo('PRODUCTION', { override: true })).not.toThrow();
      expect(demand.status).toBe('PRODUCTION');
    });
  });

  it('marks only PRODUCTION as terminal', () => {
    for (const status of DEMAND_STATUSES) {
      expect(demandState(status).isTerminal).toBe(status === 'PRODUCTION');
    }
  });
});

describe('Demand invariants', () => {
  it('freezes the content of a demand in production', () => {
    const demand = makeDemand('PRODUCTION');

    expect(() => demand.changeTitle('Outro título')).toThrowError(/produção/i);
    expect(() =>
      demand.changeDescription(RichText.fromSanitizedHtml('<p>Outra descrição</p>')),
    ).toThrowError(/produção/i);
    expect(() => demand.changeDueDate(CalendarDate.fromISO('2027-01-01'))).toThrowError(/produção/i);
    expect(() => demand.assignResponsible(Uuid.generate())).toThrowError(/produção/i);
  });

  it('rejects an empty or over-long title', () => {
    const demand = makeDemand();
    expect(() => demand.changeTitle('  ')).toThrowError(DomainError);
    expect(() => demand.changeTitle('a'.repeat(181))).toThrowError(DomainError);
  });

  it('normalizes whitespace in the title', () => {
    const demand = makeDemand();
    demand.changeTitle('  Corrigir    bug  no   login  ');
    expect(demand.title).toBe('Corrigir bug no login');
  });

  it('rejects an unknown status string', () => {
    expect(() => Demand.assertStatus('DONE')).toThrowError(DomainError);
    expect(Demand.assertStatus('IN_REVIEW')).toBe('IN_REVIEW');
  });
});
