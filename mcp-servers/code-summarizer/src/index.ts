#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import * as fs from 'fs'
import * as path from 'path'

interface Annotation {
  line: number
  tag: 'TODO' | 'FIXME' | 'HACK' | 'BUG'
  text: string
}

interface CodeImport {
  module: string
  line: number
  kind: 'import' | 'export' | 'require' | 'dynamic-import'
  isTypeOnly: boolean
}

interface ExportedSymbol {
  name: string
  line: number
  type: string
}

interface CodeFunction {
  name: string
  line: number
  isAsync: boolean
}

interface CodeClass {
  name: string
  line: number
  methods: string[]
}

interface CodeSummary {
  filePath: string
  fileSize: number
  lineCount: number
  nonBlankLineCount: number
  exports: ExportedSymbol[]
  imports: CodeImport[]
  functions: CodeFunction[]
  classes: CodeClass[]
  interfaces: Array<{ name: string; line: number }>
  types: Array<{ name: string; line: number }>
  enums: Array<{ name: string; line: number }>
  annotations: Annotation[]
  summary: string
  originalSize: number
  summarySize: number
  compressionRatio: number
}

interface DirectoryAnalysisResult {
  dirPath: string
  filesAnalyzed: number
  filesMatched: number
  filesReturned: number
  pattern: string
  maxFiles: number
  maxDepth: number
  totalOriginalSize: number
  totalSummarySize: number
  avgCompressionRatio: number
  totalFunctions: number
  totalClasses: number
  totalImports: number
  files: CodeSummary[]
}

interface SearchMatch {
  filePath: string
  line: number
  column: number
  snippet: string
}

interface DependencyEdge {
  from: string
  to: string
  module: string
  isExternal: boolean
}

class CodeAnalyzer {
  analyzeCodeFile(filePath: string): CodeSummary {
    const content = fs.readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')

    const summaryPayload = this.generateSummary(content, lines, filePath)
    const originalSize = content.length
    const summarySize = summaryPayload.summary.length
    const compressionRatio = originalSize > 0 ? 1 - summarySize / originalSize : 0

    return {
      ...summaryPayload,
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
    const enums = this.extractEnums(lines)
    const annotations = this.extractAnnotations(lines)

    const summaryText = this.buildSummaryText(
      filePath,
      exports,
      imports,
      functions,
      classes,
      interfaces,
      types,
      enums,
      annotations
    )

    return {
      filePath,
      fileSize: content.length,
      lineCount: lines.length,
      nonBlankLineCount: lines.filter(line => line.trim().length > 0).length,
      exports,
      imports,
      functions,
      classes,
      interfaces,
      types,
      enums,
      annotations,
      summary: summaryText,
    }
  }

  private extractExports(lines: string[]): ExportedSymbol[] {
    return lines
      .map((line, idx) => {
        const match = line.match(
          /(?:^|\s)export\s+(?:default\s+)?(async\s+function|function|class|interface|type|enum|const|let|var)\s+([A-Za-z_$][\w$]*)/
        )

        if (match) {
          return {
            name: match[2],
            line: idx + 1,
            type: match[1],
          }
        }

        const namedExportMatch = line.match(
          /(?:^|\s)export\s*\{[^}]*\}\s+from\s+['"][^'"]+['"]/,
        )
        if (!namedExportMatch) {
          return null
        }

        return {
          name: 'named-export',
          line: idx + 1,
          type: 'export',
        }
      })
      .filter((value): value is ExportedSymbol => value !== null)
  }

