import { existsSync, rmSync } from 'node:fs'
import consola from 'consola'
import { resolve } from 'pathe'
import { parseRpcPort } from '../../utils/error'
import { httpHealthCheck, portCheck, waitUntilReady } from '../../workspace/health'
import { isProcessRunning, killByPattern, killPort, spawnDetached } from '../../workspace/process'
import type { Stage } from '../../workspace/stage'
import type { ValidatorStageOptions } from '../types'

const logger = consola.withTag('polyq:validator')

const DEFAULT_RPC_PORT = 8899
const DEFAULT_FAUCET_PORT = 9900

export type { ValidatorStageOptions }

export function createValidatorStage(options: ValidatorStageOptions): Stage {
  const rpcUrl = options.rpcUrl ?? `http://127.0.0.1:${DEFAULT_RPC_PORT}`
  const rpcPort = parseRpcPort(rpcUrl, DEFAULT_RPC_PORT)
  const logFile = options.logFile ?? '/tmp/polyq-validator.log'
  const flags = options.flags ?? ['--quiet']
  // SVM defaults: RPC port, WS port (rpc+1), faucet port 9900.
  const ports = options.ports ?? [rpcPort, rpcPort + 1, DEFAULT_FAUCET_PORT]
  const processName = options.processName ?? 'solana-test-validator'

  const poll = options.healthChecks?.pollInterval ?? 1000
  const maxWait = options.healthChecks?.maxWait ?? 30_000
  const requestTimeout = options.healthChecks?.requestTimeout ?? 2000

  return {
    name: 'Validator',

    async check() {
      return httpHealthCheck(`${rpcUrl}/health`, requestTimeout)
    },

    async start() {
      if (await httpHealthCheck(`${rpcUrl}/health`, requestTimeout)) {
        logger.info('Validator already running')
        return
      }

      if (isProcessRunning(processName)) {
        logger.info('Killing stale validator...')
        killByPattern(processName, 'SIGKILL')

        await waitUntilReady(async () => !isProcessRunning(processName), {
          label: 'Validator shutdown',
          interval: 500,
          timeout: 10_000,
          quiet: true,
        })
      }

      for (const port of ports) {
        killPort(port)
      }

      await waitUntilReady(
        async () => {
          const busy = await portCheck('127.0.0.1', rpcPort)
          return !busy
        },
        { label: `Port ${rpcPort} free`, interval: 500, timeout: 5_000, quiet: true },
      )

      logger.info('Starting solana-test-validator...')
      spawnDetached('solana-test-validator', flags, {
        logFile,
        cwd: options.root,
      })

      await waitUntilReady(() => httpHealthCheck(`${rpcUrl}/health`, requestTimeout), {
        label: 'Validator RPC',
        interval: poll,
        timeout: maxWait,
      })
    },

    async stop() {
      if (!isProcessRunning(processName)) {
        logger.info('Validator not running')
        return
      }

      logger.info('Stopping validator...')
      killByPattern(processName, 'SIGKILL')

      await waitUntilReady(async () => !isProcessRunning(processName), {
        label: 'Validator shutdown',
        interval: 500,
        timeout: 10_000,
        quiet: true,
      })

      for (const port of ports) {
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
      await baseStage.stop()

      if (existsSync(ledgerPath)) {
        logger.info('Removing stale ledger...')
        rmSync(ledgerPath, { recursive: true, force: true })
      }

      await baseStage.start()
    },

    stop: baseStage.stop,
  }
}
