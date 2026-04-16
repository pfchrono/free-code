# Changelog

All notable changes to free-code are documented here.

## [0.3.1] - 2026-04-16

<!-- GENERATED_RECENT_COMMITS_START -->
### Recent commits
- 2026-04-16 feat: expand ultraplan workflow and provider/status tooling
- 2026-04-13 chore: ignore local claude session files
- 2026-04-13 chore: stop tracking local session history
- 2026-04-13 feat: align config-home storage and docs
- 2026-04-13 feat: expand provider workflow and local skills
- 2026-04-11 chore: stop tracking tauri build artifacts
- 2026-04-11 feat: merge gui, wiki, provider, and mcp workflow upgrades
- 2026-04-11 feat: ignore openspec temp artifacts
- 2026-04-09 fix: correct process.env.NODE_ENV comparisons
- 2026-04-09 docs: add project memory and documentation
- 2026-04-09 feat: backport MCP servers, palette, sidebar, provider services, and UI components
- 2026-04-08 feat: add RedQueen compression, deterministic tool reducers, and observability layer
- 2026-04-08 fix: watchdog now aborts hung streams by calling abort() on AbortController
- 2026-04-08 feat: add aggressive message pruning to reduce token bloat
- 2026-04-08 feat: refine caveman compaction and provider workflow
- 2026-04-08 fix: update attribution branding and document token reduction work
- 2026-04-08 fix: remove anthropic email from default attribution
- 2026-04-08 feat: comprehensive token reduction optimization
- 2026-04-07 feat: expand command system, infrastructure, and UI overhaul
- 2026-04-06 feat: ship provider and model workflow expansion
<!-- GENERATED_RECENT_COMMITS_END -->


### Added
- **RedQueen Compression** â€” MCP tool result compression pipeline with deduplication, relevance filtering, and LLM summarization (Phase 2)
- **Deterministic Tool Reducers** â€” Pure string transforms for noisy tools (Playwright console/network/snapshot, GitHub search_code/list_issues, Context7 query) â€” extract high-signal fields without LLM cost
- **Aggressive Message Pruning** â€” Automatic pruning of user/assistant messages to reduce token bloat before API calls
- **Observability Layer** â€” Structured logging via `src/services/observability/`, telemetry events for compression stats
- **MiniMax MCP Server** â€” New `src/commands/minimax/` for MiniMax-specific commands

### Changed
- **Caveman Mode** â€” Refined text compaction, removes articles/fillers for ultra-compressed LLM responses (~75% token reduction)
- **Provider Config** â€” Enhanced provider configuration system with model-specific token limits
- **API Client** â€” Improved streaming, abort handling, and provider routing

## [0.1.12] - 2026-04-08

### Token Reduction Optimizations

- **RedQueen cache keying fix** -- use actual tool args instead of empty object for improved cache hits
- **RedQueen pipeline reordering** -- move dedup/filter before large-output persistence (early compression)
- **Deterministic tool reducers** -- pure string transforms (no LLM cost) for Playwright, GitHub, Context7 tools
- **Summarizer improvements** -- tighten system/user prompts, add per-tool maxInputChars caps (800-4k range)
- **TUI compression footer** -- display compression ratio and tokens saved to user
- **Token savings** -- 91% reduction validated on realistic tool outputs (Playwright console, GitHub search, Context7 docs)
- **Caveman prompt compaction** -- compact plain model-bound natural language while preserving code, JSON, commands, paths, stack traces, and other structured content
- **Compaction helpers + tests** -- add `src/utils/cavemanText.ts`, `src/utils/cavemanText.test.ts`, and prompt snapshot measurement coverage
- **Tool/result wrapper compaction** -- compact user-context reminders, tool-use summaries, and persisted large-output notices when caveman mode is enabled
- **RedQueen cache stopgap** -- inline no-op cache helpers in `src/services/compact/redQueen.ts` keep build working while cache module is absent

### Attribution & Branding

- **Remove Anthropic email** -- strip `noreply@anthropic.com` from all past commit trailers via history rewrite
- **Attribution format** -- new commit trailer: `Co-Authored-By: free-code <model> via <adapter>` (no Anthropic branding)
- **Code branding** -- ensure code/CLI always references free-code, never Claude/Anthropic/noreply addresses

### New Commands

| Command | Description |
|---------|-------------|
| `/buddy` | Buddy/observer mode for agentic pair programming |
| `/caveman-mode` | Ultra-compressed AI output (~75% fewer tokens) |
| `/dream` | Dream mode -- extended reasoning with depth control |
| `/onboard-github` | GitHub OAuth onboarding flow |
| `/provider` | Unified provider management dashboard |
| `/torch` | Attention/memory intensity control for context management |
| `/zen` | Zen mode -- minimal UI, focus on output |

### New Infrastructure

- **Headless server** (`src/server/`) -- full server stack with backends, lockfile, session manager, connect URL parser, server banner/logging
- **Provider config system** (`src/services/api/providerConfig.ts`) -- unified provider configuration with env var and CLI override support
- **MCP skills** (`src/skills/mcpSkills.ts`) -- MCP-driven skill loading
- **Web Browser Tool** (`src/tools/WebBrowserTool/`) -- browser automation panel and state
- **Theme discovery** (`src/components/theme/`) -- embedded themes, opencode theme provider, dynamic theme discovery
- **Attribution hooks** (`src/utils/attributionHooks.ts`) -- attribution tracking
- **GitHub model credentials** (`src/utils/githubModelsCredentials.ts`) -- GitHub Models API credential handling
- **System theme watcher** (`src/utils/systemThemeWatcher.ts`) -- OS theme sync

