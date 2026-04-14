import { describe, it, expect } from 'vitest'
import { buildStages } from '../src/workspace/orchestrator'
import type { ResolvedHelmConfig } from '../src/config/types'

function makeConfig(overrides?: Partial<ResolvedHelmConfig>): ResolvedHelmConfig {
  return {
    root: '/tmp/test-project',
    _chain: 'svm' as const,
    programs: {
      myProgram: {
        type: 'anchor',
        path: 'programs/my-program',
        idl: 'target/idl/my_program.json',
        programId: { localnet: '11111111111111111111111111111111' },
      },
    },
    workspace: {
      buildFeatures: ['local'],
      docker: { enabled: true, services: ['postgres'] },
      validator: { rpcUrl: 'http://127.0.0.1:8899' },
      init: { script: 'scripts/init.ts', runner: 'bun' },
      database: {
        url: 'postgresql://test:test@127.0.0.1:5433/test',
        migrationsDir: 'migrations',
        seed: { script: 'seed:local', runner: 'bun' },
      },
      devServer: { command: 'bun run dev' },
    },
    ...overrides,
  }
}

describe('buildStages', () => {
  it('builds all stages in correct order', () => {
    const stages = buildStages(makeConfig())
    const names = stages.map(s => s.name)
    expect(names).toEqual([
      'Docker',
      'Validator',
      'Programs (build)',
      'Programs (deploy)',
      'Initialize',
      'Database',
      'Dev Server',
    ])
  })

  it('skips program stages with --quick', () => {
    const stages = buildStages(makeConfig(), { quick: true })
    const names = stages.map(s => s.name)
    expect(names).toEqual([
      'Docker',
      'Validator',
      'Database',
      'Dev Server',
    ])
  })

  it('uses reset stages with --reset', () => {
    const stages = buildStages(makeConfig(), { reset: true })
    const names = stages.map(s => s.name)
    expect(names).toContain('Validator (reset)')
    expect(names).toContain('Database (reset)')
  })

  it('filters by --only', () => {
    const stages = buildStages(makeConfig(), { only: ['validator'] })
    expect(stages).toHaveLength(1)
    expect(stages[0].name).toBe('Validator')
  })

  it('skips docker when disabled', () => {
    const config = makeConfig()
    config.workspace!.docker = { enabled: false }
    const stages = buildStages(config)
    expect(stages.map(s => s.name)).not.toContain('Docker')
  })

  it('throws without workspace config', () => {
    const config = makeConfig()
    delete (config as any).workspace
    expect(() => buildStages(config)).toThrow('No workspace config')
  })
})
