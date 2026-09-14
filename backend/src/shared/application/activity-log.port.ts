import { type Actor } from './actor';
import {
  type ActivityAction,
  type LogLevel,
  type LogSubjectType,
  type SystemEventCode,
} from '../domain/activity-catalog';

export interface LogActor {
  uuid: string;
  name: string;
}

export function logActorOf(actor: Actor): LogActor {
  return { uuid: actor.userUuid.toString(), name: actor.name };
}

/**
 * What an entry is about. `label` is a snapshot taken at the moment of the event —
 * a demand renamed later keeps the title it had when the entry was written, and a demand
 * deleted later still has a readable history.
 */
export interface LogSubject {
  type: LogSubjectType;
  uuid: string;
  label: string | null;
}

export interface LogProjectRef {
  uuid: string;
  name: string;
}

/** Display values, not identifiers: the entry must stay readable if the referent goes. */
export interface FieldChange {
  field: string;
  from: string | null;
  to: string | null;
}

export interface ActivityRecord {
  action: ActivityAction;
  subject: LogSubject;
  project?: LogProjectRef | null;
  changes?: FieldChange[];
  metadata?: Record<string, unknown>;
}

/**
 * Records a business fact.
 *
 * Called inside the same unit of work as the change it describes, so the two commit or
 * roll back together: an audit trail that can miss a change, or record one that never
 * happened, is worse than no audit trail. A failure here fails the operation.
 *
 * `actor` is null only for work the installation itself performed (the seed's bootstrap).
 */
export interface ActivityRecorder {
  record(actor: LogActor | null, record: ActivityRecord): Promise<void>;
}

export interface SystemEvent {
  code: SystemEventCode;
  /** Defaults to the level declared in the catalog. */
  level?: LogLevel;
  message: string;
  actor?: LogActor | null;
  subject?: LogSubject | null;
  metadata?: Record<string, unknown>;
  requestId?: string | null;
}

/**
 * Records a technical event.
 *
 * The opposite contract to ActivityRecorder, on purpose: fire-and-forget, never throws,
 * never joins a transaction. System events are most often written *because* something
 * failed, so they must survive the rollback of the work that failed — and a logging
 * problem must never turn a handled error into an unhandled one.
 */
export interface SystemLogger {
  log(event: SystemEvent): void;
}
