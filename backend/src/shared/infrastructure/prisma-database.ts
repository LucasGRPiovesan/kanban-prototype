import { AsyncLocalStorage } from 'node:async_hooks';
import { type Prisma, type PrismaClient } from '@prisma/client';
import { type AfterCommit, type UnitOfWork } from '../application/unit-of-work.port';

export type DatabaseClient = PrismaClient | Prisma.TransactionClient;

/**
 * The database handle every repository shares, aware of an open unit of work.
 *
 * Prisma's interactive transactions hand out a separate client object, which would
 * normally force every repository method to accept it as a parameter — and force every
 * use case to thread it through. Instead the open transaction lives in an
 * AsyncLocalStorage scope: a repository asks for `client` and receives the transaction
 * when one is open, or the root client when none is. Call sites stay exactly as they
 * were, and the application layer never learns Prisma exists.
 *
 * Two entry points, deliberately:
 * - `run` is the application-facing UnitOfWork.
 * - `transaction` is for a repository that needs its own atomic block (a demand and its
 *   checklist). It joins an outer unit of work when there is one, because Prisma cannot
 *   nest interactive transactions and the outer unit is the one that owns atomicity.
 */
export class PrismaDatabase implements UnitOfWork, AfterCommit {
  private readonly scope = new AsyncLocalStorage<Prisma.TransactionClient>();
  private readonly pendingAfterCommit = new WeakMap<Prisma.TransactionClient, (() => void)[]>();

  constructor(readonly root: PrismaClient) {}

  get client(): DatabaseClient {
    return this.scope.getStore() ?? this.root;
  }

  run<T>(work: () => Promise<T>): Promise<T> {
    return this.transaction(() => work());
  }

  async transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const current = this.scope.getStore();
    if (current) {
      return fn(current);
    }
    let opened: Prisma.TransactionClient | null = null;
    const result = await this.root.$transaction(
      (tx) => {
        opened = tx;
        return this.scope.run(tx, () => fn(tx));
      },
      { maxWait: 5_000, timeout: 15_000 },
    );
    // Reached only once the commit succeeded; a rollback throws above and the queued
    // callbacks are simply dropped along with the transaction they belonged to.
    const callbacks = opened ? this.pendingAfterCommit.get(opened) : undefined;
    callbacks?.forEach(runSafely);
    return result;
  }

  afterCommit(callback: () => void): void {
    const current = this.scope.getStore();
    if (!current) {
      // Nothing to wait for: outside a unit of work every write is already committed.
      runSafely(callback);
      return;
    }
    const queue = this.pendingAfterCommit.get(current) ?? [];
    queue.push(callback);
    this.pendingAfterCommit.set(current, queue);
  }
}

/** A side effect of a committed change must never turn that change into a failed request. */
function runSafely(callback: () => void): void {
  try {
    callback();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        source: 'after-commit',
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
