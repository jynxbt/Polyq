import { defineCommand } from 'citty'
import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'pathe'
import consola from 'consola'
import { detectChain, getChainProvider } from '../../chains'

export default defineCommand({
  meta: {
    name: 'init',
    description: 'Initialize Polyq configuration',
  },
  async run() {
    const cwd = process.cwd()
    const configPath = resolve(cwd, 'polyq.config.ts')

    if (existsSync(configPath)) {
      consola.warn('polyq.config.ts already exists')
      return
    }

    const chain = detectChain(cwd)
    const provider = getChainProvider(chain)
    const programs = provider.detectPrograms(cwd)
    const programsStr = programs
      ? JSON.stringify(programs, null, 4).replace(/"(\w+)":/g, '$1:')
      : `// No ${chain === 'svm' ? 'Anchor.toml' : 'foundry.toml / hardhat.config'} found — add programs manually`

    const syncKey = chain === 'svm' ? 'idlSync' : 'schemaSync'
    const syncComment = chain === 'svm'
      ? "// Map IDL names to destination paths\n      // my_program: ['packages/sdk/src/idl.json'],"
      : "// Map contract names to destination paths\n      // MyContract: ['src/abi/MyContract.json'],"

    // Chain-specific workspace defaults
    const validatorTool = chain === 'svm' ? 'solana-test-validator' : 'anvil'
    const validatorPort = chain === 'svm' ? 8899 : 8545
    const buildHint = chain === 'svm' ? "// buildFeatures: ['local']," : ''

    const template = `import { definePolyqConfig } from 'polyq'

export default definePolyqConfig({
  // Detected chain: ${chain}
  programs: ${programsStr},

  ${syncKey}: {
    mapping: {
      ${syncComment}
    },
  },

  codegen: {
    outDir: 'generated',
  },

  workspace: {
    ${buildHint}
    validator: {
      tool: '${validatorTool}',
      rpcUrl: 'http://127.0.0.1:${validatorPort}',
    },
    devServer: {
      command: '${chain === 'svm' ? 'bun run dev' : 'npm run dev'}',
    },
  },
})
`

    writeFileSync(configPath, template, 'utf-8')
    consola.success(`Created ${configPath} (${chain} project)`)
    consola.info('Edit the config to set up schema sync mappings and codegen output')
  },
})
