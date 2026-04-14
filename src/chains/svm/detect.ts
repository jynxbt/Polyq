import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'pathe'
import type { ChainDetectionResult } from '../types'

export const SOLANA_PACKAGES = [
  '@solana/web3.js',
  '@coral-xyz/anchor',
  '@coral-xyz/borsh',
  '@solana/spl-token',
  '@solana/kit',
  '@metaplex-foundation/umi',
  'tweetnacl',
  'bs58',
]

export const SVM_OPTIMIZE_DEPS = [
  'buffer',
  '@coral-xyz/anchor',
  'bn.js',
  '@solana/web3.js',
  'bs58',
]

export const SVM_ROOT_MARKERS = ['Anchor.toml']

export function detectSvmProject(root: string): ChainDetectionResult | null {
  if (existsSync(resolve(root, 'Anchor.toml'))) {
    return { chain: 'svm', configFile: 'Anchor.toml', confidence: 'definite' }
  }
  return null
}

export function detectSolanaPackages(root: string): string[] {
  const pkgPath = resolve(root, 'package.json')
  if (!existsSync(pkgPath)) return []

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
    return SOLANA_PACKAGES.filter(p => p in allDeps)
  } catch {
    return []
  }
}
