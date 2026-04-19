import { defineConfig } from 'tsdown'

// Rolldown-based build that produces the same `dist/` tree tsup used to.
// Chosen over tsup (8.5.1) because tsup's DTS rollup injects a deprecated
// `baseUrl` that triggers a TS 6+ build error — fixable only via the
// `ignoreDeprecations` compiler flag, which TS 7 removes. tsdown uses a
// different DTS pipeline and doesn't need the workaround.
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'core/index': 'src/core/index.ts',
    'vite/index': 'src/adapters/vite/index.ts',
    'webpack/index': 'src/adapters/webpack/index.ts',
    'nuxt/index': 'src/adapters/nuxt/index.ts',
    'next/index': 'src/adapters/next/index.ts',
    'sveltekit/index': 'src/adapters/sveltekit/index.ts',
    'remix/index': 'src/adapters/remix/index.ts',
    'codegen/index': 'src/codegen/index.ts',
    'workspace/index': 'src/workspace/index.ts',
    'chains/svm/index': 'src/chains/svm/index.ts',
    'chains/evm/index': 'src/chains/evm/index.ts',
    'cli/index': 'src/cli/index.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['vite', 'webpack', 'next', 'chokidar'],
  // Matches `engines.node: ">=22"`. node18/20 dropped from the CI matrix
  // in 0.4.0, so there's no reason to constrain rolldown to older syntax.
  target: 'node22',
})
