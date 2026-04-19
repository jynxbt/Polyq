import consola from 'consola'
import { gracefulKill, run } from '../process'
import type { Stage } from '../stage'

const logger = consola.withTag('polyq:devserver')

export interface DevServerStageOptions {
  /** Command to run (e.g., 'bun run dev') */
  command: string
  /** Working directory (relative to root) */
  cwd?: string | undefined
  /** Project root */
  root: string
}

// DevServer runs in the foreground; `healthChecks` isn't consumed here yet.
// Declared on the orchestrator payload for symmetry but not threaded down.

/**
 * Start the dev server (e.g., Nuxt, Vite) in the foreground.
 * This is always the last stage — it takes over the terminal.
 */
export function createDevServerStage(options: DevServerStageOptions): Stage {
  const parts = options.command.split(' ')
  const cmd = parts[0]
  if (!cmd) throw new Error(`Invalid dev server command: "${options.command}"`)
  const args = parts.slice(1)
  const cwd = options.cwd ? `${options.root}/${options.cwd}` : options.root

  return {
    name: 'Dev Server',

    async check() {
      // Dev server is always started fresh
      return false
    },

    async start() {
      logger.info(`Starting: ${options.command}`)

      // This runs in the foreground — blocks until the dev server exits
      const result = await run(cmd, args, {
        cwd,
        label: 'dev server',
      })

      if (result.exitCode !== 0 && result.exitCode !== 130) {
        // 130 = SIGINT (Ctrl+C), which is normal
        logger.error(`Dev server exited with code ${result.exitCode}`)
      }
    },

    async stop() {
      // Dev servers own caches + child processes. SIGTERM first so Nuxt/Vite
      // can flush their .cache/.next directories, then escalate to SIGKILL if
      // they hang past the default 3-second window.
      await gracefulKill('nuxt dev')
      await gracefulKill('vite')
    },
  }
}
