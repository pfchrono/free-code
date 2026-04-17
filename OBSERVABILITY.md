# Observability System — Token Monitoring & Code Compression

## Overview

Two complementary MCP servers + integration layer for real-time token tracking and context-efficient code handling.

**Goal:** Reduce token waste, detect budget anomalies, compress large files before API submission.

---

## Components

### 1. Token Monitor MCP
**Location:** `mcp-servers/token-monitor/`

Tracks API token consumption with real-time analytics and anomaly detection.

**Features:**
- Event logging (input/output tokens, duration, model, cache stats)
- Circular 10k-event history buffer
- Metrics: avg tokens, peak RPS, cache hit rate, spike detection
- Anomaly detection: 2x baseline threshold over 60s window
- Per-request lookup

**Tools:**
- `record_token_event` — log API call results
- `get_metrics` — fetch real-time dashboard
- `get_request_stats` — lookup specific request

**Output Example:**
```json
{
  "totalRequests": 245,
  "totalTokensUsed": 450000,
  "avgTokensPerRequest": 1836,
  "peakTokensPerSecond": 8500,
  "cacheHitRate": 0.32,
  "spikesDetected": [
    {
      "timestamp": 1704067200000,
      "spike": 12000,
      "baseline": 5000
    }
  ]
}
```

### 2. Code Summarizer MCP
**Location:** `mcp-servers/code-summarizer/`

Extracts code structure and compresses files. No AST dependency — regex-based parsing.

**Features:**
- File analysis: exports, imports, functions, classes, interfaces, types
- Directory-level batch analysis (first 10 files)
- Compression metrics: ratio, size delta, token savings
- LRU cache (100 entries)

**Tools:**
- `summarize_file` — analyze single file structure
- `analyze_directory` — batch analyze directory

**Output Example:**
```json
{
  "filePath": "src/query.ts",
  "fileSize": 45231,
  "lineCount": 1247,
  "exports": [
    { "name": "executeQuery", "line": 42, "type": "export async function" }
  ],
  "originalSize": 45231,
  "summarySize": 12456,
  "compressionRatio": 0.725,
  "summary": "# query.ts\n## Exports\n- Line 42: export async function executeQuery..."
}
```

### 3. Observability Integration Layer
**Location:** `src/services/observability/`

Unified API for both MCP servers with caching, initialization, and convenience methods.

**Exports:**
```typescript
observability.tokens
  .recordEvent(event) — log API call
  .getMetrics() — fetch dashboard
  .checkForAnomalies() — check for spikes
  .generateRequestId() — create unique ID

observability.code
  .summarizeFile(path) — analyze file
  .analyzeDirectory(path) — batch analyze
  .getCompressedVersion(path) — compression if >20% reduction
  .estimateTokenSavings(summary) — ~4 chars/token estimate
  .clearCache() — clear LRU cache
  .getCacheStats() — show cache usage

observability.init(mcpClient) — initialize both servers
observability.logApiCall(args) — convenience wrapper for token logging
observability.prepareFileContent(path) — compress file if beneficial
observability.getSnapshot() — full observability state
```

---

## Setup

### 1. Build MCP Servers
```bash
npm run build -w mcp-servers/token-monitor
npm run build -w mcp-servers/code-summarizer
```

### 2. Register in Claude Code
Add to `.mcp/servers.json`:
```json
{
  "token-monitor": {
    "command": "node",
    "args": ["./mcp-servers/token-monitor/build/index.js"]
  },
  "code-summarizer": {
    "command": "node",
    "args": ["./mcp-servers/code-summarizer/build/index.js"]
  }
}
```

### 3. Initialize in App
```typescript
import { observability } from './services/observability'

// After MCP client is ready
observability.init(mcpClient)
```

---

## Usage Patterns

### Pattern 1: Log API Calls
```typescript
const start = Date.now()
const response = await api.messages.create({ prompt, files })
await observability.logApiCall({
  inputTokens: response.usage.input_tokens,
  outputTokens: response.usage.output_tokens,
  model: 'claude-opus-4-6',
  duration: Date.now() - start,
  cacheReadTokens: response.usage.cache_read_input_tokens,
})
```