  private extractImports(lines: string[]): CodeImport[] {
    return lines
      .map((line, idx) => {
        const trimmed = line.trim()
        const typeOnly = /^\s*import\s+type\b/.test(line) || /\btype\s+\{/.test(line)

        const importMatch = trimmed.match(
          /^(?:import)\s+(?:type\s+)?(?:[^'"]+)\s+from\s+['"]([^'"]+)['"]/
        )
        if (importMatch) {
          return {
            module: importMatch[1],
            line: idx + 1,
            kind: 'import',
            isTypeOnly: typeOnly,
          }
        }

        const sideEffectImportMatch = trimmed.match(/^(?:import)\s+['"]([^'"]+)['"]/)
        if (sideEffectImportMatch) {
          return {
            module: sideEffectImportMatch[1],
            line: idx + 1,
            kind: 'import',
            isTypeOnly: false,
          }
        }

        const exportMatch = trimmed.match(
          /^(?:export)\s+(?:type\s+)?\{[^}]*\}\s+from\s+['"]([^'"]+)['"]/
        )
        if (exportMatch) {
          return {
            module: exportMatch[1],
            line: idx + 1,
            kind: 'export',
            isTypeOnly: typeOnly,
          }
        }

        const exportStarMatch = trimmed.match(
          /^(?:export)\s+\*\s+from\s+['"]([^'"]+)['"]/
        )
        if (exportStarMatch) {
          return {
            module: exportStarMatch[1],
            line: idx + 1,
            kind: 'export',
            isTypeOnly: false,
          }
        }

        const requireMatch = trimmed.match(
          /^(?:const|let|var)\s+[^=]+\=\s*require\(\s*['"]([^'"]+)['"]\s*\)/
        )
        if (requireMatch) {
          return {
            module: requireMatch[1],
            line: idx + 1,
            kind: 'require',
            isTypeOnly: false,
          }
        }

        const dynamicImportMatch = trimmed.match(
          /^import\(\s*['"]([^'"]+)['"]\s*\)/
        )
        if (dynamicImportMatch) {
          return {
            module: dynamicImportMatch[1],
            line: idx + 1,
            kind: 'dynamic-import',
            isTypeOnly: false,
          }
        }

        return null
      })
      .filter((value): value is CodeImport => value !== null)
  }

  private extractFunctions(lines: string[]): CodeFunction[] {
    return lines
      .map((line, idx) => {
        const functionMatch = line.match(
          /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/,
        )
        if (functionMatch) {
          return {
            name: functionMatch[1],
            line: idx + 1,
            isAsync: functionMatch[0].includes('async'),
          }
        }

        const constFnMatch = line.match(
          /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/
        )
        if (constFnMatch) {
          return {
            name: constFnMatch[1],
            line: idx + 1,
            isAsync: line.includes('async'),
          }
        }

        return null
      })
      .filter((value): value is CodeFunction => value !== null)
  }

  private extractClasses(lines: string[]): CodeClass[] {
    const classes: CodeClass[] = []
    let currentClass: CodeClass | null = null
    let braceDepth = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const classMatch = line.match(/^\s*(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/)
      if (classMatch) {
        if (currentClass) {
          classes.push(currentClass)
        }
        currentClass = {
          name: classMatch[1],
          line: i + 1,
          methods: [],
        }
        braceDepth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length
        continue
      }

      if (!currentClass) {
        continue
      }

      const methodMatch = line.match(
        /^\s*(?:public|private|protected|static|async\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*(?:<[^>]+>\s*)?\([^)]*\)\s*[:{]/,
      )
      if (methodMatch && methodMatch[1] !== 'if' && methodMatch[1] !== 'for' && methodMatch[1] !== 'while') {
        currentClass.methods.push(methodMatch[1])
      }

      const opens = (line.match(/{/g) || []).length
      const closes = (line.match(/}/g) || []).length
      braceDepth += opens - closes

      if (braceDepth <= 0 && i > currentClass.line - 1) {
        classes.push(currentClass)
        currentClass = null
        braceDepth = 0
      }
    }

    if (currentClass) {
      classes.push(currentClass)
    }

    return classes
  }

  private extractInterfaces(lines: string[]): Array<{ name: string; line: number }> {
    return lines
      .map((line, idx) => {
        const match = line.match(/^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/)
        if (!match) {
          return null
        }
        return {
          name: match[1],
          line: idx + 1,
        }
      })
      .filter((value): value is { name: string; line: number } => value !== null)
  }

  private extractTypes(lines: string[]): Array<{ name: string; line: number }> {
    return lines
      .map((line, idx) => {
        const match = line.match(/^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/)
        if (!match) {
          return null
        }
        return {
          name: match[1],
          line: idx + 1,
        }
      })
      .filter((value): value is { name: string; line: number } => value !== null)
  }

  private extractEnums(lines: string[]): Array<{ name: string; line: number }> {
    return lines
      .map((line, idx) => {
        const match = line.match(/^\s*(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)/)
        if (!match) {
          return null
        }
        return {
          name: match[1],
          line: idx + 1,
        }
      })
      .filter((value): value is { name: string; line: number } => value !== null)
  }

  private extractAnnotations(lines: string[]): Annotation[] {
    const tags = ['TODO', 'FIXME', 'HACK', 'BUG'] as const
    return lines
      .map((line, idx) => {
        const match = line.match(/(TODO|FIXME|HACK|BUG)\b\s*:?(.*)/i)
        if (!match) {
          return null
        }
        const tag = match[1].toUpperCase() as Annotation['tag']
        if (!tags.includes(tag)) {
          return null
        }
        return {
          line: idx + 1,
          tag,
          text: match[2].trim(),
        }
      })
      .filter((value): value is Annotation => value !== null)
  }

  private buildSummaryText(
    filePath: string,
    exports: ExportedSymbol[],
    imports: CodeImport[],
    functions: CodeFunction[],
    classes: CodeClass[],
    interfaces: Array<{ name: string; line: number }>,
    types: Array<{ name: string; line: number }>,
    enums: Array<{ name: string; line: number }>,
    annotations: Annotation[]
  ): string {
    const externalImports = imports.filter(imp => !isRelativeImport(imp.module)).length

    const parts: string[] = [
      `# ${path.basename(filePath)}`,
      '',
      `- Line count: ${imports.length + functions.length + classes.length} symbols discovered`,
      `- Functions: ${functions.length}`,
      `- Classes: ${classes.length}`,
      `- Imports: ${imports.length} (external: ${externalImports})`,
      '',
    ]

    if (interfaces.length > 0) {
      parts.push('## Interfaces')
      interfaces.forEach(intf => {
        parts.push(`- Line ${intf.line}: interface ${intf.name}`)
      })
      parts.push('')
    }

    if (enums.length > 0) {
      parts.push('## Enums')
      enums.forEach(e => {
        parts.push(`- Line ${e.line}: enum ${e.name}`)
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
        parts.push(`- ... and ${functions.length - 20} more`)
      }
      parts.push('')
    }

    if (imports.length > 0) {
      parts.push('## Imports')
      imports.slice(0, 20).forEach(imp => {
        parts.push(`- Line ${imp.line}: [${imp.kind}] ${imp.module}`)
      })
      if (imports.length > 20) {
        parts.push(`- ... and ${imports.length - 20} more`)
      }
      parts.push('')
    }

    if (exports.length > 0) {
      parts.push('## Exports')
      exports.forEach(exp => {
        parts.push(`- Line ${exp.line}: ${exp.type} ${exp.name}`)
      })
      parts.push('')
    }

    if (types.length > 0) {
      parts.push('## Types')
      types.forEach(typeAlias => {
        parts.push(`- Line ${typeAlias.line}: type ${typeAlias.name}`)
      })
      parts.push('')
    }

    if (annotations.length > 0) {
      parts.push('## Annotations')
      annotations.slice(0, 20).forEach(note => {
        parts.push(`- Line ${note.line}: ${note.tag}: ${note.text}`)
      })
      if (annotations.length > 20) {
        parts.push(`- ... and ${annotations.length - 20} more`)
      }
      parts.push('')
    }

    return parts.join('\n')
  }
}

const analyzer = new CodeAnalyzer()

function ensureAbsolutePath(filePath: string, label: string): string {
  if (!path.isAbsolute(filePath)) {
    throw new Error(`${label} must be absolute path`)
  }
  return filePath
}

function ensureFile(filePath: string, label: string): void {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} does not exist: ${filePath}`)
  }
  const stats = fs.statSync(filePath)
  if (!stats.isFile()) {
    throw new Error(`${label} must be a file: ${filePath}`)
  }
}

function ensureDirectory(dirPath: string, label: string): void {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`${label} does not exist: ${dirPath}`)
  }
  const stats = fs.statSync(dirPath)
  if (!stats.isDirectory()) {
    throw new Error(`${label} must be a directory: ${dirPath}`)
  }
}

function isRelativeImport(moduleName: string): boolean {
  return (
    moduleName.startsWith('./') ||
    moduleName.startsWith('../') ||
    moduleName.startsWith('/')
  )
}

function parseIntInput(
  value: number | undefined,
  label: string,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback
  }
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
  return value
}

function collectFiles(
  rootPath: string,
  maxDepth: number,
  ignored: Set<string>,
): string[] {
  const files: string[] = []
  const stack: Array<{ currentPath: string; depth: number }> = [
    { currentPath: rootPath, depth: 0 },
  ]

  while (stack.length > 0) {
    const { currentPath, depth } = stack.pop()!
    const stats = fs.statSync(currentPath)

    if (stats.isSymbolicLink()) {
      continue
    }

    if (stats.isDirectory()) {
      if (depth >= maxDepth) {
        continue
      }
      const entries = fs.readdirSync(currentPath, { withFileTypes: true })
      for (const entry of entries) {
        if (ignored.has(entry.name)) {
          continue
        }
        const childPath = path.join(currentPath, entry.name)
        stack.push({ currentPath: childPath, depth: depth + 1 })
      }
      continue
    }

    if (stats.isFile()) {
      files.push(currentPath)
    }
  }

  return files
}

function globToRegExp(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, '/')
  let regex = ''

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i]
    const next = normalized[i + 1]

    if (char === '*' && next === '*') {
      const afterNext = normalized[i + 2]
      if (afterNext === '/') {
        regex += '(?:.*/)?'
        i += 2
      } else {
        regex += '.*'
        i += 1
      }
      continue
    }

    if (char === '*') {
      regex += '[^/]*'
      continue
    }

    if (char === '?') {
      regex += '[^/]'
      continue
    }

    if (char === '{') {
      const end = normalized.indexOf('}', i)
      if (end !== -1) {
        const options = normalized
          .slice(i + 1, end)
          .split(',')
          .map(option => option.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        regex += `(?:${options.join('|')})`
        i = end
        continue
      }
    }

    if ('\\.[]{}()+-^$|'.includes(char)) {
      regex += `\\${char}`
      continue
    }

    regex += char
  }

  return new RegExp(`^${regex}$`)
}

function matchesPattern(filePath: string, rootPath: string, pattern: string): boolean {
  const normalizedRelativePath = path.relative(rootPath, filePath).replace(/\\/g, '/')
  const normalizedPattern = pattern.replace(/\\/g, '/')
  const regex = globToRegExp(normalizedPattern)
  return regex.test(normalizedRelativePath)
}

function resolveLocalImport(fromPath: string, moduleName: string): string | null {
  if (!isRelativeImport(moduleName)) {
    return null
  }

  const basePath = path.resolve(path.dirname(fromPath), moduleName)
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.d.ts']

  const candidates = [
    basePath,
    ...extensions.map(ext => `${basePath}${ext}`),
    ...['index.ts', 'index.tsx', 'index.js', 'index.jsx'].map(suffix => path.join(basePath, suffix)),
  ]

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue
    }

    const stats = fs.statSync(candidate)
    if (stats.isFile()) {
      return candidate
    }
  }

  return null
}

function normalizeSchemaDefaults<T>(maybe: T | undefined, fallback: T): T {
  return maybe === undefined ? fallback : maybe
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildRegex(query: string, isRegex: boolean): RegExp {
  if (query.length === 0) {
    throw new Error('query cannot be empty')
  }

  if (isRegex) {
    return new RegExp(query, 'g')
  }

  return new RegExp(escapeRegExp(query), 'g')
}

const summarizeFileSchema = z.object({
  filePath: z.string().describe('Absolute path to a TypeScript/JavaScript file'),
})

const analyzeDirectorySchema = z.object({
  directoryPath: z.string().describe('Absolute path to the directory'),
  pattern: z
    .string()
    .optional()
    .describe('File pattern to match (default: **/*.{ts,tsx,js,jsx})'),
  maxFiles: z.number().int().positive().max(500).optional().describe('Max files to analyze (default: 50)'),
  maxDepth: z.number().int().nonnegative().max(12).optional().describe('Directory depth to scan (default: 12)'),
  skipNodeModules: z
    .boolean()
    .optional()
    .describe('Skip node_modules and .git directories (default: true)'),
})

const searchCodeSchema = z.object({
  searchPath: z.string().describe('Absolute file or directory path'),
  query: z.string().min(1).describe('Text or regex search query'),
  pattern: z.string().optional().describe('File pattern to match when searching directories'),
  maxResults: z
    .number()
    .int()
    .positive()
    .max(2000)
    .optional()
    .describe('Max matches to return (default: 100)'),
  maxDepth: z
    .number()
    .int()
    .nonnegative()
    .max(12)
    .optional()
    .describe('Directory depth to scan (default: 12)'),
  isRegex: z.boolean().optional().describe('Treat query as regex'),
  caseSensitive: z.boolean().optional().describe('Case sensitive search'),
})

const relatedFilesSchema = z.object({
  entryPath: z.string().describe('Absolute path to the entry file'),
  maxDepth: z
    .number()
    .int()
    .nonnegative()
    .max(10)
    .optional()
    .describe('Max import-depth to traverse (default: 4)'),
  includeExternal: z.boolean().optional().describe('Include external (npm) imports in graph'),
})

const server = new McpServer({
  name: 'code-summarizer',
  version: '1.1.0',
})

server.registerTool(
  'summarize_file',
  {
    description: 'Analyze and summarize a code file structure',
    inputSchema: summarizeFileSchema,
  },
  async ({ filePath }: { filePath: string }) => {
    try {
      const absoluteFilePath = ensureAbsolutePath(filePath, 'filePath')
      ensureFile(absoluteFilePath, 'filePath')

      const summary = analyzer.analyzeCodeFile(absoluteFilePath)
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
    description: 'Analyze code files in a directory with optional pattern and limit',
    inputSchema: analyzeDirectorySchema,
  },
  async args => {
    try {
      const directoryPath = ensureAbsolutePath(args.directoryPath, 'directoryPath')
      ensureDirectory(directoryPath, 'directoryPath')

      const pattern = normalizeSchemaDefaults(args.pattern, '**/*.{ts,tsx,js,jsx}')
      const maxFiles = parseIntInput(normalizeSchemaDefaults(args.maxFiles, 50), 'maxFiles', 50)
      const maxDepth = normalizeSchemaDefaults(args.maxDepth, 12)
      const skipNodeModules = normalizeSchemaDefaults(args.skipNodeModules, true)
      const ignored = new Set<string>(['.git'])
      if (skipNodeModules) {
        ignored.add('node_modules')
      }

      const allFiles = collectFiles(directoryPath, maxDepth, ignored)
      const matchedFiles = allFiles.filter(filePath =>
        matchesPattern(filePath, directoryPath, pattern),
      )
      const selectedFiles = matchedFiles.slice(0, maxFiles)

      const fileSummaries = selectedFiles.map(filePath => analyzer.analyzeCodeFile(filePath))

      const totalOriginalSize = fileSummaries.reduce((sum, current) => sum + current.originalSize, 0)
      const totalSummarySize = fileSummaries.reduce((sum, current) => sum + current.summarySize, 0)
      const avgCompressionRatio =
        fileSummaries.length > 0
          ? fileSummaries.reduce((sum, current) => sum + current.compressionRatio, 0) /
            fileSummaries.length
          : 0
      const totalFunctions = fileSummaries.reduce((sum, current) => sum + current.functions.length, 0)
      const totalClasses = fileSummaries.reduce((sum, current) => sum + current.classes.length, 0)
      const totalImports = fileSummaries.reduce((sum, current) => sum + current.imports.length, 0)

      const payload: DirectoryAnalysisResult = {
        dirPath: directoryPath,
        filesAnalyzed: selectedFiles.length,
        filesMatched: matchedFiles.length,
        filesReturned: fileSummaries.length,
        pattern,
        maxFiles,
        maxDepth,
        totalOriginalSize,
        totalSummarySize,
        avgCompressionRatio,
        totalFunctions,
        totalClasses,
        totalImports,
        files: fileSummaries,
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(payload, null, 2),
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

server.registerTool(
  'search_code',
  {
    description: 'Search symbol names or text across a file or directory',
    inputSchema: searchCodeSchema,
  },
  async args => {
    try {
      const searchPath = ensureAbsolutePath(args.searchPath, 'searchPath')
      const query = args.query.trim()
      const pattern = normalizeSchemaDefaults(
        args.pattern,
        '**/*.{ts,tsx,js,jsx}',
      )
      const maxResults = normalizeSchemaDefaults(args.maxResults, 100)
      const maxDepth = normalizeSchemaDefaults(args.maxDepth, 12)
      const caseSensitive = normalizeSchemaDefaults(args.caseSensitive, false)
      const isRegex = normalizeSchemaDefaults(args.isRegex, false)
      const ignored = new Set<string>(['.git', 'node_modules'])

      const stat = fs.statSync(searchPath)

      let filesToScan: string[]
      if (stat.isFile()) {
        filesToScan = [searchPath]
      } else if (stat.isDirectory()) {
        filesToScan = collectFiles(searchPath, maxDepth, ignored).filter(filePath =>
          matchesPattern(filePath, searchPath, pattern)
        )
      } else {
        throw new Error(`searchPath must be file or directory: ${searchPath}`)
      }

      const baseRegex = buildRegex(query, isRegex)
      const regex = caseSensitive
        ? baseRegex
        : new RegExp(baseRegex.source, `${baseRegex.flags}i`)

      const hits: SearchMatch[] = []
      for (const filePath of filesToScan) {
        if (hits.length >= maxResults) {
          break
        }

        let text = ''
        try {
          text = fs.readFileSync(filePath, 'utf-8')
        } catch {
          continue
        }

        const lines = text.split('\n')
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          const match = regex.exec(line)
          if (match) {
            hits.push({
              filePath,
              line: i + 1,
              column: (match.index || 0) + 1,
              snippet: line.trim(),
            })
          }
          regex.lastIndex = 0
          if (hits.length >= maxResults) {
            break
          }
        }
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                query,
                filesScanned: filesToScan.length,
                matchesFound: hits.length,
                maxResults,
                isRegex,
                caseSensitive,
                results: hits,
              },
              null,
              2,
            ),
          },
        ],
      }
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error searching code: ${err}`,
          },
        ],
        isError: true,
      }
    }
  },
)

