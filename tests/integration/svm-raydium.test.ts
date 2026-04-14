/**
 * Integration test: Helm against Raydium CP-Swap (Anchor/Solana project)
 *
 * Tests chain detection, config resolution, and codegen from a real-world
 * Anchor IDL (Raydium's constant-product swap program).
 */
import { describe, it, expect, afterAll } from 'vitest'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'pathe'
import { detectChain, getChainProvider } from '../../src/chains'
import { generateFromIdl } from '../../src/codegen/generate'
import { generateFromSchema } from '../../src/codegen/generate'

const IDL_PATH = resolve(__dirname, 'raydium-idl/raydium_cpmm/raydium_cp_swap.json')
const OUT_DIR = resolve(__dirname, '.svm-codegen-output')

describe('SVM integration: Raydium CP-Swap (Anchor)', () => {
  afterAll(() => {
    rmSync(OUT_DIR, { recursive: true, force: true })
  })

  describe('IDL validation', () => {
    it('IDL file exists and is valid JSON', () => {
      expect(existsSync(IDL_PATH)).toBe(true)
      const content = JSON.parse(readFileSync(IDL_PATH, 'utf-8'))
      expect(content.metadata.name).toBe('raydium_cp_swap')
      expect(content.metadata.spec).toBe('0.1.0')
    })

    it('IDL has expected program address', () => {
      const idl = JSON.parse(readFileSync(IDL_PATH, 'utf-8'))
      expect(idl.address).toBe('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C')
    })

    it('IDL contains instructions', () => {
      const idl = JSON.parse(readFileSync(IDL_PATH, 'utf-8'))
      expect(idl.instructions.length).toBeGreaterThan(0)
      const names = idl.instructions.map((i: any) => i.name)
      expect(names).toContain('swap_base_input')
      expect(names).toContain('swap_base_output')
      expect(names).toContain('deposit')
      expect(names).toContain('withdraw')
      expect(names).toContain('initialize')
    })

    it('IDL contains type definitions', () => {
      const idl = JSON.parse(readFileSync(IDL_PATH, 'utf-8'))
      expect(idl.types.length).toBeGreaterThan(0)
    })
  })

  describe('codegen: full Raydium CP-Swap IDL', () => {
    it('generates all expected files', () => {
      const result = generateFromIdl(IDL_PATH, OUT_DIR)
      const paths = result.files.map(f => f.path)

      expect(paths).toContain('types.ts')
      expect(paths).toContain('pda.ts')
      expect(paths).toContain('instructions.ts')
      expect(paths).toContain('accounts.ts')
      expect(paths).toContain('errors.ts')
      expect(paths).toContain('index.ts')
    })

    it('generates correct program ID in PDA helpers', () => {
      const content = readFileSync(resolve(OUT_DIR, 'raydium-cp-swap/pda.ts'), 'utf-8')
      expect(content).toContain('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C')
      expect(content).toContain('PublicKey.findProgramAddressSync')
    })

    it('generates instruction builders for swap, deposit, withdraw', () => {
      const content = readFileSync(resolve(OUT_DIR, 'raydium-cp-swap/instructions.ts'), 'utf-8')
      expect(content).toContain('createSwapBaseInputInstruction')
      expect(content).toContain('createSwapBaseOutputInstruction')
      expect(content).toContain('createDepositInstruction')
      expect(content).toContain('createWithdrawInstruction')
      expect(content).toContain('createInitializeInstruction')
    })

    it('generates typed accounts interfaces', () => {
      const content = readFileSync(resolve(OUT_DIR, 'raydium-cp-swap/instructions.ts'), 'utf-8')
      // swap_base_input has accounts like payer, authority, ammConfig, poolState, etc.
      expect(content).toContain('SwapBaseInputAccounts')
      expect(content).toContain('PublicKey')
    })

    it('generates type definitions from IDL types', () => {
      const content = readFileSync(resolve(OUT_DIR, 'raydium-cp-swap/types.ts'), 'utf-8')
      // Raydium CP-Swap has types like PoolState, AmmConfig, etc.
      expect(content.length).toBeGreaterThan(100)
    })

    it('generates error codes', () => {
      const content = readFileSync(resolve(OUT_DIR, 'raydium-cp-swap/errors.ts'), 'utf-8')
      expect(content).toContain('ProgramError')
      expect(content).toContain('getProgramError')
    })

    it('generates discriminators for accounts', () => {
      const content = readFileSync(resolve(OUT_DIR, 'raydium-cp-swap/accounts.ts'), 'utf-8')
      expect(content).toContain('DISCRIMINATOR')
      expect(content).toContain('connection.getAccountInfo')
    })

    it('barrel export re-exports all modules', () => {
      const content = readFileSync(resolve(OUT_DIR, 'raydium-cp-swap/index.ts'), 'utf-8')
      expect(content).toContain("export * from './types'")
      expect(content).toContain("export * from './pda'")
      expect(content).toContain("export * from './instructions'")
      expect(content).toContain("export * from './accounts'")
      expect(content).toContain("export * from './errors'")
    })

    it('works through the chain-agnostic generateFromSchema dispatcher', () => {
      const result = generateFromSchema(IDL_PATH, OUT_DIR, undefined, 'svm')
      expect(result.files.length).toBeGreaterThan(0)
      expect(result.files.some(f => f.path === 'instructions.ts')).toBe(true)
    })
  })

  describe('SVM chain provider', () => {
    it('provider detects Solana packages correctly', () => {
      const provider = getChainProvider('svm')
      expect(provider.chain).toBe('svm')
      expect(provider.defaultArtifactDir).toBe('target/idl')
      expect(provider.rootMarkers).toContain('Anchor.toml')
    })
  })
})
