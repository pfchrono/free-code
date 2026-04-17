---
name: mcp-token-monitor-stats
description: Token monitor MCP returns zeros until API calls recorded
type: reference
---

## Token Monitor MCP Status

**`get_metrics`** returns structure:
```json
{
  "totalRequests": 0,
  "totalTokensUsed": 0,
  "avgTokensPerRequest": 0,
  "peakTokensPerRequest": 0,
  "peakTokensPerSecond": 0,
  "requestsPerSecond": 0,
  "cacheHitRate": 0,
  "recentEvents": [],
  "spikesDetected": []
}
```

**All zeros** = no API calls recorded in session yet. Tool itself is functional.

**How to use:** Call `record_token_event()` after each LLM API call, then `get_metrics()` to retrieve stats.
