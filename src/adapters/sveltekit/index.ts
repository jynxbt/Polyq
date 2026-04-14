import type { HelmConfig, PolyfillConfig, IdlSyncConfig } from '../../config/types'
import { helmPolyfills } from '../vite/polyfills'
import { helmIdlSync } from '../vite/idl-sync'

interface HelmSvelteKitOptions {
  polyfills?: PolyfillConfig
  idlSync?: IdlSyncConfig
}

/**
 * SvelteKit Vite plugin helper.
 *
 * SvelteKit uses Vite natively, so this is a convenience wrapper that
 * returns the right Vite plugins for your svelte.config.js.
 *
 * Usage:
 * ```ts
 * // vite.config.ts
 * import { sveltekit } from '@sveltejs/kit/vite'
 * import { helmSvelteKit } from 'solana-helm/sveltekit'
 *
 * export default defineConfig({
 *   plugins: [sveltekit(), ...helmSvelteKit()],
 * })
 * ```
 *
 * With options:
 * ```ts
 * plugins: [sveltekit(), ...helmSvelteKit({
 *   polyfills: { buffer: true },
 *   idlSync: {
 *     mapping: { my_program: ['src/lib/idl.json'] },
 *   },
 * })]
 * ```
 */
export function helmSvelteKit(options?: HelmSvelteKitOptions) {
  const plugins = [helmPolyfills(options?.polyfills)]

  if (options?.idlSync) {
    plugins.push(helmIdlSync(options.idlSync))
  }

  return plugins
}
