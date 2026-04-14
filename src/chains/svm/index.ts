import type { ChainProvider } from '../types'
import { SOLANA_PACKAGES, SVM_OPTIMIZE_DEPS, SVM_ROOT_MARKERS, detectSvmProject, detectSolanaPackages } from './detect'
import { detectProgramsFromAnchor, findSvmSchemaFiles } from './config'
import { generateFromIdl } from './codegen'
import { createValidatorStage, createValidatorResetStage } from './validator'
import { createProgramsBuildStage, createProgramsDeployStage } from './programs'

export const svmProvider: ChainProvider = {
  chain: 'svm',
  programTypes: ['anchor', 'native'],
  rootMarkers: SVM_ROOT_MARKERS,
  defaultArtifactDir: 'target/idl',
  optimizeDeps: SVM_OPTIMIZE_DEPS,

  detectProject: detectSvmProject,
  detectPackages: detectSolanaPackages,
  detectPrograms: detectProgramsFromAnchor,
  generateClient: generateFromIdl,
  findSchemaFiles: findSvmSchemaFiles,
  createValidatorStage,
  createValidatorResetStage,
  createBuildStage: createProgramsBuildStage,
  createDeployStage: createProgramsDeployStage,
}

// Re-export for backwards compat
export { detectSolanaPackages, SOLANA_PACKAGES, SVM_OPTIMIZE_DEPS } from './detect'
export { detectProgramsFromAnchor } from './config'
export { generateFromIdl, type CodegenOutput } from './codegen'
