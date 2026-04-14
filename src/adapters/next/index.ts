import type { HelmConfig, PolyfillConfig, IdlSyncConfig } from '../../config/types'
import { helmWebpack } from '../webpack/polyfills'

interface NextConfig {
  webpack?: (config: any, context: any) => any
  [key: string]: any
}

interface HelmNextOptions {
  polyfills?: PolyfillConfig
  idlSync?: IdlSyncConfig
}

/**
 * Next.js config wrapper that adds Solana polyfills.
 *
 * Usage:
 * ```ts
 * // next.config.ts
 * import { withHelm } from 'solana-helm/next'
 *
 * const nextConfig = { ... }
 * export default withHelm(nextConfig)
 * ```
 *
 * With options:
 * ```ts
 * export default withHelm(nextConfig, {
 *   polyfills: { buffer: true, crypto: true },
 * })
 * ```
 */
export function withHelm(
  nextConfig: NextConfig = {},
  options?: HelmNextOptions,
): NextConfig {
  const applyPolyfills = helmWebpack(options?.polyfills)

  const originalWebpack = nextConfig.webpack

  return {
    ...nextConfig,
    webpack(config: any, context: any) {
      // Only apply polyfills for client-side builds
      if (!context.isServer) {
        applyPolyfills(config)
      }

      // Chain with existing webpack config
      if (originalWebpack) {
        return originalWebpack(config, context)
      }
      return config
    },
  }
}
