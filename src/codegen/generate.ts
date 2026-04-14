import type { CodegenConfig } from '../config/types'
import type { CodegenOutput } from '../chains/types'
import { detectChain, getChainProvider } from '../chains'

export type { CodegenOutput }

/**
 * Generate TypeScript client from a contract schema file.
 * Auto-detects chain (SVM/EVM) and dispatches to the appropriate generator.
 */
export function generateFromSchema(
  schemaPath: string,
  outDir: string,
  config?: Partial<CodegenConfig>,
  chain?: 'svm' | 'evm',
): CodegenOutput {
  const resolvedChain = chain ?? detectChain(process.cwd())
  const provider = getChainProvider(resolvedChain)
  return provider.generateClient(schemaPath, outDir, config)
}

/**
 * @deprecated Use generateFromSchema. This calls the SVM codegen directly.
 */
export function generateFromIdl(
  idlPath: string,
  outDir: string,
  config?: Partial<CodegenConfig>,
): CodegenOutput {
  return generateFromSchema(idlPath, outDir, config, 'svm')
}
