import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, basename, dirname } from 'pathe'
import { watch } from 'chokidar'
import consola from 'consola'
import type { Plugin, ViteDevServer } from 'vite'
import type { IdlSyncConfig } from '../../config/types'

const logger = consola.withTag('helm:idl-sync')

/**
 * Vite plugin that watches Anchor IDL output and syncs to configured destinations.
 *
 * On IDL change:
 * 1. Copies the IDL JSON to each mapped destination
 * 2. Invalidates the Vite module graph for the destination files
 * 3. Triggers HMR so the frontend picks up new types without a page refresh
 */
export function helmIdlSync(options?: IdlSyncConfig): Plugin {
  const watchDir = options?.watchDir ?? 'target/idl'
  const mapping = options?.mapping ?? {}
  let server: ViteDevServer | undefined
  let watcher: ReturnType<typeof watch> | undefined

  return {
    name: 'helm:idl-sync',

    configResolved(config) {
      // Resolve watch directory relative to project root
      const resolvedWatchDir = resolve(config.root, watchDir)

      if (!existsSync(resolvedWatchDir)) {
        logger.info(`IDL directory ${resolvedWatchDir} does not exist yet — will watch when created`)
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

      watcher.on('change', (filePath) => {
        handleIdlChange(filePath, root)
      })

      watcher.on('add', (filePath) => {
        handleIdlChange(filePath, root)
      })

      logger.info(`Watching ${resolvedWatchDir} for IDL changes`)
    },

    closeBundle() {
      watcher?.close()
    },
  }

  function handleIdlChange(filePath: string, root: string) {
    const idlName = basename(filePath, '.json')
    const destinations = mapping[idlName]

    if (!destinations || destinations.length === 0) {
      logger.debug(`No mapping for IDL: ${idlName}`)
      return
    }

    logger.info(`IDL changed: ${idlName}`)

    let content: string
    try {
      content = readFileSync(filePath, 'utf-8')
      // Validate it's actually JSON
      JSON.parse(content)
    } catch (e) {
      logger.warn(`Failed to read IDL ${filePath}: ${e}`)
      return
    }

    for (const dest of destinations) {
      const resolvedDest = resolve(root, dest)
      try {
        mkdirSync(dirname(resolvedDest), { recursive: true })
        writeFileSync(resolvedDest, content, 'utf-8')
        logger.success(`Synced → ${dest}`)

        // Trigger HMR by invalidating the module
        if (server) {
          const module = server.moduleGraph.getModuleById(resolvedDest)
            ?? server.moduleGraph.getModulesByFile(resolvedDest)?.values().next().value
          if (module) {
            server.moduleGraph.invalidateModule(module)
            server.ws.send({
              type: 'update',
              updates: [{
                type: 'js-update',
                path: module.url,
                acceptedPath: module.url,
                timestamp: Date.now(),
              }],
            })
            logger.success(`HMR update sent for ${dest}`)
          } else {
            // If the module isn't in the graph yet, do a full reload
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
