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

Use best tool for task. Use shell for narrow file reads/tests and CodeSight MCP for broad repo analysis.

### Tool selection

| Task | Preferred tool |
|------|----------------|
| Known file or small targeted read | `shell_command` (`Get-Content`) |
| Known text/symbol/pattern search | `shell_command` (`Select-String`) |
| Known file/path pattern search | `shell_command` |
| Multiple commands in one call | `multi_tool_use.parallel` |
| Agent/subagent work | Use for broad exploration, architecture decisions |

### Reading code

Use CodeSight MCP tools for broad source facts:
- `mcp__codesight__codesight_get_knowledge` — decisions, specs, notes, knowledge
- `mcp__codesight__codesight_get_routes` — API/file routes
- `mcp__codesight__codesight_get_schema` — schema/types
- `mcp__codesight__codesight_get_env` — environment variables
- `mcp__codesight__codesight_scan` — scan code with query
- `mcp__codesight__codesight_lint_wiki` — wiki consistency check

### Cost guardrails

- Batch parallel operations with independent calls.
- Combine related shell searches before executing.
- Use Agent tool for research-heavy tasks to reduce tool call overhead
- Avoid unnecessary sequential tool calls when one batch call would suffice
- For risky edits, confirm current state with `git status --short` first.

### Prompt handling

- Default query paths already use lean system prompts; avoid adding verbose behavioral prose in prompt text.
- Keep `CLAUDE.md` reads conditional on need (instruction/tool-usage related prompts) rather than unconditional.

### Windows shell note

- Use PowerShell commands directly for shell execution.
- Do not rely on plain `bash` for POSIX behavior assumptions.

## CodeSight + memory

- Use `.codesight/` first for codebase map. Read targeted file, not all.
- Start with `.codesight/CODESIGHT.md`. If wiki exists, read `.codesight/wiki/index.md`, then one article.
- Read `.codesight/KNOWLEDGE.md` for decisions, specs, notes, retros.
- Use CodeSight for code facts: routes, schema, deps, blast radius, hot files, env.
- If CodeSight MCP exists, use targeted MCP tool over broad scans.
- Use current source as truth. Memory tools can help if available; CodeSight shows where.
- Search order: CodeSight → repo source (`shell_command` + targeted reads).
- If local `.codesight/` stale or missing, refresh with `npx codesight` / `npx codesight --wiki` / `npx codesight --mode knowledge`.
- Keep reads small. Prefer one CodeSight article or slice over broad file sweeps.
- Keep edits minimal and avoid unrelated file rewrites.

## Observability & MCP Integration

- `mcp__sentry__` tools are available for project/org/release/events lookups when observability context is needed.
- Use CodeSight first for structure, then Sentry for runtime/issue investigation.
