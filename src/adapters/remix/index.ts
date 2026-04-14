import type { PolyfillConfig, IdlSyncConfig } from '../../config/types'
import { helmPolyfills } from '../vite/polyfills'
import { helmIdlSync } from '../vite/idl-sync'

interface HelmRemixOptions {
  polyfills?: PolyfillConfig
  idlSync?: IdlSyncConfig
}

/**
 * Remix Vite plugin helper.
 *
 * Remix uses Vite, so this returns the right Vite plugins.
 *
 * Usage:
 * ```ts
 * // vite.config.ts
 * import { vitePlugin as remix } from '@remix-run/dev'
 * import { helmRemix } from 'solana-helm/remix'
 *
 * export default defineConfig({
 *   plugins: [remix(), ...helmRemix()],
 * })
 * ```
 */
export function helmRemix(options?: HelmRemixOptions) {
  const plugins = [helmPolyfills(options?.polyfills)]

  if (options?.idlSync) {
    plugins.push(helmIdlSync(options.idlSync))
  }

  return plugins
}
