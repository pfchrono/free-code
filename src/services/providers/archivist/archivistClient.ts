import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js'
import type { MCPServerConnection } from '../../mcp/types.js'

export interface ArchivistClient {
  callTool<T = unknown>(toolName: string, args: Record<string, unknown>): Promise<T>
}

const ARCHIVIST_SERVER_NAMES = new Set(['archivist', 'token-savior'])

let archivistClient: ArchivistClient | null = null

function normalizeMcpResult(content: ContentBlock[] | undefined, structuredContent: unknown): unknown {
  if (structuredContent !== undefined) {
    return structuredContent
  }

  if (!Array.isArray(content)) {
    return null
  }

  const text = content
    .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim()

  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export function createArchivistClient(connection: MCPServerConnection): ArchivistClient | null {
  if (connection.type !== 'connected' || !ARCHIVIST_SERVER_NAMES.has(connection.name)) {
    return null
  }

  return {
    async callTool<T = unknown>(toolName: string, args: Record<string, unknown>): Promise<T> {
      const result = await connection.client.callTool(
        {
          name: toolName,
          arguments: args,
        },
        undefined,
        { timeout: 15000 },
      )

      return normalizeMcpResult(result.content, result.structuredContent) as T
    },
  }
}

export function syncArchivistClient(connections: readonly MCPServerConnection[]): void {
  const connection = connections.find(candidate => candidate.type === 'connected' && ARCHIVIST_SERVER_NAMES.has(candidate.name))
  setArchivistClient(connection ? createArchivistClient(connection) : null)
}

export function setArchivistClient(client: ArchivistClient | null): void {
  archivistClient = client
}

export function getArchivistClient(): ArchivistClient | null {
  return archivistClient
}

export function isArchivistClientAvailable(): boolean {
  return archivistClient !== null
}
