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

/**
 * OpenAI Model Capabilities System
 * Extends free-code with OpenAI model discovery and capability routing
 * Inspired by oh-my-openagent's model capability matching
 */

// Enhanced schema that includes more capability information
const OpenAIModelCapabilitySchema = lazySchema(() =>
  z
    .object({
      id: z.string(),
      object: z.string().optional(),
      created: z.number().optional(),
      owned_by: z.string().optional(),
      max_input_tokens: z.number().optional(),
      max_tokens: z.number().optional(),
      // Capability categories for automatic routing
      capabilities: z
        .object({
          reasoning: z.boolean().default(false),
          vision: z.boolean().default(false),
          function_calling: z.boolean().default(true),
          json_mode: z.boolean().default(false),
          streaming: z.boolean().default(true),
          code_generation: z.boolean().default(true),
        })
        .optional(),
      // Cost and performance metrics
      cost_per_1k_tokens: z
        .object({
          input: z.number().optional(),
          output: z.number().optional(),
        })
        .optional(),
      performance_tier: z.enum(['fast', 'balanced', 'quality']).optional(),
      preferredTokenParameter: z
        .enum(['max_tokens', 'max_completion_tokens'])
        .optional(),
    })
    .strip(),
)

const OpenAICacheFileSchema = lazySchema(() =>
  z.object({
    models: z.array(OpenAIModelCapabilitySchema()),
    timestamp: z.number(),
    source: z.enum(['api', 'static']).default('api'),
  }),
)

export type OpenAIModelCapability = z.infer<
  ReturnType<typeof OpenAIModelCapabilitySchema>
>

