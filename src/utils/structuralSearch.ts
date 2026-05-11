import { execFileNoThrowWithCwd } from './execFileNoThrow.js'
import { findExecutable } from './findExecutable.js'

export type StructuralSearchOptions = {
  root: string
  pattern: string
  language?: string
  glob?: string
  globs?: string[]
  limit: number
  offset: number
  abortSignal: AbortSignal
}

export type StructuralSearchMatch = {
  path: string
  line: number
  text: string
}

type AstGrepJsonMatch = {
  file?: string
  range?: {
    start?: {
      line?: number
    }
  }
  lines?: string
  text?: string
}

async function structuralSearchCommand(): Promise<string | null> {
  const astGrep = findExecutable('ast-grep', [])
  if (astGrep.cmd !== 'ast-grep') return astGrep.cmd

  const sg = findExecutable('sg', [])
  if (sg.cmd !== 'sg') {
    const version = await execFileNoThrowWithCwd(sg.cmd, ['--version'], {
      timeout: 2_000,
      preserveOutputOnError: true,
    })
    const text = `${version.stdout}\n${version.stderr}`.toLowerCase()
    if (text.includes('ast-grep')) return sg.cmd
  }

  return null
}

function parseAstGrepJson(stdout: string): StructuralSearchMatch[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return []
  }

  const rawMatches = Array.isArray(parsed) ? parsed : [parsed]
  const matches: StructuralSearchMatch[] = []
  for (const raw of rawMatches) {
    if (raw === null || typeof raw !== 'object') continue
    const match = raw as AstGrepJsonMatch
    if (typeof match.file !== 'string') continue
    const line = match.range?.start?.line
    matches.push({
      path: match.file,
      line: typeof line === 'number' ? line + 1 : 1,
      text: (match.lines ?? match.text ?? '').split(/\r?\n/, 1)[0] ?? '',
    })
  }
  return matches
}

export async function searchWithAstGrep(
  options: StructuralSearchOptions,
): Promise<{
  matches: StructuralSearchMatch[]
  unavailable?: string
  appliedLimit?: number
}> {
  const command = await structuralSearchCommand()
  if (!command) {
    return {
      matches: [],
      unavailable:
        'Structural search requires ast-grep (`sg` or `ast-grep`) on PATH.',
    }
  }

  const args = ['--json', '-p', options.pattern]
  if (options.language) args.push('-l', options.language)
  for (const globPattern of options.globs ?? []) {
    args.push('--globs', globPattern)
  }
  if (options.glob) args.push('--globs', options.glob)
  args.push(options.root)

  const result = await execFileNoThrowWithCwd(command, args, {
    cwd: options.root,
    abortSignal: options.abortSignal,
    timeout: 20_000,
    maxBuffer: 2_000_000,
  })
  if (result.code !== 0 && !result.stdout.trim()) {
    return { matches: [], unavailable: result.stderr || result.error }
  }

  const matches = parseAstGrepJson(result.stdout)
  const end = options.limit === 0 ? undefined : options.offset + options.limit
  return {
    matches: matches.slice(options.offset, end),
    ...(options.limit !== 0 && matches.length - options.offset > options.limit && {
      appliedLimit: options.limit,
    }),
  }
}
