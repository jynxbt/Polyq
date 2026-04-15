import type { Plugin } from 'vite'
import type { PolyqConfig } from '../../config/types'
import { polyqPolyfills } from './polyfills'
import { polyqIdlSync } from './idl-sync'

export { polyqPolyfills } from './polyfills'
export { polyqIdlSync } from './idl-sync'

/**
 * Main Vite plugin factory for Polyq.
 *
 * Returns an array of Vite plugins that handle:
 * - Automatic Solana polyfills (Buffer, global, optimizeDeps)
 * - IDL file watching + HMR sync
 *
 * Usage:
 * ```ts
 * // vite.config.ts
 * import { polyqVite } from 'polyq/vite'
 * export default defineConfig({
 *   plugins: [polyqVite()]
 * })
 * ```
 */
export function polyqVite(config?: PolyqConfig): Plugin[] {
  const plugins: Plugin[] = []

  // Always add polyfills (auto-detects if Solana deps exist)
  plugins.push(polyqPolyfills(config?.polyfills))

  // Add schema/IDL sync if configured (schemaSync takes precedence)
  const sync = config?.schemaSync ?? config?.idlSync
  if (sync) {
    plugins.push(polyqIdlSync(sync))
  }

  return plugins
}
