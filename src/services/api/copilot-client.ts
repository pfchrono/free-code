import Anthropic, { type ClientOptions } from '@anthropic-ai/sdk'
import { z } from 'zod'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { logForDebugging } from '../../utils/debug.js'
import {
  getCopilotOAuthTokens,
  saveCopilotOAuthTokens,
} from '../../utils/auth.js'
import { refreshCopilotTokens } from '../oauth/copilot-client.js'
import { createCopilotFetch, resolveModelAlias } from './copilot-fetch-adapter.js'
import {
  COPILOT_REFRESH_BUFFER_MS,
  DEFAULT_COPILOT_REFRESH_TIMEOUT_MS,
  COPILOT_EDITOR_VERSION,
  COPILOT_PLUGIN_VERSION,
  COPILOT_USER_AGENT,
  COPILOT_API_VERSION,
  COPILOT_MODEL_CACHE_TTL_MS,
  COPILOT_CAPABILITY_CACHE_TTL_MS,
  DEFAULT_COPILOT_MODEL,
  getCopilotApiBaseUrl,
  buildCopilotHeaders,
  COPILOT_FALLBACK_MODELS,
  getCopilotTokenParameter,
} from './copilot-constants.js'
import { getCopilotEnterpriseConfig, isModelAvailableInEnterprise, getEnterpriseHeaders } from '../../utils/copilot-enterprise.js'

export type CopilotVisionCapability = {
  supported: boolean
  supportedMediaTypes: string[]
  maxImageSize?: number
  maxImagesPerRequest?: number
}

export type CopilotModelCapability = {
  model: string
  supported: boolean
  status: number
  code?: string
  message?: string
}

export type CopilotDiscoveredModel = {
  id: string
  name: string
  version: string
  modelPickerEnabled: boolean
  supportedEndpoints: string[]
  maxContextWindowTokens?: number
  maxOutputTokens?: number
  supportsToolCalls: boolean
  supportsVision: boolean
  preferredTokenParameter?: 'max_tokens' | 'max_completion_tokens'
}

const copilotModelsResponseSchema = z.object({
  data: z.array(
    z.object({
      model_picker_enabled: z.boolean(),
      id: z.string(),
      name: z.string(),
      version: z.string(),
      supported_endpoints: z.array(z.string()).optional(),
      capabilities: z.object({
        limits: z.object({
          max_context_window_tokens: z.number().optional(),
          max_output_tokens: z.number().optional(),
          vision: z
            .object({
              supported_media_types: z.array(z.string()).optional(),
              max_image_size: z.number().optional(),
              max_images_per_request: z.number().optional(),
            })
            .optional(),
        }),
        supports: z.object({
          tool_calls: z.boolean().optional(),
          vision: z.boolean().optional(),
        }),
        tokenizer_requirements: z
          .object({
            max_prompt_tokens_parameter: z
              .enum(['max_tokens', 'max_completion_tokens'])
              .optional(),
          })
          .optional(),
      }),
    }),
  ),
})

