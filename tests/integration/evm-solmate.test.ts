/**
 * Integration test: Helm against solmate (Foundry EVM project)
 *
 * Tests chain detection, config resolution, codegen from real ERC20/ERC721
 * ABIs matching solmate's contract interfaces.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'pathe'
import { detectChain, getChainProvider } from '../../src/chains'
import { resolveConfig } from '../../src/config/resolve'
import { generateFromAbi } from '../../src/chains/evm/codegen'
import { generateFromSchema } from '../../src/codegen/generate'

const SOLMATE_ROOT = resolve(__dirname, 'solmate')
const ARTIFACTS_ROOT = resolve(__dirname, 'solmate-artifacts')
const OUT_DIR = resolve(__dirname, '.evm-codegen-output')

describe('EVM integration: solmate (Foundry)', () => {
  afterAll(() => {
    rmSync(OUT_DIR, { recursive: true, force: true })
  })

  describe('chain detection', () => {
    it('detects solmate as an EVM/Foundry project', () => {
      const chain = detectChain(SOLMATE_ROOT)
      expect(chain).toBe('evm')
    })

    it('detects project with foundry.toml', () => {
      const provider = getChainProvider('evm')
      const result = provider.detectProject(SOLMATE_ROOT)
      expect(result).not.toBeNull()
      expect(result!.chain).toBe('evm')
      expect(result!.configFile).toBe('foundry.toml')
      expect(result!.confidence).toBe('definite')
    })

    it('detects Solidity contracts', () => {
      const provider = getChainProvider('evm')
      const programs = provider.detectPrograms(SOLMATE_ROOT)
      expect(programs).toBeDefined()
      // solmate has contracts in src/tokens/, src/auth/, src/utils/
      const names = Object.keys(programs!)
      expect(names.length).toBeGreaterThan(0)
    })
  })

  describe('config resolution', () => {
    it('resolves config with EVM chain', () => {
      const config = resolveConfig({}, SOLMATE_ROOT)
      expect(config._chain).toBe('evm')
      expect(config.root).toBe(SOLMATE_ROOT)
    })

    it('auto-detects programs from foundry.toml', () => {
      const config = resolveConfig({}, SOLMATE_ROOT)
      expect(config.programs).toBeDefined()
    })

    it('sets default artifact watch dir', () => {
      const config = resolveConfig({}, SOLMATE_ROOT)
      expect(config.schemaSync?.watchDir).toContain('out')
    })
  })

  describe('codegen: ERC20 (from ABI artifact)', () => {
    const erc20Path = resolve(ARTIFACTS_ROOT, 'ERC20.sol/ERC20.json')

    it('generates typed client from ERC20 ABI', () => {
      const result = generateFromAbi(erc20Path, OUT_DIR)
      const paths = result.files.map(f => f.path)

      expect(paths).toContain('contract.ts')
      expect(paths).toContain('types.ts')
      expect(paths).toContain('events.ts')
      expect(paths).toContain('index.ts')
    })

    it('generates correct ABI const export', () => {
      const content = readFileSync(resolve(OUT_DIR, 'erc20/contract.ts'), 'utf-8')
      expect(content).toContain('ERC20_ABI')
      expect(content).toContain('as const')
      expect(content).toContain('transfer')
      expect(content).toContain('approve')
      expect(content).toContain('balanceOf')
    })

    it('generates typed function args', () => {
      const content = readFileSync(resolve(OUT_DIR, 'erc20/types.ts'), 'utf-8')
      // transfer(to, amount)
      expect(content).toContain('TransferArgs')
      expect(content).toContain('to: `0x${string}`')
      expect(content).toContain('amount: bigint')
      // approve(spender, amount)
      expect(content).toContain('ApproveArgs')
      expect(content).toContain('spender: `0x${string}`')
      // permit(owner, spender, value, deadline, v, r, s)
      expect(content).toContain('PermitArgs')
    })

    it('generates event types for Transfer and Approval', () => {
      const content = readFileSync(resolve(OUT_DIR, 'erc20/events.ts'), 'utf-8')
      expect(content).toContain('TransferEvent')
      expect(content).toContain('from: `0x${string}`')
      expect(content).toContain('amount: bigint')
      expect(content).toContain('ApprovalEvent')
    })

    it('works through the chain-agnostic generateFromSchema dispatcher', () => {
      const result = generateFromSchema(erc20Path, OUT_DIR, undefined, 'evm')
      expect(result.files.length).toBeGreaterThan(0)
      expect(result.files.some(f => f.path === 'contract.ts')).toBe(true)
    })
  })

  describe('codegen: ERC721 (from ABI artifact)', () => {
    const erc721Path = resolve(ARTIFACTS_ROOT, 'ERC721.sol/ERC721.json')

    it('generates typed client from ERC721 ABI', () => {
      const result = generateFromAbi(erc721Path, OUT_DIR)
      expect(result.files.map(f => f.path)).toContain('contract.ts')
    })

    it('generates event types for Transfer, Approval, ApprovalForAll', () => {
      const content = readFileSync(resolve(OUT_DIR, 'erc721/events.ts'), 'utf-8')
      expect(content).toContain('TransferEvent')
      expect(content).toContain('ApprovalEvent')
      expect(content).toContain('ApprovalForAllEvent')
    })

    it('generates correct NFT function args (id is bigint)', () => {
      const content = readFileSync(resolve(OUT_DIR, 'erc721/types.ts'), 'utf-8')
      expect(content).toContain('TransferFromArgs')
      expect(content).toContain('id: bigint')
    })
  })
})
