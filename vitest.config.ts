import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Several tests play whole 300-turn games to completion, which is the
    // point of them; the 5s default is nowhere near enough.
    testTimeout: 120_000,
    hookTimeout: 300_000,
  },
});
