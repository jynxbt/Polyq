import { mkdirSync, readFileSync } from 'node:fs'
import consola from 'consola'
import { resolve } from 'pathe'
import type { CodegenConfig } from '../../config/types'
import type { CodegenOutput } from '../types'

const logger = consola.withTag('polyq:codegen-kit')

/**
 * Generate a @solana/kit-flavored client from an Anchor IDL by delegating to Codama.
 *
 * Requires the following peer dependencies in the consumer project:
 *   codama, @codama/nodes-from-anchor, @codama/renderers-js
 *
 * The peers are optional at the polyq level so users who stick with legacy codegen
 * don't pay the install cost. The dynamic imports below produce a clear,
 * actionable error if any of the three are missing.
 */
export async function generateFromIdlKit(
  idlPath: string,
  outDir: string,
  _config?: Partial<CodegenConfig>,
): Promise<CodegenOutput> {
  const raw = readFileSync(idlPath, 'utf-8')
  let anchorIdl: unknown
  try {
    anchorIdl = JSON.parse(raw)
  } catch {
    throw new Error(`Invalid JSON in IDL file: ${idlPath}`)
  }

  const [{ createFromRoot }, { rootNodeFromAnchor }, { renderVisitor }] = await Promise.all([
    loadPeer<{ createFromRoot: (root: unknown) => { accept: (v: unknown) => Promise<void> } }>(
      'codama',
    ),
    loadPeer<{ rootNodeFromAnchor: (idl: unknown) => unknown }>('@codama/nodes-from-anchor'),
    loadPeer<{ renderVisitor: (out: string) => unknown }>('@codama/renderers-js'),
  ])

  mkdirSync(outDir, { recursive: true })
  const absOut = resolve(outDir)

  logger.info(`Generating @solana/kit client via Codama → ${absOut}`)
  const codama = createFromRoot(rootNodeFromAnchor(anchorIdl))
  await codama.accept(renderVisitor(absOut))
  logger.success('Codama render complete')

  // Codama writes files directly; we don't get the file list back.
  // Return an empty `files` array to satisfy the CodegenOutput shape.
  return { files: [] }
}

async function loadPeer<T>(name: string): Promise<T> {
  try {
    return (await import(name)) as T
  } catch {
    throw new Error(
      `codegen.mode "kit" requires peer dependency "${name}". ` +
        'Install it in your project: `npm install --save-dev codama @codama/nodes-from-anchor @codama/renderers-js`',
    )
  }
}
