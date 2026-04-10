import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import * as fs from 'fs'
import * as path from 'path'

interface CodeSummary {
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

class CodeAnalyzer {
  analyzeTsFile(filePath: string): CodeSummary {
    const content = fs.readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')
    const fullSummary = this.generateSummary(content, lines, filePath)

    const originalSize = content.length
    const summarySize = fullSummary.summary.length
    const compressionRatio = 1 - summarySize / originalSize

    return {
      ...fullSummary,
      originalSize,
      summarySize,
      compressionRatio,
    }
  }

  private generateSummary(
    content: string,
    lines: string[],
    filePath: string
  ): Omit<CodeSummary, 'originalSize' | 'summarySize' | 'compressionRatio'> {
    const exports = this.extractExports(lines)
    const imports = this.extractImports(lines)
    const functions = this.extractFunctions(lines)
    const classes = this.extractClasses(lines)
    const interfaces = this.extractInterfaces(lines)
    const types = this.extractTypes(lines)

    const summaryText = this.buildSummaryText(
      filePath,
      exports,
      imports,
      functions,
      classes,
      interfaces,
      types
    )

    return {
      filePath,
      fileSize: content.length,
      lineCount: lines.length,
      exports,
      imports,
      functions,
      classes,
      interfaces,
      types,
      summary: summaryText,
    }
  }

  private extractExports(
    lines: string[]
  ): Array<{ name: string; line: number; type: string }> {
    return lines
      .map((line, idx) => {
        const match = line.match(/export\s+(const|function|class|interface|type|async\s+function)\s+(\w+)/)
        if (match) {
          return { name: match[2], line: idx + 1, type: match[1] }
        }
        return null
      })
      .filter((x): x is { name: string; line: number; type: string } => x !== null)
  }

  private extractImports(
    lines: string[]
  ): Array<{ module: string; line: number }> {
    return lines
      .map((line, idx) => {
        const match = line.match(/import\s+(?:\{[^}]*\}|[\w*]+)\s+from\s+['"]([^'"]+)['"]/)
        if (match) {
          return { module: match[1], line: idx + 1 }
        }
        return null
      })
      .filter((x): x is { module: string; line: number } => x !== null)
  }

  private extractFunctions(
    lines: string[]
  ): Array<{ name: string; line: number; isAsync: boolean }> {
    return lines
      .map((line, idx) => {
        const match = line.match(/(?:async\s+)?function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\(/)
        if (match) {
          const name = match[1] || match[2]
          return {
            name,
            line: idx + 1,
            isAsync: line.includes('async'),
          }
        }
        return null
      })
      .filter((x): x is { name: string; line: number; isAsync: boolean } => x !== null)
  }

  private extractClasses(
    lines: string[]
  ): Array<{ name: string; line: number; methods: string[] }> {
    const classes: Array<{ name: string; line: number; methods: string[] }> = []
    let currentClass: { name: string; line: number; methods: string[] } | null = null

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      const classMatch = line.match(/class\s+(\w+)/)
      if (classMatch) {
        if (currentClass) classes.push(currentClass)
        currentClass = { name: classMatch[1], line: i + 1, methods: [] }
      }

      if (currentClass && line.includes('}') && !line.trim().startsWith('//')) {
        classes.push(currentClass)
        currentClass = null
      }

      if (currentClass) {
        const methodMatch = line.match(/\s+(\w+)\s*\([^)]*\)\s*[:{]/)
        if (methodMatch) {
          currentClass.methods.push(methodMatch[1])
        }
      }
    }

    if (currentClass) classes.push(currentClass)
    return classes
  }

  private extractInterfaces(
    lines: string[]
  ): Array<{ name: string; line: number }> {
    return lines
      .map((line, idx) => {
        const match = line.match(/interface\s+(\w+)/)
        if (match) {
          return { name: match[1], line: idx + 1 }
        }
        return null
      })
      .filter((x): x is { name: string; line: number } => x !== null)
  }

  private extractTypes(
    lines: string[]
  ): Array<{ name: string; line: number }> {
    return lines
      .map((line, idx) => {
        const match = line.match(/type\s+(\w+)\s*=/)
        if (match) {
          return { name: match[1], line: idx + 1 }
        }
        return null
      })
      .filter((x): x is { name: string; line: number } => x !== null)
  }

