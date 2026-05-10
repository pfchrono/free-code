# Free-Code Parity Tracker

Source comparison repo: sibling repo under `~/code`
Target repo: `/home/midnight/code/free-code`
Initial handoff: `/tmp/handoff-rfc6gV.md`

## Waves

- [x] Wave 1: Inventory and test harness
  - Captured parity inventory and risks in handoff.
  - Added this tracker as the durable issue list.
- [x] Wave 2: Integrations registry skeleton
  - Ported `src/integrations/*` from upstream comparison repo.
  - Registry remains disconnected from runtime until provider merge.
- [x] Wave 3: Provider runtime merge
  - Added provider request resolution, agent/auth routing, local retry/cache scope,
    GitHub model normalization, and OpenAI-compatible API-format support without
    replacing Free-Code adapters.
- [x] Wave 4: Provider commands and ProviderManager UX
  - Wired provider command UX to the integration catalog for catalog/default
    models, transport metadata, and discover output.
  - Provider selection now persists to `.free-code/settings.local.json`.
  - Kept Free-Code-native provider commands instead of bulk replacing with the
    upstream ProviderManager.
- [x] Wave 5: SDK entry points
  - Added a Free-Code-native `./sdk` export and `dist/sdk.mjs` build target.
  - Exposes `query`, `queryText`, and `coreTypes` through a CLI-backed SDK
    entrypoint without importing upstream branding/runtime assumptions.
- [x] Wave 6: Tool providers and web search
  - Ported WebSearch provider adapters and tests behind current tool registry.
  - Native Anthropic/Vertex/Foundry web search remains first choice; other
    providers use adapter backends.
- [x] Wave 7: Optional product surfaces
  - Defer upstream web and VS Code extension; Free-Code Tauri GUI/headless
    transport remains source of truth.
- [x] Wave 8: Full upstream parity run from `/tmp/handoff-5NFxIp.md`
  - Completed Phases 1-6: storage/branding safety, provider runtime/OAuth,
    MCP doctor/runtime, SDK parity, tool behavior parity, command/provider UX.
  - Completed Phase 7: ported useful upstream scripts/docs/release scaffolding
    without upstream product identity, web app, VS Code extension, or PR branch
    workflow.
  - Preserved Free-Code provider adapters and added `--profile`/`--provider`
    compatibility for `codex`, `copilot`, `zen`, `minimax`, `openrouter`,
    `lmstudio`, and upstream-compatible profiles.
  - Rerouted active project/user writes found in audit from `.claude/` to
    `.free-code/` for settings, skills, agent memory, scheduled tasks,
    worktrees, completions, assistant install defaults, and debug paths.
  - Kept `.claude/` as legacy import/read compatibility where needed.
- [x] Wave 9: Final command parity and workflow capture
  - Restored upstream command helper exports for GitHub onboarding and usage
    descriptors while keeping Free-Code provider semantics.
  - Fixed mixed command-suite isolation by making settings-change subscription
    tolerant of incomplete test doubles.
  - Created `tte/try-to-enhance` as a global skill in both `.codex/skills` and
    `.agents/skills`, incorporating grill-with-docs, architecture/UX
    enhancement passes, Karpathy guardrails, subagent cleanup, and final handoff.
- [x] Wave 10: TTE upstream enhancement pass
  - Ran a second upstream comparison against `/home/midnight/code/openclaude`
    using `tte/try-to-enhance`.
  - Adopted/merged safe developer tooling: no-telemetry GrowthBook local feature
    flags, feature-flag source guard test, coverage heatmap renderer, verified
    build alias, coverage scripts, and strict hardening alias.
  - Added Free-Code-native `/commit-message` command for commit attribution
    configuration.
  - Added compact Free-Code `/lsp` command surface for status,
    recommendations, and restart using existing LSP/plugin infrastructure.
  - Classified and skipped higher-risk upstream surfaces such as hook chains,
    knowledge command, auto-fix, benchmark, web, atomic-chat, and provider
    command replacement.
- [x] Wave 11: Setup docs and low-risk test parity
  - Added Free-Code quick-start docs for macOS/Linux and Windows to satisfy
    existing non-technical setup links.
  - Added LiteLLM setup guide adapted to Free-Code provider/profile and
    `.free-code/` storage rules.
  - Fixed stale README/advanced setup references that still described
    `.claude/` as active storage and Atomic Chat helper scripts that are not
    current Free-Code package scripts.
  - Adopted low-risk upstream tests for request logging and startup provider
    override cleanup.
- [x] Wave 12: Provider recommendation test parity
  - Added upstream-style coverage for Ollama ranking, benchmark latency
    reordering, non-chat filtering, and goal-based default OpenAI model
    selection.
- [x] Wave 13: Provider models test parity
  - Added upstream-style utility coverage for model-list parsing, primary model
    selection, and multi-model detection in `src/utils/providerModels.ts`.
- [x] Wave 14: Provider profile model persistence parity
  - Added low-risk upstream-style coverage for provider-profile model option
    merging and active-profile model persistence in
    `src/utils/providerProfiles.ts`, including profile-managed env refresh.
