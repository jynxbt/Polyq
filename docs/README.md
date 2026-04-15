---
title: Polyq Documentation
description: DX toolkit for Solana and EVM — polyfills, schema sync, codegen, and workspace orchestration.
---

# Polyq Documentation

## Getting Started

- [Introduction](getting-started/introduction.md) — What Polyq is and why it exists
- [Installation](getting-started/installation.md) — Install and set up your first project
- [Configuration](getting-started/configuration.md) — Full config reference with auto-detection

## Guides

- [Polyfills](guides/polyfills.md) — How Polyq handles Node.js polyfills for blockchain libs
- [Code Generation](guides/codegen.md) — Generate typed TypeScript clients from IDLs/ABIs
- [Schema Sync + HMR](guides/schema-sync.md) — Auto-sync contract schemas with hot reload
- [Smart Workspace](guides/workspace.md) — Orchestrate your local dev environment

## API Reference

- [Vite Plugin](api/vite-plugin.md) — `polyqVite()`, `polyqPolyfills()`, `polyqIdlSync()`
- [Webpack Plugin](api/webpack-plugin.md) — `polyqWebpack()` for raw webpack projects
- [Next.js Adapter](api/next-adapter.md) — `withPolyq()` for webpack + Turbopack
- [Nuxt Module](api/nuxt-module.md) — Nuxt module with auto-config loading
- [SvelteKit Adapter](api/sveltekit-adapter.md) — `polyqSvelteKit()` for SvelteKit
- [Remix Adapter](api/remix-adapter.md) — `polyqRemix()` for Remix
- [Codegen API](api/codegen-api.md) — `generateFromSchema()`, type mappings
- [Chain Detection](api/chain-detection.md) — `detectChain()`, `ChainProvider` interface

## CLI

- [Commands](cli/commands.md) — `polyq dev`, `polyq codegen`, `polyq init`, `polyq build`, `polyq stop`, `polyq status`

## Architecture

- [Overview](architecture/overview.md) — Package structure, chain provider pattern, orchestrator design
