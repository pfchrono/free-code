# AGENTS.md

This file provides guidance for agentic coding agents operating in this repository.

**Note**: This codebase has its own conventions that differ from generic guidelines.
When in doubt, follow the conventions in this file rather than external skill templates.

## Build Commands

```bash
# Install dependencies
bun install

# Standard build (./cli)
bun run build

# Dev build (./cli-dev)
bun run build:dev

# Dev build with all experimental features
bun run build:dev:full

# Compiled build (./dist/cli)
bun run compile

# Run from source (slower startup, good for development)
bun run dev
```

## Testing

```bash
# Run all tests
bun test

# Run a single test file
bun test src/services/api/copilot-fetch-adapter.test.ts

# Run a specific test by name (partial match)
bun test -- "test name"

# Run with coverage
bun test --coverage
```

## MCP Tooling

- `codesight` MCP is available for repository analysis. Use it for repo scanning, hot files, routes, env vars, coverage, schema, and summary views.
- `sentry` MCP is available for observability workflows (organizations, projects, releases, DSN, issue events).
- Use these tools when broad analysis is needed; keep shell reads for narrow or explicit file inspection.

## Code Style Guidelines

### TypeScript

- Use `bun` types: `import type { ... } from 'bun:test'`
- Use explicit return types for exported functions
- Avoid `any`; use `unknown` when type is truly unknown
- Use Zod for runtime validation of external data

### Imports

- Use `.js` extension for local imports (TypeScript with `verbatimModuleSyntax`)
- Group imports in this order:
  1. Node built-ins (`node:*`)
  2. External packages (alphabetical)
  3. Relative imports from `src/` (alphabetical)
- Use named imports: `import { foo, bar } from 'package'`
- Use type-only imports for types: `import type { Foo } from 'package'`

```typescript
// Good
import { useState } from 'react'
import { Read } from './Read.js'
import type { Command } from '../types.js'
import { logForDebugging } from '../../utils/debug.js'

// Bad
import * as React from 'react'
import Read from './Read.js'
```

### Naming Conventions

- **Files**: kebab-case (`copilot-fetch-adapter.ts`)
- **Components/Classes**: PascalCase (`REPL.tsx`, `FileEditTool`)
- **Functions/variables**: camelCase (`getModelById`, `fetchCalls`)
- **Constants**: UPPER_SNAKE_CASE (`DEFAULT_COMPACTION_RATIO`)
- **Interfaces**: PascalCase with `T` prefix optional (`Command`, `LocalCommandCall`)

### Formatting

- Use 2 spaces for indentation
- Trailing commas in objects/arrays
- Single quotes for strings
- Semicolons at statement end
- Max line length: 120 chars (soft guideline)

### React/Ink Components

- Functional components with explicit prop types
- Use hooks from `usehooks-ts` for common hooks
- Prefer inline styles via Ink's `<Box>` over CSS

### Error Handling

- Use `try/catch` with async functions
- Propagate errors with context: `throw new Error(\`Failed to X: \${err}\`)`
- Log errors for debugging before rethrowing
- Use Result types for operations that can fail

```typescript
// Good
try {
  const result = await riskyOperation()
  return result
} catch (err) {
  logForDebugging(\`Operation failed: \${err}\`)
  throw new Error(\`Failed to operation: \${err}\`)
}
```

### Tool/Command Structure

Commands go in `src/commands/` and export a default object:

```typescript
import type { Command, LocalCommandCall } from '../types/command.js'

const call: LocalCommandCall = async () => {
  return { type: 'text', value: 'result' }
}

const myCommand = {
  type: 'local',
  name: 'my-command',
  description: 'Does something',
  isEnabled: () => true,
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default myCommand
```

### Feature Flags

Feature flags are compile-time constants. Access via global `feature()` function:

```typescript
if (feature('ULTRAPLAN')) {
  // Enable ultra planning
}
```

### API Adapters

API adapters (like `copilot-fetch-adapter.ts`) should:
- Handle request/response transformation
- Map between provider formats
- Manage authentication headers
- Implement request deduplication when needed

### Testing Patterns

- Use `bun:test` with `describe`, `it`, `expect`
- Mock with `mock()` function
- Clean up in `afterEach`
- Test one behavior per test case

