import { type ChildProcess, execSync, type SpawnOptions, spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import consola from 'consola'
import { errorMessage } from '../utils/error'

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
  const timeout = options?.timeout ?? 300_000 // 5 minutes default

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
      child.stdout?.on('data', d => {
        stdout += d.toString()
      })
      child.stderr?.on('data', d => {
        stderr += d.toString()
      })
    }

    child.on('error', err => {
      if (timer) clearTimeout(timer)
      reject(new Error(`${label} failed to start: ${err.message}`))
    })

    child.on('close', code => {
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
  options?: { cwd?: string; timeout?: number },
): { ok: boolean; output: string } {
  try {
    const output = execSync(command, {
      cwd: options?.cwd,
      timeout: options?.timeout ?? 5000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { ok: true, output: output.trim() }
  } catch (e: unknown) {
    const stderr = (e as { stderr?: { toString: () => string } })?.stderr?.toString()
    return { ok: false, output: stderr ?? errorMessage(e) }
  }
}

// Probed per call rather than at module load so tests can swap
// `process.platform` around individual invocations.
const isWindows = (): boolean => process.platform === 'win32'

/**
 * Kill processes matching a pattern.
 *
 * - POSIX: `pkill -f <pattern>` (SIGTERM) or `pkill -9 -f <pattern>` (SIGKILL).
 * - Windows: `taskkill /F /FI "WINDOWTITLE eq <pattern>*"` — pkill's `-f` flag
 *   matches the full command line; `taskkill` with `/FI` filters on fields.
 *   Windows has no per-process signal concept; `/F` is forceful kill, omitting
 *   it asks the process to terminate (roughly analogous to SIGTERM).
 */
export function killByPattern(pattern: string, signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM'): boolean {
  if (isWindows()) {
    // taskkill matches on the image name OR the window title; most dev-server
    // processes we target (vite, anvil, solana-test-validator) show up as the
    // binary name so IMAGENAME works. Users targeting something unusual can
    // override via validator.processName.
    const force = signal === 'SIGKILL' ? '/F' : ''
    const { ok } = runSync(`taskkill ${force} /FI "IMAGENAME eq ${pattern}*"`.trim())
    return ok
  }
  const flag = signal === 'SIGKILL' ? '-9' : ''
  const { ok } = runSync(`pkill ${flag} -f "${pattern}"`.trim())
  return ok
}

/**
 * Try SIGTERM first, give the process a chance to flush state, then escalate
 * to SIGKILL if it's still alive. Prefer this over a bare SIGKILL for
 * long-running processes that own caches, log buffers, or child processes.
 *
 * Returns `true` if the process(es) exited (via either signal), `false` if
 * nothing matched or they're still alive after the escalation.
 */
export async function gracefulKill(
  pattern: string,
  options: { timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 3000
  const pollIntervalMs = options.pollIntervalMs ?? 200

  if (!isProcessRunning(pattern)) return false

  killByPattern(pattern, 'SIGTERM')

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isProcessRunning(pattern)) return true
    await new Promise(r => setTimeout(r, pollIntervalMs))
  }

  // Still alive — escalate.
  logger.debug(`Process "${pattern}" did not exit after ${timeoutMs}ms of SIGTERM; sending SIGKILL`)
  killByPattern(pattern, 'SIGKILL')
  // Brief window for the kernel to reap.
  await new Promise(r => setTimeout(r, pollIntervalMs))
  return !isProcessRunning(pattern)
}

/**
 * Check if any process matches a pattern.
 * POSIX: `pgrep -f`. Windows: `tasklist /FI "IMAGENAME eq <pattern>*"`.
 */
export function isProcessRunning(pattern: string): boolean {
  if (isWindows()) {
    const { ok, output } = runSync(`tasklist /NH /FI "IMAGENAME eq ${pattern}*"`)
    // `tasklist` returns ok:true and prints "INFO: No tasks..." when empty.
    // A real match contains the pattern in the output; an empty result does not.
    return ok && output.length > 0 && !output.startsWith('INFO:')
  }
  const { ok } = runSync(`pgrep -f "${pattern}"`)
  return ok
}

/**
 * Kill processes listening on a specific port.
 * POSIX: `lsof -t -i:<port>` → `process.kill(pid, signal)`.
 * Windows: `netstat -ano | findstr :<port>` to find the PID, then
 *          `process.kill` — same Node API works on both platforms for pid-based kills.
 */
export function killPort(port: number, signal: 'SIGTERM' | 'SIGKILL' = 'SIGKILL'): boolean {
  const pids = isWindows() ? findPidsOnPortWindows(port) : findPidsOnPortPosix(port)
  if (pids.length === 0) return false

  for (const pid of pids) {
    try {
      // Windows doesn't really distinguish SIGTERM from SIGKILL for console
      // processes — Node's process.kill emulates it by translating to a
      // TerminateProcess call for SIGKILL and the default for others.
      process.kill(pid, signal === 'SIGKILL' ? 'SIGKILL' : 'SIGTERM')
    } catch {
      // Process may have already exited
    }
  }
  return true
}

function findPidsOnPortPosix(port: number): number[] {
  const { ok, output } = runSync(`lsof -t -i:${port}`)
  if (!ok || !output.trim()) return []
  return output
    .trim()
    .split('\n')
    .map(s => Number(s))
    .filter(n => Number.isFinite(n) && n > 0)
}

function findPidsOnPortWindows(port: number): number[] {
  // `netstat -ano` lists every socket with its owning PID in the last column.
  // Filter rows that end with `:<port>` on the local address side, then yank
  // the PID. Works for both IPv4 (0.0.0.0:<port>) and IPv6 ([::]:<port>).
  const { ok, output } = runSync('netstat -ano')
  if (!ok) return []
  const pids = new Set<number>()
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed?.toLowerCase().startsWith('tcp')) continue
    // Columns: Proto | LocalAddr | ForeignAddr | State | PID
    const cols = trimmed.split(/\s+/)
    if (cols.length < 5) continue
    const local = cols[1]!
    if (!local.endsWith(`:${port}`)) continue
    const pid = Number(cols[4])
    if (Number.isFinite(pid) && pid > 0) pids.add(pid)
  }
  return [...pids]
}
