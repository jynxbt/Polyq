import consola from 'consola'
import { run } from '../process'
import type { Stage } from '../stage'

const logger = consola.withTag('polyq:init')

export interface InitStageOptions {
  /** Init script path (relative to root) */
  script: string
  /** Script runner (default: 'bun') */
  runner?: string | undefined
  /** Project root */
  root: string
}

/**
 * Run a post-deploy initialization script (PDA setup, wallet funding, etc.)
 */
export function createInitStage(options: InitStageOptions): Stage {
  const runner = options.runner ?? 'bun'

  return {
    name: 'Initialize',

    async check() {
      // Can't cheaply check if initialization has run — always re-run
      // The script itself should be idempotent
      return false
    },

    async start() {
      logger.info(`Running init script: ${options.script}`)

      const result = await run(runner, ['x', 'tsx', options.script], {
        cwd: options.root,
        label: 'init',
      })

      if (result.exitCode !== 0) {
        throw new Error(`Init script failed (exit ${result.exitCode})`)
      }

      logger.success('Initialization complete')
    },

    async stop() {
      // Nothing to stop
    },
  }
}
