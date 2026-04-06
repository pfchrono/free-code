import { statSync } from 'fs'
import { extname, resolve, dirname, join } from 'path'
import { createHash } from 'crypto'
import { logForDebugging } from '../debug.js'
import type { FileRecord, SymbolRecord, DependencyRecord } from './liveDependencyGraphDB.js'

/**
 * Dependency Parser for Live Dependency Graph
 * Extracts imports, exports, symbols from source files
 * Supports multiple languages through pattern matching and AST parsing
 */

export interface ParsedFile {
  file: Omit<FileRecord, 'id'>
  symbols: Omit<SymbolRecord, 'id' | 'file_id'>[]
  dependencies: Array<{
    path: string
    type: DependencyRecord['dependency_type']
    line: number
  }>
}

export interface LanguageConfig {
  extensions: string[]
  importPatterns: RegExp[]
  exportPatterns: RegExp[]
  symbolPatterns: Record<string, RegExp>
}

// Language-specific parsing configurations
const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  typescript: {
    extensions: ['.ts', '.tsx', '.d.ts'],
    importPatterns: [
      /import\s+(?:(?:\*\s+as\s+\w+)|(?:\{[^}]*\})|(?:\w+))\s+from\s+['"`]([^'"`]+)['"`]/g,
      /import\s+['"`]([^'"`]+)['"`]/g,
      /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g, // dynamic imports
    ],
    exportPatterns: [
      /export\s+(?:default\s+)?(?:class|function|interface|type|const|let|var)\s+(\w+)/g,
      /export\s+\*\s+from\s+['"`]([^'"`]+)['"`]/g,
      /export\s+\{([^}]+)\}/g,
    ],
    symbolPatterns: {
      function: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
      class: /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/g,
      interface: /(?:export\s+)?interface\s+(\w+)/g,
      type: /(?:export\s+)?type\s+(\w+)/g,
      variable: /(?:export\s+)?(?:const|let|var)\s+(\w+)/g,
    },
  },
  javascript: {
    extensions: ['.js', '.jsx', '.mjs', '.cjs'],
    importPatterns: [
      /import\s+(?:(?:\*\s+as\s+\w+)|(?:\{[^}]*\})|(?:\w+))\s+from\s+['"`]([^'"`]+)['"`]/g,
      /import\s+['"`]([^'"`]+)['"`]/g,
      /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
      /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    ],
    exportPatterns: [
      /export\s+(?:default\s+)?(?:class|function|const|let|var)\s+(\w+)/g,
      /module\.exports\s*=\s*(\w+)/g,
      /exports\.(\w+)/g,
    ],
    symbolPatterns: {
      function: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
      class: /(?:export\s+)?class\s+(\w+)/g,
      variable: /(?:export\s+)?(?:const|let|var)\s+(\w+)/g,
    },
  },
  python: {
    extensions: ['.py', '.pyi'],
    importPatterns: [
      /^import\s+([\w.]+)/gm,
      /^from\s+([\w.]+)\s+import/gm,
    ],
    exportPatterns: [
      /__all__\s*=\s*\[([^\]]+)\]/g,
    ],
    symbolPatterns: {
      function: /^def\s+(\w+)/gm,
      class: /^class\s+(\w+)/gm,
    },
  },
  go: {
    extensions: ['.go'],
    importPatterns: [
      /import\s+"([^"]+)"/g,
      /import\s+\(\s*([^)]+)\s*\)/gs,
    ],
    exportPatterns: [],
    symbolPatterns: {
      function: /^func\s+(\w+)/gm,
      type: /^type\s+(\w+)/gm,
    },
  },
}

export class DependencyParser {
  private getLanguageFromPath(filePath: string): string | null {
    const ext = extname(filePath).toLowerCase()

    for (const [language, config] of Object.entries(LANGUAGE_CONFIGS)) {
      if (config.extensions.includes(ext)) {
        return language
      }
    }

    return null
  }

  private createFileHash(content: string): string {
    return createHash('sha256').update(content).digest('hex').substring(0, 16)
  }

  private resolveImportPath(importPath: string, currentFilePath: string): string {
    // Handle relative imports
    if (importPath.startsWith('.')) {
      const currentDir = dirname(currentFilePath)
      return resolve(currentDir, importPath)
    }

    // Handle absolute imports (node_modules, etc.)
    // For now, we'll keep them as-is and let the caller handle resolution
    return importPath
  }

  private extractImports(
    content: string,
    language: string,
    filePath: string
  ): Array<{ path: string; type: DependencyRecord['dependency_type']; line: number }> {
    const config = LANGUAGE_CONFIGS[language]
    if (!config) return []

    const imports: Array<{ path: string; type: DependencyRecord['dependency_type']; line: number }> = []
    const lines = content.split('\\n')

    for (const pattern of config.importPatterns) {
      let match
      while ((match = pattern.exec(content)) !== null) {
        const importPath = match[1]
        if (!importPath) continue

        // Find the line number
        const beforeMatch = content.substring(0, match.index)
        const lineNumber = (beforeMatch.match(/\\n/g) || []).length + 1

        // Determine import type
        let type: DependencyRecord['dependency_type'] = 'import'
        if (match[0].includes('require(')) {
          type = 'require'
        } else if (match[0].includes('import(')) {
          type = 'import' // dynamic import, but still import type
        }

        // Resolve the path
        const resolvedPath = this.resolveImportPath(importPath, filePath)

        imports.push({
          path: resolvedPath,
          type,
          line: lineNumber,
        })
      }
    }

    return imports
  }

  private extractSymbols(
    content: string,
    language: string
  ): Omit<SymbolRecord, 'id' | 'file_id'>[] {
    const config = LANGUAGE_CONFIGS[language]
    if (!config) return []

    const symbols: Omit<SymbolRecord, 'id' | 'file_id'>[] = []
    const lines = content.split('\\n')

    for (const [symbolType, pattern] of Object.entries(config.symbolPatterns)) {
      let match
      while ((match = pattern.exec(content)) !== null) {
        const symbolName = match[1]
        if (!symbolName) continue

        // Find the line number
        const beforeMatch = content.substring(0, match.index)
        const lineNumber = (beforeMatch.match(/\\n/g) || []).length + 1

        // Check if it's exported
        const exported = match[0].includes('export')

        symbols.push({
          name: symbolName,
          type: symbolType as SymbolRecord['type'],
          start_line: lineNumber,
          end_line: null, // TODO: Calculate end line using AST
          scope: null, // TODO: Determine scope
          exported,
        })
      }
    }

    // Extract exports
    for (const pattern of config.exportPatterns) {
      let match
      while ((match = pattern.exec(content)) !== null) {
        const exportName = match[1]
        if (!exportName) continue

        // Handle export lists like export { foo, bar }
        if (exportName.includes(',')) {
          const exports = exportName.split(',').map(e => e.trim())
          for (const exp of exports) {
            const beforeMatch = content.substring(0, match.index)
            const lineNumber = (beforeMatch.match(/\\n/g) || []).length + 1

            symbols.push({
              name: exp,
              type: 'export',
              start_line: lineNumber,
              end_line: null,
              scope: null,
              exported: true,
            })
          }
        } else {
          const beforeMatch = content.substring(0, match.index)
          const lineNumber = (beforeMatch.match(/\\n/g) || []).length + 1

          symbols.push({
            name: exportName,
            type: 'export',
            start_line: lineNumber,
            end_line: null,
            scope: null,
            exported: true,
          })
        }
      }
    }

    return symbols
  }

  parseFile(filePath: string, content: string): ParsedFile | null {
    try {
      const language = this.getLanguageFromPath(filePath)
      if (!language) {
        logForDebugging(`[DependencyParser] Unsupported file type: ${filePath}`)
        return null
      }

      const stats = statSync(filePath)
      const hash = this.createFileHash(content)

      const file: Omit<FileRecord, 'id'> = {
        path: filePath,
        hash,
        size: stats.size,
        mtime: Math.floor(stats.mtimeMs / 1000),
        language,
      }

      const imports = this.extractImports(content, language, filePath)
      const symbols = this.extractSymbols(content, language)

      return {
        file,
        symbols,
        dependencies: imports,
      }
    } catch (error) {
      logForDebugging(`[DependencyParser] Error parsing ${filePath}:`, error)
      return null
    }
  }

  getSupportedLanguages(): string[] {
    return Object.keys(LANGUAGE_CONFIGS)
  }

  getSupportedExtensions(): string[] {
    return Object.values(LANGUAGE_CONFIGS)
      .flatMap(config => config.extensions)
  }

  isSupported(filePath: string): boolean {
    return this.getLanguageFromPath(filePath) !== null
  }
}

// Singleton instance
let parserInstance: DependencyParser | null = null

export function getDependencyParser(): DependencyParser {
  if (!parserInstance) {
    parserInstance = new DependencyParser()
  }
  return parserInstance
}