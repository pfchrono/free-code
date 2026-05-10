# Memory Parity Enhancement Plan

Goal: make Free-Code memory continuity equal to or better than Nexagent while preserving Free-Code naming, `.free-code/` storage, provider semantics, and existing Archivist/token-savior compatibility.

## Current Comparison

Free-Code now has strong foundations:

- native `/goal` and goal tools with compact state plus recent progress notes
- `persistentMemorySystem` with native and Archivist providers
- `sessionContinuityManager` with sessions, tasks, working files, insights, resume snapshots
- `sessionMemoryCompact` and context-collapse persistence
- `/memory`, `/memory+`, `/session`, `/context`, `/compact`
- Archivist memory/code-intel/checkpoint providers

Nexagent is still ahead because its memory is more operationally connected:

- `tool-memory.ts` records every useful tool/assistant result into compact prompt memory
- `session-timeline.ts` gives an operator-visible event/goal/commit timeline
- `/sessions timeline` and `/sessions tree` expose continuity lineage
- Boomerang completion compacts work and seeds Archivist memory automatically
- Nexsight gives bounded gather/read/index/search as a first-class anti-context-flood layer
- Goal continuation prompt performs a stricter completion audit with requirement-to-evidence checklist

## Enhancement Candidates

### 1. Runtime Tool Memory For Free-Code

Adopt Nexagent's `tool-memory` concept, not its branding.

Files to target:

- `src/services/memory/toolMemory.ts`
- `src/services/tools/toolExecution.ts`
- `src/QueryEngine.ts`
- `src/context.ts` or prompt assembly path
- tests under `src/services/memory/`

Behavior:

- record compact summaries of tool calls and assistant outcomes
- extract durable facts from outputs
- inject bounded recent memory into prompt context
- store under `.free-code/memory/tool-memory.json` or session state

Benefit: biggest memory-ranking jump. Harness remembers what it did even when transcript compacts.

Risk: prompt bloat and stale facts. Mitigate with low-signal filters, char budget, source ids, and TTL.

### 2. Session Timeline And Continuity Tree

Merge Nexagent's timeline idea into Free-Code session surfaces.

Files to target:

- `src/services/memory/sessionContinuityManager.ts`
- `src/commands/session/session.tsx`
- `src/utils/sessionStorage.ts`
- `src/services/goals/goalStore.ts`

Behavior:

- persist timeline entries for goal updates, compactions, tool batches, commits, handoffs, and resume source
- add `/session timeline` and `/session tree`
- show current resume source and latest compact state

Benefit: user can inspect what harness thinks happened. This directly fixes "forgot task during /goal" trust failures.

Risk: duplicate session stores. Mitigate by making timeline an append-only view over existing session continuity state.

### 3. Boomerang/Handoff Memory Reseed

Free-Code already has handoff skills and goal loops. Add automatic durable reseed after handoff-style autonomous runs.

Files to target:

- handoff skill integration path
- `src/services/providers/archivist/archivistCheckpointProvider.ts`
- `src/services/memory/persistentMemorySystem.ts`
- `src/commands/goal/goal.ts`

Behavior:

- when `$handoff`, `$tte/try-to-enhance`, or long `/goal` run wraps up, save compact summary into native memory and Archivist
- include changed files, commands, tests, blockers, next action

Benefit: next session starts with durable task state, not only visible transcript.

Risk: over-saving junk. Mitigate with minimum signal checks and explicit source tags.

### 4. Nexsight-Like Bounded Context Store

Free-Code has context-mode MCP and codebase utilities, but not a native user-facing "bounded context engine" equivalent to Nexsight.

Files to target:

- `src/services/contextIndex/` or `src/services/nexsight-equivalent/` with Free-Code naming
- `src/commands/context/`
- `src/tools/` if exposed as internal tools

Behavior:

- compressed read modes: map, signatures, outline, lines
- batch gather for broad audits
- local FTS/JSON fallback index under `.free-code/context/`

Benefit: avoids raw context floods and makes memory retrieval more precise.

Risk: overlaps existing context-mode MCP. Mitigate by using native path as fallback/local layer and preserving MCP compatibility.

### 5. Stronger Goal Completion Audit

Port Nexagent's goal audit wording into Free-Code continuation prompt.

Files to target:

- `src/services/goals/goalPrompt.ts`
- `src/services/goals/goalStore.test.ts`

Behavior:

- require prompt-to-artifact checklist before `update_goal complete`
- require evidence for every explicit requirement
- reject proxy signals as completion by themselves

Benefit: prevents `/goal` from stopping because build passed while requirements remain incomplete.

Risk: more tokens. Mitigate by keeping audit text concise and reusing compact state.

## Recommended Order

1. Add runtime tool memory and prompt injection.
2. Add session timeline/tree and resume-source display.
3. Wire handoff/goal completion summaries into native memory plus Archivist.
4. Strengthen goal completion audit.
5. Add native bounded context store only after memory surfaces prove stable.

Done criteria:

- Free-Code can answer "what was I doing?" after compaction/resume using stored memory.
- `/goal status` or `/session timeline` shows compact state, recent actions, changed files, verification, and next action.
- Long goal run survives transcript compaction without reverting to dirty-worktree guessing.
- Tests cover memory recording, low-signal filtering, timeline persistence, and prompt budget bounds.
