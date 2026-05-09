# PROJECT

## Goal

Summarize prompt autocomplete behavior in Hermes and NexAgent, compare it with current free-code behavior, and recommend parity work that matters.

## External reference summary

### Hermes

Hermes has a richer command-autocomplete surface than a basic slash-command list.

Observed behavior from public docs/issues:
- Typing `/` opens an autocomplete dropdown for slash commands.
- `Tab` accepts auto-suggestions and slash-command completions.
- Arrow keys navigate suggestions.
- `Escape` dismisses overlays / completion surfaces.
- Hermes distinguishes command discovery from execution: users can browse, filter, then accept.
- Hermes issues show active investment in command palette UX, argument-level completion, and full keyboard navigation.

Relevant themes from Hermes references:
- registry-driven slash commands
- autocomplete available from the main CLI input
- command arguments also need completion, not only command names
- command browsing should scale past a small fixed list

### NexAgent

NexAgent appears much thinner at the CLI layer.

Observed behavior from available public material:
- CLI acts mainly as a host shell for agent runtime/session management.
- Public docs clearly expose slash commands like `/new` and `/stop`.
- I did not find strong evidence of a mature documented autocomplete system comparable to Hermes.
- Best conclusion: NexAgent is useful as a contrast point for command/session surface, but not as a strong autocomplete UX reference.

## Current free-code implementation

Current free-code already has more autocomplete behavior than a simple `/help` menu.

### What exists now

#### Slash commands
- Start-of-input slash command suggestions via `generateCommandSuggestions` in `src/utils/suggestions/commandSuggestions.ts:300`.
- Mid-input slash command ghost completion via `findMidInputSlashCommand` and `getBestCommandMatch` in `src/utils/suggestions/commandSuggestions.ts:115` and `src/utils/suggestions/commandSuggestions.ts:165`.
- `Tab` accepts current command suggestion through `handleTab` in `src/hooks/useTypeahead.tsx:923`.
- `Enter` can accept-and-execute selected command suggestions through `handleEnter` in `src/hooks/useTypeahead.tsx:1155`.
- `Escape` dismiss support is wired through autocomplete keybindings in `src/hooks/useTypeahead.tsx:1256`.
- Arrow-style previous/next navigation is wired through autocomplete handlers in `src/hooks/useTypeahead.tsx:1265` and `src/hooks/useTypeahead.tsx:1274`.

#### Other suggestion types
free-code autocomplete is broader than Hermes in some areas:
- file and directory suggestions
- MCP resource suggestions
- agent / teammate suggestions
- shell completion in bash mode
- shell history ghost text
- Slack channel suggestions
- `/resume` custom title suggestions
- `$skill` shortcut suggestions

Most orchestration lives in `src/hooks/useTypeahead.tsx:353`.

#### UI surface
- Suggestion rendering lives in `src/components/PromptInput/PromptInputFooterSuggestions.tsx:217`.
- Overlay item count is capped by terminal height via `getMaxVisibleSuggestionItems` in `src/components/PromptInput/PromptInputFooterSuggestions.tsx:20`.

## Current strengths

1. **Breadth**: free-code already autocompletes more entity types than Hermes docs explicitly highlight.
2. **Keyboard acceptance**: `Tab`, `Enter`, next/previous, and dismiss flows already exist.
3. **Mid-input support**: free-code handles slash commands inside normal prose, which many CLIs miss.
4. **Context-aware suggestions**: `/resume`, `#channel`, agent names, paths, shell mode, and MCP resources all branch correctly from one input surface.

## Current gaps vs Hermes-quality UX

### 1. Discovery still feels fragmented
Behavior exists, but it is spread across ghost text, footer suggestions, overlay rules, and command-specific branches inside `src/hooks/useTypeahead.tsx:533`.

Impact:
- harder to reason about
- easier to create precedence bugs
- harder to explain to users

### 2. Command argument completion is selective, not general
free-code has special cases such as:
- `/add-dir`
- `/resume`
- command argument hints

But it does not appear to have a generalized per-command argument completion model like Hermes is moving toward.

### 3. No obvious command-palette style browse surface
Hermes is investing in a searchable palette/discovery flow. free-code currently relies on inline suggestion behavior only.

Impact:
- harder discovery for users with many commands/skills
- worse “show me what exists” UX than a dedicated palette

### 4. Suggestion policy is hard-coded in one large hook
`src/hooks/useTypeahead.tsx:353` now owns:
- trigger detection
- async fetching
- precedence between suggestion families
- keyboard acceptance
- dismissal behavior
- ghost text behavior

Impact:
- future autocomplete work will be slower and riskier
- parity additions likely increase complexity unless structure improves first

### 5. NexAgent comparison gives little product signal
NexAgent is not a strong benchmark for autocomplete quality. Hermes is better reference bar.

## Recommended parity work

### Priority 1 — generalize slash command completion model
Create a command-completion model that is registry-driven instead of special-cased.

Target outcomes:
- one place defines command name, aliases, description, argument hint, and argument completion provider
- start-of-input and mid-input command completion share same source of truth
- accept/dismiss/navigation behavior stays consistent across ghost text and dropdown modes

Why first:
- closes biggest structural gap with Hermes
- reduces branching inside `src/hooks/useTypeahead.tsx:533`

### Priority 2 — add generalized argument completion
Extend command definitions so commands can optionally provide argument completions.

Examples:
- `/resume` session ids / titles
- `/add-dir` directories
- future model / tool / agent / profile commands

Why:
- strongest Hermes-style parity win without inventing new surface area
- turns existing ad hoc cases into a reusable system

### Priority 3 — add explicit browse/discovery mode for commands
Add a command-palette or “show all commands” overlay triggered from input.

Minimum behavior:
- open full command list
- fuzzy filter as user types
- arrow navigation
- `Tab` or `Enter` accept
- `Escape` dismiss

Why:
- better discoverability
- better with large command/skill sets
- avoids overloading bare `/` list behavior

### Priority 4 — split suggestion engine by provider
Refactor `useTypeahead` into smaller suggestion providers with shared arbitration.

Suggested internal shape:
- command provider
- argument provider
- file/resource provider
- agent/provider
- shell provider
- slack provider
- arbitration layer for precedence + keyboard semantics

Why:
- lowers regression risk
- makes parity work additive instead of tangled

## Recommendation summary

If goal is “match or beat Hermes autocomplete UX,” free-code is already competitive on raw capability, but behind on product coherence.

Best next move:
1. treat Hermes as primary benchmark
2. ignore NexAgent as autocomplete reference except for basic CLI command framing
3. unify command + argument completion architecture
4. add explicit command discovery surface
5. keep existing rich multi-entity autocomplete breadth as free-code differentiator

## Bottom line

free-code does **not** need a brand-new autocomplete system.
It needs a cleaner one.

Core parity story:
- keep existing `Tab` / `Enter` / dismiss / navigation behavior
- generalize argument completion
- improve command discovery
- reduce special-case logic in `src/hooks/useTypeahead.tsx:353`
