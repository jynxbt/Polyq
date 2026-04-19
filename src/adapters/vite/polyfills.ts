import type { Plugin } from 'vite'
import type { PolyfillConfig } from '../../config/types'
import {
  detectChainPackages,
  detectSolanaPackages,
  OPTIMIZE_DEPS,
  resolvePolyfillNeeds,
} from '../../core/detect'

/**
 * Vite plugin that auto-configures polyfills required for blockchain libraries.
 *
 * Works with any Vite-based framework: React, Svelte, SvelteKit, Remix, Nuxt, etc.
 *
 * Detects blockchain packages (SVM + EVM) in your dependencies and sets up:
 * - `global` → `globalThis` (Node global in browser)
 * - `buffer` alias → npm `buffer` package
 * - `optimizeDeps` for pre-bundling deps
 *
 * Respects SSR context — polyfills only apply to client builds.
 * Note: EVM libs (ethers, viem) generally don't need Buffer/global polyfills,
 * but detection still fires so the plugin can apply optimizeDeps.
 */
export function polyqPolyfills(options?: PolyfillConfig): Plugin {
  return {
    name: 'polyq:polyfills',
    enforce: 'pre',

    config(userConfig, env) {
      const root = userConfig.root ?? process.cwd()
      const mode = options?.mode ?? 'auto'

      if (mode === 'auto') {
        const detected = detectChainPackages(root)
        if (detected.length === 0) return
      }

      // Only apply polyfills for client-side builds
      // Node.js already has Buffer, global, crypto natively
      const isSSR = env.isSsrBuild ?? false
      if (isSSR) return

      // Polyfill needs are based on SVM packages (EVM libs don't need Buffer/global)
      const needs = resolvePolyfillNeeds(mode === 'auto' ? detectSolanaPackages(root) : [], {
        global: options?.global,
        buffer: options?.buffer,
        crypto: options?.crypto,
        process: options?.process,
      })

      // When manual mode, default everything to true
      if (mode === 'manual') {
        needs.global = options?.global ?? true
        needs.buffer = options?.buffer ?? true
      }

      const define: Record<string, string> = {}
      const alias: Record<string, string> = {}
      const include: string[] = []

      if (needs.global) {
        define.global = 'globalThis'
      }

      if (needs.buffer) {
        alias.buffer = 'buffer/'
        include.push('buffer')
      }

      // Add Solana packages to optimizeDeps for pre-bundling
      for (const pkg of OPTIMIZE_DEPS) {
        if (!include.includes(pkg)) {
          include.push(pkg)
        }
      }

      return {
        define,
        resolve: { alias },
        optimizeDeps: { include },
      }
    },
  }
}
