# Free-Code MCP Servers

Two real-time observability tools for token management and code analysis.

## Token Monitor MCP

Real-time token usage tracking. Monitors per-request consumption, detects anomalies, identifies cache hits/misses.

**Tools:**
- `record_token_event` — Log token usage for a completed request
- `get_metrics` — Real-time metrics (avg tokens, peaks, RPS, cache hit rate, spike detection)
- `get_request_stats` — Lookup specific request token data

**Usage:**
```bash
cd token-monitor
npm install
npm run build
node build/index.js
```

**Integration:**
Configure in `.mcp/servers.json`:
```json
{
  "token-monitor": {
    "command": "node",
    "args": ["./mcp-servers/token-monitor/build/index.js"]
  }
}
```

Then log events in code:
```typescript
// After API call completes
await mcp.callTool('token-monitor', 'record_token_event', {
  requestId: 'req-123',
  inputTokens: 450,
  outputTokens: 1200,
  model: 'claude-opus-4-6',
  duration: 2500,
})

// Get dashboard data
const metrics = await mcp.callTool('token-monitor', 'get_metrics', {})
```

## Code Summarizer MCP

Compress large code files. Extracts exports, functions, classes, interfaces with line references. Target: 20-30% reduction.

**Tools:**
- `summarize_file` — Analyze single file structure
- `analyze_directory` — Batch analyze directory (first 10 files)

**Usage:**
```bash
cd code-summarizer
npm install
npm run build
node build/index.js
```

**Integration:**
```json
{
  "code-summarizer": {
    "command": "node",
    "args": ["./mcp-servers/code-summarizer/build/index.js"]
  }
}
```

Example call:
```typescript
const summary = await mcp.callTool('code-summarizer', 'summarize_file', {
  filePath: '/path/to/large-file.ts'
})
// Returns: file structure, exports, functions, compression ratio (~25-35%)
```

## Deployment

1. **Build both servers:**
   ```bash
   npm run build -w mcp-servers/token-monitor
   npm run build -w mcp-servers/code-summarizer
   ```

2. **Register with Claude Code:**
   Update `.mcp/servers.json` with both server configs

3. **Start using:**
   - Token Monitor: Track usage in real-time, detect budget risks
   - Code Summarizer: Compress context before sending large files to APIs

## Architecture

Both servers use the Model Context Protocol (MCP) and communicate via stdio. They maintain in-memory state and provide JSON outputs for integration with Claude Code workflows.

**Token Monitor:**
- 10k event history (circular buffer)
- 60s baseline window for anomaly detection
- 2x threshold for spike detection

**Code Summarizer:**
- Regex-based AST parsing (no dependencies)
- Extracts signatures, ignores bodies
- Per-file and directory-level analysis
