import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execFileNoThrowWithCwd } from '../../utils/execFileNoThrow.js'
import { getOriginalCwd, getSessionId } from '../../bootstrap/state.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'

export type SessionTimelineEntry = {
  id: string
  at: string
  sessionId: string
  projectPath: string
  kind: 'goal' | 'tool' | 'assistant' | 'compact' | 'handoff' | 'commit' | 'resume' | 'harness'
  status: string
  summary: string
  refs: string[]
  continuity?: 'compact' | 'handoff' | 'resume'
}

type SessionTimelineStore = {
  version: 1
  nextId: number
  entries: SessionTimelineEntry[]
}

const TIMELINE_LIMIT = 300

function getTimelinePaths(configHomeDir = getClaudeConfigHomeDir()): {
  dir: string
  file: string
} {
  const dir = join(configHomeDir, 'sessions')
  return {
    dir,
    file: join(dir, 'timeline.json'),
  }
}

function emptyStore(): SessionTimelineStore {
  return { version: 1, nextId: 1, entries: [] }
}

function truncate(value: string, maxChars: number): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean.length <= maxChars ? clean : `${clean.slice(0, maxChars - 3)}...`
}

function extractRefs(value: string): string[] {
  return [
    ...new Set(
      value.match(/(?:#[0-9]+|[a-f0-9]{7,40}|[A-Z][A-Z0-9]+-\d+)/g) ?? [],
    ),
  ].slice(0, 12)
}

function normalizeStore(value: unknown): SessionTimelineStore {
  if (!value || typeof value !== 'object') return emptyStore()
  const raw = value as Record<string, unknown>
  const entries = Array.isArray(raw.entries)
    ? raw.entries
        .filter((entry): entry is SessionTimelineEntry => {
          if (!entry || typeof entry !== 'object') return false
          const candidate = entry as Record<string, unknown>
          return (
            typeof candidate.id === 'string' &&
            typeof candidate.at === 'string' &&
            typeof candidate.summary === 'string'
          )
        })
        .slice(-TIMELINE_LIMIT)
    : []
  const maxId = entries.reduce(
    (max, entry) => Math.max(max, Number(entry.id.replace(/^e/, '')) || 0),
    0,
  )
  return {
    version: 1,
    nextId:
      typeof raw.nextId === 'number' && Number.isFinite(raw.nextId)
        ? Math.max(raw.nextId, maxId + 1)
        : maxId + 1,
    entries,
  }
}

async function loadStore(configHomeDir = getClaudeConfigHomeDir()): Promise<SessionTimelineStore> {
  try {
    return normalizeStore(
      JSON.parse(await readFile(getTimelinePaths(configHomeDir).file, 'utf8')),
    )
  } catch {
    return emptyStore()
  }
}

async function saveStore(
  store: SessionTimelineStore,
  configHomeDir = getClaudeConfigHomeDir(),
): Promise<void> {
  const { dir, file } = getTimelinePaths(configHomeDir)
  await mkdir(dir, { recursive: true })
  await writeFile(file, JSON.stringify(store, null, 2), 'utf8')
}

export async function recordSessionTimelineEntry(args: {
  kind: SessionTimelineEntry['kind']
  status: string
  summary: string
  continuity?: SessionTimelineEntry['continuity']
}): Promise<SessionTimelineEntry> {
  const configHomeDir = getClaudeConfigHomeDir()
  const store = await loadStore(configHomeDir)
  const entry: SessionTimelineEntry = {
    id: `e${store.nextId}`,
    at: new Date().toISOString(),
    sessionId: getSessionId(),
    projectPath: getOriginalCwd(),
    kind: args.kind,
    status: args.status,
    summary: truncate(args.summary, 500),
    refs: extractRefs(args.summary),
    continuity: args.continuity,
  }
  store.nextId += 1
  store.entries.push(entry)
  store.entries = store.entries.slice(-TIMELINE_LIMIT)
  await saveStore(store, configHomeDir)
  return entry
}

async function recentCommits(): Promise<SessionTimelineEntry[]> {
  const { stdout } = await execFileNoThrowWithCwd(
    'git',
    ['log', '-5', '--date=iso-strict', '--pretty=format:%h%x09%cI%x09%s'],
    { cwd: getOriginalCwd(), preserveOutputOnError: false },
  )
  return stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      const [hash = '', at = '', subject = ''] = line.split('\t')
      const summary = `${hash} ${subject}`
      return {
        id: `c${index + 1}`,
        at,
        sessionId: getSessionId(),
        projectPath: getOriginalCwd(),
        kind: 'commit',
        status: 'complete',
        summary,
        refs: extractRefs(summary),
      } satisfies SessionTimelineEntry
    })
}

export async function formatSessionTimeline(entryId?: string): Promise<string> {
  const store = await loadStore()
  const projectPath = getOriginalCwd()
  const entries = [
    ...store.entries.filter(entry => entry.projectPath === projectPath),
    ...(await recentCommits()),
  ].sort((left, right) => left.at.localeCompare(right.at))
  if (entryId) {
    const entry = entries.find(candidate => candidate.id === entryId)
    if (!entry) {
      return [
        `timeline entry not found: ${entryId}`,
        'available:',
        ...entries.slice(-12).map(candidate => `  ${candidate.id} ${candidate.kind} ${candidate.summary}`),
      ].join('\n')
    }
    return [
      'timeline entry',
      `id: ${entry.id}`,
      `at: ${entry.at}`,
      `kind: ${entry.kind}`,
      `status: ${entry.status}`,
      `summary: ${entry.summary}`,
      `continuity: ${entry.continuity ?? 'none'}`,
      `refs: ${entry.refs.length ? entry.refs.join(' ') : 'none'}`,
    ].join('\n')
  }
  return [
    'timeline',
    `session ${getSessionId()}`,
    ...entries.slice(-30).map(entry =>
      `${entry.id} ${entry.at} ${entry.kind}/${entry.status} ${entry.summary}${entry.continuity ? ` lineage=${entry.continuity}` : ''}${entry.refs.length ? ` refs=${entry.refs.join(',')}` : ''}`,
    ),
    ...(entries.length ? [] : ['empty timeline']),
  ].join('\n')
}

export async function formatSessionTree(): Promise<string> {
  const store = await loadStore()
  const entries = store.entries.filter(
    entry => entry.projectPath === getOriginalCwd() && entry.continuity,
  )
  return [
    'session tree',
    `session ${getSessionId()}`,
    entries.length ? 'lineage:' : 'lineage: none',
    ...entries
      .slice(-20)
      .map(entry => `  ${entry.id} ${entry.at} ${entry.continuity} ${entry.status} ${entry.summary}`),
  ].join('\n')
}
