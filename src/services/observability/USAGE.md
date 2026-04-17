# Observability Module Usage

## Setup

Initialize observability in your main app startup:

```typescript
import { observability } from './services/observability'

// After MCP client is ready
observability.init(mcpClient)
```

## Token Monitoring

Log API calls to track token consumption in real-time:

```typescript
import { observability } from './services/observability'

// After making an API call
const startTime = Date.now()
const response = await anthropic.messages.create({...})
const duration = Date.now() - startTime

await observability.logApiCall({
  inputTokens: response.usage.input_tokens,
  outputTokens: response.usage.output_tokens,
  model: 'claude-opus-4-6',
  duration,
  cacheReadTokens: response.usage.cache_read_input_tokens,
  cacheCreationTokens: response.usage.cache_creation_input_tokens,
})
```

**Check metrics:**
```typescript
const metrics = await observability.tokens.getMetrics()
console.log({
  avgTokensPerRequest: metrics.avgTokensPerRequest,
  peakTokensPerSecond: metrics.peakTokensPerSecond,
  cacheHitRate: metrics.cacheHitRate,
  anomalies: metrics.spikesDetected,
})

// Check for budget risks
const anomaly = await observability.tokens.checkForAnomalies()
if (anomaly) {
  // Trigger alerting or graceful degradation
}
```

## Code Compression

Automatically compress large files before sending to APIs:

```typescript
import { observability } from './services/observability'

// Get compressed version if beneficial (>20% reduction)
const compressed = await observability.prepareFileContent('/path/to/large-file.ts')

if (compressed) {
  // Use compressed version — saves tokens
  console.log(`Compression saves ~${observability.code.estimateTokenSavings(summary)} tokens`)
  await sendToApi(compressed)
} else {
  // Send original — wasn't compressed enough
  await sendToApi(originalContent)
}
```

**Analyze directory structure:**
```typescript
const analysis = await observability.code.analyzeDirectory('./src')
console.log({
  filesAnalyzed: analysis.filesAnalyzed,
  avgCompression: analysis.avgCompressionRatio,
  totalTokensSaved: analysis.totalOriginalSize - analysis.totalSummarySize,
})
```

## Real-Time Monitoring

Get full observability snapshot:

```typescript
const snapshot = await observability.getSnapshot()
console.log({
  totalTokensUsed: snapshot.tokens.totalTokensUsed,
  avgRequestTime: snapshot.tokens.avgTokensPerRequest,
  codeCache: snapshot.codeSummarizerCache.cached,
  anomalies: snapshot.anomalyDetected,
})
```

## Cache Management

Code summarization results are cached automatically:

```typescript
// Get cache stats
const stats = observability.code.getCacheStats()
console.log(`${stats.cached}/${stats.maxSize} files cached`)

// Clear cache if needed
observability.code.clearCache()
```

## Performance Tips

- **Token monitoring:** Log events after each API call for real-time tracking
- **Code compression:** Pre-compress files >5KB before API submission
- **Anomaly detection:** Check `checkForAnomalies()` periodically (every 1-5 min)
- **Caching:** Code summaries are cached per-file; clear cache after major refactors

## Integration Examples

### Query Service
```typescript
import { observability } from './services/observability'

export async function executeQuery(prompt: string, files: string[]) {
  // Prepare files — compress if beneficial
  const fileContents = await Promise.all(
    files.map(async f => {
      const compressed = await observability.prepareFileContent(f)
      return compressed || fs.readFileSync(f, 'utf-8')
    })
  )

  // Execute with token tracking
  const start = Date.now()
  const response = await api.create({ prompt, files: fileContents })
  
  await observability.logApiCall({
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    model: response.model,
    duration: Date.now() - start,
  })

  return response
}
```

### Periodic Health Check
```typescript
// Run every 5 minutes
setInterval(async () => {
  const snapshot = await observability.getSnapshot()
  
  if (snapshot.anomalyDetected) {
    logger.warn('Token anomaly detected', {
      spikes: snapshot.tokens.spikesDetected.length,
      avgTokens: snapshot.tokens.avgTokensPerRequest,
    })
  }
  
  metrics.track('observability.snapshot', snapshot)
}, 5 * 60 * 1000)
```
