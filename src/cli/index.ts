#!/usr/bin/env node
import { defineCommand, runMain } from 'citty'

const main = defineCommand({
  meta: {
    name: 'polyq',
    version: '0.2.0',
    description: 'DX toolkit for Solana and EVM — schema sync, polyfills, codegen, and workspace orchestration',
  },
  subCommands: {
    dev: () => import('./commands/dev').then(m => m.default),
    build: () => import('./commands/build').then(m => m.default),
    codegen: () => import('./commands/codegen').then(m => m.default),
    stop: () => import('./commands/stop').then(m => m.default),
    status: () => import('./commands/status').then(m => m.default),
    init: () => import('./commands/init').then(m => m.default),
  },
})

runMain(main)
