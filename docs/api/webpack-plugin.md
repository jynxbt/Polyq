---
title: Webpack Plugin
description: API reference for the Polyq webpack plugin.
---

# Webpack Plugin

`polyq/webpack` — Works with any webpack-based project (Next.js webpack mode, CRA, custom webpack).

## `polyqWebpack(options?)`

Returns a function that applies blockchain polyfills to a webpack config object.

```ts
import { polyqWebpack } from 'polyq/webpack'

const applyPolyq = polyqWebpack()

export default applyPolyq({
  entry: './src/index.ts',
  // ...
})
```

**Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `options.mode` | `'auto' \| 'manual'` | `'auto'` | Auto-detect from package.json or use explicit flags |
| `options.buffer` | `boolean` | `true` (auto) | Add `buffer` to `resolve.fallback` |
| `options.global` | `boolean` | `true` (auto) | Inject `Buffer` global via `ProvidePlugin` |
| `options.crypto` | `boolean` | `false` | Add `crypto-browserify` to `resolve.fallback` |
| `options.process` | `boolean` | `false` | Inject `process/browser` via `ProvidePlugin` |

**Returns:** `(webpackConfig: any) => any`

## What It Does

1. **Auto-detection** — Scans `package.json` for Solana packages. If none found, returns the config unchanged.

2. **`resolve.fallback`** — Adds browser polyfills for Node.js built-ins:
   ```js
   resolve: {
     fallback: {
       buffer: require.resolve('buffer/'),
       // crypto: require.resolve('crypto-browserify'),  // if enabled
     }
   }
   ```

3. **`ProvidePlugin`** — Injects globals without explicit imports:
   ```js
   new webpack.ProvidePlugin({
     Buffer: ['buffer', 'Buffer'],
     // process: ['process/browser'],  // if enabled
   })
   ```

## Manual Mode

Force polyfills regardless of detected packages:

```ts
const applyPolyq = polyqWebpack({
  mode: 'manual',
  buffer: true,
  crypto: true,
})
```

## With Next.js

For Next.js, prefer the dedicated adapter which handles both webpack and Turbopack:

```ts
import { withPolyq } from 'polyq/next'
export default withPolyq(nextConfig)
```

The webpack plugin is used internally by the Next.js adapter for webpack builds.
