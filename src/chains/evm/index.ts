import type { ChainProvider } from '../types'
import { EVM_OPTIMIZE_DEPS, EVM_ROOT_MARKERS, detectEvmProject, detectEvmPackages } from './detect'
import { detectEvmPrograms, findEvmSchemaFiles } from './config'
import { generateFromAbi } from './codegen'
import { createEvmValidatorStage, createEvmValidatorResetStage } from './validator'
import { createEvmBuildStage, createEvmDeployStage } from './programs'

export const evmProvider: ChainProvider = {
  chain: 'evm',
  programTypes: ['hardhat', 'foundry'],
  rootMarkers: EVM_ROOT_MARKERS,
  defaultArtifactDir: 'out',
  optimizeDeps: EVM_OPTIMIZE_DEPS,

  detectProject: detectEvmProject,
  detectPackages: detectEvmPackages,
  detectPrograms: detectEvmPrograms,
  generateClient: generateFromAbi,
  findSchemaFiles: findEvmSchemaFiles,
  createValidatorStage: createEvmValidatorStage,
  createValidatorResetStage: createEvmValidatorResetStage,
  createBuildStage: createEvmBuildStage,
  createDeployStage: createEvmDeployStage,
}

export { detectEvmPackages, EVM_PACKAGES } from './detect'
export { generateFromAbi } from './codegen'
