import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getOriginalCwd, getSessionId } from '../../bootstrap/state.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { recordSessionTimelineEntry } from '../memory/sessionTimeline.js'

export type RatchetStatus = 'open' | 'planned' | 'fixed' | 'wontfix'

export type RatchetEntry = {
  id: string
  at: string
  updatedAt: string
  sessionId: string
  projectPath: string
  status: RatchetStatus
  failure: string
  impact?: string
  desiredBehavior?: string
  proposedHarnessFixes: string[]
  evidence: string[]
  tags: string[]
}

const ENTRY_LIMIT = 300

function ratchetDir(): string {
  return join(getClaudeConfigHomeDir(), 'harness')
}

function ledgerPath(): string {
  return join(ratchetDir(), 'failures.jsonl')
}

function normalizeText(value: string, maxChars = 1200): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxChars)
}

function splitList(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(',')
    .map(part => normalizeText(part, 160))
    .filter(Boolean)
    .slice(0, 12)
}

function parseEntry(line: string): RatchetEntry | null {
  try {
    const value = JSON.parse(line) as Partial<RatchetEntry>
    if (!value || typeof value.id !== 'string' || typeof value.failure !== 'string') {
      return null
    }
    return {
      id: value.id,
      at: typeof value.at === 'string' ? value.at : new Date().toISOString(),
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : value.at ?? new Date().toISOString(),
      sessionId: typeof value.sessionId === 'string' ? value.sessionId : getSessionId(),
      projectPath: typeof value.projectPath === 'string' ? value.projectPath : getOriginalCwd(),
      status: isRatchetStatus(value.status) ? value.status : 'open',
      failure: normalizeText(value.failure),
      impact: typeof value.impact === 'string' ? normalizeText(value.impact) : undefined,
      desiredBehavior:
        typeof value.desiredBehavior === 'string'
          ? normalizeText(value.desiredBehavior)
          : undefined,
      proposedHarnessFixes: Array.isArray(value.proposedHarnessFixes)
        ? value.proposedHarnessFixes
            .filter((item): item is string => typeof item === 'string')
            .map(item => normalizeText(item, 240))
            .filter(Boolean)
            .slice(0, 8)
        : [],
      evidence: Array.isArray(value.evidence)
        ? value.evidence
            .filter((item): item is string => typeof item === 'string')
            .map(item => normalizeText(item, 240))
            .filter(Boolean)
            .slice(0, 12)
        : [],
      tags: Array.isArray(value.tags)
        ? value.tags
            .filter((item): item is string => typeof item === 'string')
            .map(item => normalizeText(item, 60))
            .filter(Boolean)
            .slice(0, 12)
        : [],
    }
  } catch {
    return null
  }
}

function isRatchetStatus(value: unknown): value is RatchetStatus {
  return value === 'open' || value === 'planned' || value === 'fixed' || value === 'wontfix'
}

function defaultFixes(failure: string): string[] {
  const lower = failure.toLowerCase()
  const fixes = new Set<string>()
  if (lower.includes('handoff') || lower.includes('skill')) {
    fixes.add('Add a skill-chain finalizer test so requested post-actions cannot be dropped.')
  }
  if (lower.includes('goal') || lower.includes('continue') || lower.includes('loop')) {
    fixes.add('Add a goal-loop regression test that forces continuation until evidence proves completion.')
  }
  if (lower.includes('context') || lower.includes('compact') || lower.includes('forgot')) {
    fixes.add('Add compact checkpoint state with current objective, completed work, blockers, and next action.')
  }
  fixes.add('Add or update AGENTS.md/skill instruction only if this failure recurs without code enforcement.')
  fixes.add('Prefer a test, hook, or command-router guard that makes the failure mechanically hard to repeat.')
  return [...fixes].slice(0, 5)
}

export async function readRatchetEntries(): Promise<RatchetEntry[]> {
  try {
    const content = await readFile(ledgerPath(), 'utf8')
    return content
      .split(/\r?\n/)
      .filter(Boolean)
      .map(parseEntry)
      .filter((entry): entry is RatchetEntry => entry !== null)
      .slice(-ENTRY_LIMIT)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return []
    }
    throw error
  }
}

