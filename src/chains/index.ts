import { existsSync } from 'node:fs'
import consola from 'consola'
import { dirname, resolve } from 'pathe'
import { evmProvider } from './evm'
import { svmProvider } from './svm'
import type { ChainFamily, ChainProvider } from './types'

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
  const definiteMatches: ChainFamily[] = []
  for (const provider of getAllProviders()) {
    const result = provider.detectProject(root)
    if (result?.confidence === 'definite') {
      definiteMatches.push(result.chain)
    }
  }

  if (definiteMatches.length > 1) {
    consola.warn(
      `Multiple chain configs detected (${definiteMatches.join(', ')}). ` +
        `Using '${definiteMatches[0]}'. Set \`chain\` explicitly in polyq.config.ts to silence this warning.`,
    )
  }

  if (definiteMatches.length > 0) return definiteMatches[0]!

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

export type {
  ChainDetectionResult,
  ChainFamily,
  ChainProvider,
  CodegenOutput,
  ProgramsStageOptions,
  ValidatorStageOptions,
} from './types'
