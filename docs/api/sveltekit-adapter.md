---
title: SvelteKit Adapter
description: API reference for the SvelteKit adapter.
---

# SvelteKit Adapter

`polyq/sveltekit` — Returns Vite plugins for SvelteKit projects.

## `polyqSvelteKit(options?)`

Returns an array of Vite plugins for polyfills and optional schema sync.

```ts
import { sveltekit } from '@sveltejs/kit/vite'
import { polyqSvelteKit } from 'polyq/sveltekit'

export default defineConfig({
  plugins: [sveltekit(), ...polyqSvelteKit()],
})
```

**Parameters:**

| Param | Type | Description |
|---|---|---|
| `options.polyfills` | `PolyfillConfig` | Polyfill settings (auto-detect by default) |
| `options.idlSync` | `SchemaSyncConfig` | Schema sync mapping |

**Returns:** `Plugin[]`

### With Schema Sync

```ts
plugins: [
  sveltekit(),
  ...polyqSvelteKit({
    polyfills: { buffer: true },
    idlSync: {
      mapping: {
        my_program: ['src/lib/idl.json'],
      },
    },
  }),
]
```

## How It Works

This is a convenience wrapper that composes `polyqPolyfills()` and `polyqIdlSync()` from `polyq/vite`. Use it instead of importing those plugins individually.
