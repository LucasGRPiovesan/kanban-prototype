/**
 * Domain-level error taxonomy.
 * The domain layer knows nothing about HTTP; the presentation layer maps these
 * to status codes in one place (shared/http/error-handler.ts).
 */
export type DomainErrorKind =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'UNAUTHORIZED'
  | 'INVARIANT'
  /** Too many requests — ours or an upstream quota. Carries `retryAfterSeconds` when known. */
  | 'RATE_LIMITED'
  /** A dependency outside this system failed or answered unusably. */
  | 'UNAVAILABLE';

export class DomainError extends Error {
  public readonly kind: DomainErrorKind;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(kind: DomainErrorKind, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'DomainError';
    this.kind = kind;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, DomainError.prototype);
  }

  static validation(code: string, message: string, details?: unknown): DomainError {
    return new DomainError('VALIDATION', code, message, details);
  }

  static notFound(code: string, message: string): DomainError {
    return new DomainError('NOT_FOUND', code, message);
  }

  static conflict(code: string, message: string): DomainError {
    return new DomainError('CONFLICT', code, message);
  }

  static forbidden(code: string, message: string): DomainError {
    return new DomainError('FORBIDDEN', code, message);
  }

  static unauthorized(code: string, message: string): DomainError {
    return new DomainError('UNAUTHORIZED', code, message);
  }

  /** Violation of an aggregate invariant — a bug or an illegal transition. */
  static invariant(code: string, message: string): DomainError {
    return new DomainError('INVARIANT', code, message);
  }

  static rateLimited(code: string, message: string, retryAfterSeconds?: number): DomainError {
    return new DomainError(
      'RATE_LIMITED',
      code,
      message,
      retryAfterSeconds ? { retryAfterSeconds } : undefined,
    );
  }

  static unavailable(code: string, message: string): DomainError {
    return new DomainError('UNAVAILABLE', code, message);
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
