import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import consola from 'consola'
import { join, relative, resolve } from 'pathe'
import type { CodegenConfig } from '../../config/types'
import { codegenHeader } from '../_header'
import type { CodegenOutput } from '../types'

const logger = consola.withTag('polyq:evm-codegen-viem')

interface AbiItem {
  type: 'function' | 'event' | 'error' | 'constructor' | 'fallback' | 'receive'
  name?: string
  inputs?: unknown[]
  outputs?: unknown[]
  stateMutability?: string
  anonymous?: boolean
}

interface HardhatArtifact {
  contractName?: string
  abi: AbiItem[]
}

/**
 * Generate a viem-flavored TypeScript client from an EVM ABI.
 *
 * Output shape:
 *   generated/<contract>/
 *     abi.ts       — `export const <NAME>_ABI = [...] as const satisfies Abi`
 *     contract.ts  — a `createXContract(address, client)` helper wrapping viem's getContract
 *     index.ts     — barrel re-export
 *
 * Consumer's side:
 *   import { createCounterContract } from './generated/counter'
 *   const counter = createCounterContract('0x...', publicClient)
 *   const slot = await counter.read.count()
 */
export function generateFromAbiViem(
  schemaPath: string,
  outDir: string,
  config?: Partial<CodegenConfig>,
): CodegenOutput {
  const raw = readFileSync(schemaPath, 'utf-8')
  let artifact: HardhatArtifact
  try {
    artifact = JSON.parse(raw)
  } catch {
    throw new Error(`Invalid JSON in ABI file: ${schemaPath}`)
  }
  if (!Array.isArray(artifact.abi)) {
    throw new Error(`ABI file missing required "abi" array: ${schemaPath}`)
  }

  const contractName =
    artifact.contractName ?? schemaPath.split('/').pop()?.replace('.json', '') ?? 'Contract'

  logger.info(`Generating viem client for ${contractName}...`)

  const files: CodegenOutput['files'] = []
  const header = codegenHeader(config)

  files.push({ path: 'abi.ts', content: renderAbi(contractName, artifact.abi, header) })
  files.push({ path: 'contract.ts', content: renderContract(contractName, header) })
  files.push({ path: 'index.ts', content: renderBarrel(header) })

  const contractDir = resolve(outDir, camelToKebab(contractName))
  if (relative(outDir, contractDir).startsWith('..')) {
    throw new Error(`Path traversal detected in contract name: ${contractName}`)
  }
  mkdirSync(contractDir, { recursive: true })
  for (const file of files) {
    writeFileSync(join(contractDir, file.path), file.content, 'utf-8')
    logger.success(`  → ${file.path}`)
  }

  return { files }
}

function renderAbi(name: string, abi: AbiItem[], header: string): string {
  const constName = `${toConstCase(name)}_ABI`
  return [
    header,
    `// ABI for ${name} (viem-ready, as const-asserted)`,
    '',
    `import type { Abi } from 'viem'`,
    '',
    `export const ${constName} = ${JSON.stringify(abi, null, 2)} as const satisfies Abi`,
    '',
    `export type ${name}Abi = typeof ${constName}`,
    '',
  ].join('\n')
}

function renderContract(name: string, header: string): string {
  const constName = `${toConstCase(name)}_ABI`
  const factoryName = `create${name}Contract`
  return [
    header,
    `// Typed viem contract wrapper for ${name}`,
    '',
    `import type { Address, Client } from 'viem'`,
    `import { getContract } from 'viem'`,
    `import { ${constName} } from './abi'`,
    '',
    '/**',
    ` * Build a typed viem contract instance for ${name}.`,
    ' *',
    ' * @example',
    ` *   const ${lowerFirst(name)} = ${factoryName}('0x...', publicClient)`,
    ` *   const value = await ${lowerFirst(name)}.read.someMethod()`,
    ' */',
    `export function ${factoryName}(address: Address, client: Client) {`,
    `  return getContract({ address, abi: ${constName}, client })`,
    '}',
    '',
  ].join('\n')
}

function renderBarrel(header: string): string {
  return [header, '', "export * from './abi'", "export * from './contract'", ''].join('\n')
}

function toConstCase(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toUpperCase()
}

function camelToKebab(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
}

function lowerFirst(s: string): string {
  return s.length > 0 ? s[0]!.toLowerCase() + s.slice(1) : s
}
