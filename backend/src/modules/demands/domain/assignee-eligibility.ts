import { DomainError } from '../../../shared/domain/errors';
import { type Uuid } from '../../../shared/domain/identifier';

/**
 * What the domain needs to know about a candidate responsible, independent of how
 * the infrastructure discovers it.
 */
export interface AssigneeCandidate {
  readonly userUuid: Uuid;
  readonly name: string;
  readonly active: boolean;
  /**
   * Whether allocation is part of the question at all.
   *
   * A demand with no project has no allocation to check against, so membership is
   * simply not a criterion for it — expressed as a separate flag rather than by
   * claiming `isProjectMember: true`, which would state something untrue about the
   * person and would silently pass the moment a project is attached later.
   */
  readonly requiresMembership: boolean;
  readonly isProjectMember: boolean;
  /** Whether the candidate's role effectively grants DEMAND_BE_ASSIGNEE. */
  readonly canBeAssignee: boolean;
}

/**
 * Specification for "who may be the responsible of a demand".
 *
 * Expressed as a capability rather than a role list: the original profiles receive
 * DEMAND_BE_ASSIGNEE through the seed, and any custom role can be granted it without
 * a code change. `role === 'DEVELOPER' || role === 'AGILE'` would have made custom
 * profiles second-class citizens.
 */
export class AssigneeEligibility {
  static isEligible(candidate: AssigneeCandidate): boolean {
    return (
      candidate.active &&
      candidate.canBeAssignee &&
      (!candidate.requiresMembership || candidate.isProjectMember)
    );
  }

  /** Throws the most specific reason, so the API can explain the rejection. */
  static assert(candidate: AssigneeCandidate | null): AssigneeCandidate {
    if (!candidate) {
      throw DomainError.notFound('RESPONSIBLE_NOT_FOUND', 'Usuário responsável não encontrado.');
    }
    if (!candidate.active) {
      throw DomainError.validation(
        'RESPONSIBLE_INACTIVE',
        'O usuário selecionado está inativo e não pode ser responsável por demandas.',
      );
    }
    if (candidate.requiresMembership && !candidate.isProjectMember) {
      throw DomainError.validation(
        'RESPONSIBLE_NOT_PROJECT_MEMBER',
        'O usuário selecionado não participa do projeto desta demanda.',
      );
    }
    if (!candidate.canBeAssignee) {
      throw DomainError.validation(
        'RESPONSIBLE_CANNOT_BE_ASSIGNEE',
        'O perfil do usuário selecionado não permite assumir demandas.',
      );
    }
    return candidate;
  }
}
