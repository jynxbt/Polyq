import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: {
      'index': 'src/index.ts',
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
    target: 'node18',
  },
])
