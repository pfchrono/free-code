import { mkdir, writeFile } from 'fs/promises'
import { readFileSync } from 'fs'
import isEqual from 'lodash-es/isEqual.js'
import memoize from 'lodash-es/memoize.js'
import { join } from 'path'
import { z } from 'zod/v4'
import { logForDebugging } from '../debug.js'
import { getClaudeConfigHomeDir } from '../envUtils.js'
import { safeParseJSON } from '../json.js'
import { lazySchema } from '../lazySchema.js'
import { isEssentialTrafficOnly } from '../privacyLevel.js'
import { jsonStringify } from '../slowOperations.js'
import { getAPIProvider } from './providers.js'

const LMSTUDIO_BASE_URL = process.env.LMSTUDIO_BASE_URL || 'http://127.0.0.1:1234/v1'

const LMStudioModelCapabilitySchema = lazySchema(() =>
  z
    .object({
      id: z.string(),
      object: z.string().optional(),
      owned_by: z.string().optional(),
      max_input_tokens: z.number().optional(),
      max_tokens: z.number().optional(),
      capabilities: z
        .object({
          reasoning: z.boolean().default(false),
          vision: z.boolean().default(false),
          function_calling: z.boolean().default(true),
          json_mode: z.boolean().default(true),
          streaming: z.boolean().default(true),
          code_generation: z.boolean().default(true),
        })
        .optional(),
      performance_tier: z.enum(['fast', 'balanced', 'quality']).optional(),
      preferredTokenParameter: z
        .enum(['max_tokens', 'max_completion_tokens'])
        .optional(),
    })
    .strip(),
)

const LMStudioCacheFileSchema = lazySchema(() =>
  z.object({
    models: z.array(LMStudioModelCapabilitySchema()),
    timestamp: z.number(),
    source: z.literal('api').default('api'),
  }),
)

export type LMStudioModelCapability = z.infer<
  ReturnType<typeof LMStudioModelCapabilitySchema>
>

function getLMStudioCacheDir(): string {
  return join(getClaudeConfigHomeDir(), 'cache')
}

function getLMStudioCachePath(): string {
  return join(getLMStudioCacheDir(), 'lmstudio-model-capabilities.json')
}

function isLMStudioEligible(): boolean {
  return getAPIProvider() === 'lmstudio'
}

function inferLMStudioCapability(modelId: string): LMStudioModelCapability {
  const lower = modelId.toLowerCase()
  const isVision = /(vision|vl|llava|qwen2\.5-vl|internvl|pixtral)/i.test(modelId)
  const isReasoning = /(reason|r1|qwq|deepseek|o1|o3|o4)/i.test(modelId)
  const isFast = /(mini|small|3b|7b|8b)/i.test(modelId)

  return {
    id: modelId,
    capabilities: {
      reasoning: isReasoning,
      vision: isVision,
      function_calling: true,
      json_mode: true,
      streaming: true,
      code_generation: true,
    },
    performance_tier: isFast ? 'fast' : isReasoning ? 'quality' : 'balanced',
    preferredTokenParameter: 'max_tokens',
  }
}

function sortLMStudioModelsForMatching(
  models: LMStudioModelCapability[],
): LMStudioModelCapability[] {
  return [...models].sort(
    (a, b) => b.id.length - a.id.length || a.id.localeCompare(b.id),
  )
}

const loadLMStudioCache = memoize(
  (path: string): LMStudioModelCapability[] | null => {
    try {
      const raw = readFileSync(path, 'utf-8')
      const parsed = LMStudioCacheFileSchema().safeParse(safeParseJSON(raw, false))
      return parsed.success ? parsed.data.models : null
    } catch {
      return null
    }
  },
  path => path,
)

async function fetchLMStudioModelsFromAPI(): Promise<LMStudioModelCapability[]> {
  const response = await fetch(`${LMSTUDIO_BASE_URL}/models`)

  if (!response.ok) {
    throw new Error(`LM Studio /v1/models responded with ${response.status}`)
  }

  const data = (await response.json()) as {
    data?: Array<{ id?: string; owned_by?: string; object?: string }>
  }

  return sortLMStudioModelsForMatching(
    (data.data || [])
      .map(model => model.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
      .map(modelId => inferLMStudioCapability(modelId)),
  )
}

export function getLMStudioModelCapabilities(): LMStudioModelCapability[] {
  if (!isLMStudioEligible()) return []
  return loadLMStudioCache(getLMStudioCachePath()) || []
}

export function getLMStudioModelCapability(
  model: string,
): LMStudioModelCapability | undefined {
  if (!isLMStudioEligible()) return undefined

  const cached = loadLMStudioCache(getLMStudioCachePath())
  if (!cached || cached.length === 0) return undefined

  const normalized = model.toLowerCase()
  const exact = cached.find(c => c.id.toLowerCase() === normalized)
  if (exact) return exact
  return cached.find(c => normalized.includes(c.id.toLowerCase()))
}

export function getDefaultLMStudioModel(): string | null {
  const models = getLMStudioModelCapabilities()
  return models[0]?.id ?? null
}

export async function refreshLMStudioModelCapabilities(): Promise<void> {
  if (!isLMStudioEligible()) return
  if (isEssentialTrafficOnly()) return

  try {
    const models = await fetchLMStudioModelsFromAPI()
    if (models.length === 0) return

    const path = getLMStudioCachePath()
    if (isEqual(loadLMStudioCache(path), models)) {
      logForDebugging('[lmstudioCapabilities] cache unchanged, skipping write')
      return
    }

    await mkdir(getLMStudioCacheDir(), { recursive: true })
    await writeFile(
      path,
      jsonStringify({
        models,
        timestamp: Date.now(),
        source: 'api',
      }),
      {
        encoding: 'utf-8',
        mode: 0o600,
      },
    )
    loadLMStudioCache.cache.delete(path)
    logForDebugging(`[lmstudioCapabilities] cached ${models.length} LM Studio models`)
  } catch (error) {
    logForDebugging(
      `[lmstudioCapabilities] refresh failed: ${error instanceof Error ? error.message : 'unknown'}`,
    )
  }
}