async function writeEntries(entries: RatchetEntry[]): Promise<void> {
  await mkdir(ratchetDir(), { recursive: true })
  await writeFile(
    ledgerPath(),
    `${entries.slice(-ENTRY_LIMIT).map(entry => JSON.stringify(entry)).join('\n')}\n`,
    'utf8',
  )
}

export async function addRatchetEntry(args: {
  failure: string
  impact?: string
  desiredBehavior?: string
  evidence?: string[]
  tags?: string[]
  proposedHarnessFixes?: string[]
}): Promise<RatchetEntry> {
  const failure = normalizeText(args.failure)
  if (!failure) throw new Error('Ratchet failure text is required')
  const now = new Date().toISOString()
  const entry: RatchetEntry = {
    id: `r-${randomUUID().slice(0, 8)}`,
    at: now,
    updatedAt: now,
    sessionId: getSessionId(),
    projectPath: getOriginalCwd(),
    status: 'open',
    failure,
    impact: args.impact ? normalizeText(args.impact) : undefined,
    desiredBehavior: args.desiredBehavior ? normalizeText(args.desiredBehavior) : undefined,
    proposedHarnessFixes: args.proposedHarnessFixes?.length
      ? args.proposedHarnessFixes.map(item => normalizeText(item, 240)).filter(Boolean).slice(0, 8)
      : defaultFixes(failure),
    evidence: args.evidence?.map(item => normalizeText(item, 240)).filter(Boolean).slice(0, 12) ?? [],
    tags: args.tags?.map(item => normalizeText(item, 60)).filter(Boolean).slice(0, 12) ?? [],
  }
  const entries = await readRatchetEntries()
  await writeEntries([...entries, entry])
  await recordSessionTimelineEntry({
    kind: 'harness',
    status: entry.status,
    summary: `Ratchet logged: ${entry.failure}`,
  })
  return entry
}

export async function updateRatchetStatus(
  id: string,
  status: RatchetStatus,
): Promise<RatchetEntry> {
  const entries = await readRatchetEntries()
  const index = entries.findIndex(entry => entry.id === id)
  if (index === -1) throw new Error(`Ratchet entry not found: ${id}`)
  const entry = {
    ...entries[index],
    status,
    updatedAt: new Date().toISOString(),
  }
  entries[index] = entry
  await writeEntries(entries)
  await recordSessionTimelineEntry({
    kind: 'harness',
    status,
    summary: `Ratchet ${status}: ${entry.failure}`,
  })
  return entry
}

export function parseRatchetAddArgs(args: string): {
  failure: string
  impact?: string
  desiredBehavior?: string
  evidence: string[]
  tags: string[]
} {
  const fields = new Map<string, string>()
  const remaining = args.replace(
    /\s+--(impact|desired|evidence|tags)\s+("[^"]*"|'[^']*'|\S+)/g,
    (_match, key: string, raw: string) => {
      fields.set(key, raw.replace(/^['"]|['"]$/g, ''))
      return ''
    },
  )
  return {
    failure: normalizeText(remaining),
    impact: fields.get('impact'),
    desiredBehavior: fields.get('desired'),
    evidence: splitList(fields.get('evidence')),
    tags: splitList(fields.get('tags')),
  }
}

export function formatRatchetEntry(entry: RatchetEntry): string {
  return [
    `${entry.id} ${entry.status} ${entry.failure}`,
    `at: ${entry.at}`,
    `desired: ${entry.desiredBehavior ?? 'not captured'}`,
    `impact: ${entry.impact ?? 'not captured'}`,
    `evidence: ${entry.evidence.length ? entry.evidence.join(', ') : 'none'}`,
    `tags: ${entry.tags.length ? entry.tags.join(', ') : 'none'}`,
    'proposed harness fixes:',
    ...entry.proposedHarnessFixes.map(fix => `- ${fix}`),
  ].join('\n')
}

export function formatRatchetList(entries: RatchetEntry[]): string {
  const projectPath = getOriginalCwd()
  const projectEntries = entries.filter(entry => entry.projectPath === projectPath)
  return [
    'harness ratchet',
    `ledger: ${ledgerPath()}`,
    ...(projectEntries.length
      ? projectEntries
          .slice(-20)
          .map(entry => `${entry.id} ${entry.status} ${entry.failure}`)
      : ['no ratchet entries for this project']),
  ].join('\n')
}
