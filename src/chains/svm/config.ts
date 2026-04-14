import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'pathe'
import type { ProgramConfig } from '../../config/types'

/**
 * Parse Anchor.toml to extract program definitions.
 */
export function detectProgramsFromAnchor(
  root: string,
): Record<string, ProgramConfig> | undefined {
  const anchorPath = resolve(root, 'Anchor.toml')
  if (!existsSync(anchorPath)) return undefined

  const content = readFileSync(anchorPath, 'utf-8')
  const programs: Record<string, ProgramConfig> = {}

  const programIdsByNetwork: Record<string, Record<string, string>> = {}
  const programSectionRe = /\[programs\.(\w+)\]\s*\n([\s\S]*?)(?=\n\[|\n*$)/g
  let match
  while ((match = programSectionRe.exec(content)) !== null) {
    const network = match[1]
    const body = match[2]
    const kvRe = /^(\w+)\s*=\s*"([^"]+)"/gm
    let kv
    while ((kv = kvRe.exec(body)) !== null) {
      if (!programIdsByNetwork[kv[1]]) programIdsByNetwork[kv[1]] = {}
      programIdsByNetwork[kv[1]][network] = kv[2]
    }
  }

  const workspaceRe = /\[workspace\]\s*\n[\s\S]*?members\s*=\s*\[([\s\S]*?)\]/
  const workspaceMatch = workspaceRe.exec(content)
  const memberPaths: string[] = []
  if (workspaceMatch) {
    const memberRe = /"([^"]+)"/g
    let m
    while ((m = memberRe.exec(workspaceMatch[1])) !== null) {
      memberPaths.push(m[1])
    }
  }

  for (const [name, ids] of Object.entries(programIdsByNetwork)) {
    const camelName = name.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    const programPath = memberPaths.find(p => p.includes(name.replace(/_/g, '-')))

    programs[camelName] = {
      type: 'anchor',
      path: programPath ?? `programs/${name.replace(/_/g, '-')}`,
      schema: `target/idl/${name}.json`,
      programId: ids,
    }
  }

  return Object.keys(programs).length > 0 ? programs : undefined
}

export function findSvmSchemaFiles(root: string): string[] {
  const idlDir = resolve(root, 'target/idl')
  if (!existsSync(idlDir)) return []
  return readdirSync(idlDir)
    .filter(f => f.endsWith('.json'))
    .map(f => resolve(idlDir, f))
}
