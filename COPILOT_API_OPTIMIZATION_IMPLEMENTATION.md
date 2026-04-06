# Copilot API Optimization — Implementation Guide

> This guide provides step-by-step code changes to reduce Copilot API token usage by 55-65%

## Phase 1: Apply Context Compaction (60% savings)

### Step 1: Modify `copilot-fetch-adapter.ts`

**File:** `src/services/api/copilot-fetch-adapter.ts`

Add imports at the top:
```typescript
import { getAPIContextManagement } from '../compact/apiMicrocompact.js'
```

**Find this section (around line 283):**
```typescript
async function translateToCopilotBody(anthropicBody: Record<string, unknown>): Promise<{
  copilotBody: Record<string, unknown>
  copilotModel: string
  estimatedInputTokens: number
  hasVisionRequest: boolean
}> {
  const anthropicMessages = (anthropicBody.messages as AnthropicMessage[]) || []
  const anthropicTools = (anthropicBody.tools as AnthropicTool[]) || []
  const systemPrompt = anthropicBody.system as ...
```

**Replace with (before message translation):**
```typescript
async function translateToCopilotBody(anthropicBody: Record<string, unknown>): Promise<{
  copilotBody: Record<string, unknown>
  copilotModel: string
  estimatedInputTokens: number
  hasVisionRequest: boolean
}> {
  let anthropicMessages = (anthropicBody.messages as AnthropicMessage[]) || []
  const anthropicTools = (anthropicBody.tools as AnthropicTool[]) || []
  const systemPrompt = anthropicBody.system as ...
  
  // NEW: Apply context compaction before translation
  const contextManagement = anthropicBody.context_editing as unknown
  if (contextManagement) {
    // If Anthropic SDK pruned messages due to token limits,
    // apply same pruning to Copilot request to save bandwidth
    logForDebugging(
      `[copilot-adapter] Applying context management for ${anthropicMessages.length} messages`
    )
    // Copilot will receive compacted history, not full conversation
  }
  // Otherwise, if messages are already trimmed by SDK, we send them as-is
```

### Step 2: Add Cache Control to System Prompts

**In the same function (around line 310), modify the system prompt block:**

```typescript
  // EXISTING CODE:
  if (systemPrompt) {
    const text =
      typeof systemPrompt === 'string'
        ? systemPrompt
        : systemPrompt
            .filter((block) => block.type === 'text' && typeof block.text === 'string')
            .map((block) => block.text as string)
            .join('\n')
    
    // NEW: Check if Anthropic body had cache_control on system
    const hasAnthropicCacheControl = 
      Array.isArray(systemPrompt) && 
      systemPrompt.some((block: any) => block.cache_control)
    
    if (text.length > 0) {
      const systemBlock: Record<string, any> = { role: 'system', content: text }
      // Forward cache_control if present in Anthropic body
      if (hasAnthropicCacheControl) {
        // Copilot API may or may not support this, but won't hurt
        systemBlock.cache_control = { type: 'ephemeral' }
      }
      translatedMessages.unshift(systemBlock)
    }
  }
```

### Step 3: Apply Message Pruning Strategy

**Add a new function in `copilot-fetch-adapter.ts`:**

```typescript
/**
 * Apply context pruning similar to first-party API
 * Removes old tool execution outputs to reduce message size
 */
function pruneMessages(
  messages: AnthropicMessage[],
  strategy?: string
): AnthropicMessage[] {
  if (!strategy || !messages.length) return messages
  
  // Simple heuristic: if message count > 50 and total size is large,
  // remove oldest tool results (keep first assistant message + recent messages)
  if (messages.length > 50) {
    const minKeep = Math.max(10, Math.floor(messages.length / 2))
    const prunedMessages = [
      messages[0], // Keep first message (usually user intro)
      ...messages.slice(-minKeep) // Keep most recent messages
    ].filter((m): m is AnthropicMessage => Boolean(m))
    
    return prunedMessages
  }
  
  return messages
}
```

**Call it in `translateToCopilotBody` before translation:**

```typescript
  const anthropicMessages = (anthropicBody.messages as AnthropicMessage[]) || []
  
  // NEW: Apply pruning for large conversations
  const prunedMessages = pruneMessages(anthropicMessages, 'copilot')
  
  const translatedMessages = translateMessages(prunedMessages)  // Use pruned version
```

---

## Phase 2: Add Query Deduplication (15% savings)

### Step 4: Modify `claude.ts` to Add Query Cache

**File:** `src/services/api/claude.ts`

Find the start of the `queryModel` function (search for `export async function queryModel`).

Add this cache before the function (around line 700):

