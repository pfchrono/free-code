# Harness Engineering Notes

Source: user-provided copy of an Addy Osmani post about agent harness engineering, captured on 2026-05-10.

## Core Idea

A coding agent is the model plus everything around it: prompts, tools, context policy, hooks, sandboxes, subagents, feedback loops, observability, and recovery paths. Harness engineering treats that scaffolding as a living artifact. When an agent fails, the harness should gain a durable fix so the exact failure is harder to repeat.

## Free-Code Takeaways

- Treat failures as ratchet signals, not one-off bad turns.
- Prefer enforceable fixes: tests, hooks, command-router guards, context checkpoints, or skill-chain finalizers.
- Keep root instructions short and earned by observed failures.
- Use filesystem and Git as durable state.
- Use compaction, tool-result offloading, and progressive disclosure to fight context rot.
- Separate generation and evaluation when tasks get long.
- Make hook failures verbose and hook success quiet.

## Proposed Free-Code Stages

1. Harness Ratchet: record failures, proposed harness fixes, evidence, tags, and status.
2. Long-Horizon Loop: make `/goal` enforce continuation from compact state until completion evidence exists.
3. Skill Orchestration: make chained skills and finalizers reliable, including `$tte ... then $handoff`.

Stage B checkpoint decision: active goals should write `.free-code/goals/*.checkpoint.md` on create, progress, usage, and status changes. The continuation prompt references this file so compaction, handoff, and resume have a durable objective/status/progress source instead of relying only on in-context memory.

Stage C finalizer decision: inline skill parsing should normalize common namespaced shortcuts like `$tte-try-to-enhance` to `tte/try-to-enhance`, preserve direct hyphenated skills like `$grill-with-docs`, and treat `$handoff`/`$handover` after `then`, `after`, `finally`, or a slash follow-up as finalizers. This directly ratchets the observed failure where `$tte ... then $handoff after` ran the enhancement skill but dropped the handoff intent.

## Flue-Inspired Improvement Ideas

Source: Flue docs and README reviewed on 2026-05-10.

- **Programmable headless harness:** Free-Code already has CLI/headless pieces; expose a cleaner programmable run surface so workflows can call sessions, skills, shell, and finalizers without pretending to be a TUI user.
- **Typed skill results:** Let skills declare result schemas for important outputs. This would make `$tte`, `$handoff`, `/goal`, and future ratchet workflows machine-checkable instead of relying on freeform text.
- **Session/task split:** Keep main session continuity, but run focused child tasks with separate message history and shared filesystem. Free-Code subagents already point this way; Stage B/C should preserve parent goal state while task outputs return as structured evidence.
- **Per-call command grants:** Instead of broad ambient tool access, support workflow-scoped command/tool grants. This helps deterministic CI-style flows and reduces prompt/tool injection blast radius.
- **Agent-scoped provider settings:** Provider routing should stay scoped to profile/session/workflow calls where possible so `/profile`, `/provider status`, and imported upstream behavior do not fight global state.
- **Connector recipes:** Treat MCP/sandbox/provider integrations as installable markdown recipes that generate small adapters under `.free-code/`, keeping secrets out of model-visible files.
- **Durable agent/session IDs:** Reuse stable IDs for long-running goal work so sandbox/filesystem/session state can be resumed intentionally instead of recovered by guesswork.

## OpenClaude Comparison Handoff

Source: local comparison against `/home/midnight/code/openclaude` on 2026-05-10.

What already landed in this pass:
- **Safe, high-value ratchet:** inline skill parsing now resolves namespaced shorthand like `$tte-try-to-enhance`, preserves real hyphenated skill names, and deduplicates `$handover`/`$handoff` aliases before finalizer handling.
- **Why this won:** it closes an observed orchestration failure without changing provider, transport, or permission surfaces. Low blast radius, easy regression coverage, immediate harness value.
- **Verification target:** `src/utils/skillChainParsing.test.ts` covers shorthand normalization, direct hyphenated names, handoff follow-up slash commands, and alias dedupe.

Next comparison candidates worth a later pass:
1. **Programmable harness entrypoints** similar to the cleaner non-TUI execution surfaces seen in other agent harnesses.
2. **Structured skill/finalizer outputs** so handoff and goal continuation can carry machine-checkable evidence instead of only prose.
3. **Tighter task/session separation** for long-running goal work, keeping durable parent continuity while child tasks stay narrow.

## Original Post Text

The user pasted the full post into the working session. This document keeps distilled project guidance rather than republishing the full social post verbatim.
