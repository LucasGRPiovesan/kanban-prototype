import { describe, expect, it } from 'vitest';
import { planVercelBuild } from '../../scripts/vercel-build-plan';

describe('planVercelBuild', () => {
  it('migrates and seeds only in Production', () => {
    expect(planVercelBuild({ VERCEL_ENV: 'production', VERCEL_TARGET_ENV: 'production' }).steps).toEqual([
      'generate',
      'migrate',
      'seed',
    ]);
  });

  it('never touches the database from a Preview deployment, even with DATABASE_URL present', () => {
    const plan = planVercelBuild({
      VERCEL_ENV: 'preview',
      VERCEL_TARGET_ENV: 'preview',
      DATABASE_URL: 'mysql://prod',
      SEED_ON_DEPLOY: 'true',
    });
    expect(plan.steps).toEqual(['generate']);
    expect(plan.notes.join(' ')).toMatch(/preview/);
  });

  it('treats custom environments and builds outside Vercel as non-production', () => {
    // A custom environment reports VERCEL_ENV=preview; VERCEL_TARGET_ENV names it.
    expect(planVercelBuild({ VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'staging' }).steps).toEqual(['generate']);
    expect(planVercelBuild({ VERCEL_ENV: 'development' }).steps).toEqual(['generate']);
    expect(planVercelBuild({}).steps).toEqual(['generate']);
  });

  it('prefers VERCEL_TARGET_ENV over VERCEL_ENV', () => {
    expect(planVercelBuild({ VERCEL_ENV: 'production', VERCEL_TARGET_ENV: 'staging' }).steps).toEqual(['generate']);
  });

  it('keeps migrations but skips the seed when SEED_ON_DEPLOY is disabled', () => {
    for (const flag of ['false', 'FALSE', '0', 'off']) {
      const plan = planVercelBuild({ VERCEL_TARGET_ENV: 'production', SEED_ON_DEPLOY: flag });
      expect(plan.steps).toEqual(['generate', 'migrate']);
    }
    expect(planVercelBuild({ VERCEL_TARGET_ENV: 'production', SEED_ON_DEPLOY: 'true' }).steps).toContain('seed');
  });
});