// Static fallback model data inspired by oh-my-openagent approach
const STATIC_OPENAI_MODELS: OpenAIModelCapability[] = [
  {
    id: 'gpt-5.5',
    max_input_tokens: 272000,
    max_tokens: 128000,
    capabilities: {
      reasoning: true,
      vision: true,
      function_calling: true,
      json_mode: true,
      streaming: true,
      code_generation: true,
    },
    cost_per_1k_tokens: { input: 0, output: 0 },
    performance_tier: 'quality',
  },
  {
    id: 'gpt-5.4',
    max_input_tokens: 1000000,
    max_tokens: 128000,
    capabilities: {
      reasoning: true,
      vision: true,
      function_calling: true,
      json_mode: true,
      streaming: true,
      code_generation: true,
    },
    cost_per_1k_tokens: { input: 0, output: 0 },
    performance_tier: 'quality',
  },
  {
    id: 'gpt-5.4-mini',
    max_input_tokens: 272000,
    max_tokens: 128000,
    capabilities: {
      reasoning: true,
      vision: true,
      function_calling: true,
      json_mode: true,
      streaming: true,
      code_generation: true,
    },
    cost_per_1k_tokens: { input: 0, output: 0 },
    performance_tier: 'fast',
  },
  {
    id: 'gpt-5.2',
    max_input_tokens: 272000,
    max_tokens: 128000,
    capabilities: {
      reasoning: true,
      vision: true,
      function_calling: true,
      json_mode: true,
      streaming: true,
      code_generation: true,
    },
    cost_per_1k_tokens: { input: 0, output: 0 },
    performance_tier: 'balanced',
  },
  {
    id: 'gpt-4o',
    max_input_tokens: 128000,
    max_tokens: 16384,
    capabilities: {
      reasoning: true,
      vision: true,
      function_calling: true,
      json_mode: true,
      streaming: true,
      code_generation: true,
    },
    cost_per_1k_tokens: { input: 0.0025, output: 0.01 },
    performance_tier: 'quality',
  },
  {
    id: 'gpt-4o-mini',
    max_input_tokens: 128000,
    max_tokens: 16384,
    capabilities: {
      reasoning: true,
      vision: true,
      function_calling: true,
      json_mode: true,
      streaming: true,
      code_generation: true,
    },
    cost_per_1k_tokens: { input: 0.00015, output: 0.0006 },
    performance_tier: 'fast',
  },
  {
    id: 'o1',
    max_input_tokens: 200000,
    max_tokens: 100000,
    capabilities: {
      reasoning: true,
      vision: false,
      function_calling: false,
      json_mode: false,
      streaming: false,
      code_generation: true,
    },
    cost_per_1k_tokens: { input: 0.015, output: 0.06 },
    performance_tier: 'quality',
  },
  {
    id: 'o1-mini',
    max_input_tokens: 128000,
    max_tokens: 65536,
    capabilities: {
      reasoning: true,
      vision: false,
      function_calling: false,
      json_mode: false,
      streaming: false,
      code_generation: true,
    },
    cost_per_1k_tokens: { input: 0.003, output: 0.012 },
    performance_tier: 'balanced',
  },
  {
    id: 'gpt-4-turbo',
    max_input_tokens: 128000,
    max_tokens: 4096,
    capabilities: {
      reasoning: true,
      vision: true,
      function_calling: true,
      json_mode: true,
      streaming: true,
      code_generation: true,
    },
    cost_per_1k_tokens: { input: 0.01, output: 0.03 },
    performance_tier: 'quality',
  },
  {
    id: 'gpt-3.5-turbo',
    max_input_tokens: 16385,
    max_tokens: 4096,
    capabilities: {
      reasoning: false,
      vision: false,
      function_calling: true,
      json_mode: true,
      streaming: true,
      code_generation: true,
    },
    cost_per_1k_tokens: { input: 0.0005, output: 0.0015 },
    performance_tier: 'fast',
  },
  // OpenCode Zen free models
  {
    id: 'big-pickle',
    max_input_tokens: 200000,
    max_tokens: 128000,
    capabilities: {
      reasoning: true,
      vision: false,
      function_calling: true,
      json_mode: true,
      streaming: true,
      code_generation: true,
    },
    cost_per_1k_tokens: { input: 0, output: 0 },
    performance_tier: 'quality',
  },
  {
    id: 'minimax-m2.5-free',
    max_input_tokens: 200000,
    max_tokens: 128000,
    capabilities: {
      reasoning: true,
      vision: false,
      function_calling: true,
      json_mode: true,
      streaming: true,
      code_generation: true,
    },
    cost_per_1k_tokens: { input: 0, output: 0 },
    performance_tier: 'balanced',
  },
  // Popular OpenRouter models with pricing (per 1K tokens)
  // Prices from https://openrouter.ai/models
  {
    id: 'anthropic/claude-3.5-sonnet',
    max_input_tokens: 200000,
    max_tokens: 8192,
    capabilities: {
      reasoning: true,
      vision: true,
      function_calling: true,
      json_mode: true,
      streaming: true,
      code_generation: true,
    },
    cost_per_1k_tokens: { input: 0.003, output: 0.015 },
    performance_tier: 'quality',
  },
  {
    id: 'anthropic/claude-3.7-sonnet',
    max_input_tokens: 200000,
    max_tokens: 8192,
    capabilities: {
      reasoning: true,
      vision: true,
      function_calling: true,
      json_mode: true,
      streaming: true,
      code_generation: true,
    },
    cost_per_1k_tokens: { input: 0.003, output: 0.015 },
    performance_tier: 'quality',
  },
  {
    id: 'anthropic/claude-sonnet-4',
    max_input_tokens: 200000,
    max_tokens: 8192,
    capabilities: {
      reasoning: true,
      vision: true,
      function_calling: true,
      json_mode: true,
      streaming: true,
      code_generation: true,
    },
    cost_per_1k_tokens: { input: 0.003, output: 0.015 },
    performance_tier: 'quality',
  },
  {
    id: 'anthropic/claude-opus-4.1',
    max_input_tokens: 200000,
    max_tokens: 32000,
    capabilities: {
      reasoning: true,
      vision: true,
      function_calling: true,
      json_mode: true,
      streaming: true,
      code_generation: true,
    },
    cost_per_1k_tokens: { input: 0.015, output: 0.075 },
    performance_tier: 'quality',
  },
  {
    id: 'anthropic/claude-3.5-haiku',
    max_input_tokens: 200000,
    max_tokens: 8192,
    capabilities: {
      reasoning: true,
      vision: true,
      function_calling: true,
      json_mode: true,
      streaming: true,
      code_generation: true,
    },
    cost_per_1k_tokens: { input: 0.0008, output: 0.004 },
    performance_tier: 'fast',
  },
  {
    id: 'google/gemini-2.5-flash-preview',
    max_input_tokens: 1000000,
    max_tokens: 65536,
    capabilities: {
      reasoning: true,
      vision: true,
      function_calling: true,
      json_mode: true,
      streaming: true,
      code_generation: true,
    },
    cost_per_1k_tokens: { input: 0.00015, output: 0.0006 },
    performance_tier: 'fast',
  },
  {
    id: 'google/gemini-2.5-pro',
    max_input_tokens: 1000000,
    max_tokens: 65536,
    capabilities: {
      reasoning: true,
      vision: true,
      function_calling: true,
      json_mode: true,
      streaming: true,
      code_generation: true,
    },
    cost_per_1k_tokens: { input: 0.00125, output: 0.01 },
    performance_tier: 'quality',
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    max_input_tokens: 131072,
    max_tokens: 8192,
    capabilities: {
      reasoning: true,
      vision: false,
      function_calling: true,
      json_mode: true,
      streaming: true,
      code_generation: true,
    },
    cost_per_1k_tokens: { input: 0.00012, output: 0.0003 },
    performance_tier: 'balanced',
  },
  {
    id: 'meta-llama/llama-3.1-405b-instruct',
    max_input_tokens: 131072,
    max_tokens: 8192,
    capabilities: {
      reasoning: true,
      vision: false,
      function_calling: true,
      json_mode: true,
      streaming: true,
      code_generation: true,
    },
    cost_per_1k_tokens: { input: 0.0008, output: 0.0008 },
    performance_tier: 'quality',
  },
  {
    id: 'mistralai/mistral-large-2',
    max_input_tokens: 131072,
    max_tokens: 8192,
    capabilities: {
      reasoning: true,
      vision: false,
      function_calling: true,
      json_mode: true,
      streaming: true,
      code_generation: true,
    },
    cost_per_1k_tokens: { input: 0.002, output: 0.006 },
    performance_tier: 'quality',
  },
  {
    id: 'nvidia/llama-3.1-nemotron-70b-instruct',
    max_input_tokens: 131072,
    max_tokens: 8192,
    capabilities: {
      reasoning: true,
      vision: false,
      function_calling: true,
      json_mode: true,
      streaming: true,
      code_generation: true,
    },
    cost_per_1k_tokens: { input: 0.00012, output: 0.0003 },
    performance_tier: 'balanced',
  },
  {
    id: 'nvidia/llama-3.3-nemotron-super-49b-v1',
    max_input_tokens: 131072,
    max_tokens: 8192,
    capabilities: {
      reasoning: true,
      vision: false,
      function_calling: true,
      json_mode: true,
      streaming: true,
      code_generation: true,
    },
    cost_per_1k_tokens: { input: 0, output: 0 },
    performance_tier: 'balanced',
  },
  {
    id: 'nvidia/llama-3.1-nemotron-51b-instruct',
    max_input_tokens: 131072,
    max_tokens: 8192,
    capabilities: {
      reasoning: true,
      vision: false,
      function_calling: true,
      json_mode: true,
      streaming: true,
      code_generation: true,
    },
    cost_per_1k_tokens: { input: 0, output: 0 },
    performance_tier: 'balanced',
  },
  {
    id: 'qwen/qwen3-235b-a22b',
    max_input_tokens: 131072,
    max_tokens: 8192,
    capabilities: {
      reasoning: true,
      vision: false,
      function_calling: true,
      json_mode: true,
      streaming: true,
      code_generation: true,
    },
    cost_per_1k_tokens: { input: 0.0004, output: 0.0012 },
    performance_tier: 'quality',
  },
  {
    id: 'qwen/qwen3-coder-plus',
    max_input_tokens: 131072,
    max_tokens: 8192,
    capabilities: {
      reasoning: true,
      vision: false,
      function_calling: true,
      json_mode: true,
      streaming: true,
      code_generation: true,
    },
    cost_per_1k_tokens: { input: 0.0004, output: 0.0012 },
    performance_tier: 'quality',
  },
  {
    id: 'deepseek/deepseek-chat-v3-0324',
    max_input_tokens: 131072,
    max_tokens: 8192,
    capabilities: {
      reasoning: true,
      vision: false,
      function_calling: true,
      json_mode: true,
      streaming: true,
      code_generation: true,
    },
    cost_per_1k_tokens: { input: 0.00027, output: 0.0011 },
    performance_tier: 'quality',
  },
  {
    id: 'deepseek/deepseek-r1',
    max_input_tokens: 131072,
    max_tokens: 8192,
    capabilities: {
      reasoning: true,
      vision: false,
      function_calling: false,
      json_mode: false,
      streaming: true,
      code_generation: true,
    },
    cost_per_1k_tokens: { input: 0.00055, output: 0.0022 },
    performance_tier: 'quality',
  },
]

