import { getAllProviders } from '../chains'

// Re-export SVM detection for backwards compat
export { SOLANA_PACKAGES, SVM_OPTIMIZE_DEPS as OPTIMIZE_DEPS, detectSolanaPackages } from '../chains/svm/detect'

/** Node built-ins that blockchain libs may need in browsers */
export const NODE_POLYFILLS = {
  buffer: 'buffer/',
  crypto: 'crypto-browserify',
  stream: 'stream-browserify',
  http: 'stream-http',
  https: 'https-browserify',
  zlib: 'browserify-zlib',
  url: 'url/',
} as const

/**
 * Detect chain packages across all supported chains.
 */
export function detectChainPackages(root: string): string[] {
  const all: string[] = []
  for (const provider of getAllProviders()) {
    all.push(...provider.detectPackages(root))
  }
  return all
}

export interface PolyfillNeeds {
  global: boolean
  buffer: boolean
  crypto: boolean
  process: boolean
}

export function resolvePolyfillNeeds(
  detected: string[],
  overrides?: Partial<PolyfillNeeds>,
): PolyfillNeeds {
  const hasSolana = detected.length > 0

  return {
    global: overrides?.global ?? hasSolana,
    buffer: overrides?.buffer ?? hasSolana,
    crypto: overrides?.crypto ?? false,
    process: overrides?.process ?? false,
  }
}
