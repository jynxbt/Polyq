import { resolve } from 'pathe'
import type { HelmConfig, ResolvedHelmConfig } from './types'
import { detectChain, findProjectRoot, getChainProvider } from '../chains'

/**
 * Resolve a HelmConfig by auto-detecting chain, root, and programs.
 */
export function resolveConfig(
  config: HelmConfig,
  cwd: string,
): ResolvedHelmConfig {
  const root = config.root ? resolve(cwd, config.root) : findProjectRoot(cwd)
  const chain = config.chain ?? detectChain(root)
  const provider = getChainProvider(chain)

  const programs = config.programs ?? provider.detectPrograms(root)

  // Merge idlSync into schemaSync for backwards compat
  const schemaSync = config.schemaSync ?? config.idlSync ?? {
    watchDir: resolve(root, provider.defaultArtifactDir),
  }

  return {
    ...config,
    root,
    _chain: chain,
    programs,
    schemaSync,
    idlSync: schemaSync,
  }
}

/**
 * @deprecated Use detectProgramsFromAnchor from 'solana-helm/chains/svm'
 */
export { detectProgramsFromAnchor } from '../chains/svm/config'
