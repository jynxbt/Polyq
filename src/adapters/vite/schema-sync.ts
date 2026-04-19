import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { watch } from 'chokidar'
import consola from 'consola'
import { basename, dirname, relative, resolve } from 'pathe'
import type { Plugin, ViteDevServer } from 'vite'
import type { SchemaSyncConfig } from '../../config/types'

const logger = consola.withTag('polyq:schema-sync')

/**
 * Vite plugin that watches schema output (Anchor IDLs, EVM ABIs) and syncs to
 * configured destinations.
 *
 * On schema change:
 * 1. Copies the JSON to each mapped destination
 * 2. Invalidates the Vite module graph for the destination files
 * 3. Triggers HMR so the frontend picks up new types without a page refresh
 */
export function polyqSchemaSync(options?: SchemaSyncConfig): Plugin {
  const watchDir = options?.watchDir ?? 'target/idl'
  const mapping = options?.mapping ?? {}
  let server: ViteDevServer | undefined
  let watcher: ReturnType<typeof watch> | undefined

  return {
    name: 'polyq:schema-sync',

    configResolved(config) {
      const resolvedWatchDir = resolve(config.root, watchDir)
      if (!existsSync(resolvedWatchDir)) {
        logger.info(
          `Schema directory ${resolvedWatchDir} does not exist yet — will watch when created`,
        )
      }
    },

    configureServer(devServer) {
      server = devServer
      const root = devServer.config.root
      const resolvedWatchDir = resolve(root, watchDir)

      watcher = watch(resolvedWatchDir, {
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 200,
          pollInterval: 50,
        },
      })

      watcher.on('change', filePath => {
        handleSchemaChange(filePath, root)
      })
      watcher.on('add', filePath => {
        handleSchemaChange(filePath, root)
      })

      logger.info(`Watching ${resolvedWatchDir} for schema changes`)

      devServer.httpServer?.on('close', () => {
        watcher?.close()
      })
    },

    closeBundle() {
      watcher?.close()
    },
  }

  function handleSchemaChange(filePath: string, root: string) {
    const schemaName = basename(filePath, '.json')
    const destinations = mapping[schemaName]

    if (!destinations || destinations.length === 0) {
      logger.debug(`No mapping for schema: ${schemaName}`)
      return
    }

    logger.info(`Schema changed: ${schemaName}`)

    let content: string
    try {
      content = readFileSync(filePath, 'utf-8')
      JSON.parse(content)
    } catch (e) {
      logger.warn(`Failed to read schema ${filePath}: ${e}`)
      return
    }

    for (const dest of destinations) {
      const resolvedDest = resolve(root, dest)
      if (relative(root, resolvedDest).startsWith('..')) {
        logger.warn(`Skipping destination outside project root: ${dest}`)
        continue
      }
      try {
        mkdirSync(dirname(resolvedDest), { recursive: true })
        writeFileSync(resolvedDest, content, 'utf-8')
        logger.success(`Synced → ${dest}`)

        if (server) {
          const module =
            server.moduleGraph.getModuleById(resolvedDest) ??
            server.moduleGraph.getModulesByFile(resolvedDest)?.values().next().value
          if (module) {
            server.moduleGraph.invalidateModule(module)
            try {
              server.ws.send({
                type: 'update',
                updates: [
                  {
                    type: 'js-update',
                    path: module.url,
                    acceptedPath: module.url,
                    timestamp: Date.now(),
                  },
                ],
              })
            } catch {
              server.ws.send({ type: 'full-reload' })
            }
            logger.success(`HMR update sent for ${dest}`)
          } else {
            server.ws.send({ type: 'full-reload' })
            logger.info('Triggered full reload (module not in graph)')
          }
        }
      } catch (e) {
        logger.error(`Failed to sync to ${dest}: ${e}`)
      }
    }
  }
}
