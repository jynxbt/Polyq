import type { ChainFamily, ProgramType } from '../chains/types'

export type { ChainFamily, ProgramType }

export interface HelmConfig {
  /** Chain family — auto-detected if omitted */
  chain?: ChainFamily

  /** Project root directory (auto-detected from config files) */
  root?: string

  /** Program/contract definitions */
  programs?: Record<string, ProgramConfig>

  /** Schema/artifact sync configuration */
  schemaSync?: SchemaSyncConfig

  /** @deprecated Use schemaSync */
  idlSync?: SchemaSyncConfig

  /** Codegen configuration */
  codegen?: CodegenConfig

  /** Polyfill configuration */
  polyfills?: PolyfillConfig

  /** Workspace orchestration (for `helm dev`) */
  workspace?: WorkspaceConfig
}

export interface ProgramConfig {
  /** Program/contract type — determines build/deploy toolchain */
  type: ProgramType

  /** Path to the program/contract directory (relative to root) */
  path: string

  /** Path to the schema file (IDL for SVM, ABI for EVM) */
  schema?: string

  /** @deprecated Use schema */
  idl?: string

  /** Program/contract identifiers per network */
  programId?: Record<string, string>

  /** Deployment config */
  deploy?: {
    keypair?: string
    binary?: string
    script?: string
  }
}

export interface SchemaSyncConfig {
  /** Directory to watch for schema changes */
  watchDir?: string

  /** Map schema name → destination paths */
  mapping?: Record<string, string[]>
}

/** @deprecated Use SchemaSyncConfig */
export type IdlSyncConfig = SchemaSyncConfig

export interface CodegenConfig {
  /** Output directory for generated TypeScript */
  outDir: string

  /** Which programs to generate clients for */
  programs?: string[]

  /** What to generate */
  features?: {
    types?: boolean
    instructions?: boolean
    accounts?: boolean
    pda?: boolean
    errors?: boolean
    events?: boolean
    abi?: boolean
  }
}

export interface PolyfillConfig {
  /** Detection mode: 'auto' scans package.json, 'manual' uses explicit flags */
  mode?: 'auto' | 'manual'

  /** Explicit polyfill toggles (used when mode is 'manual') */
  buffer?: boolean
  global?: boolean
  process?: boolean
  crypto?: boolean
}

export interface WorkspaceConfig {
  /** Build features (e.g., ['local'] for Solana) */
  buildFeatures?: string[]

  /** Docker compose configuration */
  docker?: {
    enabled?: boolean
    compose?: string
    services?: string[]
  }

  /** Local node/validator settings */
  validator?: {
    /** Tool to use (auto-detected from chain: 'solana-test-validator', 'anvil', 'hardhat') */
    tool?: string
    rpcUrl?: string
    flags?: string[]
    logFile?: string
  }

  /** Post-deploy initialization script */
  init?: {
    script: string
    runner?: string
  }

  /** Database configuration */
  database?: {
    url?: string
    migrationsDir?: string
    seed?: {
      script: string
      runner?: string
    }
  }

  /** Dev server to start after orchestration */
  devServer?: {
    command: string
    cwd?: string
  }

  /** Health check tuning */
  healthChecks?: {
    pollInterval?: number
    maxWait?: number
  }
}

export type ResolvedHelmConfig = Required<
  Pick<HelmConfig, 'root'>
> & HelmConfig & { _chain: ChainFamily }

export function defineHelmConfig(config: HelmConfig): HelmConfig {
  return config
}
