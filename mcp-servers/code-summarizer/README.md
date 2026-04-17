# Code Summarizer MCP Server

MCP server for summarizing TypeScript and JavaScript files over stdio.
Designed to help coding workflows and MCP orchestration with fast symbol-aware views,
directory analysis, code search, and dependency discovery.

## Requirements

- Node.js 20+
- npm

## Install

```powershell
npm install
```

### Local install to `~/.local`

```bash
npm install
npm run build
npm install --global --prefix "$HOME/.local" --workspaces=false .
```

## Build

```powershell
npm run build
```

## Run

```powershell
node build/index.js
```

Installed binary:

```bash
code-summarizer
```

Server uses stdio transport, so it should be launched by an MCP client instead of manually for normal use.

## MCP Client Config

```json
{
  "mcpServers": {
    "code-summarizer": {
      "command": "code-summarizer",
      "args": []
    }
  }
}
```

If you prefer absolute path:

```json
{
  "mcpServers": {
    "code-summarizer": {
      "command": "~/.local/code-summarizer",
      "args": []
    }
  }
}
```

If `code-summarizer` is not on `PATH`:
- Unix/macOS: `~/.local/bin/code-summarizer`
- Windows: `~/.local/code-summarizer.cmd`

## Tools

### `summarize_file`

Input:

```json
{
  "filePath": "F:/code/code-summarizer/src/index.ts"
}
```

Returns file structure summary including imports, exports, functions, classes, interfaces, types, and compression stats.

### `analyze_directory`

Input:

```json
{
  "directoryPath": "F:/code/code-summarizer/src",
  "pattern": "**/*.ts"
}
```

Returns summaries for matching files in directory tree.

Input:

```json
{
  "directoryPath": "F:/code/code-summarizer/src",
  "pattern": "**/*.{ts,tsx,js,jsx}",
  "maxFiles": 25,
  "maxDepth": 8,
  "skipNodeModules": true
}
```

Returns:
- `filesMatched`: all matching files found
- `filesAnalyzed`: capped by `maxFiles`
- aggregate stats (`totalOriginalSize`, `totalSummarySize`, `avgCompressionRatio`, `totalFunctions`, `totalClasses`, `totalImports`)
- per-file summaries

### `search_code`

Input:

```json
{
  "searchPath": "F:/code/code-summarizer",
  "query": "McpServer",
  "pattern": "**/*.{ts,tsx,js,jsx}",
  "maxResults": 80,
  "maxDepth": 8,
  "isRegex": false,
  "caseSensitive": false
}
```

Searches text across files and returns matched line snapshots with line/column.

### `find_related_files`

Input:

```json
{
  "entryPath": "F:/code/code-summarizer/src/index.ts",
  "maxDepth": 4,
  "includeExternal": false
}
```

Follows local import edges and returns dependency graph (`nodes`, `edges`, `unresolvedImports`) for quick context expansion.

Supported patterns:

- `**/*.ts`
- `**/*.js`
- `**/*.{ts,tsx,js,jsx}`
- `src/**/*.ts`
- `*.ts`

## Notes

- `analyze_directory` default pattern is `**/*.{ts,tsx,js,jsx}` and defaults to 50 files.
- `analyze_directory` and `search_code` defaults avoid `node_modules` and `.git`.
- `find_related_files` follows local imports only unless `includeExternal` is true.
