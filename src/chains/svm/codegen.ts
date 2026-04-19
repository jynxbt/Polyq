import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import consola from 'consola'
import { join, relative, resolve } from 'pathe'
import type { CodegenConfig } from '../../config/types'
import { codegenHeader } from '../_header'
import type { CodegenOutput } from '../types'

const logger = consola.withTag('polyq:codegen')

export type { CodegenOutput }

interface AnchorIdl {
  address: string
  metadata: { name: string; version: string; spec: string }
  instructions: AnchorInstruction[]
  accounts: AnchorAccount[]
  types: AnchorTypeDef[]
  errors?: AnchorError[]
  events?: AnchorEvent[]
}

interface AnchorInstruction {
  name: string
  discriminator: number[]
  accounts: AnchorInstructionAccount[]
  args: AnchorField[]
}

interface AnchorInstructionAccount {
  name: string
  writable?: boolean
  signer?: boolean
  pda?: {
    seeds: AnchorPdaSeed[]
  }
  optional?: boolean
  address?: string
}

interface AnchorPdaSeed {
  kind: 'const' | 'arg' | 'account'
  value?: number[]
  path?: string
  account?: string
}

interface AnchorAccount {
  name: string
  discriminator: number[]
}

interface AnchorTypeDef {
  name: string
  type: {
    kind: 'struct' | 'enum'
    fields?: AnchorField[]
    variants?: AnchorVariant[]
  }
}

interface AnchorField {
  name: string
  type: AnchorType
}

type AnchorType =
  | string
  | { array: [AnchorType, number] }
  | { vec: AnchorType }
  | { option: AnchorType }
  | { defined: { name: string } }
  | { coption: AnchorType }

interface AnchorVariant {
  name: string
  fields?: AnchorField[]
}

interface AnchorError {
  code: number
  name: string
  msg?: string
}

interface AnchorEvent {
  name: string
  discriminator: number[]
}

/**
 * Generate TypeScript client code from an Anchor IDL file.
 */
export function generateFromIdl(
  idlPath: string,
  outDir: string,
  config?: Partial<CodegenConfig>,
): CodegenOutput {
  const raw = readFileSync(idlPath, 'utf-8')
  let idl: AnchorIdl
  try {
    idl = JSON.parse(raw)
  } catch {
    throw new Error(`Invalid JSON in IDL file: ${idlPath}`)
  }

  if (!idl.metadata?.name) {
    throw new Error(`IDL missing required field "metadata.name": ${idlPath}`)
  }
  if (!Array.isArray(idl.instructions)) {
    throw new Error(`IDL missing required field "instructions": ${idlPath}`)
  }

  const features = config?.features ?? {
    types: true,
    instructions: true,
    accounts: true,
    pda: true,
    errors: true,
    events: true,
  }

  const programName = idl.metadata.name
  const files: CodegenOutput['files'] = []
  const header = codegenHeader(config)

  logger.info(`Generating client for ${programName}...`)

  if (features.types !== false) {
    const content = generateTypes(idl, header)
    files.push({ path: 'types.ts', content })
  }

  if (features.pda !== false) {
    const content = generatePdaHelpers(idl, header)
    files.push({ path: 'pda.ts', content })
  }

  if (features.instructions !== false) {
    const content = generateInstructions(idl, header)
    files.push({ path: 'instructions.ts', content })
  }

  if (features.accounts !== false) {
    const content = generateAccounts(idl, header)
    files.push({ path: 'accounts.ts', content })
  }

  if (features.errors !== false && idl.errors?.length) {
    const content = generateErrors(idl, header)
    files.push({ path: 'errors.ts', content })
  }

  // Barrel export
  const barrel = generateBarrel(
    files.map(f => f.path),
    header,
  )
  files.push({ path: 'index.ts', content: barrel })

  // Write files to disk
  const programDir = resolve(outDir, snakeToKebab(programName))
  if (relative(outDir, programDir).startsWith('..')) {
    throw new Error(`Path traversal detected in program name: ${programName}`)
  }
  mkdirSync(programDir, { recursive: true })

  for (const file of files) {
    const fullPath = join(programDir, file.path)
    writeFileSync(fullPath, file.content, 'utf-8')
    logger.success(`  → ${file.path}`)
  }

  return { files }
}

