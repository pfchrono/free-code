---
name: npm workspace invalid version fix
description: Clean install fixes npm 11 workspace bug with stale caches
type: feedback
---

npm 11.12.1 workspaces: "Invalid Version:" error when node_modules or package-lock.json is stale.

Fix: `rm -rf node_modules && rm -f package-lock.json && npm install`

**Why:** npm 11.12.1 has a regression with workspace installs when caches are corrupted. Force/legacy-peer-deps don't help — only clean install works.

**How to apply:** When "Invalid Version:" appears in mcp-servers or any workspace root, always do clean install first before investigating further.
