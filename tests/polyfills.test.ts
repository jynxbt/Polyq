import { describe, it, expect } from 'vitest'
import { helmPolyfills } from '../src/adapters/vite/polyfills'
import type { Plugin, UserConfig } from 'vite'

function callConfigHook(
  plugin: Plugin,
  userConfig: UserConfig = {},
  env: { isSsrBuild?: boolean } = {},
) {
  if (typeof plugin.config !== 'function') return undefined
  return plugin.config(
    { root: process.cwd(), ...userConfig },
    { mode: 'development', command: 'serve', isSsrBuild: env.isSsrBuild ?? false } as any,
  )
}

describe('helmPolyfills', () => {
  it('returns a plugin with correct name', () => {
    const plugin = helmPolyfills()
    expect(plugin.name).toBe('helm:polyfills')
  })

  it('sets global to globalThis in manual mode', () => {
    const plugin = helmPolyfills({ mode: 'manual', global: true, buffer: true })
    const config = callConfigHook(plugin) as any
    expect(config?.define?.global).toBe('globalThis')
  })

  it('aliases buffer in manual mode', () => {
    const plugin = helmPolyfills({ mode: 'manual', buffer: true })
    const config = callConfigHook(plugin) as any
    expect(config?.resolve?.alias?.buffer).toBe('buffer/')
  })

  it('includes buffer in optimizeDeps', () => {
    const plugin = helmPolyfills({ mode: 'manual', buffer: true })
    const config = callConfigHook(plugin) as any
    expect(config?.optimizeDeps?.include).toContain('buffer')
  })

  it('skips polyfills for SSR builds', () => {
    const plugin = helmPolyfills({ mode: 'manual', buffer: true })
    const config = callConfigHook(plugin, {}, { isSsrBuild: true })
    expect(config).toBeUndefined()
  })

  it('enforces pre order', () => {
    const plugin = helmPolyfills()
    expect(plugin.enforce).toBe('pre')
  })
})