// --- Type Generation ---

function generateTypes(idl: AnchorIdl, header: string): string {
  const lines: string[] = [header, `// Source: ${idl.metadata.name} v${idl.metadata.version}`, '']

  for (const typeDef of idl.types ?? []) {
    if (typeDef.type.kind === 'struct') {
      lines.push(`export interface ${typeDef.name} {`)
      for (const field of typeDef.type.fields ?? []) {
        lines.push(`  ${camelCase(field.name)}: ${mapType(field.type)}`)
      }
      lines.push('}')
      lines.push('')
    } else if (typeDef.type.kind === 'enum') {
      const variants = typeDef.type.variants ?? []
      if (variants.every(v => !v.fields || v.fields.length === 0)) {
        // Simple enum — use string union
        lines.push(`export type ${typeDef.name} =`)
        for (let i = 0; i < variants.length; i++) {
          const variant = variants[i]!
          const sep = i < variants.length - 1 ? ' |' : ''
          lines.push(`  | { ${camelCase(variant.name)}: Record<string, never> }${sep}`)
        }
        lines.push('')
      } else {
        // Tagged enum with fields
        lines.push(`export type ${typeDef.name} =`)
        for (const variant of variants) {
          if (!variant.fields || variant.fields.length === 0) {
            lines.push(`  | { ${camelCase(variant.name)}: Record<string, never> }`)
          } else {
            lines.push(`  | { ${camelCase(variant.name)}: {`)
            for (const field of variant.fields) {
              lines.push(`      ${camelCase(field.name)}: ${mapType(field.type)}`)
            }
            lines.push('    } }')
          }
        }
        lines.push('')
      }
    }
  }

  return lines.join('\n')
}

// --- PDA Generation ---

function generatePdaHelpers(idl: AnchorIdl, header: string): string {
  const lines: string[] = [
    header,
    `// PDA derivation helpers for ${idl.metadata.name}`,
    '',
    "import { PublicKey } from '@solana/web3.js'",
    '',
    `export const PROGRAM_ID = new PublicKey('${idl.address}')`,
    '',
  ]

  // Collect unique PDAs from all instructions
  const pdas = new Map<string, AnchorInstructionAccount>()
  for (const ix of idl.instructions) {
    for (const acc of ix.accounts) {
      if (acc.pda && !pdas.has(acc.name)) {
        pdas.set(acc.name, acc)
      }
    }
  }

  for (const [name, acc] of pdas) {
    if (!acc.pda) continue
    const seeds = acc.pda.seeds

    // Determine function parameters from non-const seeds
    const params: string[] = []
    const seedExprs: string[] = []

    for (const seed of seeds) {
      if (seed.kind === 'const' && seed.value) {
        const bytes = seed.value
        // Try to decode as UTF-8 string
        const str = Buffer.from(bytes).toString('utf-8')
        if (/^[\x20-\x7E]+$/.test(str)) {
          seedExprs.push(`Buffer.from('${str}')`)
        } else {
          seedExprs.push(`Buffer.from([${bytes.join(', ')}])`)
        }
      } else if (seed.kind === 'account' && seed.path) {
        const paramName = camelCase(seed.path)
        params.push(`${paramName}: PublicKey`)
        seedExprs.push(`${paramName}.toBuffer()`)
      } else if (seed.kind === 'arg' && seed.path) {
        const paramName = camelCase(seed.path)
        // Arg seeds can be various types — accept Buffer | string | number
        // and convert to Buffer in the seed expression
        params.push(`${paramName}: Buffer | string | number`)
        seedExprs.push(
          `(typeof ${paramName} === 'string' ? Buffer.from(${paramName}) : typeof ${paramName} === 'number' ? Buffer.from(new Uint8Array(new BigUint64Array([BigInt(${paramName})]).buffer)) : ${paramName})`,
        )
      }
    }

    const fnName = `derive${pascalCase(name)}`
    const paramStr =
      params.length > 0
        ? `${params.join(', ')}, programId: PublicKey = PROGRAM_ID`
        : 'programId: PublicKey = PROGRAM_ID'

    lines.push(`export function ${fnName}(${paramStr}): [PublicKey, number] {`)
    lines.push(`  return PublicKey.findProgramAddressSync(`)
    lines.push(`    [${seedExprs.join(', ')}],`)
    lines.push(`    programId,`)
    lines.push(`  )`)
    lines.push(`}`)
    lines.push('')
  }

  return lines.join('\n')
}

