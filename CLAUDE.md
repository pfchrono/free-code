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

## Agent-facing feature guidance

- **Enhanced memory/session continuity**:
  - Persistent memory lives in `src/services/memory/persistentMemorySystem.ts`.
  - Session continuity lives in `src/services/memory/sessionContinuityManager.ts`.
  - Prefer these systems when reasoning about recent work, session context, task continuity, or prior user intent in the current project.
  - Treat this as project/session memory, not a substitute for reading the current source of truth.
- **Live dependency graph**:
  - The codebase intelligence layer lives under `src/utils/codebase/`.
  - Use it for file/context recommendation, dependency lookups, blast-radius analysis, and ranked context selection before broad exploratory searching.
  - Relevant design/test docs: `docs/live-dependency-graph-design.md`, `HOW-TO-TEST-LIVE-DEPENDENCY-GRAPH.md`.
- **Hash-anchor editing/search**:
  - `src/tools/FileEditTool/hashAnchor.ts` provides `LINE#HASH` anchors for stale-edit protection.
  - When a workflow already supports `line_anchor`, prefer it for precise edits in frequently changing files.
  - This feature is for edit reliability and targeted validation, not a replacement for reading enough context before editing.

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

## Tool usage & consolidation

Use cheapest tool for task. Direct tools (Read, Grep, Glob) for small scoped lookups. Batch multiple operations into single tool calls when possible.

### Tool selection

| Task | Preferred tool |
|------|----------------|
| Known file or small targeted read | `Read` |
| Known text/symbol/pattern search | `Grep` |
| Known file/path pattern search | `Glob` |
| Multiple commands in one call | `Bash` (chained with `&&`) or parallel tool calls |
| Agent/subagent work | Use for broad exploration, architecture decisions |

**Bash is reserved for:** `git`, `mkdir`, `rm`, `mv`, directory navigation, and short-output commands.

### Cost guardrails

- Batch parallel operations (e.g., `Read` multiple files in sequence if independent)
- Combine related Grep/Glob searches before executing
- Use Agent tool for research-heavy tasks to reduce tool call overhead
- Avoid unnecessary sequential tool calls when one batch call would suffice

## CodeSight + memory

- Use `.codesight/` first for codebase map. Read targeted file, not all.
- Start with `.codesight/CODESIGHT.md`. If wiki exists, read `.codesight/wiki/index.md`, then one article.
- Read `.codesight/KNOWLEDGE.md` for decisions, specs, notes, retros.
- Use CodeSight for code facts: routes, schema, deps, blast radius, hot files, env.
- If CodeSight MCP exists, use targeted MCP tool over broad scans.
- Use project memory + mempalace for prior decisions, user prefs, non-code context.
- Use current source as truth. Memory explains why. CodeSight shows where.
- Search order: CodeSight → repo source (`Read`/`Grep`/`Glob`) → memory/MEMORY.md → mempalace if needed.
- If local `.codesight/` stale or missing, refresh with `npx codesight` / `npx codesight --wiki` / `npx codesight --mode knowledge`.
- Keep reads small. Prefer one CodeSight article or slice over broad file sweeps.

## Observability & MCP Integration

- **Token Monitor MCP** (`mcp-servers/token-monitor`): Real-time token usage tracking, anomaly detection, cache analytics
  - Record events: `observability.logApiCall({inputTokens, outputTokens, model, duration})`
  - Get metrics: `await observability.tokens.getMetrics()` → `{avgTokensPerRequest, peakTokensPerSecond, cacheHitRate, spikesDetected}`
  - Check anomalies: `await observability.tokens.checkForAnomalies()` (returns true if spikes/high rates detected)
  
- **Code Summarizer MCP** (`mcp-servers/code-summarizer`): File compression for context efficiency
  - Summarize file: `await observability.code.summarizeFile(filePath)` → structure with exports, functions, compression ratio
  - Prepare for API: `await observability.prepareFileContent(filePath)` → compressed summary if >20% reduction, else null
  - Estimate savings: `observability.code.estimateTokenSavings(summary)` → tokens saved

- **Usage**: Import from `src/services/observability`, call after API interactions. See `src/services/observability/USAGE.md` for patterns.
