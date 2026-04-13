## Context

The roadmap in `NexAscent.md` defines three linked phases: a unified system status surface, compaction-safe persisted session memory, and compaction controls with an event log. The codebase likely already exposes parts of this state across `context`, `session`, MCP management, worktree helpers, and bootstrap state, but users cannot inspect it from one place. The design must join these systems without breaking existing compatibility surfaces such as `.claude`, `Claude.md`, and `AGENTS.md`.

This change is cross-cutting because it spans command rendering, session persistence, compaction state, and MCP health reporting. It also introduces new persisted data shapes that must remain backward compatible with existing session files.

## Goals / Non-Goals

**Goals:**
- Define a normalized status snapshot model that can aggregate session, model, context, worktree, MCP, and agent-policy state for a single user-facing command.
- Introduce versioned persisted session state for core machine-facing memory so compaction does not break resume quality.
- Add a structured compaction event log and effective compaction configuration view so users can inspect compaction behavior.
- Preserve backward compatibility for current session restore paths and legacy instruction/config discovery surfaces.
- Sequence work so Phase 1 status output can later expose Phase 2 resume source and Phase 3 compaction events without redesign.

**Non-Goals:**
- Full product rebrand from free-code to NexAscent.
- Renaming compatibility-sensitive files such as `.claude`, `Claude.md`, or `AGENTS.md`.
- Building new remote storage or sync infrastructure.
- Introducing arbitrary user actions that mutate system state beyond safe refresh or inspect flows.

## Decisions

### 1. Add a shared status snapshot builder
Create one internal snapshot builder that gathers state from existing session, context, MCP, worktree, and model/provider sources, then returns a normalized object consumed by command renderers. This avoids duplicating formatting logic across `/status`, `/context`, or future statusline integrations.

**Why this approach:** one source of truth makes it easier to add Phase 2 and Phase 3 state later without touching every renderer.

**Alternatives considered:**
- Query each subsystem directly inside a command renderer. Rejected because rendering code would become tightly coupled to multiple services and harder to test.
- Only extend the existing `/context` output. Rejected because roadmap calls for broader system state than token/context data alone.

### 2. Model persisted session state as versioned schema with optional core memory
Extend persisted session state with a new version that stores visible messages, optional core messages, checkpoint metadata, and resume metadata. Keep loader logic backward compatible so older session files still restore through current behavior.

**Why this approach:** versioned persistence allows schema evolution and safe fallback if core memory is missing or corrupt.

**Alternatives considered:**
- Overwrite existing session shape in place. Rejected because migration ambiguity would make restore failures harder to diagnose.
- Store only a compaction summary instead of core messages. Rejected because summary-only persistence may not preserve enough machine-facing context for high-quality resume.

### 3. Record compaction events as bounded structured history
Persist a recent ring buffer of compaction events alongside session state or adjacent session metadata. Each event should capture trigger, before/after token counts when available, retained message counts, dropped tool results, strategy, and summary.

**Why this approach:** bounded structured history provides inspectability without unbounded growth.

**Alternatives considered:**
- Log only to console output. Rejected because information would be lost on restart and unavailable to `/status`.
- Keep full raw compaction transcripts. Rejected because payload size and sensitivity are harder to control.

### 4. Keep command surfaces compatibility-safe
Expose new inspection behavior through a dedicated `/status` command or a controlled extension of existing context/session commands, but do not remove or rename current entrypoints during this change. Status output should explicitly label resume source and degraded subsystem states.

**Why this approach:** users gain inspectability without breaking existing workflows or scripts.

**Alternatives considered:**
- Replace existing commands outright. Rejected because compatibility risk is too high for an infrastructure-focused change.

### 5. Treat MCP and compaction health as degradable, not fatal
If MCP health checks fail or persisted core session memory is corrupt, the snapshot should surface warning state and fallback behavior instead of aborting the command or session restore.

**Why this approach:** inspectability features should improve trust during failure, not create new hard failures.

