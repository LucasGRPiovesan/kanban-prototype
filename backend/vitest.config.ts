import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    // The API suite drives a real Express app against a real MySQL, so it needs more
    // headroom than a pure unit test.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Integration tests share one database; running files in parallel would let them
    // clobber each other's rows.
    fileParallelism: false,
  },
});
