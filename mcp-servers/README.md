# Free-Code MCP Servers

Workspace containing:
- `token-monitor` — token usage telemetry and anomaly signals
- `code-summarizer` — code structure summarization, directory analysis, search, dependency graph

## Build

From `mcp-servers/`:

```bash
npm install
npm run build
```

Builds both workspaces:
- `token-monitor/build/index.js`
- `code-summarizer/build/index.js`

## Install (Global Binaries)

### Token Monitor

```bash
cd token-monitor
npm install
npm run build
npm install --global --prefix "$HOME/.local" --workspaces=false .
```

Binary: `token-monitor`

### Code Summarizer

```bash
cd code-summarizer
npm install
npm run build
npm install --global --prefix "$HOME/.local" --workspaces=false .
```

Binary: `code-summarizer`

## MCP Config

### Codex / Claude Code (`.mcp.json`)

```json
{
  "mcpServers": {
    "token-monitor": {
      "command": "token-monitor",
      "args": []
    },
    "code-summarizer": {
      "command": "code-summarizer",
      "args": []
    }
  }
}
```

If binaries are not on PATH, use absolute commands:
- Unix/macOS: `~/.local/bin/token-monitor`, `~/.local/bin/code-summarizer`
- Windows: `~/.local/token-monitor.cmd`, `~/.local/code-summarizer.cmd`

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "token-monitor": {
      "command": "token-monitor",
      "args": []
    },
    "code-summarizer": {
      "command": "code-summarizer",
      "args": []
    }
  }
}
```

### free-code CLI (`/mcp add`)

```bash
free-code mcp add token-monitor token-monitor
free-code mcp add code-summarizer code-summarizer
```

## Tool Summary

### token-monitor
- `record_token_event`
- `get_metrics`
- `get_request_stats`

### code-summarizer
- `summarize_file`
- `analyze_directory`
- `search_code`
- `find_related_files`
