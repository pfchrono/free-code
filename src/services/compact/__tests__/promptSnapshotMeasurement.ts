/**
 * Prompt Snapshot Measurement
 *
 * Measures token deltas on real prompt-shaped inputs:
 * - current rendered system prompt from repo code
 * - dump-prompts JSONL captures in ~/.claude/dump-prompts or a provided file
 *
 * Usage:
 *   bun run src/services/compact/__tests__/promptSnapshotMeasurement.ts
 *   bun run src/services/compact/__tests__/promptSnapshotMeasurement.ts --model claude-sonnet-4-6
 *   bun run src/services/compact/__tests__/promptSnapshotMeasurement.ts --dump-jsonl C:\path\to\snapshot.jsonl
 *   bun run src/services/compact/__tests__/promptSnapshotMeasurement.ts --latest-dump
 */

import { readFile } from 'fs/promises'
import { join } from 'path'

if (typeof MACRO === 'undefined') {
  ;(globalThis as { MACRO?: Record<string, string> }).MACRO = {
    VERSION: 'dev',
    BUILD_TIME: new Date().toISOString(),
    PACKAGE_URL: 'claude-code-source-snapshot',
    FEEDBACK_CHANNEL: 'github',
  }
}

type JsonPrimitive = boolean | number | string | null
type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
type JsonObject = { [key: string]: JsonValue }

type EntryType = 'init' | 'system_update' | 'message' | 'response'

type DumpEntry = {
  type: EntryType
  timestamp?: string
  data?: JsonValue
}

type Measurement = {
  label: string
  originalTokens: number
  compactedTokens: number
  savedTokens: number
  savedPercent: number
}

function parseArgs(argv: string[]): {
  model: string
  dumpJsonlPath: string | null
  latestDump: boolean
} {
  let model = 'claude-sonnet-4-6'
  let dumpJsonlPath: string | null = null
  let latestDump = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--model' && argv[i + 1]) {
      model = argv[++i]!
      continue
    }
    if (arg === '--dump-jsonl' && argv[i + 1]) {
      dumpJsonlPath = argv[++i]!
      continue
    }
    if (arg === '--latest-dump') {
      latestDump = true
    }
  }

  return { model, dumpJsonlPath, latestDump }
}

function estimateTokens(value: JsonValue | string): number {
  return roughTokenCountEstimation(
    typeof value === 'string' ? value : jsonStringify(value),
  )
}

function toPercent(savedTokens: number, originalTokens: number): number {
  if (originalTokens <= 0) return 0
  return (savedTokens / originalTokens) * 100
}

function measure(label: string, original: JsonValue | string, compacted: JsonValue | string): Measurement {
  const originalTokens = estimateTokens(original)
  const compactedTokens = estimateTokens(compacted)
  const savedTokens = originalTokens - compactedTokens
  return {
    label,
    originalTokens,
    compactedTokens,
    savedTokens,
    savedPercent: toPercent(savedTokens, originalTokens),
  }
}

function isPlainObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function compactPromptSnapshotValue(value: JsonValue, keyHint?: string): JsonValue {
  if (typeof value === 'string') {
    return shouldCompactField(keyHint) ? compactCavemanText(value) : value
  }

  if (Array.isArray(value)) {
    return value.map(item => compactPromptSnapshotValue(item, keyHint))
  }

  if (!isPlainObject(value)) {
    return value
  }

  const result: JsonObject = {}
  for (const [key, child] of Object.entries(value)) {
    if (key === 'text' && typeof child === 'string') {
      result[key] = compactCavemanText(child)
      continue
    }
    if (key === 'content') {
      result[key] = compactContentField(child)
      continue
    }
    if (key === 'system') {
      result[key] = compactSystemField(child)
      continue
    }
    result[key] = compactPromptSnapshotValue(child, key)
  }
  return result
}

function compactSystemField(value: JsonValue): JsonValue {
  if (typeof value === 'string') {
    return compactCavemanText(value)
  }

  if (Array.isArray(value)) {
    return value.map(block => {
      if (!isPlainObject(block)) return block
      if (typeof block.text !== 'string') return block
      return {
        ...block,
        text: compactCavemanText(block.text),
      }
    })
  }

  return value
}

function compactContentField(value: JsonValue): JsonValue {
  if (typeof value === 'string') {
    return compactCavemanText(value)
  }

  if (!Array.isArray(value)) {
    return value
  }

  return value.map(block => {
    if (!isPlainObject(block)) return block
    if (block.type === 'text' && typeof block.text === 'string') {
      return {
        ...block,
        text: compactCavemanText(block.text),
      }
    }
    if (block.type === 'tool_result' && 'content' in block) {
      return {
        ...block,
        content: compactContentField(block.content as JsonValue),
      }
    }
    return block
  })
}

function shouldCompactField(keyHint?: string): boolean {
  return keyHint === 'system' || keyHint === 'text' || keyHint === 'content'
}

