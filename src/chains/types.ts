import type { Stage } from '../workspace/stage'
import type { CodegenConfig } from '../config/types'

export type ChainFamily = 'svm' | 'evm'

export type ProgramType = 'anchor' | 'native' | 'hardhat' | 'foundry'

export interface ChainDetectionResult {
  chain: ChainFamily
  configFile: string
  confidence: 'definite' | 'likely'
}

export interface CodegenOutput {
  files: { path: string, content: string }[]
}

export interface ValidatorStageOptions {
  rpcUrl?: string
  tool?: string
  flags?: string[]
  logFile?: string
  root: string
}

export interface ProgramsStageOptions {
  programs: Record<string, import('../config/types').ProgramConfig>
  features?: string[]
  rpcUrl?: string
  parallel?: boolean
  root: string
}

/**
 * Each supported chain implements this interface.
 * Generic code dispatches to the chain provider instead of
 * hardcoding Solana or EVM-specific logic.
 */
export interface ChainProvider {
  readonly chain: ChainFamily
  readonly programTypes: ProgramType[]
  readonly rootMarkers: string[]
  readonly defaultArtifactDir: string
  readonly optimizeDeps: string[]

  /** Detect if this chain's project files exist at the given root */
  detectProject(root: string): ChainDetectionResult | null

  /** Detect chain-specific packages in package.json */
  detectPackages(root: string): string[]

  /** Parse project config into ProgramConfig records */
  detectPrograms(root: string): Record<string, import('../config/types').ProgramConfig> | undefined

  /** Generate TypeScript client from a schema/ABI file */
  generateClient(schemaPath: string, outDir: string, config?: Partial<CodegenConfig>): CodegenOutput

  /** List schema/ABI files in the default artifact directory */
  findSchemaFiles(root: string): string[]

  /** Create the local node/validator stage */
  createValidatorStage(options: ValidatorStageOptions): Stage

  /** Create the validator reset stage */
  createValidatorResetStage(options: ValidatorStageOptions): Stage

  /** Create the program build stage */
  createBuildStage(options: ProgramsStageOptions): Stage

  /** Create the program deploy stage */
  createDeployStage(options: ProgramsStageOptions): Stage
}