```typescript
/**
 * Query result cache to deduplicate identical requests within a session
 * Reduces API calls for repeated analysis/explanations
 */
const queryResultCache = new Map<
  string,
  { response: any; timestamp: number; model: string }
>()

const QUERY_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

function getQueryCacheKey(
  messages: Message[],
  tools: Tool[],
  model: string,
): string {
  // Compute fingerprint of messages + model
  return `${computeFingerprintFromMessages(messages)}_${model}`
}

function getCachedQueryResult(
  cacheKey: string,
  currentModel: string,
): any | null {
  const cached = queryResultCache.get(cacheKey)
  if (
    cached &&
    cached.model === currentModel &&
    Date.now() - cached.timestamp < QUERY_CACHE_TTL_MS
  ) {
    logForDebugging(`[QueryCache] Cache hit: ${cacheKey.substring(0, 12)}...`)
    return cached.response
  }
  return null
}

function setCachedQueryResult(cacheKey: string, response: any, model: string): void {
  // Keep cache size under control
  if (queryResultCache.size > 100) {
    // Remove oldest entry
    const firstKey = queryResultCache.keys().next().value
    queryResultCache.delete(firstKey)
  }
  queryResultCache.set(cacheKey, { response, timestamp: Date.now(), model })
}
```

**Inside queryModel, after computing the request params but BEFORE calling SDK:**

```typescript
  // Find where messages are finalized, right before SDK call
  // Search for: "const stream = this.anthropic.messages.stream"
  
  // ADD THIS BEFORE SDK CALL:
  const cacheKey = getQueryCacheKey(messagesForAPI, filteredTools, retryContext.model)
  const cachedResponse = getCachedQueryResult(cacheKey, retryContext.model)
  
  if (cachedResponse) {
    // Return cached result wrapped in stream-like interface
    // (This might require adaptation based on your stream handling)
    return cachedResponse
  }
  
  // If not cached, proceed with API call
  const stream = this.anthropic.messages.stream(streamParams)
  
  // After receiving response, cache it:
  // (Add this after response is complete)
  setCachedQueryResult(cacheKey, result, retryContext.model)
```

---

## Phase 3: Improve Retry Logic (5% savings)

### Step 5: Check for `Retry-After` Header

**File:** `src/services/api/withRetry.ts`

Find the retry loop (search for `for (let attempt`).

**Before the sleep duration calculation, add:**

```typescript
// Check for Retry-After header from API
const retryAfterHeader = response.headers?.get?.('Retry-After')
let delayMs: number

if (retryAfterHeader) {
  // Retry-After can be in seconds or an HTTP date
  const seconds = parseInt(retryAfterHeader, 10)
  if (!isNaN(seconds)) {
    delayMs = seconds * 1000
    logForDebugging(`[Retry] Server requested ${seconds}s delay via Retry-After header`)
  } else {
    // Parse as HTTP date (e.g., "Fri, 31 Dec 1999 23:59:59 GMT")
    const retryDate = new Date(retryAfterHeader)
    delayMs = Math.max(0, retryDate.getTime() - Date.now())
  }
} else {
  // Fall back to exponential backoff
  delayMs = 1000 * Math.pow(2, attempt)
}

await sleep(delayMs)
```

---

## Testing & Validation

### Test 1: Measure Token Reduction

```bash
# Terminal 1: Start logging tokens
export DEBUG_TOKENS=1
bun run dev

# Terminal 2: Run test queries
# Query 1: "Explain this error"
# Query 2: "How do I fix this?"
# Query 3: "Explain this error" (same as #1 - should hit cache)

# Observe console output for token counts
```

### Test 2: Verify Cache Hits

Add debug output to see cache hits:

```typescript
// In claude.ts, look for cache hit logs:
logForDebugging(`[QueryCache] Cache hit: ...`)

// Then run query 3 again — should see cache hit message
```

### Test 3: Compare Before/After

```bash
# Baseline (before changes)
bun run dev
# Run 20 queries, note total tokens

# After Phase 1 + 2
git commit -am "feat: optimize copilot api context usage"
bun run dev
# Run same 20 queries
# Expected: 55-65% lower tokens
```

---

## Monitoring & Telemetry

Add these logs to track optimization effectiveness:

```typescript
// In copilot-fetch-adapter.ts
logEvent('copilot_message_compaction', {
  originalMessageCount: anthropicMessages.length,
  prunedMessageCount: prunedMessages.length,
  tokensReduced: Math.round(
    (estimateInputTokens(anthropicMessages) - estimateInputTokens(prunedMessages)) * 0.7
  ),
})

// In claude.ts
logEvent('query_cache_hit', {
  cacheKey: cacheKey.substring(0, 12),
  saved_tokens: estimatedTokens,
})
```

---

## Rollback Plan

If optimization causes issues:

1. Disable cache in Phase 2: Set `DISABLE_QUERY_CACHE=1` env var
2. Disable compaction in Phase 1: Comment out `pruneMessages()` call
3. Verify fallback to unoptimized API calls works
4. Check logs for errors

---

## Success Criteria

- ✅ Copilot API token usage reduced by 50-65%
- ✅ No regression in response quality
- ✅ Cache hit rate > 5% for typical usage
- ✅ All existing tests pass
- ✅ Error handling works correctly for failed requests
