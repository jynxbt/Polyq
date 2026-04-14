import type { Stage } from '../stage'
import type { ChainFamily, ValidatorStageOptions } from '../../chains/types'
import { detectChain, getChainProvider } from '../../chains'

export type { ValidatorStageOptions }

export function createValidatorStage(options: ValidatorStageOptions & { chain?: ChainFamily }): Stage {
  const chain = options.chain ?? detectChain(options.root)
  return getChainProvider(chain).createValidatorStage(options)
}

export function createValidatorResetStage(options: ValidatorStageOptions & { chain?: ChainFamily }): Stage {
  const chain = options.chain ?? detectChain(options.root)
  return getChainProvider(chain).createValidatorResetStage(options)
}
