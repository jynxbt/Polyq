import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'pathe'
import type { ProgramConfig } from '../../config/types'

/**
 * Detect EVM contracts from Foundry or Hardhat project structure.
 */
export function detectEvmPrograms(
  root: string,
): Record<string, ProgramConfig> | undefined {
  // Try Foundry first
  const foundryToml = resolve(root, 'foundry.toml')
  if (existsSync(foundryToml)) {
    return detectFromFoundry(root, foundryToml)
  }

  // Try Hardhat
  for (const name of ['hardhat.config.ts', 'hardhat.config.js']) {
    if (existsSync(resolve(root, name))) {
      return detectFromHardhat(root)
    }
  }

  return undefined
}

function detectFromFoundry(
  root: string,
  tomlPath: string,
): Record<string, ProgramConfig> | undefined {
  const programs: Record<string, ProgramConfig> = {}

  // Read foundry.toml for src directory (default: 'src')
  const content = readFileSync(tomlPath, 'utf-8')
  const srcMatch = /^src\s*=\s*['"]([^'"]+)['"]/m.exec(content)
  const srcDir = srcMatch?.[1] ?? 'src'

  const outMatch = /^out\s*=\s*['"]([^'"]+)['"]/m.exec(content)
  const outDir = outMatch?.[1] ?? 'out'

  // Find .sol files in src directory
  const srcPath = resolve(root, srcDir)
  if (existsSync(srcPath)) {
    const files = findSolFiles(srcPath)
    for (const file of files) {
      const name = file.replace('.sol', '')
      const camelName = name.charAt(0).toLowerCase() + name.slice(1)
      programs[camelName] = {
        type: 'foundry',
        path: `${srcDir}/${file}`,
        schema: `${outDir}/${file}/${name}.json`,
      }
    }
  }

  return Object.keys(programs).length > 0 ? programs : undefined
}

function detectFromHardhat(
  root: string,
): Record<string, ProgramConfig> | undefined {
  const programs: Record<string, ProgramConfig> = {}

  // Check for contracts/ directory (Hardhat default)
  const contractsDir = resolve(root, 'contracts')
  if (existsSync(contractsDir)) {
    const files = findSolFiles(contractsDir)
    for (const file of files) {
      const name = file.replace('.sol', '')
      const camelName = name.charAt(0).toLowerCase() + name.slice(1)
      programs[camelName] = {
        type: 'hardhat',
        path: `contracts/${file}`,
        schema: `artifacts/contracts/${file}/${name}.json`,
      }
    }
  }

  return Object.keys(programs).length > 0 ? programs : undefined
}

function findSolFiles(dir: string): string[] {
  try {
    return readdirSync(dir).filter(f => f.endsWith('.sol'))
  } catch {
    return []
  }
}

export function findEvmSchemaFiles(root: string): string[] {
  const files: string[] = []

  // Foundry: out/
  const outDir = resolve(root, 'out')
  if (existsSync(outDir)) {
    try {
      for (const contractDir of readdirSync(outDir)) {
        const contractPath = resolve(outDir, contractDir)
        const jsonFiles = readdirSync(contractPath)
          .filter(f => f.endsWith('.json') && !f.endsWith('.dbg.json'))
        for (const f of jsonFiles) {
          files.push(resolve(contractPath, f))
        }
      }
    } catch { /* empty */ }
  }

  // Hardhat: artifacts/contracts/
  const artifactsDir = resolve(root, 'artifacts/contracts')
  if (existsSync(artifactsDir)) {
    try {
      for (const contractDir of readdirSync(artifactsDir)) {
        const contractPath = resolve(artifactsDir, contractDir)
        const jsonFiles = readdirSync(contractPath)
          .filter(f => f.endsWith('.json') && !f.endsWith('.dbg.json'))
        for (const f of jsonFiles) {
          files.push(resolve(contractPath, f))
        }
      }
    } catch { /* empty */ }
  }

  return files
}
