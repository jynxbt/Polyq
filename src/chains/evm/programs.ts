import consola from 'consola'
import type { Stage } from '../../workspace/stage'
import type { ProgramConfig } from '../../config/types'
import { run } from '../../workspace/process'
import type { ProgramsStageOptions } from '../types'

const logger = consola.withTag('helm:evm-build')

export function createEvmBuildStage(options: ProgramsStageOptions): Stage {
  const foundryPrograms = Object.entries(options.programs)
    .filter(([_, p]) => p.type === 'foundry')
  const hardhatPrograms = Object.entries(options.programs)
    .filter(([_, p]) => p.type === 'hardhat')

  return {
    name: 'Contracts (build)',

    async check() {
      return false
    },

    async start() {
      if (foundryPrograms.length > 0) {
        logger.info('Building with Forge...')
        const result = await run('forge', ['build'], {
          cwd: options.root,
          label: 'forge build',
        })
        if (result.exitCode !== 0) {
          throw new Error(`forge build failed (exit ${result.exitCode})`)
        }
        logger.success('Forge build complete')
      }

      if (hardhatPrograms.length > 0) {
        logger.info('Compiling with Hardhat...')
        const result = await run('npx', ['hardhat', 'compile'], {
          cwd: options.root,
          label: 'hardhat compile',
        })
        if (result.exitCode !== 0) {
          throw new Error(`hardhat compile failed (exit ${result.exitCode})`)
        }
        logger.success('Hardhat compile complete')
      }
    },

    async stop() {},
  }
}

export function createEvmDeployStage(options: ProgramsStageOptions): Stage {
  const rpcUrl = options.rpcUrl ?? 'http://127.0.0.1:8545'

  return {
    name: 'Contracts (deploy)',

    async check() {
      return false
    },

    async start() {
      // EVM deploy is project-specific — run the deploy script if configured
      // The user provides their own deploy script via workspace.init
      logger.info('EVM deploy runs via workspace.init deploy script')
    },

    async stop() {},
  }
}
