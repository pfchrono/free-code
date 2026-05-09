# Roadmap: Prompt Autocomplete Parity Analysis

## Overview

This roadmap turns the project goal into four delivery boundaries: first establish the external benchmark, then audit the current free-code behavior, then convert that evidence into a clear gap analysis, and finally produce a prioritized parity recommendation that explains what free-code should preserve and what it should change.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: External Benchmark Baseline** - Capture the Hermes and NexAgent reference points that frame the comparison.
- [ ] **Phase 2: Current free-code Autocomplete Audit** - Establish the observable free-code autocomplete behavior and implementation surface.
- [ ] **Phase 3: Strengths and Gap Analysis** - Translate the benchmark and audit into a clear assessment of where free-code leads and lags.
- [ ] **Phase 4: Parity Recommendation** - Turn the analysis into prioritized guidance for what parity work matters next.

## Phase Details

### Phase 1: External Benchmark Baseline
**Goal**: The comparison has a reliable external benchmark for both Hermes and NexAgent.
**Depends on**: Nothing (first phase)
**Requirements**: EXT-01, EXT-02
**Success Criteria** (what must be TRUE):
  1. Reviewer can read a clear summary of Hermes command autocomplete behavior, including discovery, accept, navigation, and dismiss flows.
  2. Reviewer can read a clear summary of NexAgent's command and session surface without mistaking it for a mature autocomplete benchmark.
  3. Reviewer can tell from the project artifacts why Hermes is the primary parity reference and why NexAgent is only a limited contrast point.
**Plans**: 2 plans

Plans:
- [ ] 01-01-PLAN.md — Collect Hermes benchmark evidence and normalize it into a source-traceable baseline.
- [ ] 01-02-PLAN.md — Collect NexAgent benchmark evidence and finish Phase 1 with benchmark-positioning notes.

### Phase 2: Current free-code Autocomplete Audit
**Goal**: The current free-code autocomplete experience is documented in a source-traceable way.
**Depends on**: Phase 1
**Requirements**: AUD-01
**Success Criteria** (what must be TRUE):
  1. Reviewer can see how free-code currently handles slash command suggestions, mid-input completion, accept behavior, dismissal, and navigation.
  2. Reviewer can see which non-command suggestion families free-code already supports from the same input surface.
  3. Reviewer can trace the audit back to specific implementation areas instead of relying on unstated assumptions.
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 02-01: Audit slash-command and typeahead behavior
- [ ] 02-02: Audit additional suggestion families and rendering surface

### Phase 3: Strengths and Gap Analysis
**Goal**: The project explains where free-code is already strong and where Hermes-style UX parity still matters.
**Depends on**: Phase 2
**Requirements**: GAP-01, GAP-02
**Success Criteria** (what must be TRUE):
  1. Reviewer can identify the specific autocomplete capabilities free-code already does well and should preserve.
  2. Reviewer can identify the highest-value Hermes-quality gaps in discovery, argument completion, and suggestion architecture.
  3. Reviewer can understand the user-facing impact of those gaps, not just the underlying code structure.
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 03-01: Capture current strengths worth preserving
- [ ] 03-02: Analyze Hermes-quality UX and architecture gaps

### Phase 4: Parity Recommendation
**Goal**: The project ends with a prioritized, actionable recommendation for free-code autocomplete parity work.
**Depends on**: Phase 3
**Requirements**: REC-01, REC-02
**Success Criteria** (what must be TRUE):
  1. Reviewer can see a prioritized list of recommended parity improvements with a clear reason for the ordering.
  2. Reviewer can tell which existing free-code behaviors should remain intact while the command-completion model is improved.
  3. Reviewer can read a concise bottom-line recommendation that distinguishes structural cleanup from genuinely new UX additions.
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 04-01: Prioritize parity improvements
- [ ] 04-02: Write the final recommendation summary

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. External Benchmark Baseline | 0/2 | Not started | - |
| 2. Current free-code Autocomplete Audit | 0/2 | Not started | - |
| 3. Strengths and Gap Analysis | 0/2 | Not started | - |
| 4. Parity Recommendation | 0/2 | Not started | - |
