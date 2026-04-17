---
name: mcp-server-setup
description: .mcp.json requires free-code restart to register servers
type: reference
---

## MCP Server Registration in free-code

- `.mcp.json` entries load at startup only
- After adding/editing `.mcp.json`, must **exit and restart free-code** to register servers
- `claude mcp reset-project-choices` resets approvals but does NOT reload servers from .mcp.json

## .mcp.json format
```json
{
  "mcpServers": {
    "server-name": {
      "command": "node",
      "args": ["./path/to/server/build/index.js"]
    }
  }
}
```

## mcp-servers structure
```
mcp-servers/token-monitor/build/index.js  (npm run build)
mcp-servers/code-summarizer/build/index.js
```

Servers need `npm run build` before use.
