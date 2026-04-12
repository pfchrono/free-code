# Code Summarizer MCP Findings

## Current State

- Project builds successfully with `npm install` and `npm run build`.
- MCP server starts successfully with `node build/index.js`.
- Server uses stdio transport and exposes 2 tools:
  - `summarize_file`
  - `analyze_directory`

## What Was Fixed

- Added missing `zod` dependency in `package.json`.
- Added `package-lock.json` by running `npm install`.
- Updated MCP tool schema registration to match installed `@modelcontextprotocol/sdk` API.
- Added `README.md` with install, build, run, and config instructions.
- Fixed `analyze_directory` so `pattern` now affects file selection.

## Verified Behavior

- `summarize_file` accepts absolute file path and returns JSON text summary.
- `analyze_directory` walks directory recursively, skips `node_modules`, applies pattern filter, and summarizes first 10 matches.
- Compiled output generated in `build/index.js`.

## Current Weak Points

- Analyzer uses regex parsing, not AST parsing.
- Class detection likely wrong for nested braces and multi-line class bodies.
- Function detection misses many patterns:
  - arrow functions with identifiers
  - exported const arrow functions
  - methods
  - default exports
  - overloaded signatures
- Import detection misses some valid syntaxes:
  - side-effect imports
  - namespace imports edge cases
  - multiline imports
- Export detection misses some valid syntaxes:
  - `export default`
  - re-exports
  - named export lists
- `analyze_directory` computes average compression as `sum / summaries.length`; empty match set can produce invalid result.
- `pattern` matching is custom and partial, not full glob semantics.
- File support text says TypeScript/JavaScript, but analyzer name and defaults still bias toward `.ts`.
- No tests.
- No structured MCP output schema. Tool returns JSON string in `content`, not typed `structuredContent`.
- No input validation for missing paths, non-files, unreadable files, or unsupported extensions beyond runtime catch.

## Improvement Ideas

### Reliability

- Replace regex parsing with TypeScript compiler API or `ts-morph`.
- Use AST traversal for imports, exports, functions, classes, interfaces, and types.
- Add explicit path validation:
  - file exists
  - file readable
  - correct file type
  - directory exists
- Handle empty directory matches safely.

### Tool Design

- Return `structuredContent` with output schema instead of only JSON text blob.
- Add `maxFiles` option to `analyze_directory`.
- Add `extensions` option or real glob library support.
- Add `includeSummaryText` toggle if caller only wants structured metadata.
- Add `exclude` patterns.
- Add `followSymlinks` option or explicitly block symlink traversal.

### Pattern Matching

- Replace homemade glob matcher with proven library like `fast-glob` or `minimatch`.
- Support brace expansion, globstars, relative roots, and ignore patterns consistently.

### Summary Quality

- Add high-level semantic summary:
  - main responsibility
  - key dependencies
  - public API surface
  - risky areas
- Include counts by symbol type.
- Optionally include top-level constants, enums, and React components.
- Detect framework-specific constructs like hooks, Express routes, MCP resources/tools, etc.

### Performance

- Stream large directory analysis instead of building all summaries in memory.
- Add concurrency limit for file reads.
- Skip very large files or add configurable size cap.
- Cache file summaries by mtime if repeated often.

### Testing

- Add unit tests for:
  - symbol extraction
  - glob filtering
  - empty directory behavior
  - unsupported files
- Add integration tests that start MCP server and call both tools.
- Add fixtures covering:
  - TS
  - TSX
  - JS
  - JSX
  - default exports
  - re-exports
  - nested classes/functions

### Packaging

- Add `start` script.
- Add `bin` entry if intended for package-style execution.
- Add engines field for supported Node version.
- Consider publishing metadata if package will be distributed.

## Recommended Next Steps

1. Add tests first to lock current behavior.
2. Replace regex extraction with AST-based extraction.
3. Replace custom glob logic with real glob library.
4. Add structured MCP output schemas.
5. Expand directory tool options: `maxFiles`, `exclude`, `extensions`.
