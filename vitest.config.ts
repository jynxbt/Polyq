import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Integration tests under `tests/integration/**` use `describe.skipIf`
    // to no-op when `POLYQ_INTEGRATION` isn't set. They stay in the default
    // test run (discovered, reported as skipped) so `bun run test tests/integration`
    // works intuitively and CI via `.github/workflows/integration.yml` just
    // sets the env var.
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
      // Floors set just below current levels (0.4.0: statements 63.4,
      // branches 53.4, functions 62.9, lines 64.3) with a small margin.
      // These aren't aspirational — they lock in "no regression" and
      // should be ratcheted up when CLI-command coverage grows.
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 60,
        lines: 60,
      },
    },
  },
})
