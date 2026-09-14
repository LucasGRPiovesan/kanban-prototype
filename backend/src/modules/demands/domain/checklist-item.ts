import { DomainError } from '../../../shared/domain/errors';
import { Uuid } from '../../../shared/domain/identifier';

const TITLE_MIN = 1;
const TITLE_MAX = 240;

/**
 * One line on a demand's checklist.
 *
 * Modelled inside the Demand aggregate rather than as an aggregate of its own: an item
 * has no meaning without its demand, is never reached except through one, and its
 * ordering is a property of the list — which is exactly the boundary an aggregate draws.
 */
export class ChecklistItem {
  private constructor(
    readonly uuid: Uuid,
    private _title: string,
    private _done: boolean,
    private _position: number,
  ) {}

  static create(input: { title: string; position: number; done?: boolean }): ChecklistItem {
    return new ChecklistItem(
      Uuid.generate(),
      ChecklistItem.assertTitle(input.title),
      input.done ?? false,
      input.position,
    );
  }

  static rehydrate(props: {
    uuid: Uuid;
    title: string;
    done: boolean;
    position: number;
  }): ChecklistItem {
    return new ChecklistItem(props.uuid, props.title, props.done, props.position);
  }

  get title(): string {
    return this._title;
  }
  get done(): boolean {
    return this._done;
  }
  get position(): number {
    return this._position;
  }

  rename(title: string): void {
    this._title = ChecklistItem.assertTitle(title);
  }

  setDone(done: boolean): void {
    this._done = done;
  }

  moveTo(position: number): void {
    this._position = position;
  }

  private static assertTitle(value: string): string {
    const title = value.trim().replace(/\s+/g, ' ');
    if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
      throw DomainError.validation(
        'INVALID_CHECKLIST_ITEM',
        `O item do checklist deve ter entre ${TITLE_MIN} e ${TITLE_MAX} caracteres.`,
      );
    }
    return title;
  }
}