- [x] Wave 15: Provider profile env shaping parity
  - Added upstream-style coverage for provider-specific env shaping in
    `src/utils/providerProfiles.ts`, including GitHub mode selection and
    primary-model env projection for Anthropic and Gemini profiles.
- [x] Wave 16: OAuth utility test parity
  - Added upstream-style coverage for OAuth PKCE helpers in
    `src/services/oauth/crypto.ts` and redirect-listener cancellation/error
    paths in `src/services/oauth/auth-code-listener.ts`.
- [x] Wave 17: GitHub device-flow test parity
  - Added upstream-style coverage for GitHub device-code parsing, OAuth polling,
    and Copilot token exchange in `src/services/github/deviceFlow.ts`, while
    preserving Free-Code's current default device scope.

## Guardrails

- Preserve Free-Code GUI/headless transport.
- Preserve Copilot/Codex/OpenRouter/local provider behavior.
- Preserve no-phone-home verification.
- Port by tests and behavior, not bulk replacement of shared files.
- Keep Free-Code branding; do not introduce upstream product names or calls.
- Runtime config, plugin settings, and provider bootstrap writes should use
  `.free-code/`; legacy `.claude/` is import-only when the new target is absent.

## Validation Log

- Passed: `bun test src/integrations` (78 tests)
- Passed: `bun run build:dev`
- Passed: `bun test src/services/api/providerConfig.test.ts src/services/api/providerConfig.github.test.ts src/services/api/providerConfig.local.test.ts src/services/api/agentRouting.test.ts src/services/api/authRouting.test.ts`
- Passed: `bun test src/tools/WebSearchTool/providers src/services/api/providerConfig.github.test.ts src/services/api/providerConfig.local.test.ts`
- Passed: `bun run test:headless-transport`
- Passed: `bun run test:headless-integration`
- Passed: `bun test src/utils/settings/settingsMigration.test.ts`
- Passed: `./install.sh` standard compile/no-phone-home/link flow
- Passed: compiled executable smoke: `./dist/cli --version` and `~/.local/bin/free-code --version`
- Passed: SDK export smoke: `bun -e "const sdk = await import('./dist/sdk.mjs'); console.log(typeof sdk.query, typeof sdk.queryText)"`
- Passed: local `pwsh` 7.0.3 install and `install.ps1` parser check. Full `install.ps1` execution is Windows-only and exits on Linux by design.
- Passed: branding scan for upstream product names across `src`, `scripts`, `docs`, and `package.json`
- Passed: `bun test src/services/api/providerConfig*.test.ts src/services/api/*Shim*.test.ts src/services/api/*OAuth*.test.ts`
- Passed: `bun test src/services/api/cache*.test.ts src/services/api/*Routing*.test.ts`
- Passed: `bun test src/services/mcp/*.test.ts src/commands/mcp/doctorCommand.test.ts`
- Passed: `bun test src/tools/BashTool/*.test.ts src/tools/MCPTool/MCPTool.test.ts src/tools/WebFetchTool/*.test.ts src/tools/WebSearchTool/*.test.ts`
- Passed: `bun test src/services/oauth/auth-code-listener.test.ts src/services/oauth/crypto.test.ts`
- Passed: `bun test tests/sdk src/entrypoints/mcp.test.ts`
- Passed: `bun test scripts/system-check.test.ts scripts/pr-intent-scan.test.ts`
- Passed: `bun run integrations:check`
- Passed: `bun run validate:externals`
- Passed: `bun run doctor:runtime -- --json`
- Passed: `bun run verify:no-phone-home:compile`
- Passed: `bun run verify:no-phone-home:sh`
- Passed: `./dist/cli --profile copilot --model github:copilot --version`
- Passed: `./dist/cli --provider minimax --model MiniMax-M2 --version`
- Passed: temp HOME `.free-code` settings write smoke with no `.claude` creation
- Passed: `bun test src/commands`
- Passed: `bun run build:dev` after final command/helper patches
- Passed: final branding scan for upstream product names across `src`, `scripts`,
  `docs`, `package.json`, `tests`, and `.github`
- Passed: `git diff --check` with line-ending warnings only
- Passed: `bun test scripts/no-telemetry-growthbook-stub.test.ts scripts/feature-flags-source-guard.test.ts`
- Passed: `bun test src/commands/commit-message/commit-message.test.ts src/commands/lsp/lsp.test.ts src/commands.test.ts`
- Passed: `bun test src/commands`
- Passed: `bun run build:verified`
- Passed: `bun test src/utils/requestLogging.test.ts src/utils/providerStartupOverrides.test.ts`
- Passed: `bun run build:dev` after docs/test parity updates
- Passed: docs/product branding scan with only internal parity tracker upstream
  path references remaining
- Passed: `bun test src/utils/providerRecommendation.test.ts`
- Passed: `bun test src/utils/providerProfiles.test.ts`
- Passed: `bun test src/utils/providerProfiles.test.ts` after provider env-shaping parity additions
- Passed: `bun test src/services/github/deviceFlow.test.ts`
