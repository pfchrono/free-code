# Uncommitted Change Audit (2026-04-03)

## Scope Overview

- 32 tracked files modified (`1173 insertions`, `256 deletions`) across startup flow, provider routing, model selection, auth, status line/UI, and command plumbing.
- New provider implementation files were added for GitHub Copilot and repo-local provider switching.
- A focused startup regression fix was applied in `src/main.tsx` after telemetry helpers were accidentally replaced by invalid headless code.

## Major Functional Changes

### 1) Multi-provider orchestration and repo-local provider control

- Added repo-local provider command families:
	- `src/commands/copilot/*`
	- `src/commands/openai/*`
- Added bootstrap-time provider override support in:
	- `src/utils/model/bootstrapProviderOverride.ts`
- Updated command registry and startup entry points:
	- `src/commands.ts`
	- `src/entrypoints/cli.tsx`
	- `src/entrypoints/init.ts`
	- `src/replLauncher.tsx`

### 2) GitHub Copilot OAuth and API backend integration

- Added Copilot OAuth constants and token exchange flow:
	- `src/constants/copilot-oauth.ts`
	- `src/services/oauth/copilot-client.ts`
- Added Copilot API client and model capability probe logic:
	- `src/services/api/copilot-client.ts`
- Added Anthropic-to-Copilot transport adapter and stream translation:
	- `src/services/api/copilot-fetch-adapter.ts`
	- `src/services/api/copilot-fetch-adapter.test.ts`
- Wired auth/session persistence and provider checks through:
	- `src/utils/auth.ts`
	- `src/services/api/client.ts`
	- `src/hooks/useApiKeyVerification.ts`
	- `src/commands/login/index.ts`
	- `src/components/ConsoleOAuthFlow.tsx`

### 3) Codex usage and telemetry propagation

- Added shared usage store and update hooks:
	- `src/services/api/codexUsage.ts`
- Updated UI surfaces to render provider-aware usage/context:
	- `src/components/StatusLine.tsx`
	- `src/components/Settings/Usage.tsx`
	- `src/tools/AgentTool/built-in/statuslineSetup.ts`
	- `src/utils/logoV2Utils.ts`

### 4) Model catalog and validation changes

- Expanded/updated provider model options and model strings:
	- `src/utils/model/modelOptions.ts`
	- `src/utils/model/model.ts`
	- `src/utils/model/modelStrings.ts`
	- `src/utils/model/configs.ts`
	- `src/utils/model/providers.ts`
	- `src/utils/model/validateModel.ts`
- Updated Copilot model list and default mapping in:
	- `src/services/api/copilot-fetch-adapter.ts`

### 5) Startup and interactive-path reliability updates

- `src/main.tsx` has substantial startup-path edits, including:
	- startup sequencing around setup/hooks/model bootstrapping
	- restored telemetry helper functions (`logSessionTelemetry`, `logStartupTelemetry`)
	- removal of invalid top-level headless snippet that caused interactive blocker symptoms
- Related supporting changes in:
	- `src/interactiveHelpers.tsx`
	- `src/hooks/useDeferredHookMessages.ts`
	- `src/utils/processUserInput/processUserInput.ts`
	- `src/services/tools/toolHooks.ts`
	- `src/services/mcp/client.ts`
	- `src/utils/hooks.ts`

## Documentation and Configuration Changes

- Updated instructions in `CLAUDE.md`.
- Updated command type definitions in `src/types/command.ts`.
- Updated settings type surface in `src/utils/settings/types.ts` and `src/utils/config.ts`.
- Updated `/copilot` command hint to include model probing: `src/commands/copilot/index.ts`.

## Artifact Cleanup and Ignore Policy

### Cleanup target classes

- Runtime/debug logs (`*.log`)
- Local Windows build binaries (`*.exe`)
- Bun temporary build artifacts (`*.bun-build`)
- Local trace artifacts (example: `headless-run.trace`)

### Ignore rules updated

- `.gitignore` now includes:
	- `*.log`
	- `*.exe`
	- `*.bun-build`

This prevents local diagnostics/build byproducts from entering future commits.

## Notes

- The uncommitted set also includes newly added local/project files (for example `.claude/`, workspace metadata, and install helpers). These are not automatically treated as artifacts and should be included/excluded intentionally during final staging.
