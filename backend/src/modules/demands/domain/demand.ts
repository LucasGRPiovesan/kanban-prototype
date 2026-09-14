import { type CalendarDate } from '../../../shared/domain/calendar-date';
import { DomainError } from '../../../shared/domain/errors';
import { Uuid } from '../../../shared/domain/identifier';
import { type ChecklistItem } from './checklist-item';
import { type DemandAttachment } from './demand-attachment';
import { assertDemandPriority, type DemandPriorityValue } from './demand-priority';
import { type RichText } from './rich-text';
import {
  type DemandState,
  type DemandStatusValue,
  type TransitionOptions,
  demandState,
  parseDemandState,
} from './demand-status';

const TITLE_MIN = 3;
const TITLE_MAX = 180;
/** Bounds the list so it stays a checklist and not a second backlog inside a demand. */
const CHECKLIST_MAX_ITEMS = 50;

export interface DemandProps {
  uuid: Uuid;
  /** `null` when the demand is not attached to any project — see `changeProject`. */
  projectUuid: Uuid | null;
  title: string;
  description: RichText;
  dueDate: CalendarDate;
  state: DemandState;
  priority: DemandPriorityValue;
  responsibleUserUuid: Uuid;
  createdByUserUuid: Uuid;
  attachments: DemandAttachment[];
  checklist: ChecklistItem[];
  /** Hidden from the board without affecting `state`. Defaults to `false` on creation. */
  archived?: boolean;
}

/**
 * Demand aggregate root.
 *
 * Holds its own invariants (title/description shape, exactly one responsible in V1) and
 * delegates every lifecycle question to its state object.
 *
 * The project is deliberately *not* an invariant: a demand can be written down before
 * anyone has decided where it belongs. What the project does govern is who may be its
 * responsible, and that rule lives in `AssigneeEligibility`, applied by the application
 * layer against whichever project the demand will actually end up in.
 */
export class Demand {
  private constructor(private props: DemandProps) {}

  static create(input: {
    projectUuid: Uuid | null;
    title: string;
    description: RichText;
    dueDate: CalendarDate;
    responsibleUserUuid: Uuid;
    createdByUserUuid: Uuid;
    status?: DemandStatusValue;
    priority?: DemandPriorityValue;
  }): Demand {
    return new Demand({
      uuid: Uuid.generate(),
      projectUuid: input.projectUuid,
      title: Demand.assertTitle(input.title),
      description: input.description,
      dueDate: input.dueDate,
      state: demandState(input.status ?? 'NOT_STARTED'),
      // A demand created with no opinion on urgency reads as "normal", not as an empty
      // field — the same reasoning NOT_STARTED gets as the default status.
      priority: input.priority ?? 'MEDIUM',
      responsibleUserUuid: input.responsibleUserUuid,
      createdByUserUuid: input.createdByUserUuid,
      attachments: [],
      checklist: [],
      archived: false,
    });
  }

  static rehydrate(props: DemandProps): Demand {
    return new Demand(props);
  }

  get uuid(): Uuid {
    return this.props.uuid;
  }
  get projectUuid(): Uuid | null {
    return this.props.projectUuid;
  }
  get title(): string {
    return this.props.title;
  }
  get description(): RichText {
    return this.props.description;
  }
  get dueDate(): CalendarDate {
    return this.props.dueDate;
  }
  get status(): DemandStatusValue {
    return this.props.state.value;
  }
  get isTerminal(): boolean {
    return this.props.state.isTerminal;
  }
  get priority(): DemandPriorityValue {
    return this.props.priority;
  }
  get responsibleUserUuid(): Uuid {
    return this.props.responsibleUserUuid;
  }
  get createdByUserUuid(): Uuid {
    return this.props.createdByUserUuid;
  }
  get archived(): boolean {
    return this.props.archived ?? false;
  }
  get attachments(): readonly DemandAttachment[] {
    return this.props.attachments;
  }
  /** Always returned in display order, so no caller has to know how to sort it. */
  get checklist(): readonly ChecklistItem[] {
    return [...this.props.checklist].sort((a, b) => a.position - b.position);
  }

  /**
   * Lifecycle transition. Legality is decided by the current state object, so
   * "PRODUCTION is terminal" is enforced no matter who calls this — `options.override`
   * is the use case's only lever, granted solely on DEMAND_MANAGE_PRODUCTION.
   */
  moveTo(target: DemandStatusValue, options?: TransitionOptions): void {
    this.assertNotArchived();
    this.props.state = this.props.state.transitionTo(demandState(target), options);
  }

  canMoveTo(target: DemandStatusValue, options?: TransitionOptions): boolean {
    return this.props.state.canTransitionTo(demandState(target), options);
  }

  /**
   * A demand in production is frozen as a record, not merely as a status: editing its
   * scope after release would silently rewrite what was delivered.
   */
  private assertMutable(): void {
    if (this.props.state.isTerminal) {
      throw DomainError.forbidden(
        'DEMAND_IN_PRODUCTION_IS_TERMINAL',
        'Demandas em produção não podem ser alteradas.',
      );
    }
  }

  /**
   * An archived demand is read-only — the interface's only offer is to desarchive it, and
   * that rule is enforced here so no write path can bypass it, whatever permissions the
   * actor holds. `assignResponsible` is the one mutator that does *not* call this: picking
   * a new responsible is how a demand whose responsible was deactivated or excluded gets
   * back to being unarchivable in the first place, so that one door has to stay open while
   * every other one is shut.
   */
  private assertNotArchived(): void {
    if (this.props.archived) {
      throw DomainError.forbidden(
        'DEMAND_ARCHIVED_READONLY',
        'Demandas arquivadas não podem ser alteradas. Desarquive para gerenciar.',
      );
    }
  }

