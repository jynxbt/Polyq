import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'pathe'
import type { ChainFamily, ChainProvider } from './types'
import { svmProvider } from './svm'
import { evmProvider } from './evm'

const providers: Record<ChainFamily, ChainProvider> = {
  svm: svmProvider,
  evm: evmProvider,
}

export function getChainProvider(chain: ChainFamily): ChainProvider {
  const provider = providers[chain]
  if (!provider) throw new Error(`Unknown chain: ${chain}`)
  return provider
}

export function getAllProviders(): ChainProvider[] {
  return Object.values(providers)
}

export function getAllRootMarkers(): string[] {
  return Object.values(providers).flatMap(p => p.rootMarkers)
}

/**
 * Auto-detect which chain a project uses.
 *
 * Priority:
 * 1. Config file markers (Anchor.toml → svm, foundry.toml → evm)
 * 2. Package.json dependencies
 * 3. Fallback: svm
 */
export function detectChain(root: string): ChainFamily {
  // Check config file markers first (definite detection)
  for (const provider of getAllProviders()) {
    const result = provider.detectProject(root)
    if (result?.confidence === 'definite') return result.chain
  }

  // Check package.json dependencies (likely detection)
  for (const provider of getAllProviders()) {
    const packages = provider.detectPackages(root)
    if (packages.length > 0) return provider.chain
  }

  // Fallback
  return 'svm'
}

/**
 * Find project root by walking up looking for any chain's root markers.
 */
export function findProjectRoot(cwd: string): string {
  const markers = getAllRootMarkers()
  let dir = cwd
  while (dir !== dirname(dir)) {
    if (markers.some(m => existsSync(resolve(dir, m)))) return dir
    dir = dirname(dir)
  }
  return cwd
}

export type { ChainFamily, ChainProvider, ChainDetectionResult } from './types'
export type { CodegenOutput, ValidatorStageOptions, ProgramsStageOptions } from './types'
