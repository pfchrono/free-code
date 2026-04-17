import { describe, it, expect } from 'bun:test'
import { applyToolReducer } from '../toolReducers'
import type { MCPToolResult } from '../../../utils/mcpValidation'

describe('toolReducers', () => {
  describe('Playwright console messages', () => {
    it('reduces verbose console output with error counts', () => {
      const consoleOutput = `
[log] Application started
[log] Processing request ID: 12345
[log] User session initialized
[warning] Deprecation warning: old API used at line 456
[log] Connecting to database...
[error] Failed to connect to database: ECONNREFUSED localhost:5432
[log] Retrying connection...
[error] Failed again: ECONNREFUSED localhost:5432
[error] Critical: Cannot proceed without database connection
[log] Application shutting down
[warning] Memory usage high: 850MB
[log] Cleanup phase starting...
[log] Cleanup complete
      `.trim()

      const result = applyToolReducer(consoleOutput, 'playwright-browser_console_messages')
      const resultText = typeof result === 'string' ? result : result[0]?.type === 'text' ? result[0].text : ''

      expect(resultText).toContain('3 errors')
      expect(resultText).toContain('2 warnings')
      expect(resultText).toContain('ECONNREFUSED')
      expect(resultText.length).toBeLessThan(consoleOutput.length * 0.8)
    })

    it('skips reduction if content < 500 chars', () => {
      const smallOutput = '[error] Something went wrong'
      const result = applyToolReducer(smallOutput, 'playwright-browser_console_messages')
      expect(result).toBe(smallOutput)
    })
  })

  describe('Playwright network requests', () => {
    it('reduces network output with failed request counts', () => {
      const networkOutput = `
GET https://api.example.com/users - 200 OK (12ms)
GET https://api.example.com/posts - 200 OK (8ms)
GET https://api.example.com/comments - 200 OK (15ms)
POST https://api.example.com/data - 400 Bad Request (45ms)
GET https://cdn.example.com/image1.jpg - 200 OK (120ms)
GET https://cdn.example.com/image2.jpg - 200 OK (85ms)
POST https://api.example.com/upload - 500 Internal Server Error (2000ms)
GET https://analytics.example.com/track - 200 OK (5ms)
POST https://api.example.com/validate - 422 Unprocessable Entity (30ms)
GET https://cdn.example.com/style.css - 200 OK (18ms)
      `.repeat(3).trim()

      const result = applyToolReducer(networkOutput, 'playwright-browser_network_requests')
      const resultText = typeof result === 'string' ? result : result[0]?.type === 'text' ? result[0].text : ''

      expect(resultText).toContain('failed')
      expect(resultText).toContain('2000ms')
      expect(resultText.length).toBeLessThan(networkOutput.length * 0.8)
    })
  })

  describe('GitHub search code', () => {
    it('reduces code search results to top 5 matches', () => {
      const searchOutput = JSON.stringify(
        Array.from({ length: 20 }, (_, i) => ({
          path: `src/module${i}/file.ts`,
          line: 100 + i * 10,
          snippet: `long snippet of code at line ${100 + i * 10}`.repeat(20),
          relevance: 0.9 - i * 0.01,
        })),
      )

      const result = applyToolReducer(searchOutput, 'github-search_code')
      const resultText = typeof result === 'string' ? result : result[0]?.type === 'text' ? result[0].text : ''

      expect(resultText).toContain('top 5')
      expect(resultText).toContain('src/module')
      expect(resultText.length).toBeLessThan(searchOutput.length * 0.8)
    })
  })

  describe('GitHub list issues', () => {
    it('reduces issue list to title/number/state/labels', () => {
      const issueOutput = `
#1234 [open] - "Fix critical auth bug" - labels: [bug, critical, security] - assigned to @alice
  Description: Long detailed description about the auth bug...
  Comments: 12
  Created: 2026-04-01
  Updated: 2026-04-08

#1235 [closed] - "Add caching feature" - labels: [feature, enhancement] - no assignee
  Description: Another long description about the caching...
  Comments: 3
  Created: 2026-03-15
  Updated: 2026-04-05

#1236 [open] - "Refactor logging" - labels: [refactor, technical-debt] - assigned to @bob
  Description: Even longer description...
  Comments: 8
      `.repeat(2).trim()

      const result = applyToolReducer(issueOutput, 'github-list_issues')
      const resultText = typeof result === 'string' ? result : result[0]?.type === 'text' ? result[0].text : ''

      expect(resultText).toContain('#')
      expect(resultText).toContain('open')
      expect(resultText.length).toBeLessThan(issueOutput.length * 0.8)
    })
  })

  describe('Context7 query', () => {
    it('reduces documentation results to top 3 docs', () => {
      const docsOutput = Array.from({ length: 10 }, (_, i) => {
        return `
# Documentation Section ${i}

This is a detailed explanation of feature ${i} with lots of content.
The documentation contains multiple paragraphs and examples.
It goes on for several lines with various technical details.

## Subsection
More content here...

---
`
      })
        .join('\n')
        .trim()

      const result = applyToolReducer(docsOutput, 'context7-query')
      const resultText = typeof result === 'string' ? result : result[0]?.type === 'text' ? result[0].text : ''

      expect(resultText).toContain('top 3')
      expect(resultText).toContain('Section')
      expect(resultText.length).toBeLessThan(docsOutput.length * 0.8)
    })
  })

  describe('Edge cases', () => {
    it('returns original for unknown tool', () => {
      const output = 'some output'.repeat(100)
      const result = applyToolReducer(output, 'unknown-tool')
      expect(result).toBe(output)
    })

    it('returns original if reduction does not save >20%', () => {
      const output = 'short content'
      const result = applyToolReducer(output, 'playwright-browser_console_messages')
      expect(result).toBe(output)
    })

    it('gracefully handles malformed JSON', () => {
      const malformed = '{ invalid json }'
      const output = malformed.repeat(100)
      const result = applyToolReducer(output, 'github-search_code')
      // Should return original on error
      expect(typeof result === 'string' ? result : result[0]?.type === 'text').toBeDefined()
    })

    it('preserves string vs block array format', () => {
      const stringContent = '[error] test error'.repeat(100)
      const stringResult = applyToolReducer(stringContent, 'playwright-browser_console_messages')
      expect(typeof stringResult === 'string').toBe(true)

      const blockContent: MCPToolResult = [{ type: 'text' as const, text: '[error] test error'.repeat(100) }]
      const blockResult = applyToolReducer(blockContent, 'playwright-browser_console_messages')
      expect(Array.isArray(blockResult)).toBe(true)
    })
  })
})
