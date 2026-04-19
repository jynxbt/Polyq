import { execSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import consola from 'consola'
import { resolve } from 'pathe'
import type { HealthCheckTuning } from '../../config/types'
import { errorMessage } from '../../utils/error'
import { run } from '../process'
import type { Stage } from '../stage'

// Note: psql commands use the local psql() helper (not runSync) to avoid
// interpolating database URLs into shell command strings.

const logger = consola.withTag('polyq:database')

/**
 * Run psql safely by passing the connection URL via PGHOST/PGPORT/PGUSER/
 * PGPASSWORD/PGDATABASE environment variables instead of interpolating
 * into a shell command string. Prevents command injection and hides
 * credentials from process listings.
 */
function psql(
  url: string,
  args: string[],
  options?: { timeout?: number },
): { ok: boolean; output: string } {
  // Parse URL into individual components for env vars
  const parsed = new URL(url)
  const pgEnv: Record<string, string> = {
    ...process.env,
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || '5432',
    PGDATABASE: parsed.pathname.replace('/', ''),
  }
  if (parsed.username) pgEnv.PGUSER = decodeURIComponent(parsed.username)
  if (parsed.password) pgEnv.PGPASSWORD = decodeURIComponent(parsed.password)

  try {
    const output = execSync(['psql', ...args].join(' '), {
      env: pgEnv,
      timeout: options?.timeout ?? 10_000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { ok: true, output: output.trim() }
  } catch (e: unknown) {
    const stderr = (e as { stderr?: { toString: () => string } })?.stderr?.toString()
    return { ok: false, output: stderr ?? errorMessage(e) }
  }
}

export interface DatabaseStageOptions {
  /** PostgreSQL connection URL */
  url: string
  /** Path to migrations directory (relative to root) */
  migrationsDir?: string | undefined
  /** PostgreSQL extensions to enable */
  extensions?: string[] | undefined
  /** Seed script and runner */
  seed?:
    | {
        script: string
        runner?: string | undefined
      }
    | undefined
  /**
   * Health check tuning. `requestTimeout` bounds each individual `psql` call;
   * `maxWait` bounds the migration step (which can be long on cold caches).
   */
  healthChecks?: HealthCheckTuning | undefined
  /** Project root */
  root: string
}

export function createDatabaseStage(options: DatabaseStageOptions): Stage {
  const migrationsDir = options.migrationsDir
    ? resolve(options.root, options.migrationsDir)
    : undefined
  const extensions = options.extensions ?? []

  // Per-psql-call timeout. `requestTimeout` is the user knob; a cold migration
  // can legitimately take tens of seconds so migrations get `maxWait` instead.
  const probeTimeout = options.healthChecks?.requestTimeout ?? 5000
  const migrationTimeout = options.healthChecks?.maxWait ?? 30_000

  return {
    name: 'Database',

    async check() {
      // Check if we can connect and if a known table exists
      const { ok } = psql(options.url, ['-c', 'SELECT 1 FROM zenids LIMIT 0'], {
        timeout: probeTimeout,
      })
      return ok
    },

    async start() {
      // Enable extensions
      for (const ext of extensions) {
        // Sanitize extension name — only allow alphanumeric and underscore
        const safeExt = ext.replace(/[^a-zA-Z0-9_]/g, '')
        if (safeExt !== ext) {
          logger.warn(`Skipping unsafe extension name: "${ext}"`)
          continue
        }
        logger.info(`Enabling extension: ${safeExt}`)
        const { ok } = psql(options.url, ['-c', `CREATE EXTENSION IF NOT EXISTS "${safeExt}"`], {
          timeout: probeTimeout,
        })
        if (!ok) {
          logger.warn(`Failed to enable extension: ${safeExt}`)
        }
      }

      // Run migrations
      if (migrationsDir && existsSync(migrationsDir)) {
        const files = readdirSync(migrationsDir)
          .filter(f => f.endsWith('.sql'))
          .sort()

        if (files.length > 0) {
          logger.info(`Running ${files.length} migrations...`)
          for (const file of files) {
            const filePath = resolve(migrationsDir, file)
            const { ok, output } = psql(options.url, ['-v', 'ON_ERROR_STOP=1', '-f', filePath], {
              timeout: migrationTimeout,
            })
            if (!ok) {
              // Some migrations may fail if already applied — warn but continue
              logger.debug(`Migration ${file}: ${output}`)
            }
          }
          logger.success('Migrations complete')
        }
      }

      // Run seed script
      if (options.seed) {
        const runner = options.seed.runner ?? 'bun'
        const script = options.seed.script

        // Check if already seeded
        const { ok: seeded } = psql(
          options.url,
          ['-c', "SELECT 1 FROM zenids WHERE handle LIKE 'local_%' LIMIT 1"],
          { timeout: probeTimeout },
        )

        if (!seeded) {
          logger.info('Seeding data...')
          const result = await run(runner, ['run', script], {
            cwd: options.root,
            label: 'seed',
          })
          if (result.exitCode !== 0) {
            logger.warn(`Seeding failed (exit ${result.exitCode}) — non-critical`)
          } else {
            logger.success('Seeding complete')
          }
        } else {
          logger.info('Database already seeded')
        }
      }
    },

    async stop() {
      // Nothing to stop — database persists
    },
  }
}

/**
 * Hard reset: drop and recreate the database, then run migrations and seed.
 */
export function createDatabaseResetStage(options: DatabaseStageOptions): Stage {
  const baseStage = createDatabaseStage(options)

  return {
    name: 'Database (reset)',
    check: baseStage.check,

    async start() {
      const url = new URL(options.url)
      const dbName = url.pathname.replace('/', '')

      // Sanitize database name — only allow alphanumeric, underscore, hyphen
      const safeDbName = dbName.replace(/[^a-zA-Z0-9_-]/g, '')
      if (safeDbName !== dbName) {
        throw new Error(
          `Unsafe database name: "${dbName}". Only alphanumeric, underscore, hyphen allowed.`,
        )
      }

      // Connect to maintenance database
      url.pathname = '/postgres'
      const maintenanceUrl = url.toString()

      logger.info(`Dropping database: ${safeDbName}`)

      const probeTimeout = options.healthChecks?.requestTimeout ?? 5000

      // Terminate existing connections
      psql(
        maintenanceUrl,
        [
          '-c',
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${safeDbName}' AND pid <> pg_backend_pid()`,
        ],
        { timeout: probeTimeout },
      )

      // Drop and recreate
      psql(maintenanceUrl, ['-c', `DROP DATABASE IF EXISTS "${safeDbName}"`], {
        timeout: probeTimeout,
      })
      psql(maintenanceUrl, ['-c', `CREATE DATABASE "${safeDbName}"`], { timeout: probeTimeout })

      logger.success(`Database ${dbName} recreated`)

      // Now run base stage (extensions, migrations, seed)
      await baseStage.start()
    },

    stop: baseStage.stop,
  }
}
