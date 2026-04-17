---
name: free-code-patterns
description: Coding patterns extracted from free-code (Claude Code fork) repository git history
version: 1.0.0
source: local-git-analysis
analyzed_commits: 50
---

# free-code Patterns

## Commit Conventions

This project uses **conventional commits** (~80% adherence):

| Prefix | Usage |
|--------|-------|
| `feat:` | New features and capabilities |
| `fix:` | Bug fixes |
| `docs:` | Documentation updates (README, FEATURES.md) |
| `refactor:` | Code restructuring without behavior change |
| `chore:` | Maintenance, cleanup, removing outdated files |
| `merge:` | Integrating external branches |

Bare `Revert "..."` messages are used for reverts (Git default). PRs merged via `Merge pull request #N from user/branch` pattern.

## Code Architecture

```
src/
├── entrypoints/       # CLI bootstrap (cli.tsx is main entry)
├── screens/           # Top-level UI screens (REPL.tsx = main loop)
├── commands/          # Slash command implementations (one dir per command)
├── tools/             # Tool implementations
├── components/        # Ink/React terminal UI components
│   └── LogoV2/        # Mascot/branding components
├── services/
│   └── api/           # API clients (client.ts is hotspot)
├── utils/
│   ├── auth.ts        # Auth logic (most-changed util)
│   ├── model/         # Model config, providers, validation
│   ├── telemetry/     # Telemetry (disabled/stubbed)
│   └── config.ts      # App configuration
├── state/             # App state store
├── hooks/             # React hooks
├── skills/            # Skill system (bundled skills in skills/bundled/)
├── plugins/           # Plugin system
├── bridge/            # IDE bridge
├── voice/             # Voice input
├── tasks/             # Background task management
├── ink/               # Ink terminal input utilities
└── bootstrap/         # Startup/initialization
scripts/
└── build.ts           # Feature-flag bundler (second most-changed file)
```

## Build System & Feature Flags

The build script (`scripts/build.ts`) is a feature-flag bundler. Use the correct target:

```bash
bun run build           # Standard ./cli binary
bun run build:dev       # Dev binary ./cli-dev
bun run build:dev:full  # Dev + ALL experimental features ./cli-dev
bun run compile         # Compiled ./dist/cli
bun run dev             # Run from source (no compile)
```

Experimental features are gated behind feature flags (e.g., `--feature=ULTRAPLAN`, `--feature-set=dev-full`). New experimental features go in the `dev-full` preset first.

## Hotspot Files (change frequently — review carefully)

1. `README.md` — frequently updated with branding/docs
2. `scripts/build.ts` — build flags change with new features
3. `package.json` — dependencies added per feature
4. `src/utils/auth.ts` — auth logic evolves with new providers
5. `src/utils/model/model.ts` — model list grows with new API support
6. `src/services/api/client.ts` — API client changes with provider additions
7. `src/screens/REPL.tsx` — main UI loop, touches many features

## Workflows

### Adding a New Provider/Model
1. Add model constants to `src/utils/model/model.ts`
2. Update provider config in `src/utils/model/providers.ts`
3. Update auth detection in `src/utils/auth.ts`
4. Wire up API client in `src/services/api/client.ts`
5. Gate under feature flag in `scripts/build.ts` if experimental
6. Update README provider table

### Adding a New Slash Command
1. Create `src/commands/<command-name>/` directory
2. Implement command logic in `index.ts` inside that dir
3. Register in `src/commands.ts`

### Using Enhanced Memory During Work
1. Check `src/services/memory/persistentMemorySystem.ts` for persistent memory capabilities and search behavior
2. Check `src/services/memory/sessionContinuityManager.ts` for session continuity, task tracking, and continuation context
3. Prefer memory/session context for recent project work, but verify current code before acting on remembered state
4. Update `docs/phase-1-implementation-status.md` when memory/session wiring changes materially

### Using the Live Dependency Graph
1. Use `src/utils/codebase/integration.ts` and the rest of `src/utils/codebase/` for ranked context recommendations and dependency-aware file discovery
2. Prefer dependency-graph recommendations before broad repo exploration when working on multi-file changes
3. Use dependency lookups for blast-radius analysis and related-file selection
4. Keep `docs/live-dependency-graph-design.md` and `HOW-TO-TEST-LIVE-DEPENDENCY-GRAPH.md` aligned with behavior

### Using Hash-Anchored File Editing
1. `src/tools/FileEditTool/hashAnchor.ts` provides `LINE#HASH` validation helpers for edit safety
2. Prefer `line_anchor` when editing frequently changing files or when stale-line mismatches are likely
3. Treat hash anchors as validation aids, not a substitute for reading the surrounding code first

### Adding a New UI Component
1. Create `src/components/ComponentName/ComponentName.tsx`
2. Use Ink primitives (not DOM React)
3. If experimental, wrap in feature flag check

### Disabling/Removing Telemetry
Telemetry is intentionally disabled in this fork. Stubs exist in `src/utils/telemetry/`. Do not re-enable telemetry backends.

## Key Project Context

- **Origin**: Fork of Claude Code with open/multi-provider access
- **Package manager**: `bun@1.3.11` (declared in `packageManager` field — always use `bun`, never `npm`/`yarn`)
- **Framework**: Ink 6 (React for terminal UIs)
- **Providers supported**: Anthropic, OpenAI Codex, Bedrock, Azure, Vertex
- **CCH signing**: `src/services/` includes a fetch wrapper that injects a cch attribution hash (xxHash64 via xxhash-wasm)
- **Telemetry**: Disabled — stubs remain but backends are no-ops
