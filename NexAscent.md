# NexAscent Roadmap

## Product Thesis

NexAscent should feel inspectable.

User should always know:
- what state exists
- what was compacted
- what session memory survives
- what MCP servers are alive
- what model or agent policy is active

This document turns the earlier comparison into a concrete execution plan for the next three phases, followed by a full rebrand plan.

---

## Goals for Phases 1-3

1. Build a first-class system state surface.
2. Persist compaction-safe session memory.
3. Make compaction configurable and inspectable.

These three phases should productize existing free-code internals without requiring major new backend invention.

---

## Phase 1 — System State Dashboard

### Outcome
Create one operator surface that shows live state for session, context, MCP, worktree, model, and agent policy.

### Why first
The repo already appears to have many of the needed primitives, but they are spread across separate commands and services. This phase composes them into a coherent control plane.

### User-facing deliverable
Add a new `status` surface, either as:
- a dedicated `/status` command, or
- a major upgrade of the existing `/context` experience

### Minimum visible sections
- active provider and model
- token usage or pressure
- compaction state
- current session identity and resume source
- worktree status
- active MCP servers
- agent or execution policy flags

### MCP section should show
- server name
- ready / connecting / error / disabled
- tool count
- last error
- last successful ping or health check
- reconnect affordance if supported

### Candidate files to inspect and likely touch
- `src/commands/context/context.tsx`
- `src/commands/session/session.tsx`
- `src/services/mcp/MCPConnectionManager.tsx`
- `src/utils/worktree.ts`
- `src/cli/print.ts`
- `src/commands.ts`
- any existing statusline or usage components that already expose provider or token data

### Proposed implementation shape
Create a shared status aggregator that collects state from existing systems and returns a normalized snapshot.

Suggested internal shape:

```ts
interface SystemStatusSnapshot {
  session: {
    id?: string
    resumeSource?: 'fresh' | 'visible-history' | 'core-history' | 'checkpoint'
    cwd?: string
    startedAt?: string
  }
  model: {
    provider?: string
    model?: string
    effort?: string
    executionPolicy?: string[]
  }
  context: {
    tokenPressure?: 'low' | 'medium' | 'high'
    estimatedTokens?: number
    compactionEnabled?: boolean
    lastCompactionAt?: string
    lastCompactionReason?: string
  }
  worktree: {
    active?: boolean
    path?: string
    branch?: string
    repoRoot?: string
  }
  mcp: Array<{
    name: string
    status: 'ready' | 'connecting' | 'error' | 'disabled'
    toolCount?: number
    lastPingAt?: string
    lastError?: string
  }>
  agents: {
    cheapRouting?: boolean
    verificationPass?: boolean
    delayedToolLoading?: boolean
    strictTaskTargeting?: boolean
  }
}
```

### Milestone cuts

#### P1.1 Snapshot backend
- create status snapshot builder
- wire in provider/model/session/worktree/MCP basics
- expose plain text output first

#### P1.2 Rich terminal rendering
- improve formatting
- add grouped sections and health summaries
- highlight degraded systems clearly

#### P1.3 Action hooks
- add reconnect or refresh paths where safe
- link users to deeper commands like `/mcp`, `/session`, `/context`

### Acceptance criteria
- user can run one command and understand current system state
- user can see which MCP servers are healthy
- user can tell whether session resumed from persistent memory or visible history
- user can detect token pressure and compaction status

---

## Phase 2 — Compaction-Safe Session Memory

### Outcome
Persist the machine-facing conversation state needed for high-quality resume after long sessions and compaction.

### Why second
Trust depends on continuity. If a session resumes poorly after compaction, users lose confidence fast.

### User-facing deliverable
Session resume should preserve the effective working memory of the assistant, not only the visible transcript.

### Core approach
Persist a versioned core transcript or equivalent machine-facing state alongside current visible session state.

### Requirements
- preserve session continuity after compaction
- support schema evolution with versioned serialization
- keep fallback path to rebuild from visible transcript if stored core state is missing or corrupt
- do not silently fail; expose resume source in status output