server.registerTool(
  'find_related_files',
  {
    description: 'Follow local imports and build a dependency map from one file',
    inputSchema: relatedFilesSchema,
  },
  async args => {
    try {
      const entryPath = ensureAbsolutePath(args.entryPath, 'entryPath')
      ensureFile(entryPath, 'entryPath')
      const maxDepth = normalizeSchemaDefaults(args.maxDepth, 4)
      const includeExternal = normalizeSchemaDefaults(args.includeExternal, false)

      const visited = new Set<string>()
      const nodes = new Set<string>([entryPath])
      const edges: DependencyEdge[] = []
      const unresolved: string[] = []
      const queue: Array<{ filePath: string; depth: number }> = [
        { filePath: entryPath, depth: 0 },
      ]

      while (queue.length > 0) {
        const current = queue.shift()!
        if (visited.has(current.filePath) || current.depth > maxDepth) {
          continue
        }
        visited.add(current.filePath)

        const fileSummary = analyzer.analyzeCodeFile(current.filePath)
        for (const imp of fileSummary.imports) {
          const external = !isRelativeImport(imp.module)
          if (external && !includeExternal) {
            edges.push({
              from: current.filePath,
              to: imp.module,
              module: imp.module,
              isExternal: true,
            })
            continue
          }

          if (external && includeExternal) {
            edges.push({
              from: current.filePath,
              to: imp.module,
              module: imp.module,
              isExternal: true,
            })
            continue
          }

          const resolved = resolveLocalImport(current.filePath, imp.module)
          if (!resolved) {
            unresolved.push(imp.module)
            continue
          }

          edges.push({
            from: current.filePath,
            to: resolved,
            module: imp.module,
            isExternal: false,
          })
          nodes.add(resolved)
          queue.push({ filePath: resolved, depth: current.depth + 1 })
        }
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                entryPath,
                maxDepth,
                includeExternal,
                files: Array.from(nodes),
                edges,
                unresolvedImports: unresolved,
              },
              null,
              2,
            ),
          },
        ],
      }
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error building dependency map: ${err}`,
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
