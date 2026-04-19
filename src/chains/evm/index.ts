import { existsSync } from 'node:fs'
import { resolve } from 'pathe'
import type { CodegenConfig } from '../../config/types'
import type { ChainProvider, CodegenOutput } from '../types'
import { generateFromAbi } from './codegen'
import { generateFromAbiViem } from './codegen-viem'
import { detectEvmPrograms, findEvmSchemaFiles } from './config'
import { detectEvmPackages, detectEvmProject, EVM_OPTIMIZE_DEPS, EVM_ROOT_MARKERS } from './detect'
import { createEvmBuildStage, createEvmDeployStage } from './programs'
import { createEvmValidatorResetStage, createEvmValidatorStage } from './validator'

/**
 * Dispatch EVM codegen based on `config.mode`.
 * - `'viem'` → emit viem-ready typed contract wrappers
 * - anything else (default `'legacy'`) → emit the bare ABI + hand-rolled types
 */
function generateEvmClient(
  schemaPath: string,
  outDir: string,
  config?: Partial<CodegenConfig>,
): CodegenOutput {
  if (config?.mode === 'viem') {
    return generateFromAbiViem(schemaPath, outDir, config)
  }
  return generateFromAbi(schemaPath, outDir, config)
}

export const evmProvider: ChainProvider = {
  chain: 'evm',
  programTypes: ['hardhat', 'foundry'],
  rootMarkers: EVM_ROOT_MARKERS,
  // Foundry uses 'out/', Hardhat uses 'artifacts/' — check both, prefer what exists
  get defaultArtifactDir() {
    const cwd = process.cwd()
    if (existsSync(resolve(cwd, 'foundry.toml'))) return 'out'
    if (existsSync(resolve(cwd, 'artifacts'))) return 'artifacts'
    return 'out'
  },
  optimizeDeps: EVM_OPTIMIZE_DEPS,

  detectProject: detectEvmProject,
  detectPackages: detectEvmPackages,
  detectPrograms: detectEvmPrograms,
  generateClient: generateEvmClient,
  findSchemaFiles: findEvmSchemaFiles,
  createValidatorStage: createEvmValidatorStage,
  createValidatorResetStage: createEvmValidatorResetStage,
  createBuildStage: createEvmBuildStage,
  createDeployStage: createEvmDeployStage,
}

export { generateFromAbi } from './codegen'
export { generateFromAbiViem } from './codegen-viem'
export { detectEvmPackages, EVM_PACKAGES } from './detect'
