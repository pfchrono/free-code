/**
 * Code Summarizer — integrates with Code Summarizer MCP
 * Compresses large code files for context-efficient API submissions
 */

interface FileSummary {
  filePath: string
  fileSize: number
  lineCount: number
  exports: Array<{ name: string; line: number; type: string }>
  imports: Array<{ module: string; line: number }>
  functions: Array<{ name: string; line: number; isAsync: boolean }>
  classes: Array<{ name: string; line: number; methods: string[] }>
  interfaces: Array<{ name: string; line: number }>
  types: Array<{ name: string; line: number }>
  summary: string
  originalSize: number
  summarySize: number
  compressionRatio: number
}

interface DirectorySummary {
  dirPath: string
  filesAnalyzed: number
  totalOriginalSize: number
  totalSummarySize: number
  avgCompressionRatio: number
  files: FileSummary[]
}

class CodeSummarizer {
  private mcpClient: any // Will be injected by container
  private summaryCache: Map<string, FileSummary> = new Map()
  private readonly maxCacheSize = 100

  setMcpClient(client: any): void {
    this.mcpClient = client
  }

  async summarizeFile(filePath: string): Promise<FileSummary | null> {
    // Check cache
    if (this.summaryCache.has(filePath)) {
      return this.summaryCache.get(filePath)!
    }

    if (!this.mcpClient) {
      console.warn('MCP client not available — cannot summarize')
      return null
    }

    try {
      const result = await this.mcpClient.callTool(
        'code-summarizer',
        'summarize_file',
        { filePath }
      )

      const summary = JSON.parse(
        typeof result === 'string' ? result : JSON.stringify(result)
      ) as FileSummary

      // Cache result
      if (this.summaryCache.size >= this.maxCacheSize) {
        const firstKey = this.summaryCache.keys().next().value
        this.summaryCache.delete(firstKey)
      }
      this.summaryCache.set(filePath, summary)

      return summary
    } catch (err) {
      console.error(`Failed to summarize ${filePath}:`, err)
      return null
    }
  }

  async analyzeDirectory(dirPath: string): Promise<DirectorySummary | null> {
    if (!this.mcpClient) {
      console.warn('MCP client not available — cannot analyze directory')
      return null
    }

    try {
      const result = await this.mcpClient.callTool(
        'code-summarizer',
        'analyze_directory',
        { directoryPath: dirPath }
      )

      return JSON.parse(
        typeof result === 'string' ? result : JSON.stringify(result)
      ) as DirectorySummary
    } catch (err) {
      console.error(`Failed to analyze directory ${dirPath}:`, err)
      return null
    }
  }

  /**
   * Get compressed version of file ready for API submission.
   * Returns the summary text if compression is good, otherwise returns null
   * (meaning original file should be used)
   */
  async getCompressedVersion(
    filePath: string,
    minCompressionRatio = 0.2
  ): Promise<string | null> {
    const summary = await this.summarizeFile(filePath)
    if (!summary) return null

    if (summary.compressionRatio < minCompressionRatio) {
      return null // Not compressed enough
    }

    return summary.summary
  }

  /**
   * Estimate token savings from compression
   * Rough estimate: ~4 chars per token
   */
  estimateTokenSavings(summary: FileSummary): number {
    const originalTokens = Math.ceil(summary.originalSize / 4)
    const compressedTokens = Math.ceil(summary.summarySize / 4)
    return originalTokens - compressedTokens
  }

  clearCache(): void {
    this.summaryCache.clear()
  }

  getCacheStats(): { cached: number; maxSize: number } {
    return {
      cached: this.summaryCache.size,
      maxSize: this.maxCacheSize,
    }
  }
}

export const codeSummarizer = new CodeSummarizer()
