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
  - src/state/: app state store
  - src/hooks/: React hooks used by UI/flows
  - src/components/: terminal UI components (Ink)
  - src/skills/: skill system
  - src/plugins/: plugin system
  - src/bridge/: IDE bridge
  - src/voice/: voice input
  - src/tasks/: background task management

## Build system

- scripts/build.ts is the build script and feature-flag bundler. Feature flags are set via build arguments (e.g., `--feature=ULTRAPLAN`) or presets like `--feature-set=dev-full` (see README for details).

## Context-mode tool usage (MANDATORY)

For any prompt, tool, MCP action, or command expected to produce more than ~20 lines of output, you MUST use context-mode MCP tools to avoid flooding the context window. This rule applies even when the work is not initiated through Bash.

| Task | Use this tool |
|------|--------------|
| Research / multi-command investigation | `mcp__plugin_context-mode_context-mode__ctx_batch_execute` |
| Follow-up queries on already-indexed data | `mcp__plugin_context-mode_context-mode__ctx_search` |
| API calls, log analysis, data processing | `mcp__plugin_context-mode_context-mode__ctx_execute` or `ctx_execute_file` |
| Fetching external URLs | `mcp__plugin_context-mode_context-mode__ctx_fetch_and_index` |

**Bash is reserved for:** `git`, `mkdir`, `rm`, `mv`, directory navigation, and other short-output commands only.

Do NOT use Bash for: build output, test output, file listings, grep/find results, curl responses, or any command whose output exceeds ~20 lines.

## Deferred tool handling (MANDATORY)

If a slash command, skill, or injected instruction references a deferred MCP tool that is not yet callable, you MUST load the tool schema first with `ToolSearch` and then execute it.

- Treat **skill loaded** and **tool loaded** as separate states.
- Do not stop at “the tool is not loaded” when the user asked to run the slash command.
- If the skill names a specific tool, load that exact tool with `ToolSearch` and continue.
- After loading the missing schema, follow the skill instructions verbatim.
- For commands like `/context-mode:ctx-stats`, `/context-mode:ctx-doctor`, and `/context-mode:ctx-upgrade`, prefer end-to-end execution in the same flow after loading any missing deferred tools.
