import type { CodegenConfig } from '../../config/types'
import type { ChainProvider, CodegenOutput } from '../types'
import { generateFromIdl } from './codegen'
import { generateFromIdlKit } from './codegen-kit'
import { detectProgramsFromAnchor, findSvmSchemaFiles } from './config'
import {
  detectSolanaPackages,
  detectSvmProject,
  SVM_OPTIMIZE_DEPS,
  SVM_ROOT_MARKERS,
} from './detect'
import { createProgramsBuildStage, createProgramsDeployStage } from './programs'
import { createValidatorResetStage, createValidatorStage } from './validator'

/**
 * Dispatch SVM codegen based on `config.mode`.
 * - `'kit'` → delegate to Codama to emit `@solana/kit`-flavored clients (async)
 * - anything else (default `'legacy'`) → hand-rolled Borsh + web3.js v1 output (sync)
 *
 * The return type is widened to `CodegenOutput | Promise<CodegenOutput>` to
 * accommodate Codama's async renderer. The ChainProvider interface already
 * accepts either shape via the caller's `await`.
 */
function generateSvmClient(
  idlPath: string,
  outDir: string,
  config?: Partial<CodegenConfig>,
): CodegenOutput | Promise<CodegenOutput> {
  if (config?.mode === 'kit') {
    return generateFromIdlKit(idlPath, outDir, config)
  }
  return generateFromIdl(idlPath, outDir, config)
}

export const svmProvider: ChainProvider = {
  chain: 'svm',
  programTypes: ['anchor', 'native'],
  rootMarkers: SVM_ROOT_MARKERS,
  defaultArtifactDir: 'target/idl',
  optimizeDeps: SVM_OPTIMIZE_DEPS,

  detectProject: detectSvmProject,
  detectPackages: detectSolanaPackages,
  detectPrograms: detectProgramsFromAnchor,
  generateClient: generateSvmClient,
  findSchemaFiles: findSvmSchemaFiles,
  createValidatorStage,
  createValidatorResetStage,
  createBuildStage: createProgramsBuildStage,
  createDeployStage: createProgramsDeployStage,
}

export { type CodegenOutput, generateFromIdl } from './codegen'
export { generateFromIdlKit } from './codegen-kit'
export { detectProgramsFromAnchor } from './config'
// Re-export for backwards compat
export { detectSolanaPackages, SOLANA_PACKAGES, SVM_OPTIMIZE_DEPS } from './detect'
