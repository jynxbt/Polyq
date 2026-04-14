import type { Plugin } from 'vite'
import type { HelmConfig } from '../../config/types'
import { helmPolyfills } from './polyfills'
import { helmIdlSync } from './idl-sync'

export { helmPolyfills } from './polyfills'
export { helmIdlSync } from './idl-sync'

/**
 * Main Vite plugin factory for Helm.
 *
 * Returns an array of Vite plugins that handle:
 * - Automatic Solana polyfills (Buffer, global, optimizeDeps)
 * - IDL file watching + HMR sync
 *
 * Usage:
 * ```ts
 * // vite.config.ts
 * import { helmVite } from 'solana-helm/vite'
 * export default defineConfig({
 *   plugins: [helmVite()]
 * })
 * ```
 */
export function helmVite(config?: HelmConfig): Plugin[] {
  const plugins: Plugin[] = []

  // Always add polyfills (auto-detects if Solana deps exist)
  plugins.push(helmPolyfills(config?.polyfills))

  // Add IDL sync if configured or if we can auto-detect
  if (config?.idlSync) {
    plugins.push(helmIdlSync(config.idlSync))
  }

  return plugins
}
