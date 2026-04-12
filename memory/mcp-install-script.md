---
name: mcp-server-install-script
description: Added MCP server auto-install to install.ps1 for MiniMax and codesight
type: project
---

**Added to install.ps1**: `Install-MCP-Servers` function auto-adds two MCP servers after linking binary.

**MCP servers configured**:
- MiniMax: `uvx minimax-coding-plan-mcp -y`
- codesight: `npx codesight --wiki --mcp --watch -hook`

**CLI name**: `free-code` (not `claude`). Both `mcp list` and `mcp add` commands use `free-code`.
**Sanity check added**: Before adding, checks `free-code mcp list` output. Skips server if already installed.
**Why**: Users need MCP servers but don't know how to configure them. Auto-install removes friction. Sanity check prevents duplicate entries and re-configuration noise.
