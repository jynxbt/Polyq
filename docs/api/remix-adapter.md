---
title: Remix Adapter
description: API reference for the Remix adapter.
---

# Remix Adapter

`polyq/remix` — Returns Vite plugins for Remix projects.

## `polyqRemix(options?)`

Returns an array of Vite plugins for polyfills and optional schema sync.

```ts
import { vitePlugin as remix } from '@remix-run/dev'
import { polyqRemix } from 'polyq/remix'

export default defineConfig({
  plugins: [remix(), ...polyqRemix()],
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
  remix(),
  ...polyqRemix({
    idlSync: {
      mapping: {
        my_program: ['app/idl.json'],
      },
    },
  }),
]
```

## How It Works

This is a convenience wrapper that composes `polyqPolyfills()` and `polyqIdlSync()` from `polyq/vite`. Use it instead of importing those plugins individually.
