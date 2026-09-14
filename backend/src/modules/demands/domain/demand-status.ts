import { DomainError } from '../../../shared/domain/errors';

export const DEMAND_STATUSES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'PAUSED',
  'IN_REVIEW',
  'PRODUCTION',
] as const;

export type DemandStatusValue = (typeof DEMAND_STATUSES)[number];

export function isDemandStatus(value: string): value is DemandStatusValue {
  return (DEMAND_STATUSES as readonly string[]).includes(value);
}

/**
 * STATE PATTERN — the demand lifecycle.
 *
 * Each status is an object that answers for itself which transitions it allows.
 * The point is to keep transition rules out of use cases and controllers: no
 * `if (status === 'PRODUCTION')` may exist anywhere else in the codebase. Adding a
 * status, or making one terminal, is a change to this file alone.
 */
/**
 * `override` is the one input the state pattern accepts from outside itself — set by the
 * use case from the actor's DEMAND_MANAGE_PRODUCTION permission, never derived here. It
 * only ever matters to ProductionState; every other state ignores it, since nothing else
 * is terminal.
 */
export interface TransitionOptions {
  readonly override?: boolean;
}

export interface DemandState {
  readonly value: DemandStatusValue;
  readonly isTerminal: boolean;
  canTransitionTo(target: DemandState, options?: TransitionOptions): boolean;
  /** Throws a domain error when the transition is illegal; returns the next state otherwise. */
  transitionTo(target: DemandState, options?: TransitionOptions): DemandState;
}

abstract class BaseState implements DemandState {
  abstract readonly value: DemandStatusValue;
  readonly isTerminal: boolean = false;

  canTransitionTo(target: DemandState): boolean {
    return target.value !== this.value;
  }

  transitionTo(target: DemandState): DemandState {
    if (target.value === this.value) {
      return this;
    }
    if (!this.canTransitionTo(target)) {
      throw DomainError.forbidden(
        'ILLEGAL_STATUS_TRANSITION',
        `Não é possível mover a demanda de "${this.value}" para "${target.value}".`,
      );
    }
    return target;
  }
}

class NotStartedState extends BaseState {
  readonly value = 'NOT_STARTED' as const;
}

class InProgressState extends BaseState {
  readonly value = 'IN_PROGRESS' as const;
}

class PausedState extends BaseState {
  readonly value = 'PAUSED' as const;
}

class InReviewState extends BaseState {
  readonly value = 'IN_REVIEW' as const;
}

/**
 * PRODUCTION is terminal by default. This is the rule the specification singles out,
 * and it lives here — not in a controller, not in the frontend. A demand that reached
 * production leaves the board's mutable lifecycle for good, *unless* the caller carries
 * an explicit override — the one door DEMAND_MANAGE_PRODUCTION opens.
 */
class ProductionState extends BaseState {
  readonly value = 'PRODUCTION' as const;
  override readonly isTerminal = true;

  override canTransitionTo(_target: DemandState, options?: TransitionOptions): boolean {
    return Boolean(options?.override);
  }

  override transitionTo(target: DemandState, options?: TransitionOptions): DemandState {
    if (target.value === this.value) {
      return this;
    }
    if (!options?.override) {
      throw DomainError.forbidden(
        'DEMAND_IN_PRODUCTION_IS_TERMINAL',
        'Demandas em produção não podem mudar de status.',
      );
    }
    return target;
  }
}

const STATES: Record<DemandStatusValue, DemandState> = {
  NOT_STARTED: new NotStartedState(),
  IN_PROGRESS: new InProgressState(),
  PAUSED: new PausedState(),
  IN_REVIEW: new InReviewState(),
  PRODUCTION: new ProductionState(),
};

export function demandState(value: DemandStatusValue): DemandState {
  return STATES[value];
}

export function parseDemandState(value: string): DemandState {
  if (!isDemandStatus(value)) {
    throw DomainError.validation('INVALID_DEMAND_STATUS', `Status inválido: "${value}".`);
  }
  return STATES[value];
}
