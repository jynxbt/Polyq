import { rmSync, existsSync } from 'node:fs'
import { resolve } from 'pathe'
import consola from 'consola'
import type { Stage } from '../../workspace/stage'
import { spawnDetached, killByPattern, isProcessRunning, killPort } from '../../workspace/process'
import { waitUntilReady, httpHealthCheck } from '../../workspace/health'

const logger = consola.withTag('helm:validator')

export interface ValidatorStageOptions {
  /** RPC URL (default: http://127.0.0.1:8899) */
  rpcUrl?: string
  /** Extra flags for solana-test-validator */
  flags?: string[]
  /** Log file path */
  logFile?: string
  /** Project root */
  root: string
}

export function createValidatorStage(options: ValidatorStageOptions): Stage {
  const rpcUrl = options.rpcUrl ?? 'http://127.0.0.1:8899'
  const logFile = options.logFile ?? '/tmp/helm-validator.log'
  const flags = options.flags ?? ['--quiet']

  return {
    name: 'Validator',

    async check() {
      return httpHealthCheck(`${rpcUrl}/health`)
    },

    async start() {
      // If already running, skip
      if (await httpHealthCheck(`${rpcUrl}/health`)) {
        logger.info('Validator already running')
        return
      }

      // Kill any stale validator processes
      if (isProcessRunning('solana-test-validator')) {
        logger.info('Killing stale validator...')
        killByPattern('solana-test-validator', 'SIGKILL')

        // Wait for process to exit
        await waitUntilReady(
          async () => !isProcessRunning('solana-test-validator'),
          { label: 'Validator shutdown', interval: 500, timeout: 10_000, quiet: true },
        )
      }

      // Kill any processes on validator ports
      for (const port of [8899, 8900, 9900]) {
        killPort(port)
      }

      // Wait for ports to be free
      await waitUntilReady(
        async () => {
          const { portCheck } = await import('../../workspace/health')
          const busy = await portCheck('127.0.0.1', 8899)
          return !busy
        },
        { label: 'Port 8899 free', interval: 500, timeout: 5_000, quiet: true },
      )

      logger.info('Starting solana-test-validator...')
      spawnDetached('solana-test-validator', flags, {
        logFile,
        cwd: options.root,
      })

      // Wait for RPC to be ready
      await waitUntilReady(
        () => httpHealthCheck(`${rpcUrl}/health`),
        { label: 'Validator RPC', interval: 1000, timeout: 30_000 },
      )
    },

    async stop() {
      if (!isProcessRunning('solana-test-validator')) {
        logger.info('Validator not running')
        return
      }

      logger.info('Stopping validator...')
      killByPattern('solana-test-validator', 'SIGKILL')

      await waitUntilReady(
        async () => !isProcessRunning('solana-test-validator'),
        { label: 'Validator shutdown', interval: 500, timeout: 10_000, quiet: true },
      )

      // Clean up ports
      for (const port of [8899, 8900, 9900]) {
        killPort(port)
      }
    },
  }
}

/**
 * Hard reset: kill validator, clear ledger, start fresh.
 */
export function createValidatorResetStage(options: ValidatorStageOptions): Stage {
  const baseStage = createValidatorStage(options)
  const ledgerPath = resolve(options.root, 'test-ledger')

  return {
    name: 'Validator (reset)',
    check: baseStage.check,

    async start() {
      // Force stop first
      await baseStage.stop()

      // Remove stale ledger
      if (existsSync(ledgerPath)) {
        logger.info('Removing stale ledger...')
        rmSync(ledgerPath, { recursive: true, force: true })
      }

      // Start fresh
      await baseStage.start()
    },

    stop: baseStage.stop,
  }
}
