import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getOriginalCwd } from '../../bootstrap/state.js'
import { logForDebugging } from '../../utils/debug.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import { recordSessionTimelineEntry } from './sessionTimeline.js'

export type ToolMemoryEntry = {
  id: string
  source: 'tool' | 'assistant' | 'fact'
  name: string
  ok: boolean
  args: string
  summary: string
  detail?: string
  projectPath: string
  createdAt: string
}

export type ToolMemoryStore = {
  version: 1
  nextId: number
  updatedAt: string | null
  entries: ToolMemoryEntry[]
}

const TOOL_MEMORY_LIMIT = 48
const PROMPT_ENTRY_LIMIT = 28
const PROMPT_CHAR_BUDGET = 12_000
const SUMMARY_MAX_CHARS = 1_000
const DETAIL_MAX_CHARS = 3_000
const ARGS_MAX_CHARS = 260

function memoryPath(): string {
  return join(getClaudeConfigHomeDir(), 'memory', 'tool-memory.json')
}

function emptyStore(): ToolMemoryStore {
  return { version: 1, nextId: 1, updatedAt: null, entries: [] }
}

function cleanString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeEntry(value: unknown): ToolMemoryEntry | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const id = cleanString(raw.id)
  const name = cleanString(raw.name)
  const summary = cleanString(raw.summary)
  if (!id || !name || !summary) return null
  return {
    id,
    source:
      raw.source === 'assistant' || raw.source === 'fact' ? raw.source : 'tool',
    name,
    ok: raw.ok !== false,
    args: cleanString(raw.args) ?? '{}',
    summary,
    detail: cleanString(raw.detail),
    projectPath: cleanString(raw.projectPath) ?? getOriginalCwd(),
    createdAt: cleanString(raw.createdAt) ?? new Date(0).toISOString(),
  }
}

function normalizeStore(value: unknown): ToolMemoryStore {
  if (!value || typeof value !== 'object') return emptyStore()
  const raw = value as Record<string, unknown>
  const entries = Array.isArray(raw.entries)
    ? raw.entries
        .map(normalizeEntry)
        .filter((entry): entry is ToolMemoryEntry => Boolean(entry))
        .slice(-TOOL_MEMORY_LIMIT)
    : []
  const maxId = entries.reduce(
    (max, entry) => Math.max(max, Number(entry.id.replace(/^toolmem-/, '')) || 0),
    0,
  )
  return {
    version: 1,
    nextId:
      typeof raw.nextId === 'number' && Number.isFinite(raw.nextId)
        ? Math.max(raw.nextId, maxId + 1)
        : maxId + 1,
    updatedAt: cleanString(raw.updatedAt) ?? null,
    entries,
  }
}

async function loadStore(): Promise<ToolMemoryStore> {
  try {
    return normalizeStore(JSON.parse(await readFile(memoryPath(), 'utf8')))
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return emptyStore()
    }
    logForDebugging(`Failed to load tool memory: ${error}`)
    return emptyStore()
  }
}

async function saveStore(store: ToolMemoryStore): Promise<void> {
  await mkdir(join(getClaudeConfigHomeDir(), 'memory'), { recursive: true })
  await writeFile(memoryPath(), JSON.stringify(store, null, 2), 'utf8')
}

function truncate(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars - 3)}...`
}

function compactJson(value: unknown, maxChars: number): string {
  try {
    return truncate(jsonStringify(value), maxChars)
  } catch {
    return '{}'
  }
}

function normalizeLines(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !/^[+-]{3}\s/.test(line))
}

function isLowSignalAssistantOutput(output: string): boolean {
  return (
    /^(done|ok|okay|complete|completed|fixed|updated|implemented)\.?$/i.test(output.trim()) ||
    /^Tool budget exhausted before final assistant answer/i.test(output)
  )
}

function isLowSignalToolFailure(name: string, ok: boolean, output: string): boolean {
  return (
    !ok &&
    name === 'Bash' &&
    /permission denied|policy blocked|protected path/i.test(output)
  )
}

function summarizeOutput(output: string): string {
  const lines = normalizeLines(output)
  const selected = lines.slice(0, 14).join(' ; ') || 'no output'
  return truncate(selected.replace(/\s+/g, ' '), SUMMARY_MAX_CHARS)
}

function summarizeDetail(output: string): string | undefined {
  const detail = normalizeLines(output).slice(0, 40).join('\n').trim()
  return detail ? truncate(detail, DETAIL_MAX_CHARS) : undefined
}

async function appendEntry(
  partial: Omit<ToolMemoryEntry, 'id' | 'projectPath' | 'createdAt'>,
): Promise<ToolMemoryEntry | null> {
  const store = await loadStore()
  const now = new Date().toISOString()
  const entry: ToolMemoryEntry = {
    ...partial,
    id: `toolmem-${store.nextId}`,
    projectPath: getOriginalCwd(),
    createdAt: now,
  }
  store.nextId += 1
  store.entries.push(entry)
  store.entries = store.entries.slice(-TOOL_MEMORY_LIMIT)
  store.updatedAt = now
  await saveStore(store)
  void recordSessionTimelineEntry({
    kind: partial.source === 'assistant' ? 'assistant' : 'tool',
    status: partial.ok ? 'ok' : 'failed',
    summary: `${partial.name}: ${partial.summary}`,
  })
  return entry
}

export async function recordToolMemory(args: {
  name: string
  input: unknown
  output: string
  ok: boolean
}): Promise<ToolMemoryEntry | null> {
  if (isLowSignalToolFailure(args.name, args.ok, args.output)) return null
  return appendEntry({
    source: 'tool',
    name: args.name,
    ok: args.ok,
    args: compactJson(args.input ?? {}, ARGS_MAX_CHARS),
    summary: summarizeOutput(args.output),
    detail: summarizeDetail(args.output),
  })
}

export async function recordAssistantMemory(output: string): Promise<ToolMemoryEntry | null> {
  if (!output.trim() || isLowSignalAssistantOutput(output)) return null
  return appendEntry({
    source: 'assistant',
    name: 'assistant',
    ok: true,
    args: '{}',
    summary: summarizeOutput(output),
    detail: summarizeDetail(output),
  })
}

export async function formatToolMemoryPromptSummary(): Promise<string | null> {
  const store = await loadStore()
  const projectPath = getOriginalCwd()
  const entries = store.entries
    .filter(entry => entry.projectPath === projectPath)
    .slice(-PROMPT_ENTRY_LIMIT)
    .reverse()
  if (!entries.length) return null

  const lines: string[] = []
  let usedChars = 0
  for (const entry of entries) {
    const status = entry.ok ? 'ok' : 'failed'
    const args = entry.args && entry.args !== '{}' ? ` args=${entry.args}` : ''
    const detail = entry.detail ? `\n  evidence=${entry.detail}` : ''
    const line = `- ${entry.name} ${status}${args}: ${entry.summary}${detail}`
    if (usedChars + line.length > PROMPT_CHAR_BUDGET && lines.length > 0) break
    lines.push(line)
    usedChars += line.length
  }
  return lines.reverse().join('\n')
}

export async function formatToolMemoryStatus(): Promise<string> {
  const store = await loadStore()
  const projectPath = getOriginalCwd()
  const entries = store.entries.filter(entry => entry.projectPath === projectPath)
  if (!entries.length) return 'tool memory\nnone'
  return [
    'tool memory',
    ...entries.slice(-PROMPT_ENTRY_LIMIT).map(entry => {
      const status = entry.ok ? 'ok' : 'failed'
      return `${entry.id} ${entry.name} ${status}: ${entry.summary}`
    }),
  ].join('\n')
}
