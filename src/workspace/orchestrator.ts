import consola from 'consola'
import type { ResolvedPolyqConfig } from '../config/types'
import { errorMessage } from '../utils/error'
import type { Stage } from './stage'
import { createDatabaseResetStage, createDatabaseStage } from './stages/database'
import { createDevServerStage } from './stages/devserver'
import { createDockerStage } from './stages/docker'
import { createInitStage } from './stages/init'
import { createProgramsBuildStage, createProgramsDeployStage } from './stages/programs'
import { createValidatorResetStage, createValidatorStage } from './stages/validator'

const logger = consola.withTag('polyq')

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
  config: ResolvedPolyqConfig,
  options: OrchestratorOptions = {},
): Stage[] {
  const ws = config.workspace
  if (!ws) {
    throw new Error(
      'No workspace config. Run `polyq init` or add a workspace section to polyq.config.ts',
    )
  }

  const chain = config.resolvedChain ?? 'svm'
  const stages: Stage[] = []
  const healthChecks = ws.healthChecks

  // Stage 1: Docker
  if (ws.docker?.enabled !== false) {
    stages.push(
      createDockerStage({
        compose: ws.docker?.compose,
        services: ws.docker?.services,
        healthCheckPort: ws.docker?.healthCheckPort,
        healthChecks,
        root: config.root,
      }),
    )
  }

  // Stage 2: Validator / local node
  const validatorOpts = {
    rpcUrl: ws.validator?.rpcUrl,
    tool: ws.validator?.tool,
    flags: ws.validator?.flags,
    logFile: ws.validator?.logFile,
    command: ws.validator?.command,
    processName: ws.validator?.processName,
    ports: ws.validator?.ports,
    healthChecks,
    root: config.root,
    chain,
  }
  if (options.reset) {
    stages.push(createValidatorResetStage(validatorOpts))
  } else {
    stages.push(createValidatorStage(validatorOpts))
  }

  // Stage 3 & 4: Program/contract build + deploy (skip in --quick mode)
  if (!options.quick && config.programs) {
    stages.push(
      createProgramsBuildStage({
        programs: config.programs,
        features: ws.buildFeatures,
        rpcUrl: ws.validator?.rpcUrl,
        parallel: true,
        healthChecks,
        root: config.root,
        chain,
      }),
    )

    stages.push(
      createProgramsDeployStage({
        programs: config.programs,
        rpcUrl: ws.validator?.rpcUrl,
        healthChecks,
        root: config.root,
        chain,
      }),
    )
  }

  // Stage 5: Initialization (skip in --quick mode)
  if (!options.quick && ws.init) {
    stages.push(
      createInitStage({
        script: ws.init.script,
        runner: ws.init.runner,
        root: config.root,
      }),
    )
  }

  // Stage 6: Database
  if (ws.database) {
    const dbExtensions = ws.database.extensions ?? []
    const dbOpts = {
      url: ws.database.url!,
      migrationsDir: ws.database.migrationsDir,
      extensions: dbExtensions,
      seed: ws.database.seed,
      healthChecks,
      root: config.root,
    }
    if (options.reset) {
      stages.push(createDatabaseResetStage(dbOpts))
    } else {
      stages.push(createDatabaseStage(dbOpts))
    }
  }

  // Stage 7: Dev server (always last)
  if (ws.devServer) {
    stages.push(
      createDevServerStage({
        command: ws.devServer.command,
        cwd: ws.devServer.cwd,
        root: config.root,
      }),
    )
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
    const stage = stages[i]!
    const step = `[${i + 1}/${total}]`

    logger.info(`${step} ${stage.name}`)

    try {
      const alreadyReady = await stage.check()
      if (alreadyReady) {
        logger.success(`${step} ${stage.name} — already running`)
        continue
      }

      await stage.start()
    } catch (err: unknown) {
      logger.error(`${step} ${stage.name} failed: ${errorMessage(err)}`)
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
    } catch (err: unknown) {
      logger.warn(`Failed to stop ${stage.name}: ${errorMessage(err)}`)
    }
  }

  logger.success('All services stopped')
}

/**
 * Check the status of all stages.
 */
export async function checkStages(stages: Stage[]): Promise<{ name: string; running: boolean }[]> {
  const results: { name: string; running: boolean }[] = []

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
