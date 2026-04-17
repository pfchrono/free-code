# Token Monitor MCP Server

MCP server for real-time token telemetry over stdio.
Tracks request-level token usage, cache behavior, and spike anomalies.

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
token-monitor
```

Server uses stdio transport, so MCP clients should launch it.

## MCP Client Config

Codex / Claude Code (`.mcp.json`):

```json
{
  "mcpServers": {
    "token-monitor": {
      "command": "token-monitor",
      "args": []
    }
  }
}
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "token-monitor": {
      "command": "token-monitor",
      "args": []
    }
  }
}
```

If `token-monitor` is not on `PATH`:
- Unix/macOS: `~/.local/bin/token-monitor`
- Windows: `~/.local/token-monitor.cmd`

## Tools

### `record_token_event`

Input:

```json
{
  "requestId": "req-123",
  "inputTokens": 450,
  "outputTokens": 1200,
  "cacheReadTokens": 200,
  "cacheCreationTokens": 0,
  "model": "claude-opus-4-6",
  "duration": 2500
}
```

### `get_metrics`

Returns aggregate telemetry:
- request count
- total/average/peak token stats
- recent events
- cache hit rate
- spike detections

### `get_request_stats`

Input:

```json
{
  "requestId": "req-123"
}
```
