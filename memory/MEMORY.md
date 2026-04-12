- [feedback-saver-hooks](feedback_saver-hooks.md) — Save memory mid-session when user invokes memory hook
- [feedback-stop-hook](feedback-stop-hook.md) — /stop hook triggers auto-save checkpoint
- [mcp-config-location](mcp-config-location.md) — MCP servers in ~\.claude.json not .mcp.json
- [mcp-server-setup](mcp-server-setup.md) — .mcp.json restart requirement, server formats
- [bug-commitstandard-missing](bug_commitstandard-missing.md) — commitStandard missing from COMMANDS() despite being imported
- [commands-stub-hunting](feedback-commands-untrusted.md) — Stubs vs complete commands, Read fails on stubs
- [slash-commands](slash-commands.md) — /commit-standard exists as slash command, but undercover mode is internal utility, NOT slash command
- [feedback-slash-commands](feedback-slash-commands.md) — Verify slash commands against commands.ts, don't trust memory without checking
- [feedback-devbar-ant-feature-flags](feedback-devbar-ant-feature-flags.md) — ANT flags use process.env.USER_TYPE === 'ant', not literal string comparison
- [feedback-build-checks](feedback_build_checks.md) — Build verification: use `bun run ./scripts/build.ts`, skip `tsc --noEmit` (bundler moduleResolution causes false failures)
- [free-code-repo](project-free-code-repo.md) — Free Code CLI on Claude Code codebase, ANT feature flags via USER_TYPE env
- [mcp-token-monitor-stats](mcp-token-monitor-stats.md) — Token monitor returns zeros until API calls recorded
- [mcp-code-summarizer-working](mcp-code-summarizer-working.md) — Code summarizer operational, 76% compression
- [feedback-claude-md-code-summarizer](feedback-claude-md-code-summarizer.md) — CLAUDE.md observability section (lines 142-145) describes non-existent APIs, needs update
- [npm-workspace-fix](npm-workspace-fix.md) — Clean install fixes npm 11 workspace "Invalid Version:" errors
- [mcp-install-script](mcp-install-script.md) — Added Install-MCP-Servers to install.ps1 for MiniMax + codesight
- [deferred-tool-stop-sequence-debug](deferred-tool-stop-sequence-debug.md) — tool_reference sibling text relocation behavior can leave tail text in place; targeted provider tests pass
- [prompt-compaction-scan](prompt-compaction-scan.md) — Located prompt and memory injection surfaces for future prompt compaction work
- [prompt-compaction-followup](prompt-compaction-followup.md) — Closed stale task entries and identified next high-value prompt compaction targets

## Session: 2025-01-20 — Wiki Service Bug Fix

### Bug: Merged wiki service files
- `src/services/wiki/init.ts` and `src/services/wiki/ingest.ts` had their contents merged into one file, breaking the wiki initialization and ingest functionality
- Caused MCP errors when wiki services were called

### Fix Applied
- Restored proper separation:
  - `init.ts` — `initializeWiki()` function only
  - `ingest.ts` — `ingestWikiSource()` function only

### Decision
- Files are located at `src/services/wiki/` directory
- Uses `getWikiPaths()`, `rebuildWikiIndex()` from sibling modules
- Uses `types.js` for `WikiInitResult` and `WikiIngestResult` types

## Session: 2025-01-21 — Provider Switch Tests

### Test Results: `providers.test.ts`
- All 4 tests pass (`bun test src/utils/model/providers.test.ts`)
- Tests cover `getAPIProvider()` and `switchProviderDirectly()`
- `switchProviderDirectly` has optional `setAppState` parameter — callers don't need to pass it

### Key Pattern
- `switchProviderDirectly(provider, setAppState?)` — second arg optional, works fine when omitted
- Tests call it with only provider name: `switchProviderDirectly('minimax')` / `switchProviderDirectly('openai')`

## Session: 2025-01-21 — Wiki Source Ingest

### Files
- `src/services/wiki/ingest.ts` — `ingestWikiSource(cwd, sourcePath)` function
  - Reads source file, extracts title, sanitizes slug, writes to `sourcesDir/*.md`
  - Logs to `paths.logFile`
  - Calls `rebuildWikiIndex(cwd)` after ingest
  - Returns `WikiIngestResult: { sourceFile, sourceNote, summary, title }`

### Key Imports (ingest.ts)
- `getWikiPaths()` from `./paths.js`
- `rebuildWikiIndex()` from `./indexBuilder.js`
- `extractTitleFromText()`, `sanitizeWikiSlug()`, `summarizeText()` from `./utils.js`
- `WikiIngestResult` type from `./types.js`

## Session: 2025-01-22 — CLI Binary Build Issue

### Problem
- `package.json` declares `"bin": { "free-code": "./cli", ... }`
- `./cli` did not exist initially — no compiled binary present
- `./cli-dev` exists but is JavaScript shebang script (not compiled binary)

### Resolution
- Ran `bun run build` — both `cli` and `cli-dev` now exist (~13MB each)
- Verified: `bun cli --help` works correctly

### Key Finding: CLI Hangs = Expected Behavior
- `bun cli` with no arguments **hangs** because it's an **interactive CLI**
- It waits for stdin input — this is NOT a bug
- To run non-interactively: `bun cli --print "prompt"` or pipe input with `echo "hello" | bun cli`

### Solution
- Run `bun run build` to compile/bundle
- Verify `cli` binary is created before assuming build works
- Use `--print` flag for non-interactive use
