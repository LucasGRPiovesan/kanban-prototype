import { type Actor } from '../../../shared/application/actor';
import { type SystemLogger, logActorOf } from '../../../shared/application/activity-log.port';
import { type FileStoragePort } from '../../../shared/application/file-storage.port';

/**
 * Removes stored bytes after their rows are gone, and reports what could not be removed.
 *
 * Rows go first on purpose — an orphaned blob is a cleanup problem, a row pointing at a
 * deleted file is a broken page for everyone — so a storage failure here must not fail
 * the operation. Before, those failures vanished inside `Promise.allSettled`; now each one
 * becomes a system event an operator can find and act on.
 */
export async function removeStoredFiles(
  storage: FileStoragePort,
  systemLogger: SystemLogger,
  context: { actor: Actor; demand: { uuid: string; title: string } },
  storageKeys: readonly string[],
): Promise<void> {
  const results = await Promise.allSettled(storageKeys.map((key) => storage.delete(key)));

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      return;
    }
    const storageKey = storageKeys[index]!;
    systemLogger.log({
      code: 'storage.cleanup_failed',
      message: `Não foi possível remover um arquivo da demanda "${context.demand.title}" do armazenamento.`,
      actor: logActorOf(context.actor),
      subject: { type: 'DEMAND', uuid: context.demand.uuid, label: context.demand.title },
      metadata: {
        storageKey,
        reason: result.reason instanceof Error ? result.reason.message : String(result.reason),
      },
    });
  });
}
