import { defineNuxtModule, addVitePlugin } from '@nuxt/kit'
import type { HelmConfig } from '../../config/types'
import { helmPolyfills } from '../vite/polyfills'
import { helmIdlSync } from '../vite/idl-sync'

/**
 * Nuxt module for Helm.
 *
 * Usage:
 * ```ts
 * // nuxt.config.ts
 * export default defineNuxtConfig({
 *   modules: ['solana-helm/nuxt'],
 *   helm: {
 *     idlSync: { ... },
 *     polyfills: { ... },
 *   }
 * })
 * ```
 */
export default defineNuxtModule<HelmConfig>({
  meta: {
    name: 'solana-helm',
    configKey: 'helm',
  },
  defaults: {},
  setup(options: HelmConfig) {
    addVitePlugin(helmPolyfills(options.polyfills))

    if (options.idlSync) {
      addVitePlugin(helmIdlSync(options.idlSync))
    }
  },
})
