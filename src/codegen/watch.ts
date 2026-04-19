import { type FSWatcher, watch } from 'chokidar'
import consola from 'consola'
import { resolve } from 'pathe'
import type { ChainFamily } from '../chains/types'
import { errorMessage } from '../utils/error'
import { generateFromSchema } from './generate'

const logger = consola.withTag('polyq:codegen')

export interface WatchOptions {
  /** Project root. All paths are resolved relative to this. */
  cwd: string
  /** Output directory for generated TypeScript. */
  outDir: string
  /** svm | evm — passed through to the generator. */
  chain: ChainFamily
  /** Artifact directory to watch for IDL/ABI changes. */
  artifactDir: string
  /**
   * Source file globs. Changes here trigger `onBuild` and then a
   * regeneration from artifact files. Empty or omitted = only watch
   * the artifact dir.
   */
  sourceGlobs?: string[]
  /**
   * Rebuild hook fired when a source file changes. Defaults to invoking
   * `anchor build` / `forge build` based on chain. Tests override this
   * to avoid needing the real toolchain.
   */
  onBuild?: (chain: ChainFamily, cwd: string) => Promise<boolean>
  /** Regeneration hook — the test seam for the codegen call itself. */
  onRegenerate?: (path: string) => void
}

export interface WatcherHandle {
  /** Resolves once both (source + artifact) watchers are ready. */
  ready: Promise<void>
  /** Stops watching; resolves when chokidar has torn down. */
  close: () => Promise<void>
}

async function defaultBuild(chain: ChainFamily, cwd: string): Promise<boolean> {
  const { run } = await import('../workspace/process')
  const [cmd, args, label] =
    chain === 'svm' ? ['anchor', ['build'], 'anchor build'] : ['forge', ['build'], 'forge build']
  logger.info(`Running ${label}...`)
  try {
    const result = await run(cmd as string, args as string[], { cwd, label, quiet: true })
    if (result.exitCode !== 0) {
      logger.error(`${label} failed`)
      return false
    }
    return true
  } catch (e) {
    logger.error(`${label} failed: ${errorMessage(e)}`)
    return false
  }
}

/**
 * Start watching source + artifact directories for codegen regeneration.
 *
 * Returns a handle with a `close()` that tears down both chokidar watchers,
 * and a `ready` promise that resolves after both watchers have attached.
 * Tests use this seam to drive the watch loop without spawning `anchor`
 * or `forge` — override `onBuild` with a synthetic callback.
 */
export function createCodegenWatcher(options: WatchOptions): WatcherHandle {
  const artifactDir = resolve(options.cwd, options.artifactDir)
  const sourceGlobs = options.sourceGlobs ?? []
  const regenerate =
    options.onRegenerate ??
    ((path: string) => {
      generateFromSchema(path, options.outDir, undefined, options.chain)
    })
  const build = options.onBuild ?? defaultBuild

  let building = false

  // Artifact watcher — the simple path. On any JSON change under the artifact
  // dir, regenerate from that single file. No build step.
  const artifactWatcher: FSWatcher = watch(artifactDir, { ignoreInitial: true })
  artifactWatcher.on('change', filePath => {
    if (building) return
    const fileName = filePath.split('/').pop()
    logger.info(`Schema changed: ${fileName}`)
    regenerate(filePath)
  })
  artifactWatcher.on('add', filePath => {
    if (building) return
    const fileName = filePath.split('/').pop()
    logger.info(`Schema added: ${fileName}`)
    regenerate(filePath)
  })

  // Source watcher — optional, fires build → regenerate sequence.
  // chokidar@5 removed glob support: `sourceGlobs` here are paths, not
  // glob patterns. Callers should point at directories (e.g. `programs/`,
  // `src/`) and we filter by extension in the event handler.
  let sourceWatcher: FSWatcher | undefined
  const sourceExtensions = options.chain === 'svm' ? new Set(['.rs']) : new Set(['.sol'])
  if (sourceGlobs.length > 0) {
    sourceWatcher = watch(sourceGlobs, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 50 },
    })
    const onSourceChange = async (filePath: string) => {
      // Filter by extension ourselves since we can't rely on globs.
      const dot = filePath.lastIndexOf('.')
      if (dot < 0 || !sourceExtensions.has(filePath.slice(dot))) return
      if (building) return
      building = true
      const fileName = filePath.split('/').pop()
      logger.info(`Source changed: ${fileName}`)
      try {
        const ok = await build(options.chain, options.cwd)
        if (!ok) return
        // After rebuild, any artifact-dir change event will fire
        // through `artifactWatcher` naturally. No explicit sweep needed.
      } catch (e) {
        logger.error(`Build failed: ${errorMessage(e)}`)
      } finally {
        building = false
      }
    }
    sourceWatcher.on('change', onSourceChange)
    sourceWatcher.on('add', onSourceChange)
  }

  const ready = Promise.all([
    new Promise<void>(r => {
      artifactWatcher.once('ready', () => r())
    }),
    sourceWatcher
      ? new Promise<void>(r => {
          sourceWatcher!.once('ready', () => r())
        })
      : Promise.resolve(),
  ]).then(() => {})

  return {
    ready,
    close: async () => {
      await Promise.all([artifactWatcher.close(), sourceWatcher?.close() ?? Promise.resolve()])
    },
  }
}