function getOpenAICacheDir(): string {
  return join(getClaudeConfigHomeDir(), 'cache')
}

function getOpenAICachePath(): string {
  return join(getOpenAICacheDir(), 'openai-model-capabilities.json')
}

function getOpenAIApiKey(): string | null {
  return process.env.OPENAI_API_KEY || null
}

function isOpenAICapabilitiesEligible(): boolean {
  return (
    getAPIProvider() === 'openai' ||
    getAPIProvider() === 'zen' ||
    getOpenAIApiKey() !== null
  )
}

function inferStaticCapability(modelId: string): OpenAIModelCapability {
  const lower = modelId.toLowerCase()
  const isReasoning =
    lower.startsWith('o1') ||
    lower.startsWith('o3') ||
    lower.startsWith('o4') ||
    lower.startsWith('gpt-5')
  const isMini = lower.includes('mini') || lower.includes('nano')
  const isVision =
    lower.startsWith('gpt-4o') ||
    lower.startsWith('gpt-4.1') ||
    lower.startsWith('gpt-5')

  return {
    id: modelId,
    capabilities: {
      reasoning: isReasoning || lower.startsWith('gpt-4'),
      vision: isVision,
      function_calling: !lower.startsWith('o1'),
      json_mode: !lower.startsWith('o1'),
      streaming: !lower.startsWith('o1'),
      code_generation: true,
    },
    performance_tier: isMini ? 'fast' : isReasoning ? 'quality' : 'balanced',
    preferredTokenParameter:
      isReasoning ? 'max_completion_tokens' : 'max_tokens',
  }
}

