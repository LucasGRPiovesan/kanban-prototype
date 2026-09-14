import { v7 as uuidv7, validate as uuidValidate } from 'uuid';

/**
 * Public identifier of every aggregate.
 *
 * Internal numeric ids (BIGINT) never leave the infrastructure layer; this value
 * object is the only identifier the domain, application and presentation layers know.
 * A Uuid is generated independently of any database sequence — it is never derived
 * from the numeric id.
 */
export class Uuid {
  private constructor(private readonly value: string) {}

  static generate(): Uuid {
    return new Uuid(uuidv7());
  }

  /** Rehydrates a persisted or inbound identifier, rejecting malformed input. */
  static create(value: string): Uuid {
    const normalized = value.trim().toLowerCase();
    if (!uuidValidate(normalized)) {
      throw DomainUuidError(value);
    }
    return new Uuid(normalized);
  }

  static isValid(value: string): boolean {
    return uuidValidate(value.trim().toLowerCase());
  }

  toString(): string {
    return this.value;
  }

  equals(other: Uuid): boolean {
    return this.value === other.value;
  }
}

function DomainUuidError(value: string): Error {
  // Kept local to avoid a domain->errors cycle at module init time.
  const error = new Error(`Invalid UUID: "${value}"`);
  error.name = 'InvalidUuidError';
  return error;
}
