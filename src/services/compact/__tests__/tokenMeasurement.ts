/**
 * Token Measurement — measure savings from RedQueen changes
 *
 * Runs same tool output through compression pipeline and measures token deltas.
 * Usage: bun run src/services/compact/__tests__/tokenMeasurement.ts
 */

import { getContentSizeEstimate } from '../../../utils/mcpValidation.js'
import { redQueenCompress } from '../redQueen.js'
import { applyToolReducer } from '../toolReducers.js'

interface MeasurementResult {
  tool: string
  originalTokens: number
  afterReducerTokens: number
  afterFullPipelineTokens: number
  reducerSavings: number
  reducerSavingsPercent: number
  fullPipelineSavings: number
  fullPipelineSavingsPercent: number
}

// Sample tool outputs for measurement
const SAMPLE_OUTPUTS: Record<string, string> = {
  'playwright-browser_console_messages': `
[log] Starting application
[log] Loading config from /etc/app/config.json
[debug] Debug mode enabled
[log] Initializing database connection
[log] Attempting connection to 192.168.1.100:5432
[warning] Connection timeout - retrying
[warning] Retry attempt 1 of 3
[error] Failed to connect to database: ECONNREFUSED
[error] Stack trace: Error at Connection.connect line 234
[error] Caused by: socket error ECONNREFUSED at 192.168.1.100:5432
[log] Fallback to local SQLite database
[log] SQLite connection established
[warning] Running in fallback mode - performance may be degraded
[log] Application ready on port 3000
[log] Listening for requests...
[log] Processing request GET /api/users from 192.168.1.50
[log] Database query: SELECT * FROM users WHERE active=true
[log] Query completed in 45ms
[log] Serializing response with 1250 items
[warning] Response size is 2.3MB - consider pagination
[log] Sent response to client in 120ms
[log] Processing request POST /api/data from 192.168.1.50
[error] Validation failed: field 'email' is required
[error] Request rejected with 400 Bad Request
[log] Client error logged
[log] Memory usage: 450MB / 1024MB
[warning] Memory usage above 40% threshold
[debug] Heap snapshot available at /tmp/heap.bin
  `.repeat(3).trim(),

  'playwright-browser_network_requests': `
GET https://api.example.com/v1/users - 200 OK (42ms) - 1.2KB
GET https://api.example.com/v1/posts - 200 OK (35ms) - 4.5KB
GET https://api.example.com/v1/comments - 200 OK (28ms) - 2.3KB
POST https://api.example.com/v1/data - 201 Created (156ms) - 0.8KB
GET https://cdn.example.com/assets/image1.jpg - 200 OK (845ms) - 124KB
GET https://cdn.example.com/assets/image2.jpg - 200 OK (920ms) - 156KB
GET https://cdn.example.com/assets/style.css - 200 OK (45ms) - 34KB
GET https://fonts.googleapis.com/css2 - 200 OK (234ms) - 12KB
POST https://api.example.com/v1/validate - 422 Unprocessable (67ms) - 0.3KB
GET https://api.example.com/v1/users/123 - 404 Not Found (12ms) - 0.2KB
POST https://api.example.com/v1/upload - 500 Internal Error (2341ms) - 1.1KB
GET https://analytics.example.com/track - 200 OK (5ms) - 0.1KB
PUT https://api.example.com/v1/settings - 200 OK (89ms) - 0.5KB
DELETE https://api.example.com/v1/item - 204 No Content (34ms) - 0KB
GET https://api.example.com/v1/logs - 403 Forbidden (8ms) - 0.4KB
  `.repeat(5).trim(),

  'github-search_code': JSON.stringify(
    Array.from({ length: 25 }, (_, i) => ({
      repository: `user/repo${i}`,
      path: `src/module${i % 5}/component${i}.ts`,
      line: 100 + i * 5,
      name: `function_${i}`,
      score: 0.95 - i * 0.01,
      snippet: `export function handler_${i}() {\n  // Long implementation here\n  return processData(input_${i}, config_${i});\n}`.repeat(3),
    })),
  ),

  'github-list_issues': `
#4521 [open] Critical bug in authentication - 24 comments - assigned to @alice - labels: [bug, critical, security]
  Created: 2026-04-01T10:30:00Z
  Updated: 2026-04-08T15:45:00Z
  Body: This is a critical security issue affecting all OAuth integrations. Users are unable to log in via Google and GitHub providers. The error occurs at the token validation stage. Full stack trace attached. This requires immediate attention as it blocks production deployments.

#4522 [open] Feature request: dark mode - 8 comments - no assignee - labels: [feature, enhancement, ui]
  Created: 2026-04-05T08:15:00Z
  Updated: 2026-04-08T12:30:00Z
  Body: Add dark mode support to the web application. This would improve usability for night users and reduce eye strain. Could use CSS variables and localStorage for persistence.

#4523 [closed] Performance optimization for database queries - 12 comments - assigned to @bob - labels: [performance, optimization, done]
  Created: 2026-03-28T14:20:00Z
  Updated: 2026-04-07T16:00:00Z
  Body: Implemented query batching and added indexes to improve performance. This work is now complete.
  `.repeat(4).trim(),
}

