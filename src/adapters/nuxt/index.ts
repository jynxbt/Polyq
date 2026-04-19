import { addVitePlugin, defineNuxtModule, useNuxt } from '@nuxt/kit'
import consola from 'consola'
import type { PolyqConfig } from '../../config/types'
import { OPTIMIZE_DEPS } from '../../core/detect'
import { errorMessage } from '../../utils/error'
import { polyqPolyfills } from '../vite/polyfills'
import { polyqSchemaSync } from '../vite/schema-sync'

/**
 * Nuxt module for Polyq.
 *
 * Usage:
 * ```ts
 * // nuxt.config.ts — zero-config (auto-detects everything)
 * export default defineNuxtConfig({
 *   modules: ['polyq/nuxt'],
 * })
 *
 * // With inline options
 * export default defineNuxtConfig({
 *   modules: ['polyq/nuxt'],
 *   polyq: {
 *     polyfills: { buffer: true },
 *     schemaSync: {
 *       mapping: { my_program: ['packages/sdk/src/idl.json'] },
 *     },
 *   },
 * })
 * ```
 */
export default defineNuxtModule<PolyqConfig>({
  meta: {
    name: 'polyq',
    configKey: 'polyq',
  },
  defaults: {},
  async setup(options: PolyqConfig) {
    const nuxt = useNuxt()
    const sync = options.schemaSync

    // If no inline options, try loading polyq.config.ts
    if (!options.polyfills && !sync) {
      try {
        const { loadConfig } = await import('../../config/loader')
        const config = await loadConfig(nuxt.options.rootDir)
        if (config.polyfills) options.polyfills = config.polyfills
        if (config.schemaSync) {
          addVitePlugin(polyqSchemaSync(config.schemaSync))
        }
      } catch (e: unknown) {
        // Missing config file is the "nothing configured, use defaults" path — silent OK.
        // Anything else (syntax error, validation failure, unexpected throw) must be
        // surfaced loudly so the user sees the real cause at `nuxt dev` startup instead
        // of having polyfills silently not load.
        const code = (e as { code?: string })?.code
        if (code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND') {
          // No config file at all — carry on with inline defaults.
        } else {
          consola.error(`Failed to load polyq.config.ts: ${errorMessage(e)}`)
          throw e
        }
      }
    }

    // Add polyfill plugin
    addVitePlugin(polyqPolyfills(options.polyfills))

    // Add schema sync if configured inline
    if (sync) {
      addVitePlugin(polyqSchemaSync(sync))
    }

    // Directly merge optimizeDeps via hook — ensures pre-bundling works
    // in dev mode regardless of plugin config hook timing
    nuxt.hook('vite:extendConfig', (config: any) => {
      if (!config.optimizeDeps) config.optimizeDeps = {}
      if (!config.optimizeDeps.include) config.optimizeDeps.include = []

      for (const dep of OPTIMIZE_DEPS) {
        if (!config.optimizeDeps.include.includes(dep)) {
          config.optimizeDeps.include.push(dep)
        }
      }
    })
  },
})
