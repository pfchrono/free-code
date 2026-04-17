import { mkdir, writeFile } from 'fs/promises'
import { readFileSync } from 'fs'
import memoize from 'lodash-es/memoize.js'
import { join } from 'path'
import { z } from 'zod/v4'
import { logForDebugging } from '../debug.js'
import { getClaudeConfigHomeDir } from '../envUtils.js'
import { safeParseJSON } from '../json.js'
import { lazySchema } from '../lazySchema.js'
import { isEssentialTrafficOnly } from '../privacyLevel.js'
import { jsonStringify } from '../slowOperations.js'

const ModelsDevModelSchema = lazySchema(() =>
  z.object({
    id: z.string(),
    name: z.string().optional(),
    attachment: z.boolean().optional(),
    reasoning: z.boolean().optional(),
    tool_call: z.boolean().optional(),
    temperature: z.boolean().optional(),
    limit: z
      .object({
        context: z.number().optional(),
        input: z.number().optional(),
        output: z.number().optional(),
      })
      .optional(),
    modalities: z
      .object({
        input: z.array(z.string()).optional(),
        output: z.array(z.string()).optional(),
      })
      .optional(),
  }),
)

const ModelsDevProviderSchema = lazySchema(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    api: z.string().optional(),
    npm: z.string().optional(),
    env: z.array(z.string()).optional(),
    models: z.record(z.string(), ModelsDevModelSchema()),
  }),
)

const ModelsDevApiSchema = lazySchema(() => z.record(z.string(), ModelsDevProviderSchema()))

export type ModelsDevModel = z.infer<ReturnType<typeof ModelsDevModelSchema>>

function getModelsDevCacheDir(): string {
  return join(getClaudeConfigHomeDir(), 'cache')
}

function getModelsDevCachePath(): string {
  return join(getModelsDevCacheDir(), 'models.dev-api.json')
}

const loadModelsDevCache = memoize((path: string) => {
  try {
    const raw = readFileSync(path, 'utf-8')
    const parsed = ModelsDevApiSchema().safeParse(safeParseJSON(raw, false))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
})

export function getModelsDevProvider(providerId: string): Record<string, ModelsDevModel> | null {
  const cached = loadModelsDevCache(getModelsDevCachePath())
  return cached?.[providerId]?.models ?? null
}

export function getModelsDevModel(providerId: string, modelId: string): ModelsDevModel | undefined {
  const provider = getModelsDevProvider(providerId)
  if (!provider) return undefined
  return provider[modelId]
}

export async function refreshModelsDev(): Promise<void> {
  if (isEssentialTrafficOnly()) return

  try {
    const response = await fetch('https://models.dev/api.json', {
      headers: { 'User-Agent': 'free-code' },
    })
    if (!response.ok) {
      throw new Error(`models.dev responded with ${response.status}`)
    }

    const text = await response.text()
    const parsed = ModelsDevApiSchema().safeParse(JSON.parse(text))
    if (!parsed.success) {
      throw new Error('models.dev payload did not match expected schema')
    }

    await mkdir(getModelsDevCacheDir(), { recursive: true })
    await writeFile(getModelsDevCachePath(), jsonStringify(parsed.data), {
      encoding: 'utf-8',
      mode: 0o600,
    })
    loadModelsDevCache.cache.delete(getModelsDevCachePath())
  } catch (error) {
    logForDebugging(
      `[models.dev] fetch failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
