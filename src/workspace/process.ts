import { spawn, execSync, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import consola from 'consola'

const logger = consola.withTag('polyq:process')

export interface SpawnResult {
  process: ChildProcess
  pid: number
}

export interface RunResult {
  exitCode: number
  stdout: string
  stderr: string
}

/**
 * Spawn a detached background process with output redirected to a log file.
 * The process survives the parent exiting.
 */
export function spawnDetached(
  command: string,
  args: string[],
  options?: {
    logFile?: string
    cwd?: string
    env?: Record<string, string>
  },
): SpawnResult {
  const spawnOpts: SpawnOptions = {
    detached: true,
    cwd: options?.cwd,
    env: { ...process.env, ...options?.env },
    stdio: 'ignore',
  }

  if (options?.logFile) {
    const out = createWriteStream(options.logFile, { flags: 'a' })
    spawnOpts.stdio = ['ignore', out, out]
  }

  const child = spawn(command, args, spawnOpts)
  child.unref()

  const pid = child.pid
  if (!pid) throw new Error(`Failed to spawn ${command}`)

  logger.debug(`Spawned ${command} (PID ${pid})`)
  return { process: child, pid }
}

/**
 * Run a command and stream output to the console. Returns when complete.
 */
export async function run(
  command: string,
  args: string[],
  options?: {
    cwd?: string
    env?: Record<string, string>
    label?: string
    quiet?: boolean
    /** Timeout in ms. Default: 5 minutes. Set 0 for no timeout. */
    timeout?: number
  },
): Promise<RunResult> {
  const label = options?.label ?? command
  const timeout = options?.timeout ?? 300_000  // 5 minutes default

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options?.cwd,
      env: { ...process.env, ...options?.env },
      stdio: options?.quiet ? 'pipe' : 'inherit',
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false

    // Kill process if it exceeds timeout
    let timer: ReturnType<typeof setTimeout> | undefined
    if (timeout > 0) {
      timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGKILL')
      }, timeout)
    }

    if (options?.quiet) {
      child.stdout?.on('data', (d) => { stdout += d.toString() })
      child.stderr?.on('data', (d) => { stderr += d.toString() })
    }

    child.on('error', (err) => {
      if (timer) clearTimeout(timer)
      reject(new Error(`${label} failed to start: ${err.message}`))
    })

    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      if (timedOut) {
        resolve({ exitCode: 124, stdout, stderr: `${label} timed out after ${timeout}ms` })
      } else {
        resolve({ exitCode: code ?? 1, stdout, stderr })
      }
    })
  })
}

/**
 * Run a command and capture output (no streaming). For quick checks.
 */
export function runSync(
  command: string,
  options?: { cwd?: string, timeout?: number },
): { ok: boolean, output: string } {
  try {
    const output = execSync(command, {
      cwd: options?.cwd,
      timeout: options?.timeout ?? 5000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { ok: true, output: output.trim() }
  } catch (e: any) {
    return { ok: false, output: e.stderr?.toString() ?? e.message ?? '' }
  }
}

/**
 * Kill processes matching a pattern using pkill.
 */
export function killByPattern(pattern: string, signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM'): boolean {
  const flag = signal === 'SIGKILL' ? '-9' : ''
  const { ok } = runSync(`pkill ${flag} -f "${pattern}"`.trim())
  return ok
}

/**
 * Check if any process matches a pattern.
 */
export function isProcessRunning(pattern: string): boolean {
  const { ok } = runSync(`pgrep -f "${pattern}"`)
  return ok
}

/**
 * Kill processes listening on a specific port.
 */
export function killPort(port: number, signal: 'SIGTERM' | 'SIGKILL' = 'SIGKILL'): boolean {
  const { ok, output } = runSync(`lsof -t -i:${port}`)
  if (!ok || !output.trim()) return false

  const pids = output.trim().split('\n')
  for (const pid of pids) {
    try {
      process.kill(Number(pid), signal === 'SIGKILL' ? 9 : 15)
    } catch {
      // Process may have already exited
    }
  }
  return true
}
