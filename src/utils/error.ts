/**
 * Extract a readable message from an `unknown` caught value.
 * Narrows `catch (e: unknown)` patterns without leaking `any`.
 */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  try {
    const serialized = JSON.stringify(e)
    // JSON.stringify(undefined) returns undefined, JSON.stringify(()=>{}) too.
    if (serialized !== undefined) return serialized
  } catch {
    // Cyclic or otherwise un-serializable — fall through to String().
  }
  return String(e)
}

/**
 * Parse the port from an RPC URL. Returns `fallback` if the URL omits a port
 * or the URL itself is malformed.
 */
export function parseRpcPort(rpcUrl: string, fallback: number): number {
  try {
    const parsed = new URL(rpcUrl)
    if (parsed.port) return Number.parseInt(parsed.port, 10)
    // URL() reports `port === ''` for default ports of the scheme.
    if (parsed.protocol === 'http:') return 80
    if (parsed.protocol === 'https:') return 443
    return fallback
  } catch {
    return fallback
  }
}
