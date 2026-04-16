## Why

NexAscent needs one inspectable control surface for session state, model state, worktree state, MCP health, and compaction behavior so users can trust what the CLI is doing during long-running work. This work should start now because the roadmap already identifies the required primitives, and later resume-memory and compaction changes depend on a normalized status surface.

## What Changes

- Add a new system status capability built around a shared status snapshot so one command surface can report provider/model, token pressure, compaction state, session resume source, worktree state, MCP server health, and agent policy flags.
- Stage delivery in three linked phases: Phase 1 snapshot and rendering foundation, Phase 2 versioned compaction-safe session resume memory, and Phase 3 compaction controls plus structured event inspection.
- Keep the initial status surface compatibility-safe by introducing a dedicated `/status` command first, while leaving `/context`, `/session`, and existing discovery surfaces intact.
- Add persistent session memory support for compaction-safe resume using versioned stored core messages with visible-history fallback and explicit resume-source reporting.
- Add compaction controls and an inspectable event log so users can understand when compaction ran, why it ran, what it kept, and what configuration is active.
- Reuse existing compatibility surfaces and keep `.claude`, `Claude.md`, and `AGENTS.md` behavior unchanged during this change.

## Capabilities

### New Capabilities
- `system-status`: Unified status snapshot and user-facing status command output for session, model, context, worktree, MCP, and agent policy state.
- `session-resume-memory`: Versioned persisted core session memory with safe fallback behavior after compaction or restart.
- `compaction-inspection`: User-visible compaction configuration and structured recent compaction event history.

### Modified Capabilities
- None.

## Reference Inputs

- Internal free-code internals and existing command/service surfaces
- Earlier NexAscent comparison and roadmap work in `F:\code\free-code-working\NexAscent.md`
- External reference repos reviewed for feature ideas and planning context:
  - `F:\code\soulforge`
  - `F:\code\opencode`
  - `F:\code\openclaude`
  - `F:\code\codex`

These references guide product direction and UX planning. Implementation should remain compatibility-safe and grounded in current free-code architecture.

## Tooling Guidance

Implementation and validation work for this change may use any available capability that best fits the task:
- repository-local read/search/edit/test tools
- available MCP servers for documentation, repo analysis, observability, browser workflows, or external context
- local shell workflows for builds, tests, and CLI-driven inspection
- local package managers when a missing dependency or CLI is required, including `winget` on Windows and tools such as `npm`, `pnpm`, `bun`, or `choco` where appropriate

Prefer the least invasive path that solves the task. Verify installation is actually needed before adding software, and avoid destructive or broad system changes unless explicitly requested.

## Impact

- Likely touches `src/commands/context/context.tsx`, `src/commands/session/session.tsx`, `src/services/mcp/MCPConnectionManager.tsx`, `src/utils/worktree.ts`, `src/cli/print.ts`, `src/commands.ts`, `src/bootstrap/state.ts`, and related session persistence and compaction modules.
- Adds new OpenSpec capability specs for status, resume memory, and compaction inspection.
- Preserves existing compatibility entrypoints and command discovery behavior while enabling future NexAscent rebrand work.