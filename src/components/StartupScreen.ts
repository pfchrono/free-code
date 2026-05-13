import { getRouteLabel, resolveActiveRouteIdFromEnv } from '../integrations/routeMetadata.js'

type StartupProviderInfo = {
  name: string
  model: string
}

const ROUTE_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  azure: 'Azure OpenAI',
  github: 'GitHub Models',
  minimax: 'MiniMax',
  mistral: 'Mistral AI',
  'nvidia-nim': 'NVIDIA NIM',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  together: 'Together AI',
  zai: 'Z.AI',
}

function getModelFallbackProvider(model: string): string | null {
  const normalized = model.toLowerCase()
  if (normalized.includes('deepseek')) return 'DeepSeek'
  if (normalized.includes('kimi-for-coding')) return 'Moonshot AI - Kimi Code'
  if (normalized.includes('kimi')) return 'Moonshot AI - API'
  if (normalized.includes('llama')) return 'Meta Llama'
  if (normalized.includes('mistral')) return 'Mistral'
  return null
}

function getOpenAIBaseUrl(): string {
  return process.env.OPENAI_BASE_URL ?? process.env.OPENAI_API_BASE ?? ''
}

function resolveRouteIdForStartup(): string {
  if (process.env.NVIDIA_NIM === '1') return 'nvidia-nim'
  if (process.env.MINIMAX_API_KEY?.trim()) return 'minimax'

  const baseUrl = getOpenAIBaseUrl()
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase()
    if (hostname.endsWith('.openai.azure.com')) return 'azure'
    if (hostname === 'api.moonshot.cn') return 'moonshot-api'
  } catch {
    // Fall through to descriptor-backed detection.
  }

  return resolveActiveRouteIdFromEnv() ?? 'anthropic'
}

function getProviderName(routeId: string, model: string): string {
  if (routeId === 'moonshot-api') return 'Moonshot AI - API'
  if (routeId === 'custom') {
    return getModelFallbackProvider(model) ?? 'OpenAI'
  }

  return ROUTE_LABELS[routeId] ?? getRouteLabel(routeId) ?? 'OpenAI'
}

function getAnthropicModel(modelOverride?: string): string {
  const model =
    modelOverride ??
    process.env.ANTHROPIC_MODEL ??
    process.env.CLAUDE_MODEL ??
    'claude-sonnet-4-6'

  switch (model) {
    case 'opus':
      return 'claude-opus-4-6'
    case 'sonnet':
      return 'claude-sonnet-4-6'
    case 'haiku':
      return 'claude-haiku-4-5-20251001'
    default:
      return model
  }
}

export function detectProvider(modelOverride?: string): StartupProviderInfo {
  const routeId = resolveRouteIdForStartup()
  const model =
    routeId === 'anthropic'
      ? getAnthropicModel(modelOverride)
      : modelOverride ??
        process.env.OPENAI_MODEL ??
        process.env.GEMINI_MODEL ??
        process.env.MISTRAL_MODEL ??
        'unknown'

  return {
    name: getProviderName(routeId, model),
    model,
  }
}

export function printStartupScreen(): void {
  process.stdout.write(
    [
      '███████╗ ████████╗',
      '██╔═══██╗ ██╔═════╝',
      '███████╔╝ ████████╗',
      'Free-Code',
      '',
    ].join('\n'),
  )
}
