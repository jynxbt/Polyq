import { createRequire } from 'node:module'
import type { PolyfillConfig } from '../../config/types'
import { detectSolanaPackages, resolvePolyfillNeeds } from '../../core/detect'

const esmRequire = createRequire(import.meta.url)

/**
 * Webpack configuration factory for blockchain polyfills.
 *
 * Returns a function that modifies a webpack config object in-place.
 * Works with Next.js, CRA, or any webpack-based bundler.
 *
 * Usage with Next.js:
 * ```ts
 * // next.config.ts
 * import { withPolyq } from 'polyq/next'
 * export default withPolyq({ ... })
 * ```
 *
 * Usage with raw webpack:
 * ```ts
 * import { polyqWebpack } from 'polyq/webpack'
 * const apply = polyqWebpack()
 * // in webpack config:
 * module.exports = apply({ entry: './src/index.ts', ... })
 * ```
 */
export function polyqWebpack(options?: PolyfillConfig) {
  return function applyPolyqPolyfills(webpackConfig: any): any {
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
      try {
        webpackConfig.resolve.fallback.buffer = esmRequire.resolve('buffer/')
      } catch {}
    }
    if (needs.crypto) {
      try {
        webpackConfig.resolve.fallback.crypto = esmRequire.resolve('crypto-browserify')
      } catch {}
      try {
        webpackConfig.resolve.fallback.stream = esmRequire.resolve('stream-browserify')
      } catch {}
    }

    // ProvidePlugin — inject globals without explicit imports
    const webpack = loadWebpack()
    if (webpack) {
      if (!webpackConfig.plugins) webpackConfig.plugins = []

      const provides: Record<string, string[]> = {}

      if (needs.buffer) {
        provides.Buffer = ['buffer', 'Buffer']
      }
      if (needs.process) {
        provides.process = ['process/browser']
      }

      if (Object.keys(provides).length > 0) {
        webpackConfig.plugins.push(new webpack.ProvidePlugin(provides))
      }
    }

    return webpackConfig
  }
}

function loadWebpack(): any {
  try {
    return esmRequire('webpack')
  } catch {
    return null
  }
}
