# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common commands

```bash
# Install dependencies
bun install

# Standard build (./cli)
bun run build

# Dev build (./cli-dev)
bun run build:dev

# Dev build with all experimental features (./cli-dev)
bun run build:dev:full

# Compiled build (./dist/cli)
bun run compile

# Run from source without compiling
bun run dev
```

Run the built binary with `./cli` or `./cli-dev`. Set `ANTHROPIC_API_KEY` in the environment or use OAuth via `./cli /login`.

## High-level architecture

- **Entry point/UI loop**: src/entrypoints/cli.tsx bootstraps the CLI, with the main interactive UI in src/screens/REPL.tsx (Ink/React).
- **Command/tool registries**: src/commands.ts registers slash commands; src/tools.ts registers tool implementations. Implementations live in src/commands/ and src/tools/.
- **LLM query pipeline**: src/QueryEngine.ts coordinates message flow, tool use, and model invocation.
- **Core subsystems**:
  - src/services/: API clients, OAuth/MCP integration, analytics stubs
  - src/services/memory/: persistent memory storage and session continuity (`persistentMemorySystem.ts`, `sessionContinuityManager.ts`)
  - src/utils/codebase/: live dependency graph, PageRank ranking, dependency parsing, and context recommendation helpers
  - src/tools/FileEditTool/: file editing flow, including hash-anchor validation support via `line_anchor`
  - src/state/: app state store
  - src/hooks/: React hooks used by UI/flows
  - src/components/: terminal UI components (Ink)
  - src/skills/: skill system
  - src/plugins/: plugin system
  - src/bridge/: IDE bridge
  - src/voice/: voice input
  - src/tasks/: background task management

## Repo systems worth knowing

- **Persistent memory/session continuity**
  - `src/services/memory/persistentMemorySystem.ts`
  - `src/services/memory/sessionContinuityManager.ts`
- **Live dependency graph / context recommendation**
  - `src/utils/codebase/`
  - design/test docs: `docs/live-dependency-graph-design.md`, `HOW-TO-TEST-LIVE-DEPENDENCY-GRAPH.md`
- **Hash-anchor support for precise edits**
  - `src/tools/FileEditTool/hashAnchor.ts`

## Build system

scripts/build.ts is the build script and feature-flag bundler. Feature flags are set via build arguments (e.g., `--feature=ULTRAPLAN`) or presets like `--feature-set=dev-full` (see README for details).

### Build commands (matching install.ps1 flow)

```bash
# Install dependencies
bun install

# Standard compiled build (./dist/cli, no telemetry)
bun run compile:no-telemetry

# Dev build with all experimental features (./dist/cli-dev, no telemetry)
bun run compile:dev:full:no-telemetry

# Verify built binary for phone-home patterns
bun run verify:no-phone-home -- ./dist/cli

# Run from source without compiling
bun run dev
```

## Repo-specific guidance

- If `.codesight/` exists, its project map and wiki can speed up orientation for this repo, but the checked-in source remains authoritative.
- Use `src/utils/codebase/` when working on dependency graph, blast-radius, or context recommendation behavior.
- Memory/session continuity work centers on `src/services/memory/`.
- Hash-anchor edit support lives in `src/tools/FileEditTool/hashAnchor.ts`.