async function getLatestDumpPath(): Promise<string | null> {
  const dir = join(getClaudeConfigHomeDir(), 'dump-prompts')
  try {
    const { readdir } = await import('fs/promises')
    const files = await readdir(dir, { withFileTypes: true })
    const jsonlFiles = files
      .filter(entry => entry.isFile() && entry.name.endsWith('.jsonl'))
      .map(entry => entry.name)

    if (jsonlFiles.length === 0) return null

    const { stat } = await import('fs/promises')
    const withStats = await Promise.all(
      jsonlFiles.map(async name => ({
        path: join(dir, name),
        mtimeMs: (await stat(join(dir, name))).mtimeMs,
      })),
    )

    withStats.sort((a, b) => b.mtimeMs - a.mtimeMs)
    return withStats[0]?.path ?? null
  } catch {
    return null
  }
}

async function measureCurrentSystemPrompt(model: string): Promise<void> {
  const prompt = await getSystemPrompt([], model)
  const original = prompt.join('\n\n')
  const compactedSections = prompt.map(section => compactCavemanText(section))
  const compacted = compactedSections.join('\n\n')
  const total = measure(`current system prompt (${model})`, original, compacted)

  console.log('\n=== Current System Prompt ===\n')
  printMeasurement(total)

  const sectionMeasurements = prompt
    .map((section, index) =>
      measure(`section ${index + 1}`, section, compactedSections[index]!),
    )
    .filter(entry => entry.savedTokens > 0)
    .sort((a, b) => b.savedTokens - a.savedTokens)
    .slice(0, 10)

  if (sectionMeasurements.length > 0) {
    console.log('\nTop changed sections:')
    for (const entry of sectionMeasurements) {
      printMeasurement(entry, '  ')
    }
  } else {
    console.log('\nTop changed sections:\n  none')
  }
}

async function measureDumpJsonl(filePath: string): Promise<void> {
  const content = await readFile(filePath, 'utf8')
  const entries = content
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => jsonParse(line) as DumpEntry)

  const measured = entries
    .filter(entry => entry.type === 'init' || entry.type === 'system_update' || entry.type === 'message')
    .map((entry, index) => {
      const original = entry.data ?? null
      const compacted = compactPromptSnapshotValue(original)
      return measure(`${entry.type}#${index + 1}`, original, compacted)
    })

  console.log(`\n=== Dump Prompt Snapshot: ${filePath} ===\n`)

  if (measured.length === 0) {
    console.log('No measurable init/system_update/message entries found.')
    return
  }

  const totals = measured.reduce(
    (acc, entry) => {
      acc.original += entry.originalTokens
      acc.compacted += entry.compactedTokens
      return acc
    },
    { original: 0, compacted: 0 },
  )

  printMeasurement({
    label: 'aggregate',
    originalTokens: totals.original,
    compactedTokens: totals.compacted,
    savedTokens: totals.original - totals.compacted,
    savedPercent: toPercent(totals.original - totals.compacted, totals.original),
  })

  console.log('\nLargest savings:')
  for (const entry of measured.sort((a, b) => b.savedTokens - a.savedTokens).slice(0, 10)) {
    printMeasurement(entry, '  ')
  }
}

function printMeasurement(entry: Measurement, prefix = ''): void {
  console.log(
    `${prefix}${entry.label}: ${entry.originalTokens} -> ${entry.compactedTokens} tokens ` +
      `(saved ${entry.savedTokens}, ${entry.savedPercent.toFixed(1)}%)`,
  )
}

async function main(): Promise<void> {
  await loadDeps()
  const args = parseArgs(process.argv.slice(2))
  if (args.model === 'claude-sonnet-4-6') {
    args.model = getMainLoopModel()
  }

  if (args.dumpJsonlPath || args.latestDump) {
    const dumpPath = args.dumpJsonlPath ?? (await getLatestDumpPath())
    if (!dumpPath) {
      throw new Error('No dump-prompts JSONL file found. Pass --dump-jsonl <path> or generate a capture first.')
    }
    await measureDumpJsonl(dumpPath)
    return
  }

  await measureCurrentSystemPrompt(args.model)
}

let getClaudeConfigHomeDir: typeof import('../../../utils/envUtils.js').getClaudeConfigHomeDir
let compactCavemanText: typeof import('../../../utils/cavemanText.js').compactCavemanText
let jsonParse: typeof import('../../../utils/slowOperations.js').jsonParse
let jsonStringify: typeof import('../../../utils/slowOperations.js').jsonStringify
let roughTokenCountEstimation: typeof import('../../tokenEstimation.js').roughTokenCountEstimation
let getSystemPrompt: typeof import('../../../constants/prompts.js').getSystemPrompt
let getMainLoopModel: typeof import('../../../utils/model/model.js').getMainLoopModel

async function loadDeps(): Promise<void> {
  if (getSystemPrompt) return

  ;({
    getClaudeConfigHomeDir,
  } = await import('../../../utils/envUtils.js'))
  ;({
    compactCavemanText,
  } = await import('../../../utils/cavemanText.js'))
  ;({
    jsonParse,
    jsonStringify,
  } = await import('../../../utils/slowOperations.js'))
  ;({
    roughTokenCountEstimation,
  } = await import('../../tokenEstimation.js'))
  ;({
    getSystemPrompt,
  } = await import('../../../constants/prompts.js'))
  ;({
    getMainLoopModel,
  } = await import('../../../utils/model/model.js'))
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
