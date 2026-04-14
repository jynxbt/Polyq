import { defineCommand } from 'citty'
import { resolve } from 'pathe'
import consola from 'consola'
import { generateFromSchema } from '../../codegen/generate'
import { detectChain, getChainProvider } from '../../chains'
import type { ChainFamily } from '../../chains/types'

const VALID_CHAINS: ChainFamily[] = ['svm', 'evm']

export default defineCommand({
  meta: {
    name: 'codegen',
    description: 'Generate TypeScript client from contract schemas (IDL/ABI)',
  },
  args: {
    idl: {
      type: 'string',
      description: 'Path to schema file (IDL or ABI JSON)',
    },
    out: {
      type: 'string',
      description: 'Output directory',
      default: 'generated',
    },
    chain: {
      type: 'string',
      description: 'Chain family: svm or evm (auto-detected)',
    },
    watch: {
      type: 'boolean',
      description: 'Watch source files, auto-build, and regenerate',
      default: false,
    },
  },
  async run({ args }) {
    const cwd = process.cwd()
    const outDir = resolve(cwd, args.out)

    // Validate --chain flag
    if (args.chain && !VALID_CHAINS.includes(args.chain as ChainFamily)) {
      consola.error(`Invalid chain: '${args.chain}'. Must be one of: ${VALID_CHAINS.join(', ')}`)
      process.exit(1)
    }

    const chain = (args.chain as ChainFamily) ?? detectChain(cwd)
    const provider = getChainProvider(chain)

    if (args.idl) {
      const schemaPath = resolve(cwd, args.idl)
      consola.info(`Generating from ${schemaPath} (${chain})...`)
      generateFromSchema(schemaPath, outDir, undefined, chain)
      consola.success('Done')
      return
    }

    // Auto-detect schema files using the chain provider
    const schemaFiles = provider.findSchemaFiles(cwd)

    if (schemaFiles.length === 0) {
      const artifactDir = provider.defaultArtifactDir
      consola.error(`No schema files found in ${artifactDir}/.`)
      if (chain === 'svm') {
        consola.info('Run `anchor build` to generate IDL files, then try again.')
      } else {
        consola.info('Run `forge build` or `npx hardhat compile` to generate ABI files, then try again.')
      }
      process.exit(1)
    }

    runCodegen(schemaFiles, outDir, chain)

    if (args.watch) {
      const { watch } = await import('chokidar')
      const { run: runCmd } = await import('../../workspace/process')

      // Watch BOTH artifact dir (for direct IDL/ABI edits) AND source dir (for rebuilds)
      const artifactDir = resolve(cwd, provider.defaultArtifactDir)
      const sourceGlobs = chain === 'svm'
        ? [resolve(cwd, 'programs/**/*.rs')]
        : [resolve(cwd, 'src/**/*.sol'), resolve(cwd, 'contracts/**/*.sol')]

      consola.info(`Watching source files + ${provider.defaultArtifactDir}/ for changes...`)

      // Watch source files → build → codegen
      const sourceWatcher = watch(sourceGlobs, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
      })

      let building = false
      sourceWatcher.on('change', async (filePath) => {
        if (building) return
        building = true
        const fileName = filePath.split('/').pop()
        consola.info(`Source changed: ${fileName}`)

        try {
          if (chain === 'svm') {
            consola.info('Running anchor build...')
            const result = await runCmd('anchor', ['build'], { cwd, label: 'anchor build', quiet: true })
            if (result.exitCode !== 0) {
              consola.error('anchor build failed')
              building = false
              return
            }
          } else {
            consola.info('Running forge build...')
            const result = await runCmd('forge', ['build'], { cwd, label: 'forge build', quiet: true })
            if (result.exitCode !== 0) {
              consola.error('forge build failed')
              building = false
              return
            }
          }

          const updatedFiles = provider.findSchemaFiles(cwd)
          runCodegen(updatedFiles, outDir, chain)
        } catch (e: any) {
          consola.error(`Build failed: ${e.message}`)
        }
        building = false
      })

      // Watch artifact dir → codegen only (no rebuild)
      const artifactWatcher = watch(artifactDir, { ignoreInitial: true })
      artifactWatcher.on('change', (filePath) => {
        if (building) return
        const fileName = filePath.split('/').pop()
        consola.info(`Schema changed: ${fileName}`)
        generateFromSchema(filePath, outDir, undefined, chain)
      })

      process.on('SIGINT', () => {
        sourceWatcher.close()
        artifactWatcher.close()
        process.exit(0)
      })
    }
  },
})

function runCodegen(schemaFiles: string[], outDir: string, chain: ChainFamily) {
  for (const file of schemaFiles) {
    const fileName = file.split('/').pop()
    consola.info(`Generating from ${fileName}...`)
    generateFromSchema(file, outDir, undefined, chain)
  }
  consola.success(`Generated clients for ${schemaFiles.length} program(s)`)
}