  changeTitle(title: string): void {
    this.assertMutable();
    this.assertNotArchived();
    this.props.title = Demand.assertTitle(title);
  }

  changeDescription(description: RichText): void {
    this.assertMutable();
    this.assertNotArchived();
    this.props.description = description;
  }

  changeDueDate(dueDate: CalendarDate): void {
    this.assertMutable();
    this.assertNotArchived();
    this.props.dueDate = dueDate;
  }

  /**
   * Priority carries no lifecycle of its own — unlike status, any value may follow any
   * other — so this is a plain assignment behind the same production freeze as every
   * other field, not a second state machine.
   */
  changePriority(priority: DemandPriorityValue): void {
    this.assertMutable();
    this.assertNotArchived();
    this.props.priority = priority;
  }

  /**
   * V1: exactly one responsible. Eligibility is decided by the application layer.
   *
   * Deliberately not gated by `assertNotArchived` — see that method's own comment: this
   * is the one write an archived demand still accepts, because it is the way out of the
   * situation that made unarchiving impossible in the first place.
   */
  assignResponsible(userUuid: Uuid): void {
    this.assertMutable();
    this.props.responsibleUserUuid = userUuid;
  }

  /**
   * Attaches, moves or detaches the demand. `null` detaches it: the demand goes back to
   * belonging to nobody's board in particular, which is a legitimate state here and not
   * a way of deleting the link by accident — the caller has to pass `null` on purpose.
   */
  changeProject(projectUuid: Uuid | null): void {
    this.assertMutable();
    this.assertNotArchived();
    this.props.projectUuid = projectUuid;
  }

  /**
   * Hides the demand from the board. Deliberately not gated by `assertMutable`: archiving
   * a demand in production does not rewrite what was delivered, it only stops showing it —
   * the same reasoning that lets `DEMAND_MANAGE_PRODUCTION` stay irrelevant here. Not
   * gated by `assertNotArchived` either, for the obvious reason: it is the one write this
   * method itself exists to allow.
   */
  setArchived(archived: boolean): void {
    this.props.archived = archived;
  }

  attach(attachment: DemandAttachment): void {
    this.assertMutable();
    this.assertNotArchived();
    this.props.attachments.push(attachment);
  }

  removeAttachment(attachmentUuid: Uuid): DemandAttachment {
    this.assertMutable();
    this.assertNotArchived();
    const index = this.props.attachments.findIndex((a) => a.uuid.equals(attachmentUuid));
    if (index < 0) {
      throw DomainError.notFound('ATTACHMENT_NOT_FOUND', 'Anexo não encontrado nesta demanda.');
    }
    return this.props.attachments.splice(index, 1)[0]!;
  }

  /**
   * Checklist operations, all through the root.
   *
   * They go through the aggregate rather than a repository of their own because the
   * invariants that matter are list-wide — the item cap and the ordering — and a rule
   * about a collection cannot be enforced by an object that only sees one element.
   */
  addChecklistItem(item: ChecklistItem): void {
    this.assertMutable();
    this.assertNotArchived();
    if (this.props.checklist.length >= CHECKLIST_MAX_ITEMS) {
      throw DomainError.validation(
        'CHECKLIST_LIMIT_REACHED',
        `Uma demanda pode ter no máximo ${CHECKLIST_MAX_ITEMS} itens de checklist.`,
      );
    }
    this.props.checklist.push(item);
  }

  /** Next free slot, leaving previous positions untouched. */
  nextChecklistPosition(): number {
    return this.props.checklist.reduce((max, item) => Math.max(max, item.position), 0) + 1;
  }

  renameChecklistItem(itemUuid: Uuid, title: string): ChecklistItem {
    this.assertMutable();
    this.assertNotArchived();
    const item = this.requireChecklistItem(itemUuid);
    item.rename(title);
    return item;
  }

  setChecklistItemDone(itemUuid: Uuid, done: boolean): ChecklistItem {
    this.assertMutable();
    this.assertNotArchived();
    const item = this.requireChecklistItem(itemUuid);
    item.setDone(done);
    return item;
  }

  removeChecklistItem(itemUuid: Uuid): ChecklistItem {
    this.assertMutable();
    this.assertNotArchived();
    const index = this.props.checklist.findIndex((item) => item.uuid.equals(itemUuid));
    if (index < 0) {
      throw DomainError.notFound('CHECKLIST_ITEM_NOT_FOUND', 'Item não encontrado nesta demanda.');
    }
    return this.props.checklist.splice(index, 1)[0]!;
  }

  private requireChecklistItem(itemUuid: Uuid): ChecklistItem {
    const item = this.props.checklist.find((candidate) => candidate.uuid.equals(itemUuid));
    if (!item) {
      throw DomainError.notFound('CHECKLIST_ITEM_NOT_FOUND', 'Item não encontrado nesta demanda.');
    }
    return item;
  }

  /** The Kanban card shows the first attached image; non-images have no preview. */
  firstImageAttachment(): DemandAttachment | undefined {
    return this.props.attachments.find((a) => a.isImage());
  }

  static assertStatus(value: string): DemandStatusValue {
    return parseDemandState(value).value;
  }

  static assertPriority(value: string): DemandPriorityValue {
    return assertDemandPriority(value);
  }

  private static assertTitle(value: string): string {
    const title = value.trim().replace(/\s+/g, ' ');
    if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
      throw DomainError.validation(
        'INVALID_DEMAND_TITLE',
        `O título deve ter entre ${TITLE_MIN} e ${TITLE_MAX} caracteres.`,
      );
    }
    return title;
  }

}
