import { detectChain, getChainProvider } from '../chains'
import type { CodegenOutput } from '../chains/types'
import type { CodegenConfig } from '../config/types'

export type { CodegenOutput }

/**
 * Generate TypeScript client from a contract schema file.
 * Auto-detects chain (SVM/EVM) and dispatches to the appropriate generator.
 *
 * Returns `CodegenOutput` synchronously for the default `'legacy'` and EVM
 * `'viem'` modes (hand-rolled renderers). Returns `Promise<CodegenOutput>`
 * when `config.mode === 'kit'` (Codama delegation is async).
 *
 * Callers that don't use `mode: 'kit'` can rely on the sync return. Callers
 * that may use either should `await` the result — `await` on a non-Promise
 * is a no-op.
 */
export function generateFromSchema(
  schemaPath: string,
  outDir: string,
  config?: Partial<CodegenConfig>,
  chain?: 'svm' | 'evm',
): CodegenOutput | Promise<CodegenOutput> {
  const resolvedChain = chain ?? detectChain(process.cwd())
  const provider = getChainProvider(resolvedChain)
  return provider.generateClient(schemaPath, outDir, config)
}
