import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Node by default, because a thousand simulation tests have no use for a
    // browser and pay for one in start-up. A test that needs the interface
    // opts in per file with `// @vitest-environment jsdom`; `tests/ui/setup.ts`
    // builds the page shell out of `index.html` for those and does nothing at
    // all for the rest.
    environment: 'node',
    setupFiles: ['tests/ui/setup.ts'],
    include: ['tests/**/*.test.ts'],
    // Several tests play whole 300-turn games to completion, which is the
    // point of them; the 5s default is nowhere near enough.
    testTimeout: 120_000,
    hookTimeout: 900_000,
  },
});