### Pattern 2: Compress Large Files
```typescript
const files = ['src/large-service.ts', 'src/utils.ts']
const contents = await Promise.all(
  files.map(async f => {
    const compressed = await observability.prepareFileContent(f, 0.2)
    return compressed || fs.readFileSync(f, 'utf-8')
  })
)
// Now send compressed files to API
```

### Pattern 3: Monitor for Anomalies
```typescript
setInterval(async () => {
  if (await observability.tokens.checkForAnomalies()) {
    logger.warn('Token spike detected', {
      metrics: await observability.tokens.getMetrics()
    })
    // Trigger graceful degradation, alert, etc.
  }
}, 5 * 60 * 1000) // Every 5 minutes
```

### Pattern 4: Get Full Status
```typescript
const snapshot = await observability.getSnapshot()
console.log({
  totalTokensUsed: snapshot.tokens.totalTokensUsed,
  avgPerRequest: snapshot.tokens.avgTokensPerRequest,
  anomalies: snapshot.anomalyDetected,
  codeCacheFull: snapshot.codeSummarizerCache.cached,
})
```

---

## Integration Points

### QueryEngine (src/QueryEngine.ts)
- Log every API call with `observability.logApiCall()`
- Check for anomalies before high-volume batches
- Optionally compress context files if large

### Codebase Tools
- Use `observability.code.summarizeFile()` for large file context
- Replace full file content with compressed summary if >20% reduction

### Health Check Loop
- Run `observability.getSnapshot()` every 5 min
- Track to metrics backend
- Alert on anomalies or cache saturation

### Analytics/Billing
- Export `snapshot.tokens` for usage reporting
- Track compression savings for ROI calculation
- Monitor cache hit rate as signal of reuse patterns

---

## Performance Characteristics

### Token Monitor
- Event logging: O(1), non-blocking append
- Metrics calculation: O(n) over 10k buffer, cached
- Anomaly detection: 60s baseline window, 2x threshold
- Memory: ~2MB (10k events)

### Code Summarizer
- File analysis: O(lines) single pass, regex-based
- Caching: LRU 100 entries (~5-10MB depending on file sizes)
- Compression: typically 20-40% reduction for 5KB+ files
- Token savings: rough estimate = (original - compressed) / 4

### Integration Layer
- MCP communication: async, non-blocking
- Fallback: local buffers if MCP unavailable
- Cache: automatic LRU eviction

---

## Troubleshooting

### MCP Client Not Available
If `observability.init()` hasn't been called or MCP isn't connected:
- Token monitor: logs locally, returns null metrics
- Code summarizer: returns null, use original file
- Safe fallback to original behavior

### Token Metrics Spike
Check `metrics.spikesDetected` — indicates either:
- Genuinely high usage (check `peakTokensPerSecond`)
- Batch processing (expected, not alarming)
- Cache miss pattern (trigger rewarming)

### Code Compression Not Working
- File <5KB: compression overhead > savings, skipped
- Cache miss: file not yet analyzed
- Low compression ratio: already optimized, use original

### High Memory Usage
- Token monitor: check buffer size (default 10k events)
- Code summarizer: `observability.code.clearCache()` to reset LRU

---

## Future Enhancements

- [ ] Streaming token counting (token/sec estimates)
- [ ] Budget forecasting based on current burn rate
- [ ] Selective file compression (only >10KB files)
- [ ] Cache warming on startup
- [ ] Compression ratio tuning per file type
- [ ] Multi-model token normalization

---

## Files

| Path | Purpose |
|------|---------|
| `mcp-servers/token-monitor/` | MCP server for token analytics |
| `mcp-servers/code-summarizer/` | MCP server for code compression |
| `src/services/observability/` | Integration layer + usage patterns |
| `src/services/observability/USAGE.md` | Detailed usage examples |
| `.mcp/servers.json` | MCP server registration |
