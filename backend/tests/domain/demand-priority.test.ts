import { describe, expect, it } from 'vitest';
import { CalendarDate } from '../../src/shared/domain/calendar-date';
import { DomainError } from '../../src/shared/domain/errors';
import { Uuid } from '../../src/shared/domain/identifier';
import { Demand } from '../../src/modules/demands/domain/demand';
import { assertDemandPriority, isDemandPriority } from '../../src/modules/demands/domain/demand-priority';
import { RichText } from '../../src/modules/demands/domain/rich-text';

function makeDemand(priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'): Demand {
  return Demand.create({
    projectUuid: Uuid.generate(),
    title: 'Implementar tela de login',
    description: RichText.fromSanitizedHtml('<p>Desenvolver a tela de login conforme o protótipo.</p>'),
    dueDate: CalendarDate.fromISO('2026-12-01'),
    responsibleUserUuid: Uuid.generate(),
    createdByUserUuid: Uuid.generate(),
    priority,
  });
}

describe('Demand priority', () => {
  it('defaults to MEDIUM when none is given', () => {
    expect(makeDemand().priority).toBe('MEDIUM');
  });

  it('accepts an explicit priority at creation', () => {
    expect(makeDemand('URGENT').priority).toBe('URGENT');
  });

  it('changes freely in any direction — unlike status, priority has no lifecycle', () => {
    const demand = makeDemand('LOW');
    demand.changePriority('URGENT');
    expect(demand.priority).toBe('URGENT');
    demand.changePriority('LOW');
    expect(demand.priority).toBe('LOW');
  });

  it('is frozen once the demand reaches production, like every other field', () => {
    const demand = makeDemand('MEDIUM');
    demand.moveTo('PRODUCTION');
    expect(() => demand.changePriority('URGENT')).toThrowError(/produção/i);
  });

  it('rejects an unknown priority string', () => {
    expect(() => Demand.assertPriority('CRITICAL')).toThrowError(DomainError);
    expect(Demand.assertPriority('HIGH')).toBe('HIGH');
  });

  it('isDemandPriority narrows only the four known values', () => {
    expect(isDemandPriority('LOW')).toBe(true);
    expect(isDemandPriority('NORMAL')).toBe(false);
  });

  it('assertDemandPriority throws INVALID_DEMAND_PRIORITY on an unknown value', () => {
    try {
      assertDemandPriority('WHATEVER');
      expect.unreachable();
    } catch (error) {
      expect((error as DomainError).code).toBe('INVALID_DEMAND_PRIORITY');
    }
  });
});
