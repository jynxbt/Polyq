import { defineCommand } from 'citty'
import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'pathe'
import consola from 'consola'
import { detectChain, getChainProvider } from '../../chains'

export default defineCommand({
  meta: {
    name: 'init',
    description: 'Initialize Helm configuration',
  },
  async run() {
    const cwd = process.cwd()
    const configPath = resolve(cwd, 'helm.config.ts')

    if (existsSync(configPath)) {
      consola.warn('helm.config.ts already exists')
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

    const template = `import { defineHelmConfig } from 'solana-helm'

export default defineHelmConfig({
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
})
`

    writeFileSync(configPath, template, 'utf-8')
    consola.success(`Created ${configPath} (${chain} project)`)
    consola.info('Edit the config to set up schema sync mappings and codegen output')
  },
})
