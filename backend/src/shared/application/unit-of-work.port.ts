/**
 * Transaction boundary, expressed without leaking Prisma's client type into the
 * application layer.
 *
 * A use case that needs several writes to land together — a demand change and the
 * activity entry that records it, most visibly — wraps them in `run`. Repositories
 * called inside pick up the open transaction on their own, so neither the use case nor
 * the repository signatures ever mention `Prisma.TransactionClient`.
 *
 * Nested calls join the outer transaction rather than opening a second one: atomicity
 * belongs to the outermost unit, which is the one that knows what "all together" means.
 */
export interface UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T>;
}

/**
 * Defers a side effect until the surrounding unit of work has committed.
 *
 * For effects that leave the process — a real-time push to a browser, most visibly. Sent
 * from inside the transaction, the browser could re-fetch before the commit and read the
 * old state, or be told about a change that then rolls back. Outside a unit of work the
 * callback runs immediately. A separate interface from UnitOfWork on purpose, so the many
 * use cases (and test doubles) that only need `run` are not asked to implement it.
 */
export interface AfterCommit {
  afterCommit(callback: () => void): void;
}