async function measureTool(tool: string, output: string): Promise<MeasurementResult> {
  const originalTokens = getContentSizeEstimate(output)

  // Step 1: Apply deterministic reducer
  const afterReducer = applyToolReducer(output, tool)
  const afterReducerTokens = getContentSizeEstimate(afterReducer)
  const reducerSavings = originalTokens - afterReducerTokens
  const reducerSavingsPercent = originalTokens > 0 ? (reducerSavings / originalTokens) * 100 : 0

  // Step 2: Run through full RedQueen pipeline (no summarization for speed)
  const { content: afterPipeline } = await redQueenCompress(output, 'test-server', tool, {}, {
    maxTokens: 4000,
    enableDedup: false, // Skip dedup for measurement
    enableFiltering: true,
    enableSummarization: false, // Skip LLM for speed
  })
  const afterFullPipelineTokens = getContentSizeEstimate(afterPipeline)
  const fullPipelineSavings = originalTokens - afterFullPipelineTokens
  const fullPipelineSavingsPercent = originalTokens > 0 ? (fullPipelineSavings / originalTokens) * 100 : 0

  return {
    tool,
    originalTokens,
    afterReducerTokens,
    afterFullPipelineTokens,
    reducerSavings,
    reducerSavingsPercent,
    fullPipelineSavings,
    fullPipelineSavingsPercent,
  }
}

async function runMeasurements() {
  console.log('\n=== Token Measurement Results ===\n')

  const results: MeasurementResult[] = []

  for (const [tool, output] of Object.entries(SAMPLE_OUTPUTS)) {
    console.log(`Measuring ${tool}...`)
    try {
      const result = await measureTool(tool, output)
      results.push(result)
      console.log(`  ✓ Original: ${result.originalTokens} tokens`)
      console.log(`  ✓ After reducer: ${result.afterReducerTokens} tokens (${result.reducerSavingsPercent.toFixed(1)}% saved)`)
      console.log(`  ✓ After pipeline: ${result.afterFullPipelineTokens} tokens (${result.fullPipelineSavingsPercent.toFixed(1)}% saved)`)
    } catch (e) {
      console.error(`  ✗ Failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  console.log('\n=== Summary ===\n')
  console.log('Tool'.padEnd(40) + 'Original'.padEnd(12) + 'After Reducer'.padEnd(14) + 'Full Pipeline'.padEnd(14) + 'Savings')
  console.log('-'.repeat(90))

  let totalOriginal = 0
  let totalFinal = 0

  for (const result of results) {
    totalOriginal += result.originalTokens
    totalFinal += result.afterFullPipelineTokens
    console.log(
      result.tool.padEnd(40) +
        String(result.originalTokens).padEnd(12) +
        String(result.afterReducerTokens).padEnd(14) +
        String(result.afterFullPipelineTokens).padEnd(14) +
        `${result.fullPipelineSavingsPercent.toFixed(1)}%`,
    )
  }

  console.log('-'.repeat(90))
  const totalSavings = totalOriginal - totalFinal
  const totalSavingsPercent = totalOriginal > 0 ? (totalSavings / totalOriginal) * 100 : 0
  console.log(
    'TOTAL'.padEnd(40) +
      String(totalOriginal).padEnd(12) +
      ''.padEnd(14) +
      String(totalFinal).padEnd(14) +
      `${totalSavingsPercent.toFixed(1)}%`,
  )

  console.log(`\n✓ Session saved ${totalSavings} estimated tokens (${totalSavingsPercent.toFixed(1)}% reduction)\n`)
}

runMeasurements().catch(console.error)
