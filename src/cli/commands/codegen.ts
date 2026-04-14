import { defineCommand } from 'citty'
import { resolve } from 'pathe'
import consola from 'consola'
import { generateFromSchema } from '../../codegen/generate'
import { detectChain, getChainProvider } from '../../chains'

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
      description: 'Watch schema files and regenerate on change',
      default: false,
    },
  },
  async run({ args }) {
    const cwd = process.cwd()
    const outDir = resolve(cwd, args.out)
    const chain = (args.chain as 'svm' | 'evm') ?? detectChain(cwd)
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
      consola.error(`No schema files found in ${artifactDir}/. Build your programs/contracts first.`)
      process.exit(1)
    }

    for (const file of schemaFiles) {
      const fileName = file.split('/').pop()
      consola.info(`Generating from ${fileName}...`)
      generateFromSchema(file, outDir, undefined, chain)
    }

    consola.success(`Generated clients for ${schemaFiles.length} program(s)`)

    if (args.watch) {
      const artifactDir = resolve(cwd, provider.defaultArtifactDir)
      const { watch } = await import('chokidar')
      consola.info(`Watching ${artifactDir} for changes...`)

      const watcher = watch(artifactDir, { ignoreInitial: true })
      watcher.on('change', (filePath) => {
        const fileName = filePath.split('/').pop()
        consola.info(`Schema changed: ${fileName}`)
        generateFromSchema(filePath, outDir, undefined, chain)
      })

      process.on('SIGINT', () => {
        watcher.close()
        process.exit(0)
      })
    }
  },
})
