import { createHash } from 'crypto'

/**
 * Hash-anchored edit validation utility inspired by oh-my-openagent's LINE#ID pattern.
 * Provides content validation to prevent stale edits through line number and content hash matching.
 */

export interface LineAnchor {
  lineNumber: number
  contentHash: string
}

export interface HashAnchorValidationResult {
  isValid: boolean
  message?: string
  actualLineContent?: string
  expectedHash?: string
  actualHash?: string
}

/**
 * Parse LINE#ID format anchor string (e.g., "123#abc123")
 */
export function parseLineAnchor(anchor: string): LineAnchor | null {
  const match = anchor.match(/^(\d+)#([a-f0-9]+)$/i)
  if (!match) {
    return null
  }

  return {
    lineNumber: parseInt(match[1], 10),
    contentHash: match[2].toLowerCase()
  }
}

/**
 * Generate content hash for a line of text
 */
export function generateContentHash(content: string): string {
  return createHash('sha256')
    .update(content)
    .digest('hex')
    .substring(0, 8) // Use first 8 characters for brevity
}

/**
 * Create LINE#ID anchor for a specific line
 */
export function createLineAnchor(lineNumber: number, content: string): string {
  const hash = generateContentHash(content)
  return `${lineNumber}#${hash}`
}

/**
 * Validate hash anchor against file content
 */
export function validateHashAnchor(
  fileContent: string,
  anchor: LineAnchor,
  oldString: string
): HashAnchorValidationResult {
  const lines = fileContent.split('\n')

  // Check if line number is valid
  if (anchor.lineNumber < 1 || anchor.lineNumber > lines.length) {
    return {
      isValid: false,
      message: `Line ${anchor.lineNumber} does not exist in file (file has ${lines.length} lines)`
    }
  }

  const actualLineContent = lines[anchor.lineNumber - 1] // Convert to 0-based index
  const actualHash = generateContentHash(actualLineContent)

  // Validate content hash
  if (actualHash !== anchor.contentHash) {
    return {
      isValid: false,
      message: `Content hash mismatch at line ${anchor.lineNumber}. File content may have changed since anchor was created.`,
      actualLineContent,
      expectedHash: anchor.contentHash,
      actualHash
    }
  }

  // Additional validation: check if old_string is near the anchored line
  // Look for old_string within +/- 5 lines of the anchor
  const searchStart = Math.max(0, anchor.lineNumber - 6)
  const searchEnd = Math.min(lines.length, anchor.lineNumber + 5)
  const contextLines = lines.slice(searchStart, searchEnd).join('\n')

  if (!contextLines.includes(oldString)) {
    return {
      isValid: false,
      message: `old_string not found near anchored line ${anchor.lineNumber}. Content may have been moved or modified.`,
      actualLineContent
    }
  }

  return {
    isValid: true,
    actualLineContent
  }
}

/**
 * Find the line number where old_string appears and generate anchor
 */
export function findAndCreateAnchor(fileContent: string, oldString: string): string | null {
  const lines = fileContent.split('\n')

  // Find the line containing the old_string
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(oldString.trim())) {
      return createLineAnchor(i + 1, lines[i]) // Convert to 1-based line number
    }
  }

  return null
}

/**
 * Generate line anchors for multiple lines around a target string
 * Useful for providing context and validation for complex edits
 */
export function createContextAnchors(
  fileContent: string,
  targetString: string,
  contextLines: number = 2
): string[] {
  const lines = fileContent.split('\n')
  const anchors: string[] = []

  // Find the line containing the target string
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(targetString.trim())) {
      // Create anchors for surrounding lines
      const start = Math.max(0, i - contextLines)
      const end = Math.min(lines.length - 1, i + contextLines)

      for (let j = start; j <= end; j++) {
        anchors.push(createLineAnchor(j + 1, lines[j]))
      }
      break
    }
  }

  return anchors
}

/**
 * Suggest a line anchor for a given edit operation
 * Returns the anchor string that should be used with the edit
 */
export function suggestAnchorForEdit(
  fileContent: string,
  oldString: string
): { anchor: string | null; suggestion: string } {
  const anchor = findAndCreateAnchor(fileContent, oldString)

  if (!anchor) {
    return {
      anchor: null,
      suggestion: 'Could not find target string in file to create line anchor'
    }
  }

  return {
    anchor,
    suggestion: `Use line_anchor: "${anchor}" to ensure content hasn't changed`
  }
}