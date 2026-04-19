import type { Plugin } from 'vite'
import type { PolyqConfig } from '../../config/types'
import { polyqPolyfills } from './polyfills'
import { polyqSchemaSync } from './schema-sync'

export { polyqPolyfills } from './polyfills'
export { polyqSchemaSync } from './schema-sync'

/**
 * Main Vite plugin factory for Polyq.
 *
 * Returns an array of Vite plugins that handle:
 * - Automatic Solana polyfills (Buffer, global, optimizeDeps)
 * - Schema (IDL/ABI) file watching + HMR sync
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

  // Add schema sync if configured
  if (config?.schemaSync) {
    plugins.push(polyqSchemaSync(config.schemaSync))
  }

  return plugins
}
