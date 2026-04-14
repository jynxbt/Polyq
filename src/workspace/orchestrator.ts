import consola from 'consola'
import type { Stage } from './stage'
import type { ResolvedHelmConfig } from '../config/types'
import { createDockerStage } from './stages/docker'
import { createValidatorStage, createValidatorResetStage } from './stages/validator'
import { createProgramsBuildStage, createProgramsDeployStage } from './stages/programs'
import { createInitStage } from './stages/init'
import { createDatabaseStage, createDatabaseResetStage } from './stages/database'
import { createDevServerStage } from './stages/devserver'

const logger = consola.withTag('helm')

export interface OrchestratorOptions {
  /** Skip program builds and deploy */
  quick?: boolean
  /** Full reset before starting */
  reset?: boolean
  /** Only run specific stages by name */
  only?: string[]
}

/**
 * Build the ordered list of stages from config and options.
 */
export function buildStages(
  config: ResolvedHelmConfig,
  options: OrchestratorOptions = {},
): Stage[] {
  const ws = config.workspace
  if (!ws) {
    throw new Error('No workspace config. Run `helm init` or add a workspace section to helm.config.ts')
  }

  const chain = config._chain ?? 'svm'
  const stages: Stage[] = []

  // Stage 1: Docker
  if (ws.docker?.enabled !== false) {
    stages.push(createDockerStage({
      compose: ws.docker?.compose,
      services: ws.docker?.services,
      root: config.root,
    }))
  }

  // Stage 2: Validator / local node
  if (options.reset) {
    stages.push(createValidatorResetStage({
      rpcUrl: ws.validator?.rpcUrl,
      tool: ws.validator?.tool,
      flags: ws.validator?.flags,
      logFile: ws.validator?.logFile,
      root: config.root,
      chain,
    }))
  } else {
    stages.push(createValidatorStage({
      rpcUrl: ws.validator?.rpcUrl,
      tool: ws.validator?.tool,
      flags: ws.validator?.flags,
      logFile: ws.validator?.logFile,
      root: config.root,
      chain,
    }))
  }

  // Stage 3 & 4: Program/contract build + deploy (skip in --quick mode)
  if (!options.quick && config.programs) {
    stages.push(createProgramsBuildStage({
      programs: config.programs,
      features: ws.buildFeatures,
      rpcUrl: ws.validator?.rpcUrl,
      parallel: true,
      root: config.root,
      chain,
    }))

    stages.push(createProgramsDeployStage({
      programs: config.programs,
      rpcUrl: ws.validator?.rpcUrl,
      root: config.root,
      chain,
    }))
  }

  // Stage 5: Initialization (skip in --quick mode)
  if (!options.quick && ws.init) {
    stages.push(createInitStage({
      script: ws.init.script,
      runner: ws.init.runner,
      root: config.root,
    }))
  }

  // Stage 6: Database
  if (ws.database) {
    if (options.reset) {
      stages.push(createDatabaseResetStage({
        url: ws.database.url!,
        migrationsDir: ws.database.migrationsDir,
        extensions: ['pgcrypto', 'timescaledb'],
        seed: ws.database.seed,
        root: config.root,
      }))
    } else {
      stages.push(createDatabaseStage({
        url: ws.database.url!,
        migrationsDir: ws.database.migrationsDir,
        extensions: ['pgcrypto', 'timescaledb'],
        seed: ws.database.seed,
        root: config.root,
      }))
    }
  }

  // Stage 7: Dev server (always last)
  if (ws.devServer) {
    stages.push(createDevServerStage({
      command: ws.devServer.command,
      cwd: ws.devServer.cwd,
      root: config.root,
    }))
  }

  // Filter by --only if specified
  if (options.only?.length) {
    const names = options.only.map(s => s.toLowerCase())
    return stages.filter(s => names.some(n => s.name.toLowerCase().includes(n)))
  }

  return stages
}

/**
 * Run all stages sequentially. Each stage checks if it's already running
 * before starting. Fails fast on critical stages.
 */
export async function runStages(stages: Stage[]): Promise<void> {
  const total = stages.length
  const startTime = Date.now()

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i]
    const step = `[${i + 1}/${total}]`

    logger.info(`${step} ${stage.name}`)

    try {
      const alreadyReady = await stage.check()
      if (alreadyReady) {
        logger.success(`${step} ${stage.name} — already running`)
        continue
      }

      await stage.start()
    } catch (err: any) {
      logger.error(`${step} ${stage.name} failed: ${err.message}`)
      throw err
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  logger.success(`All stages complete (${elapsed}s)`)
}

/**
 * Stop all stages in reverse order.
 */
export async function stopStages(stages: Stage[]): Promise<void> {
  for (const stage of [...stages].reverse()) {
    try {
      await stage.stop()
    } catch (err: any) {
      logger.warn(`Failed to stop ${stage.name}: ${err.message}`)
    }
  }

  logger.success('All services stopped')
}

/**
 * Check the status of all stages.
 */
export async function checkStages(stages: Stage[]): Promise<{ name: string, running: boolean }[]> {
  const results: { name: string, running: boolean }[] = []

  for (const stage of stages) {
    try {
      const running = await stage.check()
      results.push({ name: stage.name, running })
    } catch {
      results.push({ name: stage.name, running: false })
    }
  }

  return results
}
