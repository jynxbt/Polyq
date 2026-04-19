import consola from 'consola'
import { errorMessage, parseRpcPort } from '../../utils/error'
import { waitUntilReady } from '../../workspace/health'
import { isProcessRunning, killByPattern, killPort, spawnDetached } from '../../workspace/process'
import type { Stage } from '../../workspace/stage'
import type { ValidatorStageOptions } from '../types'

const logger = consola.withTag('polyq:evm-node')

const DEFAULT_RPC_PORT = 8545

interface EvmToolConfig {
  command: string
  args: string[]
  processName: string
}

const EVM_TOOLS: Record<string, EvmToolConfig> = {
  anvil: { command: 'anvil', args: [], processName: 'anvil' },
  hardhat: { command: 'npx', args: ['hardhat', 'node'], processName: 'hardhat' },
  ganache: { command: 'ganache', args: [], processName: 'ganache' },
}

/**
 * Health check via JSON-RPC eth_blockNumber call.
 */
async function evmHealthCheck(rpcUrl: string, requestTimeoutMs: number): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs)
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    const data = (await res.json()) as { result?: string }
    return !!data.result
  } catch (e) {
    logger.debug(`EVM health check failed: ${errorMessage(e)}`)
    return false
  }
}

/**
 * Resolve the command to run. Built-in tools come from the map; for anything
 * else the caller must supply `options.command`. This is the plugin seam.
 */
function resolveToolConfig(options: ValidatorStageOptions): EvmToolConfig {
  const tool = options.tool ?? 'anvil'
  const builtin = EVM_TOOLS[tool]
  if (builtin) {
    return {
      command: options.command ?? builtin.command,
      args: builtin.args,
      processName: options.processName ?? builtin.processName,
    }
  }
  // Custom tool — `command` is required
  if (!options.command) {
    throw new Error(
      `Unknown EVM tool "${tool}". Either set \`workspace.validator.tool\` to one of ` +
        `${Object.keys(EVM_TOOLS).join(', ')}, or pass \`workspace.validator.command\` ` +
        'with the executable path.',
    )
  }
  return {
    command: options.command,
    args: [],
    processName: options.processName ?? tool,
  }
}

export function createEvmValidatorStage(options: ValidatorStageOptions): Stage {
  const tool = options.tool ?? 'anvil'
  const cfg = resolveToolConfig(options)

  const rpcUrl = options.rpcUrl ?? `http://127.0.0.1:${DEFAULT_RPC_PORT}`
  const rpcPort = parseRpcPort(rpcUrl, DEFAULT_RPC_PORT)
  const ports = options.ports ?? [rpcPort]
  const logFile = options.logFile ?? `/tmp/polyq-${tool}.log`

  const poll = options.healthChecks?.pollInterval ?? 1000
  const maxWait = options.healthChecks?.maxWait ?? 30_000
  const requestTimeout = options.healthChecks?.requestTimeout ?? 2000

  return {
    name: `EVM Node (${tool})`,

    async check() {
      return evmHealthCheck(rpcUrl, requestTimeout)
    },

    async start() {
      if (await evmHealthCheck(rpcUrl, requestTimeout)) {
        logger.info(`${tool} already running`)
        return
      }

      if (isProcessRunning(cfg.processName)) {
        logger.info(`Killing stale ${tool}...`)
        killByPattern(cfg.processName, 'SIGKILL')
        await waitUntilReady(async () => !isProcessRunning(cfg.processName), {
          label: `${tool} shutdown`,
          interval: 500,
          timeout: 10_000,
          quiet: true,
        })
      }

      for (const port of ports) {
        killPort(port)
      }

      logger.info(`Starting ${tool}...`)
      const allArgs = [...cfg.args, ...(options.flags ?? [])]
      spawnDetached(cfg.command, allArgs, {
        logFile,
        cwd: options.root,
      })

      await waitUntilReady(() => evmHealthCheck(rpcUrl, requestTimeout), {
        label: `${tool} RPC`,
        interval: poll,
        timeout: maxWait,
      })
    },

    async stop() {
      if (!isProcessRunning(cfg.processName)) {
        logger.info(`${tool} not running`)
        return
      }

      logger.info(`Stopping ${tool}...`)
      killByPattern(cfg.processName, 'SIGKILL')
      await waitUntilReady(async () => !isProcessRunning(cfg.processName), {
        label: `${tool} shutdown`,
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
