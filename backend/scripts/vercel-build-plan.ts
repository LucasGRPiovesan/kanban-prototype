/**
 * What the Vercel build of the API may do, decided from the environment alone.
 *
 * Kept as a pure function (no I/O) so the one rule that protects the production database
 * is unit-tested instead of trusted: **only a Production deployment touches the database
 * during the build.** Preview deployments (every pull request and non-production branch)
 * and custom environments generate the Prisma client and stop — they never run migrations
 * or the seed, whichever DATABASE_URL they happen to see.
 *
 * `VERCEL_TARGET_ENV` is preferred over `VERCEL_ENV` because it also names custom
 * environments ("staging"…), which must not count as production either. A build with
 * neither variable (someone running the script outside Vercel) is not production.
 */
export type BuildStep = 'generate' | 'migrate' | 'seed';

export interface BuildPlan {
  environment: string;
  steps: BuildStep[];
  /** Human-readable reasons for every skipped step, printed in the build log. */
  notes: string[];
}

export function planVercelBuild(env: NodeJS.ProcessEnv): BuildPlan {
  const environment = (env.VERCEL_TARGET_ENV || env.VERCEL_ENV || 'local').trim();
  const steps: BuildStep[] = ['generate'];
  const notes: string[] = [];

  if (environment !== 'production') {
    notes.push(
      `Ambiente "${environment}": migrations e seed não são executadas fora de Production — o banco não é tocado por este build.`,
    );
    return { environment, steps, notes };
  }

  steps.push('migrate');
  if (isDisabled(env.SEED_ON_DEPLOY)) {
    notes.push('SEED_ON_DEPLOY=false: seed ignorada.');
  } else {
    steps.push('seed');
  }
  return { environment, steps, notes };
}

function isDisabled(flag: string | undefined): boolean {
  return ['false', '0', 'no', 'off'].includes((flag ?? '').trim().toLowerCase());
}