function getCopilotRefreshTimeoutMs(): number {
  const configured = Number(process.env.COPILOT_REFRESH_TIMEOUT_MS)
  if (Number.isFinite(configured) && configured > 0) {
    return configured
  }
  return DEFAULT_COPILOT_REFRESH_TIMEOUT_MS
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function getUsableCopilotSessionToken(): Promise<{
  copilotToken: string
  enterpriseUrl?: string
}> {
  let copilotTokens = getCopilotOAuthTokens()
  if (!copilotTokens?.githubToken) {
    throw new Error(
      'GitHub Copilot backend selected but no GitHub OAuth token is available',
    )
  }

  const needsRefresh =
    !copilotTokens.copilotToken ||
    Date.now() >= copilotTokens.expiresAt - COPILOT_REFRESH_BUFFER_MS

  if (needsRefresh) {
    const timeoutMs = getCopilotRefreshTimeoutMs()
    logForDebugging(
      `[API:copilot] Refreshing session token (timeout=${timeoutMs}ms, hasSessionToken=${Boolean(copilotTokens.copilotToken)})`,
    )
    copilotTokens = await withTimeout(
      refreshCopilotTokens(copilotTokens),
      timeoutMs,
      'GitHub Copilot token refresh',
    )
    saveCopilotOAuthTokens(copilotTokens)
    logForDebugging('[API:copilot] Session token refresh complete')
  }

  if (!copilotTokens.copilotToken) {
    throw new Error(
      'GitHub Copilot backend selected but no Copilot session token is available',
    )
  }

  return {
    copilotToken: copilotTokens.copilotToken,
    enterpriseUrl: copilotTokens.enterpriseUrl,
  }
}

function getCachedCopilotModels(): CopilotDiscoveredModel[] | null {
  const cache = getGlobalConfig().copilotModelsCache
  if (!cache) return null
  if (Date.now() - cache.fetchedAt > COPILOT_MODEL_CACHE_TTL_MS) return null
  return cache.models
}

function saveCachedCopilotModels(models: CopilotDiscoveredModel[]): void {
  const current = getGlobalConfig().copilotModelsCache
  const next = {
    fetchedAt: Date.now(),
    models,
  }
  if (
    current &&
    JSON.stringify(current.models) === JSON.stringify(models)
  ) {
    saveGlobalConfig(config => ({
      ...config,
      copilotModelsCache: {
        ...next,
      },
    }))
    return
  }
  saveGlobalConfig(config => ({
    ...config,
    copilotModelsCache: next,
  }))
}

function getCachedCapability(modelId: string): {
  supported: boolean
  lastProbed: number
  error?: { code: string; message: string }
  preferredTokenParameter?: 'max_tokens' | 'max_completion_tokens'
} | null {
  const cache = getGlobalConfig().copilotCapabilityCache
  if (!cache) return null
  if (Date.now() - cache.fetchedAt > COPILOT_CAPABILITY_CACHE_TTL_MS) return null

  const capability = cache.capabilities[modelId]
  if (!capability) return null

  // Check if this specific capability is still valid (probed within TTL)
  if (Date.now() - capability.lastProbed > COPILOT_CAPABILITY_CACHE_TTL_MS) return null

  return capability
}

function saveCachedCapability(
  modelId: string,
  capability: {
    supported: boolean
    error?: { code: string; message: string }
    preferredTokenParameter?: 'max_tokens' | 'max_completion_tokens'
  },
): void {
  const current = getGlobalConfig().copilotCapabilityCache
  const now = Date.now()

  const next = {
    fetchedAt: now,
    capabilities: {
      ...(current?.capabilities || {}),
      [modelId]: {
        supported: capability.supported,
        lastProbed: now,
        error: capability.error,
        preferredTokenParameter: capability.preferredTokenParameter,
      },
    },
  }

  saveGlobalConfig(config => ({
    ...config,
    copilotCapabilityCache: next,
  }))
}

async function fetchCopilotModelsFromAPI(
  copilotToken: string,
  enterpriseUrl?: string,
): Promise<CopilotDiscoveredModel[]> {
  const enterpriseConfig = getCopilotEnterpriseConfig()

  const response = await fetch(`${enterpriseConfig.apiBaseUrl}/models`, {
    method: 'GET',
    headers: buildCopilotHeaders(copilotToken, {
      'Copilot-Integration-Id': 'vscode-chat',
      'x-initiator': 'user',
      ...getEnterpriseHeaders(enterpriseConfig),
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `Copilot /models responded with ${response.status}${body ? `: ${body}` : ''}`,
    )
  }

  const parsed = copilotModelsResponseSchema.parse(await response.json())
  return parsed.data.map((model) => ({
    id: model.id,
    name: model.name,
    version: model.version,
    modelPickerEnabled: model.model_picker_enabled,
    supportedEndpoints: model.supported_endpoints ?? [],
    maxContextWindowTokens: model.capabilities.limits.max_context_window_tokens,
    maxOutputTokens: model.capabilities.limits.max_output_tokens,
    supportsToolCalls: model.capabilities.supports.tool_calls ?? false,
    supportsVision:
      model.capabilities.supports.vision ??
      Boolean(
        model.capabilities.limits.vision?.supported_media_types?.some((type) =>
          type.startsWith('image/'),
        ),
      ),
    preferredTokenParameter: getCopilotTokenParameter(
      model.id,
      model.capabilities.tokenizer_requirements?.max_prompt_tokens_parameter,
    ),
  }))
}

export async function getCopilotModels(
  options?: { forceRefresh?: boolean; filterEnterprise?: boolean },
): Promise<CopilotDiscoveredModel[]> {
  if (!options?.forceRefresh) {
    const cached = getCachedCopilotModels()
    if (cached) {
      // Apply enterprise filtering to cached results if requested
      if (options?.filterEnterprise) {
        const enterpriseConfig = getCopilotEnterpriseConfig()
        return cached.filter(model => isModelAvailableInEnterprise(model.id, enterpriseConfig))
      }
      return cached
    }
  }

  const tokens = await getUsableCopilotSessionToken()
  try {
    const models = await fetchCopilotModelsFromAPI(
      tokens.copilotToken,
      tokens.enterpriseUrl,
    )

    // Apply enterprise filtering if requested
    let filteredModels = models
    if (options?.filterEnterprise) {
      const enterpriseConfig = getCopilotEnterpriseConfig()
      filteredModels = models.filter(model => isModelAvailableInEnterprise(model.id, enterpriseConfig))
    }

    saveCachedCopilotModels(models) // Cache the full model list
    return filteredModels // Return the filtered list
  } catch (error) {
    const cached = getGlobalConfig().copilotModelsCache?.models
    if (cached?.length) {
      logForDebugging(
        `[API:copilot] Falling back to cached /models response: ${error instanceof Error ? error.message : String(error)}`,
      )
      return cached
    }

    logForDebugging(
      `[API:copilot] Falling back to static Copilot model list: ${error instanceof Error ? error.message : String(error)}`,
    )
    return COPILOT_FALLBACK_MODELS.map((model) => ({
      id: model.id,
      name: model.label,
      version: model.id,
      modelPickerEnabled: true,
      supportedEndpoints: ['/chat/completions'],
      maxContextWindowTokens: undefined,
      maxOutputTokens: undefined,
      supportsToolCalls: true,
      supportsVision: false,
      preferredTokenParameter: getCopilotTokenParameter(model.id),
    }))
  }
}

export async function getCopilotChatModels(): Promise<CopilotDiscoveredModel[]> {
  const models = await getCopilotModels()
  return models.filter(
    (model) =>
      model.modelPickerEnabled &&
      (model.supportedEndpoints.length === 0 ||
        model.supportedEndpoints.includes('/chat/completions')),
  )
}

export async function getCopilotModelById(
  modelId: string,
): Promise<CopilotDiscoveredModel | undefined> {
  const normalized = modelId.trim().toLowerCase()
  const models = await getCopilotModels()
  const model = models.find((entry) => entry.id.toLowerCase() === normalized)
  if (!model) return undefined

  const cachedCapability = getCachedCapability(model.id)
  if (!cachedCapability?.preferredTokenParameter) {
    return model
  }

  return {
    ...model,
    preferredTokenParameter: cachedCapability.preferredTokenParameter,
  }
}

export async function isCopilotModel(model: string): Promise<boolean> {
  const normalized = model.trim().toLowerCase()
  const models = await getCopilotChatModels()
  return models.some((entry) => entry.id.toLowerCase() === normalized)
}

export async function getDefaultCopilotModel(): Promise<string> {
  const models = await getCopilotChatModels()
  if (models.some((model) => model.id === DEFAULT_COPILOT_MODEL)) {
    return DEFAULT_COPILOT_MODEL
  }
  return models[0]?.id ?? DEFAULT_COPILOT_MODEL
}

function getCapabilityProbeBody(model: CopilotDiscoveredModel): Record<string, unknown> {
  const tokenParameter = getCopilotTokenParameter(
    model.id,
    model.preferredTokenParameter,
  )
  return {
    model: model.id,
    stream: false,
    messages: [{ role: 'user', content: 'ping' }],
    [tokenParameter]: 1,
  }
}

function parseCopilotCapabilityError(bodyText: string): {
  code?: string
  message?: string
} {
  let code: string | undefined
  let message: string | undefined

  try {
    const parsed = JSON.parse(bodyText) as {
      error?: { code?: string; message?: string }
    }
    code = parsed.error?.code
    message = parsed.error?.message
  } catch {
    message = bodyText
  }

  return { code, message }
}

function inferAlternateTokenParameter(
  attemptedTokenParameter: 'max_tokens' | 'max_completion_tokens',
  error?: { code?: string; message?: string },
): 'max_tokens' | 'max_completion_tokens' | null {
  const message = error?.message?.toLowerCase() ?? ''
  if (message.includes("'max_completion_tokens'")) {
    return 'max_completion_tokens'
  }
  if (message.includes("'max_tokens'")) {
    return 'max_tokens'
  }

  return attemptedTokenParameter === 'max_tokens'
    ? 'max_completion_tokens'
    : 'max_tokens'
}

function isTokenParameterCompatibilityError(
  capability: { error?: { code: string; message: string } } | null,
): boolean {
  if (!capability?.error) return false
  return (
    capability.error.code === 'invalid_request_body' &&
    capability.error.message.includes('Unsupported parameter')
  )
}

async function checkCopilotModelCapability(
  copilotToken: string,
  model: CopilotDiscoveredModel,
  enterpriseUrl?: string,
): Promise<CopilotModelCapability> {
  const requestHeaders = {
    Authorization: `Bearer ${copilotToken}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Copilot-Integration-Id': 'vscode-chat',
    'Editor-Version': COPILOT_EDITOR_VERSION,
    'Editor-Plugin-Version': COPILOT_PLUGIN_VERSION,
    'User-Agent': COPILOT_USER_AGENT,
    'OpenAI-Intent': 'conversation-panel',
    'X-GitHub-Api-Version': COPILOT_API_VERSION,
    'x-initiator': 'user',
  }
  const apiUrl = `${getCopilotApiBaseUrl(enterpriseUrl)}/chat/completions`
  const firstAttemptTokenParameter = getCopilotTokenParameter(
    model.id,
    model.preferredTokenParameter,
  )
  let learnedTokenParameter = firstAttemptTokenParameter

  const attemptProbe = async (
    tokenParameter: 'max_tokens' | 'max_completion_tokens',
  ): Promise<{
    response: Response
    error: { code?: string; message?: string }
  }> => {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({
        ...getCapabilityProbeBody({
          ...model,
          preferredTokenParameter: tokenParameter,
        }),
      }),
    })

    if (response.ok) {
      return { response, error: {} }
    }

    const bodyText = await response.text().catch(() => '')
    return {
      response,
      error: parseCopilotCapabilityError(bodyText),
    }
  }

  let { response, error } = await attemptProbe(firstAttemptTokenParameter)
  if (response.ok) {
    return {
      model: model.id,
      supported: true,
      status: response.status,
      message:
        learnedTokenParameter !== model.preferredTokenParameter
          ? `Uses ${learnedTokenParameter}`
          : undefined,
    }
  }

  const shouldRetryTokenParameter =
    error.code === 'invalid_request_body' &&
    Boolean(error.message?.includes('Unsupported parameter'))

  if (shouldRetryTokenParameter) {
    const alternateTokenParameter = inferAlternateTokenParameter(
      firstAttemptTokenParameter,
      error,
    )
    if (
      alternateTokenParameter &&
      alternateTokenParameter !== firstAttemptTokenParameter
    ) {
      const retryResult = await attemptProbe(alternateTokenParameter)
      response = retryResult.response
      error = retryResult.error
      if (response.ok) {
        learnedTokenParameter = alternateTokenParameter
        return {
          model: model.id,
          supported: true,
          status: response.status,
          message: `Uses ${learnedTokenParameter}`,
        }
      }
    }
  }

  return {
    model: model.id,
    supported: false,
    status: response.status,
    code: error.code,
    message: error.message || response.statusText,
  }
}

/**
 * Simple semaphore for controlling concurrency
 */
class Semaphore {
  private permits: number
  private waiting: (() => void)[] = []

  constructor(permits: number) {
    this.permits = permits
  }

  async acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.permits > 0) {
        this.permits--
        resolve()
      } else {
        this.waiting.push(resolve)
      }
    })
  }

  release(): void {
    this.permits++
    if (this.waiting.length > 0) {
      const resolve = this.waiting.shift()!
      this.permits--
      resolve()
    }
  }
}

export async function probeCopilotChatCompletionsModels(
  models?: string[],
  options?: { concurrency?: number; skipCached?: boolean }
): Promise<CopilotModelCapability[]> {
  const { concurrency = 3, skipCached = true } = options ?? {}

  const tokens = await getUsableCopilotSessionToken()
  const availableModels = await getCopilotChatModels()
  const probeModels =
    models?.map(
      (id) =>
        availableModels.find((entry) => entry.id === id) ?? {
          id,
          name: id,
          version: id,
          modelPickerEnabled: true,
          supportedEndpoints: ['/chat/completions'],
          supportsToolCalls: false,
          supportsVision: false,
        },
    ) ?? availableModels

  const results: CopilotModelCapability[] = []
  const semaphore = new Semaphore(concurrency)

  // Filter out cached results if requested
  const modelsToProbe = skipCached
    ? probeModels.filter(model => {
        const cached = getCachedCapability(model.id)
        if (cached && !isTokenParameterCompatibilityError(cached)) {
          // Add cached result to results
          results.push({
            model: model.id,
            supported: cached.supported,
            status: cached.supported ? 200 : 400,
            code: cached.error?.code,
            message: cached.error?.message,
          })
          return false // Don't probe this model
        }
        return true // Need to probe this model
      })
    : probeModels

  logForDebugging(
    `[copilot-client] Probing ${modelsToProbe.length} models (${results.length} cached, concurrency=${concurrency})`
  )

  // Probe remaining models in parallel with controlled concurrency
  const probePromises = modelsToProbe.map(async (model) => {
    await semaphore.acquire()
    try {
      const result = await checkCopilotModelCapability(
        tokens.copilotToken,
        model,
        tokens.enterpriseUrl,
      )

      // Cache the result
      saveCachedCapability(model.id, {
        supported: result.supported,
        error: result.code || result.message ? {
          code: result.code || 'unknown',
          message: result.message || `HTTP ${result.status}`
        } : undefined,
        preferredTokenParameter: getCopilotTokenParameter(
          model.id,
          result.supported && result.message?.startsWith('Uses ')
            ? (result.message.replace('Uses ', '') as
                | 'max_tokens'
                | 'max_completion_tokens')
            : model.preferredTokenParameter,
        ),
      })

      return result
    } finally {
      semaphore.release()
    }
  })

  const probeResults = await Promise.all(probePromises)
  results.push(...probeResults)

  // Sort results by model name for consistent output
  return results.sort((a, b) => a.model.localeCompare(b.model))
}

export async function getModelVisionCapability(modelId: string): Promise<CopilotVisionCapability | null> {
  try {
    const model = await getCopilotModelById(modelId)
    if (!model?.supportsVision) return null

    // Extract vision capabilities from model metadata
    // Note: This relies on the enhanced schema we added above
    const visionLimits = (model as any)?.visionLimits // Cast needed since our type doesn't include all API fields

    return {
      supported: true,
      supportedMediaTypes: visionLimits?.supported_media_types ?? [
        'image/png',
        'image/jpeg',
        'image/webp',
        'image/gif'
      ],
      maxImageSize: visionLimits?.max_image_size,
      maxImagesPerRequest: visionLimits?.max_images_per_request ?? 5, // Reasonable default
    }
  } catch (error) {
    logForDebugging(`[copilot-client] Failed to get vision capability for ${modelId}: ${error}`)
    return null
  }
}

export async function createCopilotAnthropicClient({
  baseArgs,
  logger,
}: {
  baseArgs: ConstructorParameters<typeof Anthropic>[0]
  logger?: ClientOptions['logger']
}): Promise<Anthropic> {
  const copilotTokens = await getUsableCopilotSessionToken()
  const copilotFetch = createCopilotFetch(copilotTokens, {
    getModelById: async (modelId) => getCopilotModelById(resolveModelAlias(modelId)),
  })

  return new Anthropic({
    apiKey: 'copilot-placeholder',
    ...baseArgs,
    fetch: copilotFetch as unknown as typeof globalThis.fetch,
    ...(logger && { logger }),
  })
}
