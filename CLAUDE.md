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

- scripts/build.ts is the build script and feature-flag bundler. Feature flags are set via build arguments (e.g., `--feature=ULTRAPLAN`) or presets like `--feature-set=dev-full` (see README for details).

## Context-mode tool usage (MANDATORY)

Use the cheapest tool that fits the task. Direct tools are preferred for small scoped lookups; context-mode remains mandatory whenever output is expected to exceed ~20 lines.

### Tool selection order

1. **Direct file tools for scoped inspection**: prefer `Read`, `Grep`, and `Glob` when you already know the file, symbol, or search pattern, or when the task can be answered with a small number of targeted lookups.
2. **`ctx_batch_execute` for aggregation**: use `mcp__plugin_context-mode_context-mode__ctx_batch_execute` when you need to combine multiple commands/searches whose raw output would otherwise flood context.
3. **`ctx_search` for follow-ups**: use `mcp__plugin_context-mode_context-mode__ctx_search` after indexing when you need additional questions answered from the same gathered data.
4. **Subagents for broad exploration only**: use Explore or other research subagents only for open-ended, multi-step exploration where a few direct searches are unlikely to find the answer.

| Task | Preferred tool |
|------|----------------|
| Known file or small targeted read | `Read` |
| Known text/symbol/pattern search | `Grep` |
| Known file/path pattern search | `Glob` |
| Research / multi-command investigation with larger output | `mcp__plugin_context-mode_context-mode__ctx_batch_execute` |
| Follow-up queries on already-indexed data | `mcp__plugin_context-mode_context-mode__ctx_search` |
| API calls, log analysis, data processing | `mcp__plugin_context-mode_context-mode__ctx_execute` or `ctx_execute_file` |
| Fetching external URLs | `mcp__plugin_context-mode_context-mode__ctx_fetch_and_index` |

**Bash is reserved for:** `git`, `mkdir`, `rm`, `mv`, directory navigation, and other short-output commands only.

Do NOT use Bash for: build output, test output, file listings, grep/find results, curl responses, or any command whose output exceeds ~20 lines.

### Cost guardrails

- Do not use a repo-mapping subagent for a scoped documentation or code audit.
- Do not use `ctx_batch_execute` when 1-3 direct `Read`/`Grep`/`Glob` calls will answer the question.
- Escalate from direct tools -> context-mode -> subagents only when the simpler tier is clearly insufficient.

## Deferred tool handling (MANDATORY)

If a slash command, skill, or injected instruction references a deferred MCP tool that is not yet callable, you MUST load the tool schema first with `ToolSearch` and then execute it.

- Treat **skill loaded** and **tool loaded** as separate states.
- Do not stop at “the tool is not loaded” when the user asked to run the slash command.
- If the skill names a specific tool, load that exact tool with `ToolSearch` and continue.
- After loading the missing schema, follow the skill instructions verbatim.
- For commands like `/context-mode:ctx-stats`, `/context-mode:ctx-doctor`, and `/context-mode:ctx-upgrade`, prefer end-to-end execution in the same flow after loading any missing deferred tools.