async function fetchOpenAIModelsFromAPI(): Promise<OpenAIModelCapability[]> {
  const apiKey = getOpenAIApiKey()
  if (!apiKey) return []

  const response = await fetch('https://api.openai.com/v1/models', {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    throw new Error(`OpenAI /v1/models responded with ${response.status}`)
  }

  const data = (await response.json()) as {
    data?: Array<{ id?: string; created?: number; owned_by?: string }>
  }

  return sortOpenAIModelsForMatching(
    (data.data || [])
      .map(model => model.id)
      .filter((id): id is string => typeof id === 'string')
      .filter(id =>
        /^(gpt-|o1|o3|o4|chatgpt)/i.test(id),
      )
      .map(modelId => {
        const staticMatch = STATIC_OPENAI_MODELS.find(model => model.id === modelId)
        return staticMatch ?? inferStaticCapability(modelId)
      }),
  )
}

// Longest-id-first for better matching
function sortOpenAIModelsForMatching(
  models: OpenAIModelCapability[],
): OpenAIModelCapability[] {
  return [...models].sort(
    (a, b) => b.id.length - a.id.length || a.id.localeCompare(b.id),
  )
}

const loadOpenAICache = memoize(
  (path: string): OpenAIModelCapability[] | null => {
    try {
      const raw = readFileSync(path, 'utf-8')
      const parsed = OpenAICacheFileSchema().safeParse(safeParseJSON(raw, false))
      return parsed.success ? parsed.data.models : null
    } catch {
      return null
    }
  },
  path => path,
)

export function getOpenAIModelCapability(
  model: string,
): OpenAIModelCapability | undefined {
  if (!isOpenAICapabilitiesEligible()) return undefined

  // Try cached models first
  const cached = loadOpenAICache(getOpenAICachePath())
  if (cached && cached.length > 0) {
    const m = model.toLowerCase()
    const exact = cached.find(c => c.id.toLowerCase() === m)
    if (exact) return exact
    const partial = cached.find(c => m.includes(c.id.toLowerCase()))
    if (partial) return partial
  }

  // Fall back to static models
  const m = model.toLowerCase()
  const exact = STATIC_OPENAI_MODELS.find(c => c.id.toLowerCase() === m)
  if (exact) return exact
  return STATIC_OPENAI_MODELS.find(c => m.includes(c.id.toLowerCase()))
}

export async function refreshOpenAIModelCapabilities(): Promise<void> {
  if (!isOpenAICapabilitiesEligible()) return
  if (isEssentialTrafficOnly()) return

  try {
    const liveModels = await fetchOpenAIModelsFromAPI()
    const models =
      liveModels.length > 0
        ? liveModels
        : sortOpenAIModelsForMatching(STATIC_OPENAI_MODELS)

    const path = getOpenAICachePath()
    if (isEqual(loadOpenAICache(path), models)) {
      logForDebugging('[openaiCapabilities] cache unchanged, skipping write')
      return
    }

    await mkdir(getOpenAICacheDir(), { recursive: true })
    await writeFile(
      path,
      jsonStringify({
        models,
        timestamp: Date.now(),
        source: liveModels.length > 0 ? 'api' : 'static',
      }),
      {
        encoding: 'utf-8',
        mode: 0o600,
      },
    )
    loadOpenAICache.cache.delete(path)
    logForDebugging(`[openaiCapabilities] cached ${models.length} OpenAI models`)
  } catch (error) {
    logForDebugging(
      `[openaiCapabilities] refresh failed: ${error instanceof Error ? error.message : 'unknown'}`,
    )
  }
}

export function getOpenAIModelCapabilities(): OpenAIModelCapability[] {
  if (!isOpenAICapabilitiesEligible()) return []

  const cached = loadOpenAICache(getOpenAICachePath())
  if (cached && cached.length > 0) {
    return cached
  }
  return sortOpenAIModelsForMatching(STATIC_OPENAI_MODELS)
}

/**
 * Model capability routing - automatically select best model for task type
 * Inspired by oh-my-openagent's category-based routing
 */
export type TaskCategory =
  | 'reasoning'
  | 'vision'
  | 'code_generation'
  | 'fast_completion'
  | 'function_calling'
  | 'json_structured'

export function selectOpenAIModelForTask(
  category: TaskCategory,
  preferredTier?: 'fast' | 'balanced' | 'quality',
): string | null {
  if (!isOpenAICapabilitiesEligible()) return null

  const allModels = [
    ...(loadOpenAICache(getOpenAICachePath()) || []),
    ...STATIC_OPENAI_MODELS,
  ]

  // Remove duplicates by id
  const uniqueModels = allModels.filter(
    (model, index, array) => array.findIndex(m => m.id === model.id) === index,
  )

  // Filter by required capability
  const capableModels = uniqueModels.filter(model => {
    const caps = model.capabilities
    if (!caps) return false

    switch (category) {
      case 'reasoning':
        return caps.reasoning
      case 'vision':
        return caps.vision
      case 'code_generation':
        return caps.code_generation
      case 'fast_completion':
        return caps.streaming
      case 'function_calling':
        return caps.function_calling
      case 'json_structured':
        return caps.json_mode
      default:
        return true
    }
  })

  if (capableModels.length === 0) return null

  // Apply tier preference
  if (preferredTier) {
    const tieredModels = capableModels.filter(
      m => m.performance_tier === preferredTier,
    )
    if (tieredModels.length > 0) {
      return tieredModels[0].id
    }
  }

  // Default: return the first capable model
  return capableModels[0].id
}

/**
 * Get cost estimate for a model
 */
export function getOpenAIModelCost(
  modelId: string,
): { input?: number; output?: number } | null {
  // Try exact match first
  const capability = getOpenAIModelCapability(modelId)
  if (capability?.cost_per_1k_tokens) return capability.cost_per_1k_tokens

  // Try partial match on model id
  const lowerModel = modelId.toLowerCase()
  const allModels = [
    ...(loadOpenAICache(getOpenAICachePath()) || []),
    ...STATIC_OPENAI_MODELS,
  ]
  for (const model of allModels) {
    if (lowerModel.includes(model.id.toLowerCase()) || model.id.toLowerCase().includes(lowerModel)) {
      if (model.cost_per_1k_tokens) return model.cost_per_1k_tokens
    }
  }

  return null
}

/**
 * Check if a model supports a specific capability
 */
export function checkOpenAIModelCapability(
  modelId: string,
  capability: keyof NonNullable<OpenAIModelCapability['capabilities']>,
): boolean {
  const model = getOpenAIModelCapability(modelId)
  return model?.capabilities?.[capability] || false
}
