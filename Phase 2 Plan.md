# Phase 2 Plan

This document captures the next set of enhancements researched from SoulForge, OpenCode, and oh-my-openagent. It is intended as a staging plan for future implementation when work begins.

## Goals

Phase 2 should focus on extending the current free-code architecture with higher-value orchestration, planning, and code-intelligence capabilities before attempting any major UI rewrite.

## Current baseline

Phase 1 already established the following foundations:

- Persistent memory system
- Session continuity manager
- Hash-anchored file edit validation
- Live dependency graph groundwork
- Partial model capability routing
- Multi-provider support

The biggest remaining gap is not raw feature count, but integration and orchestration across these systems.

## Priority principles

1. Prefer features that extend the current QueryEngine, command registry, tool registry, REPL, and task systems.
2. Prioritize improvements that reduce token cost, improve context quality, or increase autonomous execution reliability.
3. Delay any large terminal UI rewrite until core orchestration and code-intelligence systems are solid.
4. Implement new capabilities in layers: planning and routing first, then automation, then UX refinements.

## Top 10 implementation candidates

### 1. Multi-agent dispatch and task routing
Inspired by SoulForge.

Why it matters:
- Highest-value orchestration upgrade
- Fits existing command/tool/task architecture
- Enables parallel specialist work instead of one linear loop

Scope ideas:
- Coordinator for task decomposition
- Role-based routing to planner, explorer, reviewer, verifier, cleanup agents
- Shared task context and result handoff

### 2. Repo map with surgical symbol reads
Inspired by SoulForge’s targeted context retrieval.

Why it matters:
- Reduces token waste from broad file reads
- Improves precision for large codebases
- Complements existing live dependency graph work

Scope ideas:
- Symbol-level lookup service
- Tiered fallback chain: LSP -> ts-morph -> tree-sitter -> regex
- Context recommendations for functions, classes, and exports

### 3. Discipline agents and IntentGate
Inspired by oh-my-openagent.

Why it matters:
- Improves action selection quality
- Prevents literal or shallow interpretation of user intent
- Adds low-risk quality gates before execution

Scope ideas:
- Intent classification before command/tool execution
- Discipline reviewers for planning, consistency, safety, and redundancy
- Interceptors around slash-command processing

### 4. Integrate memory and session continuity into REPL flow
Based on the gap identified in prior audit work.

Why it matters:
- Phase 1 systems exist but are not fully wired into everyday interaction
- Makes prior work more useful during active coding sessions
- Increases continuity without extra user effort

Scope ideas:
- Context injection hooks for recent memory/session data
- REPL resume awareness
- Tool-level access to continuity hints where appropriate

### 5. Autonomous workflow mode and background task queues
Inspired by Phase 2 gaps and ultrawork-style execution.

Why it matters:
- Enables longer-running workflows with less supervision
- Builds on existing task concepts already present in free-code
- Creates a foundation for recurring and staged automation

Scope ideas:
- Background execution queue
- Checkpointing and resumable work
- Autonomous continue-until-done mode with clear stop conditions

### 6. Scheduled operations and event/hook automation
Inspired by SoulForge and oh-my-openagent automation patterns.

Why it matters:
- Extends cron/trigger concepts already present in the project
- Makes automation first-class instead of ad hoc
- Useful for recurring checks, cleanup, and follow-up workflows

Scope ideas:
- Event-driven task triggers
- Scheduled planner/reviewer workflows
- Hookable automation around task lifecycle events

### 7. Full dynamic category-based model routing
Inspired by oh-my-openagent.

Why it matters:
- Current routing is only partial or stubbed
- Better model selection can lower cost and improve quality
- Works naturally with specialist agents

Scope ideas:
- Route by work category: quick, deep, visual, search, verification, edit
- Provider-aware model scoring
- Fallback rules and capability constraints

### 8. LSP and AST-Grep integration
Inspired by oh-my-openagent and OpenCode.

Why it matters:
- Enables precise code navigation and safer structural edits
- Supports rename/find-references/diagnostics workflows
- Strengthens repo map and code-intelligence systems

Scope ideas:
- LSP-backed tools for definitions, references, rename, diagnostics
- AST-Grep-backed structural search for supported languages
- Unified symbol operation interface

### 9. Planning workflow upgrade
Inspired by Prometheus, Metis, and Momus style planning.

Why it matters:
- Improves implementation quality before coding starts
- Adds deliberate gap analysis and critique
- Aligns with existing planner/agent patterns already in use

Scope ideas:
- Interview-mode planning entrypoint
- Gap analyzer pass before implementation
- Review pass that challenges assumptions and missing verification

### 10. Multi-tab or coordinated work sessions
Inspired by SoulForge parallel work patterns.

Why it matters:
- Useful once orchestration is mature
- Supports longer workflows and role separation
- Lower priority than routing and integration work

Scope ideas:
- Coordinated task panes or session contexts
- Shared cache/state across active work threads
- Cross-session task synchronization

## Deferred for later

These ideas were researched but should not be Phase 2 priorities:

- Full OpenTUI migration
- Large-scale terminal UI rewrite
- OpenCode-style multi-pane interface as a first step
- Diff viewer and heavy UI enhancements before orchestration is stable

Reason:
The existing Ink/React UI is already functional. Research suggested the higher-value move is adding orchestration and intelligence first, not replacing the interface layer.

## Recommended implementation order

### Wave 1: orchestration core
1. Multi-agent dispatch and task routing
2. Discipline agents and IntentGate
3. Integrate memory/session continuity into REPL flow

### Wave 2: context efficiency and code intelligence
4. Repo map with surgical symbol reads
5. Full dynamic model routing
6. LSP and AST-Grep integration

### Wave 3: autonomy and automation
7. Autonomous workflow mode and background task queues
8. Scheduled operations and event/hook automation
9. Planning workflow upgrade

### Wave 4: workflow UX expansion
10. Multi-tab or coordinated work sessions

## Success criteria

Phase 2 should be considered successful if it achieves most of the following:

- Agents can decompose and route work to specialized roles automatically
- Context gathering becomes more targeted and cheaper than broad file reads
- Memory and session continuity materially improve active coding workflows
- Planning becomes more structured and less error-prone
- Autonomous and scheduled workflows can run safely with clear visibility
- The system gains precision and reliability without requiring a full UI rewrite

## Suggested first implementation target

If Phase 2 begins with a single feature, start with:

**Multi-agent dispatch and task routing**

Reason:
It has the best mix of value, leverage, and architectural fit. It also unlocks better use of planning, review, verification, and future autonomy features.
