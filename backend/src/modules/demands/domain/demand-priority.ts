import { DomainError } from '../../../shared/domain/errors';

export const DEMAND_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

export type DemandPriorityValue = (typeof DEMAND_PRIORITIES)[number];

export function isDemandPriority(value: string): value is DemandPriorityValue {
  return (DEMAND_PRIORITIES as readonly string[]).includes(value);
}

/**
 * Unlike status, priority carries no lifecycle or transition rules — it is a plain
 * classification, freely reassignable in any direction, gated by nothing but
 * DEMAND_UPDATE like any other field. `MEDIUM` is the default so a demand created
 * without an opinion on urgency reads as "normal", not as an empty field.
 */
export function assertDemandPriority(value: string): DemandPriorityValue {
  if (!isDemandPriority(value)) {
    throw DomainError.validation('INVALID_DEMAND_PRIORITY', `Prioridade inválida: "${value}".`);
  }
  return value;
}
