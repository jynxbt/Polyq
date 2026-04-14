import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { resolve } from 'pathe'
import { detectChain, getChainProvider } from '../src/chains'
import { generateFromAbi } from '../src/chains/evm/codegen'
import { buildStages } from '../src/workspace/orchestrator'
import type { ResolvedHelmConfig } from '../src/config/types'

const FIXTURES = resolve(__dirname, '.chain-fixtures')

describe('chain detection', () => {
  beforeAll(() => {
    mkdirSync(resolve(FIXTURES, 'svm-project'), { recursive: true })
    writeFileSync(resolve(FIXTURES, 'svm-project/Anchor.toml'), '[workspace]\nmembers = []')

    mkdirSync(resolve(FIXTURES, 'evm-foundry'), { recursive: true })
    writeFileSync(resolve(FIXTURES, 'evm-foundry/foundry.toml'), '[profile.default]\nsrc = "src"')

    mkdirSync(resolve(FIXTURES, 'evm-hardhat'), { recursive: true })
    writeFileSync(resolve(FIXTURES, 'evm-hardhat/hardhat.config.ts'), 'export default {}')

    mkdirSync(resolve(FIXTURES, 'unknown'), { recursive: true })
  })

  afterAll(() => {
    rmSync(FIXTURES, { recursive: true, force: true })
  })

  it('detects svm from Anchor.toml', () => {
    expect(detectChain(resolve(FIXTURES, 'svm-project'))).toBe('svm')
  })

  it('detects evm from foundry.toml', () => {
    expect(detectChain(resolve(FIXTURES, 'evm-foundry'))).toBe('evm')
  })

  it('detects evm from hardhat.config.ts', () => {
    expect(detectChain(resolve(FIXTURES, 'evm-hardhat'))).toBe('evm')
  })

  it('falls back to svm for unknown projects', () => {
    expect(detectChain(resolve(FIXTURES, 'unknown'))).toBe('svm')
  })

  it('returns correct providers', () => {
    const svm = getChainProvider('svm')
    expect(svm.chain).toBe('svm')
    expect(svm.programTypes).toContain('anchor')

    const evm = getChainProvider('evm')
    expect(evm.chain).toBe('evm')
    expect(evm.programTypes).toContain('foundry')
  })
})

describe('evm codegen', () => {
  const OUT_DIR = resolve(FIXTURES, 'evm-generated')

  const SAMPLE_ABI = {
    contractName: 'SimpleToken',
    abi: [
      {
        type: 'function',
        name: 'transfer',
        inputs: [
          { name: 'to', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'nonpayable',
      },
      {
        type: 'function',
        name: 'balanceOf',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
      },
      {
        type: 'event',
        name: 'Transfer',
        inputs: [
          { name: 'from', type: 'address', indexed: true },
          { name: 'to', type: 'address', indexed: true },
          { name: 'value', type: 'uint256', indexed: false },
        ],
      },
      {
        type: 'error',
        name: 'InsufficientBalance',
        inputs: [
          { name: 'available', type: 'uint256' },
          { name: 'required', type: 'uint256' },
        ],
      },
    ],
    bytecode: '0x',
  }

  beforeAll(() => {
    mkdirSync(FIXTURES, { recursive: true })
    writeFileSync(
      resolve(FIXTURES, 'SimpleToken.json'),
      JSON.stringify(SAMPLE_ABI, null, 2),
    )
  })

  afterAll(() => {
    rmSync(FIXTURES, { recursive: true, force: true })
  })

  it('generates all expected files', () => {
    const result = generateFromAbi(
      resolve(FIXTURES, 'SimpleToken.json'),
      OUT_DIR,
    )

    const paths = result.files.map(f => f.path)
    expect(paths).toContain('contract.ts')
    expect(paths).toContain('types.ts')
    expect(paths).toContain('events.ts')
    expect(paths).toContain('errors.ts')
    expect(paths).toContain('index.ts')
  })

  it('generates ABI const export', () => {
    const contractPath = resolve(OUT_DIR, 'simple-token', 'contract.ts')
    expect(existsSync(contractPath)).toBe(true)
    const content = readFileSync(contractPath, 'utf-8')
    expect(content).toContain('SIMPLE_TOKEN_ABI')
    expect(content).toContain('as const')
    expect(content).toContain('SIMPLE_TOKEN_ADDRESS')
  })

  it('generates typed function args', () => {
    const typesPath = resolve(OUT_DIR, 'simple-token', 'types.ts')
    const content = readFileSync(typesPath, 'utf-8')
    expect(content).toContain('TransferArgs')
    expect(content).toContain('to: `0x${string}`')
    expect(content).toContain('amount: bigint')
  })

  it('generates event types', () => {
    const eventsPath = resolve(OUT_DIR, 'simple-token', 'events.ts')
    const content = readFileSync(eventsPath, 'utf-8')
    expect(content).toContain('TransferEvent')
    expect(content).toContain('from: `0x${string}`')
    expect(content).toContain('value: bigint')
  })

  it('generates custom error types', () => {
    const errorsPath = resolve(OUT_DIR, 'simple-token', 'errors.ts')
    const content = readFileSync(errorsPath, 'utf-8')
    expect(content).toContain('InsufficientBalanceError')
    expect(content).toContain('available: bigint')
  })
})

describe('evm orchestrator stages', () => {
  it('builds EVM stages with anvil validator', () => {
    const config: ResolvedHelmConfig = {
      root: '/tmp/test-evm',
      _chain: 'evm',
      programs: {
        myToken: {
          type: 'foundry',
          path: 'src/MyToken.sol',
          schema: 'out/MyToken.sol/MyToken.json',
        },
      },
      workspace: {
        docker: { enabled: false },
        validator: { tool: 'anvil', rpcUrl: 'http://127.0.0.1:8545' },
        devServer: { command: 'npm run dev' },
      },
    }

    const stages = buildStages(config)
    const names = stages.map(s => s.name)
    expect(names).toContain('EVM Node (anvil)')
    expect(names).toContain('Contracts (build)')
    expect(names).toContain('Contracts (deploy)')
  })
})