// --- Instruction Generation ---

function generateInstructions(idl: AnchorIdl, header: string): string {
  // Check if any instruction has args — if so, we need borsh import
  const anyArgs = idl.instructions.some(ix => ix.args.length > 0)

  const lines: string[] = [
    header,
    `// Instruction builders for ${idl.metadata.name}`,
    '',
    "import { PublicKey, TransactionInstruction } from '@solana/web3.js'",
  ]

  if (anyArgs) {
    lines.push("import * as borsh from '@coral-xyz/borsh'")
  }

  lines.push("import type * as types from './types'")
  lines.push('')
  lines.push(`export const PROGRAM_ID = new PublicKey('${idl.address}')`)
  lines.push('')

  // Generate Borsh layout helpers for defined types used in args
  if (anyArgs) {
    const usedTypes = collectUsedDefinedTypes(idl)
    for (const typeName of usedTypes) {
      const typeDef = idl.types?.find(t => t.name === typeName)
      if (!typeDef) continue

      if (typeDef.type.kind === 'struct') {
        lines.push(`const ${camelCase(typeName)}Layout = borsh.struct([`)
        for (const field of typeDef.type.fields ?? []) {
          lines.push(`  ${mapBorshCodec(field.type, idl, camelCase(field.name))},`)
        }
        lines.push(`])`)
        lines.push('')
      } else if (typeDef.type.kind === 'enum') {
        const variants = typeDef.type.variants ?? []
        lines.push(`const ${camelCase(typeName)}Layout = borsh.rustEnum([`)
        for (const variant of variants) {
          if (!variant.fields || variant.fields.length === 0) {
            lines.push(`  borsh.struct([], '${camelCase(variant.name)}'),`)
          } else {
            lines.push(`  borsh.struct([`)
            for (const field of variant.fields) {
              lines.push(`    ${mapBorshCodec(field.type, idl, camelCase(field.name))},`)
            }
            lines.push(`  ], '${camelCase(variant.name)}'),`)
          }
        }
        lines.push(`])`)
        lines.push('')
      }
    }
  }

  for (const ix of idl.instructions) {
    const fnName = `create${pascalCase(ix.name)}Instruction`

    // Build accounts interface
    const accountsInterfaceName = `${pascalCase(ix.name)}Accounts`
    lines.push(`export interface ${accountsInterfaceName} {`)
    for (const acc of ix.accounts) {
      const optional = acc.optional || acc.address ? '?' : ''
      lines.push(`  ${camelCase(acc.name)}${optional}: PublicKey`)
    }
    lines.push('}')
    lines.push('')

    // Build args interface if needed
    const hasArgs = ix.args.length > 0
    const argsInterfaceName = `${pascalCase(ix.name)}Args`
    if (hasArgs) {
      lines.push(`export interface ${argsInterfaceName} {`)
      for (const arg of ix.args) {
        lines.push(`  ${camelCase(arg.name)}: ${mapType(arg.type, 'types.')}`)
      }
      lines.push('}')
      lines.push('')
    }

    // Build the instruction function
    const params = hasArgs
      ? `accounts: ${accountsInterfaceName}, args: ${argsInterfaceName}`
      : `accounts: ${accountsInterfaceName}`

    lines.push(`export function ${fnName}(${params}): TransactionInstruction {`)
    lines.push(`  const keys = [`)
    for (const acc of ix.accounts) {
      const writable = acc.writable ? 'true' : 'false'
      const signer = acc.signer ? 'true' : 'false'
      if (acc.address) {
        lines.push(
          `    { pubkey: accounts.${camelCase(acc.name)} ?? new PublicKey('${acc.address}'), isWritable: ${writable}, isSigner: ${signer} },`,
        )
      } else if (acc.optional) {
        lines.push(
          `    ...(accounts.${camelCase(acc.name)} ? [{ pubkey: accounts.${camelCase(acc.name)}, isWritable: ${writable}, isSigner: ${signer} }] : []),`,
        )
      } else {
        lines.push(
          `    { pubkey: accounts.${camelCase(acc.name)}, isWritable: ${writable}, isSigner: ${signer} },`,
        )
      }
    }
    lines.push(`  ]`)
    lines.push('')
    lines.push(`  const discriminator = Buffer.from([${ix.discriminator.join(', ')}])`)

    if (hasArgs) {
      // Generate Borsh layout for this instruction's args
      lines.push(`  const argsLayout = borsh.struct([`)
      for (const arg of ix.args) {
        lines.push(`    ${mapBorshCodec(arg.type, idl, camelCase(arg.name))},`)
      }
      lines.push(`  ])`)
      lines.push(`  const argsBuffer = Buffer.alloc(10240)`)
      lines.push(`  const argsLen = argsLayout.encode(args, argsBuffer)`)
      lines.push(`  const data = Buffer.concat([discriminator, argsBuffer.subarray(0, argsLen)])`)
    } else {
      lines.push(`  const data = discriminator`)
    }

    lines.push('')
    lines.push(`  return new TransactionInstruction({`)
    lines.push(`    keys,`)
    lines.push(`    programId: PROGRAM_ID,`)
    lines.push(`    data,`)
    lines.push(`  })`)
    lines.push('}')
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Collect all defined type names referenced in instruction args (recursively).
 * Returns them in topological order — leaf types first, so layouts can reference
 * each other without forward-declaration issues.
 *
 * Uses three-color DFS to detect circular references:
 * - white (not visited) → grey (in progress) → black (done)
 * - A back-edge to a grey node means a cycle → skip (break the cycle)
 */
function collectUsedDefinedTypes(idl: AnchorIdl): string[] {
  const _white = new Set<string>() // not yet visited
  const grey = new Set<string>() // currently being processed (on stack)
  const black = new Set<string>() // fully processed
  const order: string[] = []

  function walkType(t: AnchorType) {
    if (typeof t === 'object') {
      if ('defined' in t) visitDefined(t.defined.name)
      if ('vec' in t) walkType(t.vec)
      if ('option' in t) walkType(t.option)
      if ('coption' in t) walkType(t.coption)
      if ('array' in t) walkType(t.array[0])
    }
  }

  function visitDefined(name: string) {
    if (black.has(name)) return // already fully processed
    if (grey.has(name)) return // cycle detected — break it

    grey.add(name)

    const typeDef = idl.types?.find(td => td.name === name)
    if (typeDef) {
      // Walk all fields (struct fields + enum variant fields)
      const fields =
        typeDef.type.kind === 'struct'
          ? (typeDef.type.fields ?? [])
          : (typeDef.type.variants ?? []).flatMap(v => v.fields ?? [])

      for (const field of fields) {
        walkType(field.type)
      }
    }

    grey.delete(name)
    black.add(name)
    order.push(name)
  }

  for (const ix of idl.instructions) {
    for (const arg of ix.args) {
      walkType(arg.type)
    }
  }

  return order
}

/**
 * Map an Anchor IDL type to a @coral-xyz/borsh codec expression string.
 * The property name is passed as the last argument to each codec function.
 */
function mapBorshCodec(t: AnchorType, idl: AnchorIdl, property?: string): string {
  const prop = property ? `'${property}'` : ''

  if (typeof t === 'string') {
    switch (t) {
      case 'bool':
        return `borsh.bool(${prop})`
      case 'u8':
        return `borsh.u8(${prop})`
      case 'u16':
        return `borsh.u16(${prop})`
      case 'u32':
        return `borsh.u32(${prop})`
      case 'u64':
        return `borsh.u64(${prop})`
      case 'u128':
        return `borsh.u128(${prop})`
      case 'u256':
        return `borsh.u256(${prop})`
      case 'i8':
        return `borsh.i8(${prop})`
      case 'i16':
        return `borsh.i16(${prop})`
      case 'i32':
        return `borsh.i32(${prop})`
      case 'i64':
        return `borsh.i64(${prop})`
      case 'i128':
        return `borsh.i128(${prop})`
      case 'i256':
        return `borsh.i256(${prop})`
      case 'f32':
        return `borsh.f32(${prop})`
      case 'f64':
        return `borsh.f64(${prop})`
      case 'string':
        return `borsh.str(${prop})`
      case 'pubkey':
      case 'publicKey':
        return `borsh.publicKey(${prop})`
      case 'bytes':
        return `borsh.vecU8(${prop})`
      default:
        return `borsh.u8(${prop}) /* unknown: ${t} */`
    }
  }

  if ('vec' in t) {
    return `borsh.vec(${mapBorshCodec(t.vec, idl)}${prop ? `, ${prop}` : ''})`
  }
  if ('option' in t) {
    return `borsh.option(${mapBorshCodec(t.option, idl)}${prop ? `, ${prop}` : ''})`
  }
  if ('coption' in t) {
    return `borsh.coption(${mapBorshCodec(t.coption, idl)}${prop ? `, ${prop}` : ''})`
  }
  if ('array' in t) {
    return `borsh.array(${mapBorshCodec(t.array[0], idl)}, ${t.array[1]}${prop ? `, ${prop}` : ''})`
  }
  if ('defined' in t) {
    // For defined struct types, use the pre-generated layout with property name
    const layoutName = `${camelCase(t.defined.name)}Layout`
    if (prop) {
      return `${layoutName}.replicate(${prop})`
    }
    return layoutName
  }

  return `borsh.u8(${prop}) /* unmapped */`
}

// --- Account Fetcher Generation ---

function generateAccounts(idl: AnchorIdl, header: string): string {
  // Check if any accounts have matching type definitions for deserialization
  const hasDeserializable = idl.accounts?.some(acc =>
    idl.types?.find(t => t.name === acc.name && t.type.kind === 'struct'),
  )

  const lines: string[] = [
    header,
    `// Account fetchers for ${idl.metadata.name}`,
    '',
    "import { PublicKey, type Connection } from '@solana/web3.js'",
  ]

  if (hasDeserializable) {
    lines.push("import * as borsh from '@coral-xyz/borsh'")
  }

  lines.push("import type * as types from './types'")
  lines.push('')
  lines.push(`export const PROGRAM_ID = new PublicKey('${idl.address}')`)
  lines.push('')

  // Generate Borsh layouts for account types (reuse the same layout logic)
  if (hasDeserializable) {
    const accountTypeNames = (idl.accounts ?? [])
      .map(a => a.name)
      .filter(name => idl.types?.find(t => t.name === name && t.type.kind === 'struct'))

    // Collect all types needed (including nested) in topological order
    const allNeeded = new Set<string>()
    function collectDeps(typeName: string) {
      if (allNeeded.has(typeName)) return
      const typeDef = idl.types?.find(t => t.name === typeName)
      if (!typeDef || typeDef.type.kind !== 'struct') return
      for (const field of typeDef.type.fields ?? []) {
        walkTypeDeps(field.type)
      }
      allNeeded.add(typeName)
    }
    function walkTypeDeps(t: AnchorType) {
      if (typeof t === 'object') {
        if ('defined' in t) collectDeps(t.defined.name)
        if ('vec' in t) walkTypeDeps(t.vec)
        if ('option' in t) walkTypeDeps(t.option)
        if ('coption' in t) walkTypeDeps(t.coption)
        if ('array' in t) walkTypeDeps(t.array[0])
      }
    }
    for (const name of accountTypeNames) collectDeps(name)

    for (const typeName of allNeeded) {
      const typeDef = idl.types?.find(t => t.name === typeName)
      if (!typeDef || typeDef.type.kind !== 'struct') continue

      // Skip if this layout was already generated in instructions.ts
      // Use a different suffix to avoid name collision
      lines.push(`const ${camelCase(typeName)}AccountLayout = borsh.struct([`)
      for (const field of typeDef.type.fields ?? []) {
        lines.push(`  ${mapBorshCodecForAccounts(field.type, idl, camelCase(field.name))},`)
      }
      lines.push(`])`)
      lines.push('')
    }
  }

  for (const acc of idl.accounts ?? []) {
    const typeName = acc.name
    const fnName = `fetch${pascalCase(acc.name)}`
    const discriminator = acc.discriminator
    const typeDef = idl.types?.find(t => t.name === acc.name && t.type.kind === 'struct')

    lines.push(`/** Account discriminator for ${typeName}: [${discriminator.join(', ')}] */`)
    lines.push(
      `export const ${constantCase(acc.name)}_DISCRIMINATOR = [${discriminator.join(', ')}] as const`,
    )
    lines.push('')
    lines.push(`/**`)
    lines.push(` * Fetch and deserialize a ${typeName} account.`)
    lines.push(` */`)
    lines.push(`export async function ${fnName}(`)
    lines.push(`  connection: Connection,`)
    lines.push(`  address: PublicKey,`)
    lines.push(`): Promise<types.${typeName} | null> {`)
    lines.push(`  const accountInfo = await connection.getAccountInfo(address)`)
    lines.push(`  if (!accountInfo) return null`)
    lines.push('')
    lines.push(`  // Verify discriminator`)
    lines.push(`  const disc = [...accountInfo.data.subarray(0, 8)]`)
    lines.push(`  const expected = ${constantCase(acc.name)}_DISCRIMINATOR`)
    lines.push(`  if (!disc.every((b, i) => b === expected[i])) {`)
    lines.push(`    throw new Error('Invalid account discriminator for ${typeName}')`)
    lines.push(`  }`)
    lines.push('')

    if (typeDef) {
      lines.push(
        `  return ${camelCase(typeName)}AccountLayout.decode(accountInfo.data.subarray(8)) as types.${typeName}`,
      )
    } else {
      lines.push(`  // No matching type definition found — return raw data`)
      lines.push(`  return accountInfo.data.subarray(8) as any`)
    }

    lines.push('}')
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Same as mapBorshCodec but uses AccountLayout suffix for defined types
 * to avoid collisions with instruction layouts.
 */
function mapBorshCodecForAccounts(t: AnchorType, idl: AnchorIdl, property?: string): string {
  const prop = property ? `'${property}'` : ''

  if (typeof t === 'string') {
    switch (t) {
      case 'bool':
        return `borsh.bool(${prop})`
      case 'u8':
        return `borsh.u8(${prop})`
      case 'u16':
        return `borsh.u16(${prop})`
      case 'u32':
        return `borsh.u32(${prop})`
      case 'u64':
        return `borsh.u64(${prop})`
      case 'u128':
        return `borsh.u128(${prop})`
      case 'u256':
        return `borsh.u256(${prop})`
      case 'i8':
        return `borsh.i8(${prop})`
      case 'i16':
        return `borsh.i16(${prop})`
      case 'i32':
        return `borsh.i32(${prop})`
      case 'i64':
        return `borsh.i64(${prop})`
      case 'i128':
        return `borsh.i128(${prop})`
      case 'i256':
        return `borsh.i256(${prop})`
      case 'f32':
        return `borsh.f32(${prop})`
      case 'f64':
        return `borsh.f64(${prop})`
      case 'string':
        return `borsh.str(${prop})`
      case 'pubkey':
      case 'publicKey':
        return `borsh.publicKey(${prop})`
      case 'bytes':
        return `borsh.vecU8(${prop})`
      default:
        return `borsh.u8(${prop}) /* unknown: ${t} */`
    }
  }

  if ('vec' in t)
    return `borsh.vec(${mapBorshCodecForAccounts(t.vec, idl)}${prop ? `, ${prop}` : ''})`
  if ('option' in t)
    return `borsh.option(${mapBorshCodecForAccounts(t.option, idl)}${prop ? `, ${prop}` : ''})`
  if ('coption' in t)
    return `borsh.coption(${mapBorshCodecForAccounts(t.coption, idl)}${prop ? `, ${prop}` : ''})`
  if ('array' in t)
    return `borsh.array(${mapBorshCodecForAccounts(t.array[0], idl)}, ${t.array[1]}${prop ? `, ${prop}` : ''})`
  if ('defined' in t) {
    const layoutName = `${camelCase(t.defined.name)}AccountLayout`
    return prop ? `${layoutName}.replicate(${prop})` : layoutName
  }

  return `borsh.u8(${prop}) /* unmapped */`
}

// --- Error Generation ---

function generateErrors(idl: AnchorIdl, header: string): string {
  const lines: string[] = [header, `// Error codes for ${idl.metadata.name}`, '']

  lines.push('export enum ProgramError {')
  for (const err of idl.errors ?? []) {
    if (err.msg) {
      lines.push(`  /** ${err.msg} */`)
    }
    lines.push(`  ${err.name} = ${err.code},`)
  }
  lines.push('}')
  lines.push('')

  lines.push('export const PROGRAM_ERRORS: Record<number, { name: string, msg: string }> = {')
  for (const err of idl.errors ?? []) {
    lines.push(`  ${err.code}: { name: '${err.name}', msg: '${err.msg ?? err.name}' },`)
  }
  lines.push('}')
  lines.push('')

  lines.push(
    'export function getProgramError(code: number): { name: string, msg: string } | undefined {',
  )
  lines.push('  return PROGRAM_ERRORS[code]')
  lines.push('}')
  lines.push('')

  return lines.join('\n')
}

// --- Barrel Export ---

function generateBarrel(filePaths: string[], header: string): string {
  const lines: string[] = [header, '']
  for (const fp of filePaths) {
    if (fp === 'index.ts') continue
    const mod = fp.replace('.ts', '')
    lines.push(`export * from './${mod}'`)
  }
  lines.push('')
  return lines.join('\n')
}

// --- Type Mapping ---

function mapType(t: AnchorType, typePrefix = ''): string {
  if (typeof t === 'string') {
    switch (t) {
      case 'bool':
        return 'boolean'
      case 'u8':
      case 'u16':
      case 'u32':
      case 'i8':
      case 'i16':
      case 'i32':
        return 'number'
      case 'u64':
      case 'u128':
      case 'u256':
      case 'i64':
      case 'i128':
      case 'i256':
        return 'bigint'
      case 'f32':
      case 'f64':
        return 'number'
      case 'string':
        return 'string'
      case 'pubkey':
      case 'publicKey':
        return 'PublicKey'
      case 'bytes':
        return 'Uint8Array'
      default:
        return t
    }
  }

  if ('array' in t) {
    return `${mapType(t.array[0], typePrefix)}[]`
  }
  if ('vec' in t) {
    return `${mapType(t.vec, typePrefix)}[]`
  }
  if ('option' in t) {
    return `${mapType(t.option, typePrefix)} | null`
  }
  if ('coption' in t) {
    return `${mapType(t.coption, typePrefix)} | null`
  }
  if ('defined' in t) {
    return `${typePrefix}${t.defined.name}`
  }

  return 'unknown'
}

// --- String Utils ---

function camelCase(s: string): string {
  return s.replace(/[_-]([a-z])/g, (_, c) => c.toUpperCase())
}

function pascalCase(s: string): string {
  const cc = camelCase(s)
  return cc.charAt(0).toUpperCase() + cc.slice(1)
}

function constantCase(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[- ]/g, '_')
    .toUpperCase()
}

function snakeToKebab(s: string): string {
  return s.replace(/_/g, '-')
}
