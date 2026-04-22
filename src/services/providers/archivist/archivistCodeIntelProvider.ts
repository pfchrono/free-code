import { getArchivistClient, isArchivistClientAvailable } from './archivistClient.js'

export interface CodeSearchResult {
  file: string
  symbol?: string
  snippet?: string
  reason?: string
}

export interface ImpactResult {
  changedFiles: string[]
  affectedFiles: string[]
  affectedSymbols: string[]
  impactedTests: string[]
  summary: string
}

function normalizeCodeSearchResults(result: unknown): CodeSearchResult[] {
  if (!Array.isArray(result)) {
    return []
  }

  return result
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map(item => ({
      file: typeof item.file === 'string'
        ? item.file
        : typeof item.source_file === 'string'
          ? item.source_file
          : '',
      symbol: typeof item.symbol === 'string' ? item.symbol : undefined,
      snippet: typeof item.snippet === 'string'
        ? item.snippet
        : typeof item.content === 'string'
          ? item.content
          : undefined,
      reason: typeof item.reason === 'string'
        ? item.reason
        : typeof item.summary === 'string'
          ? item.summary
          : undefined,
    }))
    .filter(item => item.file.length > 0)
}

function normalizeImpactResult(result: unknown): ImpactResult | null {
  if (!result || typeof result !== 'object') {
    return null
  }

  const value = result as Record<string, unknown>
  const toStrings = (input: unknown): string[] => Array.isArray(input)
    ? input.filter((item): item is string => typeof item === 'string')
    : []

  return {
    changedFiles: toStrings(value.changedFiles ?? value.changed_files),
    affectedFiles: toStrings(value.affectedFiles ?? value.affected_files),
    affectedSymbols: toStrings(value.affectedSymbols ?? value.affected_symbols),
    impactedTests: toStrings(value.impactedTests ?? value.impacted_tests),
    summary: typeof value.summary === 'string' ? value.summary : '',
  }
}

export class ArchivistCodeIntelProvider {
  isAvailable(): boolean {
    return isArchivistClientAvailable()
  }

  async search(query: string, limit: number = 5): Promise<CodeSearchResult[]> {
    const client = getArchivistClient()
    if (!client) {
      return []
    }

    const result = await client.callTool('search_codebase', {
      query,
      limit,
    })

    return normalizeCodeSearchResults(result)
  }

  async getImpact(files: string[]): Promise<ImpactResult | null> {
    const client = getArchivistClient()
    if (!client) {
      return null
    }

    const result = await client.callTool('get_change_impact', { files })
    return normalizeImpactResult(result)
  }
}
