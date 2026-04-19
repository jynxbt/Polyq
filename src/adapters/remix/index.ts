import type { Plugin } from 'vite'
import type { PolyfillConfig, SchemaSyncConfig } from '../../config/types'
import { polyqPolyfills } from '../vite/polyfills'
import { polyqSchemaSync } from '../vite/schema-sync'

interface PolyqRemixOptions {
  polyfills?: PolyfillConfig
  schemaSync?: SchemaSyncConfig
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
 * import { polyqRemix } from 'polyq/remix'
 *
 * export default defineConfig({
 *   plugins: [remix(), ...polyqRemix()],
 * })
 * ```
 */
export function polyqRemix(options?: PolyqRemixOptions): Plugin[] {
  const plugins: Plugin[] = [polyqPolyfills(options?.polyfills)]

  if (options?.schemaSync) {
    plugins.push(polyqSchemaSync(options.schemaSync))
  }

  return plugins
}
