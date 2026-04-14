import consola from 'consola'
import type { Stage } from '../../workspace/stage'
import { spawnDetached, killByPattern, isProcessRunning, killPort } from '../../workspace/process'
import { waitUntilReady } from '../../workspace/health'
import type { ValidatorStageOptions } from '../types'

const logger = consola.withTag('helm:evm-node')

interface EvmToolConfig {
  command: string
  args: string[]
  processName: string
  ports: number[]
}

const EVM_TOOLS: Record<string, EvmToolConfig> = {
  anvil: {
    command: 'anvil',
    args: [],
    processName: 'anvil',
    ports: [8545],
  },
  hardhat: {
    command: 'npx',
    args: ['hardhat', 'node'],
    processName: 'hardhat',
    ports: [8545],
  },
  ganache: {
    command: 'ganache',
    args: [],
    processName: 'ganache',
    ports: [8545],
  },
}

/**
 * Health check via JSON-RPC eth_blockNumber call.
 */
async function evmHealthCheck(rpcUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2000)
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    const data = await res.json() as any
    return !!data.result
  } catch {
    return false
  }
}

export function createEvmValidatorStage(options: ValidatorStageOptions): Stage {
  const tool = options.tool ?? 'anvil'
  const config = EVM_TOOLS[tool]
  if (!config) throw new Error(`Unknown EVM tool: ${tool}. Use: ${Object.keys(EVM_TOOLS).join(', ')}`)

  const rpcUrl = options.rpcUrl ?? 'http://127.0.0.1:8545'
  const logFile = options.logFile ?? `/tmp/helm-${tool}.log`

  return {
    name: `EVM Node (${tool})`,

    async check() {
      return evmHealthCheck(rpcUrl)
    },

    async start() {
      if (await evmHealthCheck(rpcUrl)) {
        logger.info(`${tool} already running`)
        return
      }

      if (isProcessRunning(config.processName)) {
        logger.info(`Killing stale ${tool}...`)
        killByPattern(config.processName, 'SIGKILL')
        await waitUntilReady(
          async () => !isProcessRunning(config.processName),
          { label: `${tool} shutdown`, interval: 500, timeout: 10_000, quiet: true },
        )
      }

      for (const port of config.ports) {
        killPort(port)
      }

      logger.info(`Starting ${tool}...`)
      const allArgs = [...config.args, ...(options.flags ?? [])]
      spawnDetached(config.command, allArgs, {
        logFile,
        cwd: options.root,
      })

      await waitUntilReady(
        () => evmHealthCheck(rpcUrl),
        { label: `${tool} RPC`, interval: 1000, timeout: 30_000 },
      )
    },

    async stop() {
      if (!isProcessRunning(config.processName)) {
        logger.info(`${tool} not running`)
        return
      }

      logger.info(`Stopping ${tool}...`)
      killByPattern(config.processName, 'SIGKILL')
      await waitUntilReady(
        async () => !isProcessRunning(config.processName),
        { label: `${tool} shutdown`, interval: 500, timeout: 10_000, quiet: true },
      )
      for (const port of config.ports) {
        killPort(port)
      }
    },
  }
}

export function createEvmValidatorResetStage(options: ValidatorStageOptions): Stage {
  const baseStage = createEvmValidatorStage(options)
  return {
    name: `EVM Node (${options.tool ?? 'anvil'}, reset)`,
    check: baseStage.check,
    async start() {
      await baseStage.stop()
      await baseStage.start()
    },
    stop: baseStage.stop,
  }
}
