import consola from 'consola'

export interface PollOptions {
  /** Human-readable label for logging */
  label: string
  /** Milliseconds between checks */
  interval: number
  /** Maximum total milliseconds to wait */
  timeout: number
  /** Suppress progress logging */
  quiet?: boolean
}

const defaults: PollOptions = {
  label: 'service',
  interval: 1000,
  timeout: 30_000,
}

/**
 * Poll a check function until it returns true or the timeout expires.
 * Replaces hardcoded `setTimeout(2000)` patterns with proper readiness polling.
 */
export async function waitUntilReady(
  check: () => Promise<boolean>,
  options?: Partial<PollOptions>,
): Promise<void> {
  const opts = { ...defaults, ...options }
  const start = Date.now()
  let attempts = 0

  while (Date.now() - start < opts.timeout) {
    attempts++
    try {
      if (await check()) {
        if (!opts.quiet) {
          consola.success(
            `${opts.label} ready (${attempts} attempt${attempts > 1 ? 's' : ''}, ${Date.now() - start}ms)`,
          )
        }
        return
      }
    } catch {
      // Check threw — keep polling
    }
    await sleep(opts.interval)
  }

  throw new Error(
    `${opts.label} did not become ready within ${opts.timeout}ms (${attempts} attempts)`,
  )
}

/**
 * Check if an HTTP endpoint returns a 2xx status.
 */
export async function httpHealthCheck(url: string, timeoutMs = 2000): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    return res.ok
  } catch {
    return false
  }
}

/**
 * Check if a TCP port is accepting connections.
 */
export async function portCheck(host: string, port: number, timeoutMs = 1000): Promise<boolean> {
  const { createConnection } = await import('node:net')
  return new Promise(resolve => {
    const socket = createConnection({ host, port, timeout: timeoutMs })
    socket.on('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.on('error', () => {
      socket.destroy()
      resolve(false)
    })
    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