### Candidate files to inspect and likely touch
- `src/commands/session/session.tsx`
- session persistence or storage modules near bootstrap or state management
- `src/bootstrap/state.ts`
- any transcript serialization code
- context or compaction modules already writing summaries or checkpoints

### Proposed persistence model

```ts
interface PersistedSessionStateV2 {
  version: 2
  visibleMessages: unknown[]
  coreMessages?: unknown[]
  checkpoints?: Array<{
    createdAt: string
    reason: 'compaction' | 'manual' | 'shutdown' | 'autosave'
    summary?: string
  }>
  resumeMeta?: {
    preferredSource: 'coreMessages' | 'visibleMessages'
    lastValidAt?: string
  }
}
```

### Resume strategy
1. try `coreMessages`
2. if invalid, fall back to visible message reconstruction
3. if that fails, resume fresh with warning
4. report actual resume source in status output and logs

### Milestone cuts

#### P2.1 Storage shape
- add versioned session state for core messages
- keep backward compatibility with existing session files

#### P2.2 Save path integration
- write core session memory during compaction, autosave, or shutdown points
- keep payload bounded and predictable

#### P2.3 Resume path integration
- load and validate core messages on startup or session restore
- expose selected source in status snapshot

### Acceptance criteria
- long session can compact and still resume coherently
- corruption in persisted core state does not brick session restore
- status view shows whether resume came from core or visible history

---

## Phase 3 — Compaction Controls and Event Log

### Outcome
Make compaction understandable, configurable, and auditable.

### Why third
free-code already appears to have compaction machinery. Users now need visibility and safe steering.

### User-facing deliverable
Users can inspect compaction behavior, change supported knobs, and understand what the model currently sees.

### Config surface to add
- compaction trigger threshold
- keep recent message count
- tool result retention policy
- optional compaction strategy mode if more than one strategy exists
- maybe debug verbosity for compaction events

### Important compatibility note
Do **not** rename `.claude`, `Claude.md`, `AGENTS.md`, or existing instruction/config entrypoints during these phases.
Compatibility must stay intact while productization work lands.

### Candidate files to inspect and likely touch
- `src/commands/context/context.tsx`
- config schema and settings loaders
- `src/bootstrap/state.ts`
- any compaction service or reducer modules
- status rendering files from Phase 1

### Proposed event model

```ts
interface CompactionEvent {
  at: string
  trigger: 'token-threshold' | 'manual' | 'shutdown' | 'background-maintenance'
  tokensBefore?: number
  tokensAfter?: number
  delta?: number
  keptRecentCount?: number
  toolResultsDropped?: number
  strategy?: string
  summary?: string
}
```

### UI or command behavior
- show latest compaction events in `/status` or `/context`
- add command path to inspect event history
- add command path to inspect effective compaction configuration
- optionally add a “what model sees now” debug view if safe

### Milestone cuts

#### P3.1 Config schema
- add supported compaction settings
- validate defaults and backward compatibility

#### P3.2 Event capture
- emit structured compaction events
- persist recent event window with session state

#### P3.3 Inspectability
- render recent events and effective config in user-facing command output
- add debug-friendly explanation of why compaction fired

### Acceptance criteria
- user can tell when compaction happened and why
- user can see key token delta information
- user can adjust supported settings without editing internals blindly

---

## Cross-Phase Shared Work

### Shared infrastructure to add once
- normalized status snapshot builder
- versioned session metadata types
- lightweight event log primitives
- compatibility-safe config reader extensions

### Testing expectations
For each phase, include:
- unit coverage for new state shape and serialization
- resume-path tests for corrupt or missing persisted data
- command rendering tests for plain text output
- compatibility tests for existing `.claude` and `Claude.md` behavior

### Documentation expectations
For each phase, update:
- user-facing command docs
- config docs
- migration notes if new settings appear

---

## Post-Phase Rebrand Plan — free-code to NexAscent

This rebrand happens **after** Phases 1-3 land and stabilize.

