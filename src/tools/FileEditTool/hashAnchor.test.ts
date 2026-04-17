import { describe, expect, it } from 'bun:test'

import {
  createLineAnchor,
  validateHashAnchor,
} from './hashAnchor.js'

describe('hash anchors', () => {
  it('treats whitespace-only changes on the anchored line as stale', () => {
    const originalLine = '  return value'
    const anchor = createLineAnchor(2, originalLine)
    const fileContent = ['const value = 1', `${originalLine}   `, ''].join('\n')

    const result = validateHashAnchor(fileContent, { lineNumber: 2, contentHash: anchor.split('#')[1] }, originalLine)

    expect(result.isValid).toBe(false)
    expect(result.message).toContain('Content hash mismatch')
  })

  it('rejects anchors when old_string only differs by surrounding whitespace', () => {
    const anchoredLine = 'target'
    const anchor = createLineAnchor(2, anchoredLine)
    const fileContent = ['const value = 1', anchoredLine, ''].join('\n')

    const result = validateHashAnchor(fileContent, { lineNumber: 2, contentHash: anchor.split('#')[1] }, `  ${anchoredLine}  `)

    expect(result.isValid).toBe(false)
    expect(result.message).toContain('old_string not found near anchored line 2')
  })
})