```typescript
import { afterEach, describe, expect, it, mock } from 'bun:test'

describe('createCopilotFetch', () => {
  afterEach(() => {
    mock.restore()
  })

  it('intercepts messages URL', async () => {
    globalThis.fetch = mock(async () => {
      return new Response(null, { status: 204 })
    }) as typeof fetch

    // ... test code
  })
})
```

## Architecture Notes

- **Entry point**: `src/entrypoints/cli.tsx`
- **REPL UI**: `src/screens/REPL.tsx` (Ink/React)
- **Command registry**: `src/commands.ts`
- **Tool registry**: `src/tools.ts`
- **Query engine**: `src/QueryEngine.ts`
- **API clients**: `src/services/api/`

## Prompt Behavior

- Keep system prompt text concise and implementation-focused.
- Default prompt assembly uses lean mode (`getSystemPrompt(..., { lean: true })` in `src/utils/queryContext.ts` and `src/QueryEngine.ts`).
- Only request `CLAUDE.md` context when the prompt implies instruction or tool-doc lookup (`shouldIncludeClaudeMdForPrompt`), so prompt token use stays tight.

## GUI Development (Tauri + React)

### Current Status
- GUI `--gui` mode functional with stub responses
- Tauri app scaffolded and builds
- Binary: `gui/src-tauri/target/release/free-code-gui.exe`
- Installer: `gui/src-tauri/target/release/bundle/nsis/`

### Key Challenge
The CLI `--gui` mode uses stub responses. The challenge is integrating the CLI core (`QueryEngine.submitMessage()`) to process real user inputs. See `GUI.md` for detailed architecture analysis.

### Integration Path
1. Initialize `QueryEngine` in `--gui` mode once at startup
2. Call `queryEngine.submitMessage()` for each user input turn
3. Stream `SDKMessage` results via `writeGuiEvent()`

### Key Files

| Path | Purpose |
|------|---------|
| `scripts/build.ts` | Build script with feature flags |
| `src/commands.ts` | Slash command registry |
| `src/tools.ts` | Tool implementation registry |
| `src/services/api/copilot-client.ts` | Copilot API client |
| `src/services/api/copilot-fetch-adapter.ts` | Request translation layer |
| `src/utils/codebase/` | Live dependency graph |
| `src/tools/FileEditTool/` | File editing with hash anchors |
| `src/gui/guiProtocol.ts` | JSON event/command types for GUI |
| `src/gui/guiMode.ts` | GUI mode handler (stub responses) |
| `src/cli/print.ts` | Headless execution (runHeadless, runHeadlessStreaming) |
| `src/QueryEngine.ts` | Core query logic (submitMessage) |
| `src/cli/structuredIO.ts` | Input/output bridging |
| `gui/src-tauri/src/main.rs` | Tauri Rust backend |
| `gui/src/hooks/useCliSession.ts` | React hook for CLI session |

## Commit Conventions

Follow conventional commits format:

- **Prefixes**: `feat`, `fix`, `test`, `docs`, `chore`, `refactor`
- **Format**: `prefix(scope): description`
- Keep first line under 65 characters
- Use imperative mood ("Add feature" not "Added feature")

Examples:
```
feat(copilot): add model discovery endpoint
fix(api): handle rate limit errors gracefully
test(adapter): add vision content translation tests
docs(readme): update provider documentation
```

## Operational Safeguards

- Keep edits minimal and scoped to requested behavior.
- Check `git status --short` before risky edits.
- Run the smallest relevant test/build slice first, then expand only if needed.

## Communication Style

Use caveman mode when user requests terse/short/token-efficient responses:

### Activation
| ON | OFF |
|----|----|
| "caveman", "terse", "kurz", "less tokens" | "normal", "verbose" |

### Rules
- Drop: articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries (sure/certainly)
- Short synonyms (big not extensive, fix not "implement a solution for")
- No hedging (skip "it might be worth considering")
- Fragments OK. Technical terms stay exact.
- Pattern: `[thing] [action] [reason]. [next step].`
- Code/commits/PRs: write normal

### Example
**User:** "Why is my React component re-rendering?"
**Normal (69 tokens):** "The reason your React component is re-rendering is likely because you're creating a new object reference on each render cycle..."
**Caveman (19 tokens):** "New object ref each render. Inline object prop = new ref = re-render. Wrap in `useMemo`."
