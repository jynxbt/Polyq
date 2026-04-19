import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'pathe'
import type { ChainDetectionResult } from '../types'

export const EVM_PACKAGES = [
  'ethers',
  'viem',
  'wagmi',
  '@wagmi/core',
  'web3',
  'hardhat',
  '@nomiclabs/hardhat-ethers',
  '@nomicfoundation/hardhat-toolbox',
  '@openzeppelin/contracts',
]

export const EVM_OPTIMIZE_DEPS = ['ethers', 'viem']

export const EVM_ROOT_MARKERS = [
  'foundry.toml',
  'hardhat.config.ts',
  'hardhat.config.js',
  'hardhat.config.cjs',
  'hardhat.config.mjs',
]

export function detectEvmProject(root: string): ChainDetectionResult | null {
  if (existsSync(resolve(root, 'foundry.toml'))) {
    return { chain: 'evm', configFile: 'foundry.toml', confidence: 'definite' }
  }
  for (const marker of EVM_ROOT_MARKERS.slice(1)) {
    if (existsSync(resolve(root, marker))) {
      return { chain: 'evm', configFile: marker, confidence: 'definite' }
    }
  }
  return null
}

export function detectEvmPackages(root: string): string[] {
  const pkgPath = resolve(root, 'package.json')
  if (!existsSync(pkgPath)) return []

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
    return EVM_PACKAGES.filter(p => p in allDeps)
  } catch {
    return []
  }
}
