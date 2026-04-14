import { detectSolanaPackages, resolvePolyfillNeeds, NODE_POLYFILLS } from '../../core/detect'
import type { PolyfillConfig } from '../../config/types'

/**
 * Webpack configuration factory for Solana polyfills.
 *
 * Returns a function that modifies a webpack config object in-place.
 * Works with Next.js, CRA, or any webpack-based bundler.
 *
 * Usage with Next.js:
 * ```ts
 * // next.config.ts
 * import { withHelm } from 'solana-helm/next'
 * export default withHelm({ ... })
 * ```
 *
 * Usage with raw webpack:
 * ```ts
 * import { helmWebpack } from 'solana-helm/webpack'
 * const apply = helmWebpack()
 * // in webpack config:
 * module.exports = apply({ entry: './src/index.ts', ... })
 * ```
 */
export function helmWebpack(options?: PolyfillConfig) {
  return function applyHelmPolyfills(webpackConfig: any): any {
    const root = process.cwd()
    const mode = options?.mode ?? 'auto'

    let detected: string[] = []
    if (mode === 'auto') {
      detected = detectSolanaPackages(root)
      if (detected.length === 0) return webpackConfig
    }

    const needs = resolvePolyfillNeeds(detected, {
      global: options?.global,
      buffer: options?.buffer,
      crypto: options?.crypto,
      process: options?.process,
    })

    if (mode === 'manual') {
      needs.global = options?.global ?? true
      needs.buffer = options?.buffer ?? true
    }

    // resolve.fallback — tell webpack to use browser polyfills for Node built-ins
    if (!webpackConfig.resolve) webpackConfig.resolve = {}
    if (!webpackConfig.resolve.fallback) webpackConfig.resolve.fallback = {}

    if (needs.buffer) {
      webpackConfig.resolve.fallback.buffer = require.resolve('buffer/')
    }
    if (needs.crypto) {
      webpackConfig.resolve.fallback.crypto = require.resolve('crypto-browserify')
      webpackConfig.resolve.fallback.stream = require.resolve('stream-browserify')
    }

    // ProvidePlugin — inject globals without explicit imports
    const webpack = requireWebpack()
    if (webpack) {
      if (!webpackConfig.plugins) webpackConfig.plugins = []

      const provides: Record<string, string[]> = {}

      if (needs.buffer) {
        provides['Buffer'] = ['buffer', 'Buffer']
      }
      if (needs.process) {
        provides['process'] = ['process/browser']
      }

      if (Object.keys(provides).length > 0) {
        webpackConfig.plugins.push(new webpack.ProvidePlugin(provides))
      }
    }

    return webpackConfig
  }
}

function requireWebpack(): any {
  try {
    return require('webpack')
  } catch {
    return null
  }
}
