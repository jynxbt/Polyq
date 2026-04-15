<img src="polyq.svg" alt="Polyq" width="120" />

Chain-agnostic DX toolkit for blockchain frontends — polyfills, schema sync, codegen, and workspace orchestration.

Works with **React, Next.js, Svelte, SvelteKit, Remix, Nuxt**, or any Vite/webpack project.

## Why?

Every blockchain frontend project wastes time on the same problems:

- You run `anchor build`, forget to copy the IDL, and spend 20 minutes debugging stale types
- You paste the same `global: 'globalThis'` and `buffer: 'buffer/'` polyfill config into every new project
- You hand-write hundreds of lines of instruction builders, PDA helpers, and account fetchers — then rewrite them every time the contract changes
- Your localnet script is 600 lines of `sleep 2` commands and sequential builds that break when anyone touches it

Polyq fixes all of this with one install. It detects your chain, configures your bundler, generates typed clients, syncs schemas on save, and orchestrates your dev environment — so you ship features instead of fighting tooling.

## Install

```bash
npm install polyq
```

## Quick Start

### React / Vite

```ts
// vite.config.ts
import { polyqVite } from 'polyq/vite'

export default defineConfig({
  plugins: [polyqVite()],
})
```

### Next.js

```ts
// next.config.ts
import { withPolyq } from 'polyq/next'

const nextConfig = { /* ... */ }
export default withPolyq(nextConfig)
```

### SvelteKit

```ts
// vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite'
import { polyqSvelteKit } from 'polyq/sveltekit'

export default defineConfig({
  plugins: [sveltekit(), ...polyqSvelteKit()],
})
```

### Remix

```ts
// vite.config.ts
import { vitePlugin as remix } from '@remix-run/dev'
import { polyqRemix } from 'polyq/remix'

export default defineConfig({
  plugins: [remix(), ...polyqRemix()],
})
```

### Nuxt

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['polyq/nuxt'],
  polyq: {
    polyfills: { buffer: true },
    idlSync: {
      mapping: { my_program: ['packages/sdk/src/idl.json'] },
    },
  },
})
```

### Raw Webpack

```ts
// webpack.config.js
import { polyqWebpack } from 'polyq/webpack'

const applyPolyq = polyqWebpack()

export default applyPolyq({
  entry: './src/index.ts',
  // ...
})
```

## As a CLI

```bash
# Generate typed TypeScript clients from contract schemas
polyq codegen                            # auto-detect chain, generate from all IDLs/ABIs
polyq codegen --idl target/idl/my_program.json --out src/generated
polyq codegen --watch                    # watch source files, auto-build, regenerate

# Initialize config with auto-detected settings
polyq init

# Orchestrate your local dev environment
polyq dev                                # Docker → Validator → Build → Deploy → DB → Dev Server
polyq dev --quick                        # skip program builds
polyq dev --reset                        # drop DB, clear ledger, full rebuild
polyq stop                               # stop all services
polyq status                             # show what's running

# Build programs/contracts
polyq build
polyq build --features local --parallel
```

## Features

### Automatic Polyfills

Zero-config. Detects Solana dependencies and auto-configures:
- `global` → `globalThis`
- `buffer` alias → npm `buffer` package
- `optimizeDeps` (Vite) / `resolve.fallback` + `ProvidePlugin` (webpack)

SSR-aware — polyfills only apply to client builds.

### IDL Sync + HMR

Watch `target/idl/` and auto-sync to your frontend on every `anchor build`:

```ts
// Any Vite-based framework
polyqVite({
  idlSync: {
    watchDir: 'target/idl',
    mapping: {
      my_program: ['packages/sdk/src/idl.json'],
    },
  },
})
```

No manual copying, no page refresh. The Vite dev server picks up IDL changes via HMR.

### Codegen

Generate TypeScript clients from Anchor IDLs:

```bash
polyq codegen                          # All IDLs in target/idl/
polyq codegen --idl target/idl/my_program.json --out generated/
polyq codegen --watch                  # Watch + regenerate
```

Generates:
- **Types** — TypeScript interfaces from IDL type definitions
- **PDAs** — `deriveFoo()` functions from IDL seed definitions
- **Instructions** — `createFooInstruction()` builders with typed accounts/args
- **Accounts** — Discriminator constants and fetch stubs
- **Errors** — Error enum and lookup function

### Smart Workspace (CLI)

Stage-based dev environment orchestration with proper health check polling:

```bash
polyq dev              # Docker → Validator → Build → Deploy → Init → DB → Dev Server
polyq dev --quick      # Skip program builds
polyq dev --reset      # Drop DB, clear ledger, full rebuild
polyq stop             # Stop services
polyq stop --all       # Also stop Docker
polyq status           # Show what's running
polyq build            # Build programs
polyq build --features local --parallel
```

Replaces hundreds of lines of shell scripts with a single config:

```ts
// polyq.config.ts
import { definePolyqConfig } from 'polyq'

export default definePolyqConfig({
  workspace: {
    buildFeatures: ['local'],
    docker: { services: ['postgres'] },
    validator: { rpcUrl: 'http://127.0.0.1:8899' },
    init: { script: 'scripts/init.ts' },
    database: {
      url: 'postgresql://dev:dev@localhost:5433/myapp',
      migrationsDir: 'migrations',
      seed: { script: 'seed:dev' },
    },
    devServer: { command: 'bun run dev' },
  },
})
```

## Framework Support Matrix

| Feature | Vite (React, Svelte, etc.) | Next.js | SvelteKit | Remix | Nuxt |
|---|---|---|---|---|---|
| Auto Polyfills | `polyqVite()` | `withPolyq()` | `polyqSvelteKit()` | `polyqRemix()` | module |
| IDL Sync + HMR | yes | — | yes | yes | yes |
| Codegen (CLI) | yes | yes | yes | yes | yes |
| Smart Workspace | yes | yes | yes | yes | yes |

IDL Sync requires Vite's dev server for HMR. Next.js projects get polyfills + codegen + workspace, but not hot IDL reload.

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `chain` | `'svm' \| 'evm'` | auto-detected | Force chain family |
| `programs` | `Record<string, ProgramConfig>` | auto-detected | Program/contract definitions |
| `schemaSync.watchDir` | `string` | auto-detected | Directory to watch for IDL/ABI changes |
| `schemaSync.mapping` | `Record<string, string[]>` | `{}` | Map schema name to destination paths |
| `codegen.outDir` | `string` | `'generated'` | Output directory for generated TypeScript |
| `codegen.features` | `object` | all enabled | Toggle types, instructions, accounts, pda, errors, events |
| `polyfills.mode` | `'auto' \| 'manual'` | `'auto'` | Auto-detect from package.json or use explicit flags |
| `polyfills.buffer` | `boolean` | `true` | Alias `buffer` to npm `buffer/` package |
| `polyfills.global` | `boolean` | `true` | Define `global` as `globalThis` |
| `workspace.validator.tool` | `string` | auto-detected | `'solana-test-validator'`, `'anvil'`, or `'hardhat'` |
| `workspace.validator.rpcUrl` | `string` | auto-detected | RPC endpoint for local node |
| `workspace.docker.services` | `string[]` | all | Docker Compose services to start |
| `workspace.docker.healthCheckPort` | `number` | `5432` | Port to poll for readiness |
| `workspace.database.extensions` | `string[]` | `[]` | PostgreSQL extensions to enable |
| `workspace.database.migrationsDir` | `string` | — | Path to SQL migration files |
| `workspace.devServer.command` | `string` | — | Command to start your dev server |

## License

MIT
