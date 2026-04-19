import { detectChain, getChainProvider } from '../../chains'
import type { ChainFamily, ProgramsStageOptions } from '../../chains/types'
import type { Stage } from '../stage'

export type { ProgramsStageOptions }

export function createProgramsBuildStage(
  options: ProgramsStageOptions & { chain?: ChainFamily },
): Stage {
  const chain = options.chain ?? detectChain(options.root)
  return getChainProvider(chain).createBuildStage(options)
}

export function createProgramsDeployStage(
  options: ProgramsStageOptions & { chain?: ChainFamily },
): Stage {
  const chain = options.chain ?? detectChain(options.root)
  return getChainProvider(chain).createDeployStage(options)
}