  private buildSummaryText(
    filePath: string,
    exports: Array<{ name: string; line: number; type: string }>,
    imports: Array<{ module: string; line: number }>,
    functions: Array<{ name: string; line: number; isAsync: boolean }>,
    classes: Array<{ name: string; line: number; methods: string[] }>,
    interfaces: Array<{ name: string; line: number }>,
    types: Array<{ name: string; line: number }>
  ): string {
    const parts: string[] = [
      `# ${path.basename(filePath)}`,
      '',
    ]

    if (imports.length > 0) {
      parts.push('## Imports')
      imports.forEach(imp => {
        parts.push(`- Line ${imp.line}: from '${imp.module}'`)
      })
      parts.push('')
    }

    if (exports.length > 0) {
      parts.push('## Exports')
      exports.forEach(exp => {
        parts.push(`- Line ${exp.line}: ${exp.type} ${exp.name}`)
      })
      parts.push('')
    }

    if (classes.length > 0) {
      parts.push('## Classes')
      classes.forEach(cls => {
        parts.push(`- Line ${cls.line}: class ${cls.name}`)
        if (cls.methods.length > 0) {
          parts.push(`  Methods: ${cls.methods.join(', ')}`)
        }
      })
      parts.push('')
    }

    if (functions.length > 0) {
      parts.push('## Functions')
      functions.slice(0, 20).forEach(fn => {
        const prefix = fn.isAsync ? 'async ' : ''
        parts.push(`- Line ${fn.line}: ${prefix}${fn.name}()`)
      })
      if (functions.length > 20) {
        parts.push(`- ... and ${functions.length - 20} more functions`)
      }
      parts.push('')
    }

    if (interfaces.length > 0) {
      parts.push('## Interfaces')
      interfaces.forEach(intf => {
        parts.push(`- Line ${intf.line}: interface ${intf.name}`)
      })
      parts.push('')
    }

    if (types.length > 0) {
      parts.push('## Type Aliases')
      types.forEach(t => {
        parts.push(`- Line ${t.line}: type ${t.name}`)
      })
      parts.push('')
    }

    return parts.join('\n')
  }
}

const analyzer = new CodeAnalyzer()

const summarizeFileSchema = z.object({
  filePath: z.string().describe('Absolute path to the code file (TypeScript/JavaScript)'),
})

const analyzeDirectorySchema = z.object({
  directoryPath: z.string().describe('Absolute path to the directory'),
  pattern: z.string().optional().describe('File pattern to match (default: **/*.ts)'),
})

const server = new McpServer({
  name: 'code-summarizer',
  version: '1.0.0',
})

server.registerTool(
  'summarize_file',
  {
    description: 'Analyze and summarize a code file structure',
    inputSchema: summarizeFileSchema,
  },
  async args => {
    try {
      const summary = analyzer.analyzeTsFile(args.filePath)
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(summary, null, 2),
          },
        ],
      }
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error analyzing file: ${err}`,
          },
        ],
        isError: true,
      }
    }
  },
)

server.registerTool(
  'analyze_directory',
  {
    description: 'Analyze all code files in a directory',
    inputSchema: analyzeDirectorySchema,
  },
  async args => {
    try {
      const dirPath = args.directoryPath
      const pattern = args.pattern || '**/*.ts'
      const files = fs
        .readdirSync(dirPath, { recursive: true })
        .filter(f =>
          typeof f === 'string' && f.endsWith('.ts') && !f.includes('node_modules')
        )

      const summaries = files
        .slice(0, 10)
        .map(f => analyzer.analyzeTsFile(path.join(dirPath, String(f))))

      const totalCompressionRatio =
        summaries.reduce((sum, s) => sum + s.compressionRatio, 0) /
        summaries.length

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                dirPath,
                filesAnalyzed: summaries.length,
                totalOriginalSize: summaries.reduce(
                  (sum, s) => sum + s.originalSize,
                  0
                ),
                totalSummarySize: summaries.reduce(
                  (sum, s) => sum + s.summarySize,
                  0
                ),
                avgCompressionRatio: totalCompressionRatio,
                files: summaries,
              },
              null,
              2
            ),
          },
        ],
      }
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error analyzing directory: ${err}`,
          },
        ],
        isError: true,
      }
    }
  },
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Code Summarizer MCP server running on stdio')
}

main().catch(console.error)
