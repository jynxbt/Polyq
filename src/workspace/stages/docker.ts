import consola from 'consola'
import type { HealthCheckTuning } from '../../config/types'
import { portCheck, waitUntilReady } from '../health'
import { run, runSync } from '../process'
import type { Stage } from '../stage'

const logger = consola.withTag('polyq:docker')

export interface DockerStageOptions {
  /** Path to docker-compose.yml (relative to root) */
  compose?: string | undefined
  /** Specific services to start (default: all) */
  services?: string[] | undefined
  /** Port to health-check for readiness (default: 5432) */
  healthCheckPort?: number | undefined
  /** Health check tuning forwarded from workspace config */
  healthChecks?: HealthCheckTuning | undefined
  /** Project root */
  root: string
}

export function createDockerStage(options: DockerStageOptions): Stage {
  const composeFile = options.compose ?? 'docker-compose.yml'

  return {
    name: 'Docker',

    async check() {
      // Check if Docker daemon is running
      const { ok } = runSync('docker info', { timeout: 5000 })
      if (!ok) return false

      // Check if required services are running
      const { ok: psOk, output } = runSync(
        `docker compose -f ${composeFile} ps --services --filter status=running`,
        { cwd: options.root },
      )
      if (!psOk) return false

      const running = output.split('\n').filter(Boolean)
      const required = options.services ?? ['postgres']
      return required.every(s => running.includes(s))
    },

    async start() {
      // Verify Docker daemon
      const { ok: dockerOk } = runSync('docker info', { timeout: 5000 })
      if (!dockerOk) {
        throw new Error('Docker daemon is not running. Start Docker Desktop or dockerd.')
      }

      const serviceArgs = options.services?.length ? options.services.join(' ') : ''

      logger.info('Starting Docker services...')
      const result = await run(
        'docker',
        ['compose', '-f', composeFile, 'up', '-d', ...(serviceArgs ? serviceArgs.split(' ') : [])],
        { cwd: options.root, label: 'docker compose up' },
      )

      if (result.exitCode !== 0) {
        throw new Error(`docker compose up failed (exit ${result.exitCode})`)
      }

      // Wait for database to accept connections
      const dbPort = options.healthCheckPort ?? 5432
      await waitUntilReady(() => portCheck('127.0.0.1', dbPort), {
        label: 'Database',
        interval: options.healthChecks?.pollInterval ?? 500,
        timeout: options.healthChecks?.maxWait ?? 15_000,
      })
    },

    async stop() {
      logger.info('Stopping Docker services...')
      await run('docker', ['compose', '-f', composeFile, 'down'], {
        cwd: options.root,
        label: 'docker compose down',
      })
    },
  }
}
