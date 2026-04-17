import type { ToolUseContext } from '../../Tool.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import { getLiveDependencyGraphIntegration } from '../../utils/codebase/integration.js'
import { relative } from 'path'
import { getCwd } from '../../utils/cwd.js'

/**
 * /dependency-graph command for Live Dependency Graph system
 * Provides interface to SQLite-backed codebase intelligence
 */

export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<null> {
  const integration = getLiveDependencyGraphIntegration()
  const normalizedArg = args.trim().toLowerCase()

  if (normalizedArg === 'status' || normalizedArg === '') {
    const stats = integration.getStats()
    const status = stats.isInitialized ? 'active' : 'inactive'

    const output = [
      `Live Dependency Graph: ${status}`,
      `Files indexed: ${stats.files}`,
      `Dependencies: ${stats.dependencies}`,
      `Symbols: ${stats.symbols}`,
      '',
      'Commands:',
      '  /dependency-graph status        - Show system status',
      '  /dependency-graph init          - Initialize system',
      '  /dependency-graph deps <file>   - Show file dependencies',
      '  /dependency-graph search <term> - Search files and symbols',
      '  /dependency-graph context       - Get recommended context files',
      '  /dependency-graph shutdown      - Shutdown system',
    ].join('\\n')

    onDone(output, { display: 'system' })
    return null
  }

  if (normalizedArg === 'init') {
    try {
      await integration.initialize()
      onDone('Live Dependency Graph system initialized successfully', {
        display: 'system',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown initialization error'
      onDone(`Failed to initialize Live Dependency Graph: ${message}`, {
        display: 'system',
      })
    }
    return null
  }

  if (normalizedArg === 'shutdown') {
    try {
      await integration.shutdown()
      onDone('Live Dependency Graph system shutdown complete', {
        display: 'system',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown shutdown error'
      onDone(`Failed to shutdown Live Dependency Graph: ${message}`, {
        display: 'system',
      })
    }
    return null
  }

  if (normalizedArg === 'context') {
    try {
      const recommendations = integration.getContextRecommendations([], 20)

      if (recommendations.length === 0) {
        onDone('No context recommendations available. Initialize the system first.', {
          display: 'system',
        })
        return null
      }

      const cwd = getCwd()
      const output = [
        'Recommended Context Files (by PageRank):',
        ...recommendations.map((rec, index) => {
          const relativePath = relative(cwd, rec.path)
          const summary = rec.summary ? ` - ${rec.summary}` : ''
          return `  ${index + 1}. ${relativePath} (rank: ${rec.rank}, score: ${rec.score.toFixed(4)})${summary}`
        }),
      ].join('\\n')

      onDone(output, { display: 'system' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown context error'
      onDone(`Failed to get context recommendations: ${message}`, {
        display: 'system',
      })
    }
    return null
  }

  if (normalizedArg.startsWith('deps ')) {
    const filePath = args.slice(5).trim()
    if (!filePath) {
      onDone('Usage: /dependency-graph deps <file-path>', { display: 'system' })
      return null
    }

    try {
      const deps = integration.getFileDependencies(filePath)
      const cwd = getCwd()

      const output = [
        `Dependencies for ${relative(cwd, filePath)}:`,
        '',
        `Dependencies (${deps.dependencies.length}):`,
        ...deps.dependencies.map(dep => `  → ${relative(cwd, dep)}`),
        '',
        `Dependents (${deps.dependents.length}):`,
        ...deps.dependents.map(dep => `  ← ${relative(cwd, dep)}`),
        '',
        `Symbols (${deps.symbols.length}):`,
        ...deps.symbols.slice(0, 10).map(sym => `  ${sym.type}: ${sym.name} (line ${sym.line})`),
        ...(deps.symbols.length > 10 ? [`  ... and ${deps.symbols.length - 10} more`] : []),
        '',
        `Blast radius: ${deps.blastRadius} files`,
      ].join('\\n')

      onDone(output, { display: 'system' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown dependencies error'
      onDone(`Failed to get dependencies for ${filePath}: ${message}`, {
        display: 'system',
      })
    }
    return null
  }

  if (normalizedArg.startsWith('search ')) {
    const query = args.slice(7).trim()
    if (!query) {
      onDone('Usage: /dependency-graph search <search-term>', { display: 'system' })
      return null
    }

    try {
      const results = integration.searchFiles(query, 15)

      if (results.length === 0) {
        onDone(`No files found matching "${query}"`, { display: 'system' })
        return null
      }

      const cwd = getCwd()
      const output = [
        `Search results for "${query}":`,
        ...results.map((result, index) => {
          const relativePath = relative(cwd, result.path)
          const scoreText = result.score ? ` (score: ${result.score.toFixed(3)})` : ''
          return `  ${index + 1}. ${relativePath}${scoreText}`
        }),
      ].join('\\n')

      onDone(output, { display: 'system' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown search error'
      onDone(`Search failed: ${message}`, { display: 'system' })
    }
    return null
  }

  const validCommands = ['status', 'init', 'deps <file>', 'search <term>', 'context', 'shutdown']
  onDone(`Usage: /dependency-graph [${validCommands.join('|')}]`, { display: 'system' })
  return null
}