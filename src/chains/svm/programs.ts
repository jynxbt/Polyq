import consola from 'consola'
import type { Stage } from '../../workspace/stage'
import type { ProgramConfig } from '../../config/types'
import { run } from '../../workspace/process'

const logger = consola.withTag('helm:programs')

export interface ProgramsStageOptions {
  /** Program definitions */
  programs: Record<string, ProgramConfig>
  /** Build features (e.g., ['local']) */
  features?: string[]
  /** RPC URL for deployment */
  rpcUrl?: string
  /** Build programs in parallel */
  parallel?: boolean
  /** Project root */
  root: string
}

export function createProgramsBuildStage(options: ProgramsStageOptions): Stage {
  const features = options.features ?? []
  const rpcUrl = options.rpcUrl ?? 'http://127.0.0.1:8899'

  // Split programs by type
  const anchorPrograms = Object.entries(options.programs)
    .filter(([_, p]) => p.type === 'anchor')
  const nativePrograms = Object.entries(options.programs)
    .filter(([_, p]) => p.type === 'native')

  return {
    name: 'Programs (build)',

    async check() {
      // We can't cheaply check if binaries are up-to-date, so always return false
      // to allow --quick flag to skip this stage
      return false
    },

    async start() {
      const buildTasks: Promise<void>[] = []

      // Anchor programs build together via `anchor build`
      if (anchorPrograms.length > 0) {
        const anchorBuild = async () => {
          const args = ['build']
          if (features.length > 0) {
            args.push('--', `--features`, features.join(','))
          }

          logger.info(`Building ${anchorPrograms.length} Anchor program(s)...`)
          const result = await run('anchor', args, {
            cwd: options.root,
            label: 'anchor build',
          })
          if (result.exitCode !== 0) {
            throw new Error(`anchor build failed (exit ${result.exitCode})`)
          }
          logger.success('Anchor build complete')
        }

        if (options.parallel) {
          buildTasks.push(anchorBuild())
        } else {
          await anchorBuild()
        }
      }

      // Native programs build individually via cargo build-sbf
      for (const [name, program] of nativePrograms) {
        const nativeBuild = async () => {
          const manifestPath = program.deploy?.binary
            ? undefined
            : `${program.path}/Cargo.toml`

          const args = ['build-sbf']
          if (manifestPath) {
            args.push('--manifest-path', manifestPath)
          }
          if (features.length > 0) {
            args.push('--features', features.join(','))
          }

          logger.info(`Building native program: ${name}...`)
          const result = await run('cargo', args, {
            cwd: options.root,
            label: `cargo build-sbf (${name})`,
          })
          if (result.exitCode !== 0) {
            throw new Error(`cargo build-sbf failed for ${name} (exit ${result.exitCode})`)
          }
          logger.success(`Native build complete: ${name}`)
        }

        if (options.parallel) {
          buildTasks.push(nativeBuild())
        } else {
          await nativeBuild()
        }
      }

      // Wait for all parallel builds
      if (buildTasks.length > 0) {
        await Promise.all(buildTasks)
      }
    },

    async stop() {
      // Nothing to stop
    },
  }
}

export function createProgramsDeployStage(options: ProgramsStageOptions): Stage {
  const rpcUrl = options.rpcUrl ?? 'http://127.0.0.1:8899'

  const anchorPrograms = Object.entries(options.programs)
    .filter(([_, p]) => p.type === 'anchor')
  const nativePrograms = Object.entries(options.programs)
    .filter(([_, p]) => p.type === 'native')

  return {
    name: 'Programs (deploy)',

    async check() {
      // Can't cheaply check if deployed versions match built binaries
      return false
    },

    async start() {
      // Deploy Anchor programs
      if (anchorPrograms.length > 0) {
        logger.info(`Deploying ${anchorPrograms.length} Anchor program(s)...`)
        const result = await run('anchor', ['deploy', '--provider.cluster', 'localnet'], {
          cwd: options.root,
          label: 'anchor deploy',
        })
        if (result.exitCode !== 0) {
          throw new Error(`anchor deploy failed (exit ${result.exitCode})`)
        }
        logger.success('Anchor deploy complete')
      }

      // Deploy native programs
      for (const [name, program] of nativePrograms) {
        if (!program.deploy?.keypair || !program.deploy?.binary) {
          logger.warn(`Skipping deploy for ${name}: no deploy config`)
          continue
        }

        logger.info(`Deploying native program: ${name}...`)
        const result = await run('solana', [
          'program', 'deploy',
          '--url', rpcUrl,
          '--program-id', program.deploy.keypair,
          program.deploy.binary,
        ], {
          cwd: options.root,
          label: `solana program deploy (${name})`,
        })
        if (result.exitCode !== 0) {
          throw new Error(`solana program deploy failed for ${name} (exit ${result.exitCode})`)
        }
        logger.success(`Deployed: ${name}`)
      }
    },

    async stop() {
      // Nothing to stop
    },
  }
}