**Alternatives considered:**
- Fail status or resume on inconsistent metadata. Rejected because the roadmap explicitly calls for safe fallback and explicit reporting.

## Risks / Trade-offs

- **[Snapshot drift across subsystems]** → Mitigation: centralize snapshot typing and add unit tests for each state contributor.
- **[Session persistence migration bugs]** → Mitigation: support old and new versions in loaders, add corruption and fallback-path tests, and keep version markers explicit.
- **[Status command becomes too broad or noisy]** → Mitigation: start with concise plain-text sections and degrade details into secondary commands where needed.
- **[Compaction event history grows too large]** → Mitigation: store only a bounded recent window and compact event fields to essential metadata.
- **[MCP health data is stale or unavailable]** → Mitigation: represent freshness timestamps and degraded states rather than implying certainty.

## Migration Plan

1. Add snapshot types and builder with current available fields, then expose initial plain-text status output.
2. Introduce versioned session persistence loader/writer that can read older session state and write new schema safely.
3. Add compaction event capture and bounded persistence, then surface event summaries through status output.
4. Add tests for snapshot composition, session migration, corruption fallback, and command rendering.
5. Ship without changing compatibility-sensitive discovery names; if issues arise, rollback by disabling new status output paths while preserving older persistence readers.

## Open Questions

- Where is the best existing source of provider/model and agent-policy flags in the current codebase?
- Should compaction configuration live in existing settings schema or a new nested config block?
- What bounded size should be used for stored core messages and compaction event history to balance quality and payload size?

## Reference Inputs

This change proposal is informed by both internal free-code primitives and external feature/reference repos reviewed during NexAscent planning.

### External reference repos
- `F:\code\soulforge`
- `F:\code\opencode`
- `F:\code\openclaude`
- `F:\code\codex`

These references are used for feature ideas, UX comparisons, and implementation-shape guidance only. The intended implementation should still prefer existing free-code internals and compatibility-safe extensions over direct cloning.

## Tooling Guidance

Implementation, validation, and follow-up exploration for this design may use any available capability that best fits the task:
- repository-native file and edit tools for direct code changes
- MCP servers for repo maps, docs, observability, browser automation, and other higher-level facts
- local shell workflows for builds, tests, and CLI-only operations
- local package managers such as `winget`, `npm`, `pnpm`, `bun`, or `choco` when a missing tool or dependency is necessary and appropriate

Prefer the lowest-impact path that provides the needed result. Confirm an install is necessary before adding software, and avoid destructive or broad system changes unless explicitly requested.

## Current Exploration Notes

### Initial command shape
Current exploration favors a dedicated `/status` command as the first user-facing surface.

**Why this is the best first cut:**
- It avoids overloading `/context`, which already implies token/context-specific output.
- It gives Phase 1 a clear home for cross-cutting system state.
- It reduces rollout risk because existing `/context` and `/session` flows can remain stable while the snapshot model matures.
- It creates a natural aggregation point for later Phase 2 resume-source reporting and Phase 3 compaction history.

A later follow-up can choose to surface a subset of the same snapshot inside `/context` if duplication improves discoverability.

### Status information architecture
The roadmap now implies a two-level inspection model:

```text
/status
  ├─ session summary
  ├─ model/provider summary
  ├─ context + compaction summary
  ├─ worktree summary
  ├─ MCP health summary
  └─ agent policy summary

Deeper commands
  ├─ /session   -> session details and restore flows
  ├─ /context   -> token/context-centric detail
  └─ /mcp       -> server-specific inspection and control
```

This keeps `/status` concise and operator-focused while preserving subsystem-specific depth elsewhere.

### Delivery shape
The safest implementation path still looks sequential:
1. Define normalized snapshot types and degraded-state rules.
2. Ship plain-text `/status` output first.
3. Feed Phase 2 resume metadata into the same snapshot.
4. Feed Phase 3 compaction config and event summaries into the same snapshot.

That sequence matches the roadmap and avoids redesign churn between phases.