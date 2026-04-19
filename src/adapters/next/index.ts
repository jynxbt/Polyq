import { createRequire } from 'node:module'
import type { PolyfillConfig, SchemaSyncConfig } from '../../config/types'
import { detectSolanaPackages, resolvePolyfillNeeds } from '../../core/detect'
import { polyqWebpack } from '../webpack/polyfills'

const esmRequire = createRequire(import.meta.url)

interface NextConfig {
  webpack?: (config: any, context: any) => any
  turbopack?: {
    root?: string
    resolveAlias?: Record<string, any>
    [key: string]: any
  }
  [key: string]: any
}

interface PolyqNextOptions {
  polyfills?: PolyfillConfig
  schemaSync?: SchemaSyncConfig
}

/**
 * Next.js config wrapper that adds blockchain polyfills.
 *
 * Supports both webpack and Turbopack bundlers:
 * - **Webpack**: resolve.fallback + ProvidePlugin for Buffer/global
 * - **Turbopack** (Next.js 15+): turbopack.resolveAlias for Node.js module stubs
 *
 * Usage:
 * ```ts
 * // next.config.ts
 * import { withPolyq } from 'polyq/next'
 *
 * const nextConfig = { ... }
 * export default withPolyq(nextConfig)
 * ```
 *
 * With options:
 * ```ts
 * export default withPolyq(nextConfig, {
 *   polyfills: { buffer: true, crypto: true },
 * })
 * ```
 */
export function withPolyq(nextConfig: NextConfig = {}, options?: PolyqNextOptions): NextConfig {
  const mode = options?.polyfills?.mode ?? 'auto'
  const detected = mode === 'auto' ? detectSolanaPackages(process.cwd()) : []
  const hasSolana = mode === 'manual' || detected.length > 0

  if (!hasSolana && mode === 'auto') return nextConfig

  const needs = resolvePolyfillNeeds(detected, {
    global: options?.polyfills?.global,
    buffer: options?.polyfills?.buffer,
    crypto: options?.polyfills?.crypto,
    process: options?.polyfills?.process,
  })

  if (mode === 'manual') {
    needs.global = options?.polyfills?.global ?? true
    needs.buffer = options?.polyfills?.buffer ?? true
  }

  // --- Turbopack config (Next.js 15+) ---
  const turbopack = { ...nextConfig.turbopack }

  if (!turbopack.resolveAlias) turbopack.resolveAlias = {}

  // Stub Node.js modules that Solana libs transitively import in the browser.
  // Turbopack uses resolveAlias with { browser: path } syntax.
  // Resolve stub from the package — works both from source and node_modules.
  let stubPath: string
  try {
    stubPath = esmRequire.resolve('polyq/stub.cjs')
  } catch {
    // Fallback for local dev / linked packages
    stubPath = esmRequire.resolve('../../../stub.cjs')
  }
  const nodeStubs = ['fs', 'net', 'tls']
  for (const mod of nodeStubs) {
    if (!turbopack.resolveAlias[mod]) {
      turbopack.resolveAlias[mod] = { browser: stubPath }
    }
  }

  if (needs.buffer) {
    turbopack.resolveAlias.buffer = { browser: 'buffer/' }
  }

  // --- Webpack config (fallback for non-Turbopack builds) ---
  const applyPolyfills = polyqWebpack(options?.polyfills)
  const originalWebpack = nextConfig.webpack

  return {
    ...nextConfig,
    turbopack,
    webpack(config: any, context: any) {
      // Apply polyfills for client-side and edge runtime builds (not Node.js server)
      if (!context.isServer || context.nextRuntime === 'edge') {
        applyPolyfills(config)
      }

      if (originalWebpack) {
        return originalWebpack(config, context)
      }
      return config
    },
  }
}
