import { defineConfig } from 'vitest/config';

/**
 * The balance sweep, which is not part of the suite.
 *
 * It plays hundreds of whole games and takes tens of minutes, so it is kept out
 * of `vitest.config.ts` entirely rather than skipped by a flag somebody has to
 * remember. `npm run sweep`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    // Verbose, or the report the sweep prints never reaches the terminal --
    // which is the entire output of the thing.
    reporters: ['verbose'],
    include: ['tools/**/*.test.ts'],
    // The runner sets its own, scaled to the number of games. This is only a
    // floor for the case where somebody forgets.
    testTimeout: 3_600_000,
    hookTimeout: 3_600_000,
  },
});
