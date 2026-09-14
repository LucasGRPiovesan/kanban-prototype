import { type FieldChange, type LogActor } from '../../../../shared/application/activity-log.port';
import { type ActivityAction } from '../../../../shared/domain/activity-catalog';
import { type DemandCardView } from './repositories';

/** A change to a demand, as it is being recorded — the same facts the activity entry holds. */
export interface DemandChange {
  actor: LogActor;
  action: ActivityAction;
  /** The demand as the transaction is about to commit it. */
  card: DemandCardView;
  changes?: FieldChange[];
  metadata?: Record<string, unknown>;
  /**
   * People with a stake in this change that the "after" snapshot no longer shows — the
   * previous responsible of a reassigned demand, who should hear that it left their hands.
   */
  formerResponsibleUuid?: string;
}

/**
 * Reacts to every recorded demand change.
 *
 * Owned by the demands module and implemented elsewhere (Notifications), so this module
 * announces that something happened without knowing who cares. Called inside the same
 * unit of work as the change: whatever a listener writes commits or rolls back with it.
 */
export interface DemandChangeListener {
  demandChanged(change: DemandChange): Promise<void>;
}
