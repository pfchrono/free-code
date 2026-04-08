# Changelog

All notable changes to free-code are documented here.

## [Unreleased] - 2026-04-07

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