### Rebrand intent
- product name becomes `NexAscent`
- user-facing references to `free-code` become `NexAscent`
- internal references to `Claude` or `Claude Code` should be sanitized to `NexAscent` where safe
- references to `Anthropic` should become provider-agnostic where possible, or explicitly reference Grevin / `github.com/pfchrono` when describing project ownership or fork lineage

### Hard compatibility rules
For now, keep these intact until a safe migration plan is implemented:
- `.claude/`
- `Claude.md`
- `AGENTS.md`
- any existing settings or instruction discovery behavior tied to those names
- compatibility with other harness conventions, including reading `Agents.md` or `Claude.md`

### Rebrand scope categories

#### Category A — Safe user-facing rename targets
These can be changed first after Phase 3:
- README and marketing copy
- help text
- command descriptions
- terminal banners
- status labels
- installer messaging
- docs titles
- package display strings if not breaking integrations

#### Category B — Internal identifiers to sanitize carefully
These should be audited and migrated with tests:
- variable names containing `claude`
- display enums or labels containing `Claude Code`
- telemetry or vendor-specific copy that still assumes Anthropic
- provider descriptions that imply Anthropic is the only first-party path

#### Category C — Compatibility names to preserve temporarily
These must remain readable and supported until migration tooling exists:
- `.claude`
- `Claude.md`
- `AGENTS.md`
- environment variables whose rename would break existing users, unless aliases are added
- repo-local settings format that currently depends on legacy naming

### Recommended rebrand execution order

#### R1. Inventory and classify all names
Run a repo-wide audit for:
- `free-code`
- `Claude`
- `Claude Code`
- `Anthropic`
- `anthropic`
- legacy environment variable names

Classify each hit as:
- user-facing string
- internal code symbol
- config or compatibility surface
- upstream provenance note that should remain factual

#### R2. Introduce compatibility policy
Before renaming broadly:
- keep legacy config discovery paths active
- support both old and new branding in non-breaking areas where needed
- document that `.claude` and `Claude.md` remain first-class compatibility surfaces during transition

#### R3. Rename user-facing brand
Update product-facing text to `NexAscent` across:
- README
- installer copy
- CLI banners
- docs headings
- package description text where safe

#### R4. Sanitize assistant and vendor references
Change unsafe or overly upstream-specific text such as:
- `Claude` -> `NexAscent` when it refers to the local product behavior
- `Claude Code` -> `NexAscent` when it refers to the local CLI product
- `Anthropic` -> provider-agnostic language when discussing generic APIs, settings, or features
- `Anthropic` -> `Grevin` or `github.com/pfchrono` when describing fork stewardship, ownership, or custom project direction

Important exception:
Keep factual provenance where necessary, such as historical notes about origin of the fork, upstream compatibility, or model vendor identifiers that must remain accurate.

#### R5. Add migration plan for legacy names
Only after safe audit and tests:
- introduce optional new config names or directories
- add alias loading from both old and new names
- add migration messaging, never hard break existing users first

### Suggested audit buckets for the rebrand
- docs and markdown files
- package metadata
- install scripts
- statusline and terminal UI strings
- command descriptions and help output
- env var docs
- provider selection UI
- session and state serialization labels
- comments that are surfaced to users

### Rebrand acceptance criteria
- product presents itself as NexAscent in normal user-visible surfaces
- existing users with `.claude` and `Claude.md` continue to work unchanged
- AGENTS.md and Claude.md instruction discovery still works
- vendor-specific references are only kept where technically or historically necessary
- docs clearly explain compatibility during transition

---

## Recommended Immediate Next Work

1. Implement Phase 1 snapshot builder and `/status` output.
2. While doing that, create a rebrand audit checklist so string cleanup can happen later without guesswork.
3. After Phase 1 lands, implement versioned core session persistence for Phase 2.
4. After Phase 2 lands, add compaction config plus event log for Phase 3.
5. Then execute the staged NexAscent rebrand with compatibility preserved.

---

## One-Sentence Summary

First make the system inspectable, then make memory durable, then make compaction legible, and only after that rebrand free-code into NexAscent without breaking `.claude`, `Claude.md`, `AGENTS.md`, or existing user workflows.