### API & Provider Layer

- **OpenAI Capabilities probe** (`src/utils/model/openaiCapabilities.ts`) -- 311-line capability detection for OpenAI-compatible endpoints
- **Provider discovery** (`src/utils/providerDiscovery.ts`) -- automatic provider detection from env/creds
- **OpenAI fetch adapter test** (`src/services/api/openai-fetch-adapter.test.ts`) -- adapter test suite
- **Error test suite** (`src/services/api/errors.test.ts`) -- error type coverage
- **withRetry utility tests** (`src/services/api/withRetry.test.ts`) -- retry logic coverage
- **Provider config tests** (`src/services/api/providerConfig.test.ts`) -- config coverage
- **Device flow OAuth** (`src/services/github/deviceFlow.ts`) -- GitHub device flow auth
- **BashTool mode validation** (`src/tools/BashTool/modeValidation.test.ts`) -- mode validation tests
- **Prompt submit handler test** (`src/utils/handlePromptSubmit.test.ts`) -- submit handler tests
- **Model providers tests** (`src/utils/model/providers.test.ts`) -- provider coverage
- **Plugin loader test** (`src/utils/plugins/pluginLoader.test.ts`) -- plugin system tests
- **Reactive provider refresh** -- login/provider flows now refresh visible provider state without restart messaging
- **Copilot vision passthrough test** -- verify vision payload + headers stay intact for models that support vision

### Model & Snip System

- **Snip compaction overhaul** (`src/services/compact/snipCompact.ts`) -- 492-line expansion with budget management, deduplication, chunking, budget windowing, and token-aware strategy selection
- **Cached microcompact** (`src/services/compact/cachedMicrocompact.ts`) -- microcompact state caching
- **Cached MC config** (`src/services/compact/cachedMCConfig.ts`) -- microcompact config caching
- **Model cost updates** (`src/utils/modelCost.ts`) -- model cost normalization
- **Model validation** (`src/utils/model/validateModel.ts`) -- updated validation logic
- **Model dev overrides** (`src/utils/model/modelsDev.ts`) -- dev-time model overrides
- **Providers utility** (`src/utils/model/providers.ts`) -- provider utility functions

### UI & UX

- **Theme picker refactor** (`src/components/ThemePicker.tsx`) -- massive simplification, dropped from 900+ lines to ~530
- **Theme utilities** (`src/utils/theme.ts`) -- streamlined theme system
- **Embedded themes refresh** (`src/components/theme/embeddedThemes.ts`) -- regenerated built-in theme bundle used by theme discovery/picker flow
- **REPL input suppression** (`src/screens/replInputSuppression.ts`) -- input handling tests and logic
- **API client** (`src/services/api/client.ts`) -- unified API client with telemetry stub
- **Session continuity manager** (`src/services/memory/sessionContinuityManager.ts`) -- session persistence

### Build System

- **Build script updates** (`scripts/build.ts`) -- 23-line build script improvements
- **Gitignore hardening** (`.gitignore`) -- added `*.txt`, `*.html`, `*.js` exclusions to prevent temp file commits
- **Windows installer fix** (`install.ps1`) -- corrected `-Dev` flag to resolve from `dist/` only
- **Package metadata** (`package.json`) -- renamed to `free-code-source`, bin entries updated, preinstall hook added

### Utilities Refactored

- **Anthropic leak detection** (`src/utils/anthropicLeakDetection.ts`) -- 16-line addition
- **Betas utility** (`src/utils/betas.ts`) -- 25-line refactor
- **Effort utility** (`src/utils/effort.ts`) -- 7-line refactor
- **Fast mode** (`src/utils/fastMode.ts`) -- 8-line refactor
- **Bootstrap provider override** (`src/utils/model/bootstrapProviderOverride.ts`) -- 11-line refactor
- **Model utility** (`src/utils/model/model.ts`) -- 4-line addition
- **Settings types** (`src/utils/settings/types.ts`) -- 10-line refactor
- **Side query** (`src/utils/sideQuery.ts`) -- 16-line refactor
- **Commands registry** (`src/commands.ts`) -- 12-line update
- **Prompts constants** (`src/constants/prompts.ts`) -- 31-line update
- **Entry point** (`src/entrypoints/cli.tsx`) -- 11-line addition
- **API client** (`src/services/api/claude.ts`) -- 3-line update
- **SkillTool** (`src/tools/SkillTool/SkillTool.ts`) -- 6-line refactor
- **TaskOutputTool** (`src/tools/TaskOutputTool/TaskOutputTool.tsx`) -- 3-line update
- **VerifyPlanExecutionTool** (`src/tools/VerifyPlanExecutionTool/VerifyPlanExecutionTool.ts`) -- 70-line refactor
- **WorkflowTool constants** (`src/tools/WorkflowTool/constants.ts`) -- 3-line update

### Cleanup

- Removed obsolete planning docs: `COPILOT_API_OPTIMIZATION.md`, `COPILOT_API_OPTIMIZATION_IMPLEMENTATION.md`, `HOW-TO-TEST-LIVE-DEPENDENCY-GRAPH.md`, `PHASE-1-COMPLETE.md`, `Phase 2 Plan.md`
- Removed temp artifacts from root directory

---

## [0.3.0] - 2026-04-06

Initial multi-provider workflow expansion:

- GitHub Copilot provider integration (OAuth + API adapter)
- Repo-local provider toggles: `/openai`, `/copilot`, `/openrouter`
- Provider-aware usage and status updates
- Startup provider override from `.claude/settings.json`
- Windows install guidance and launcher flow
