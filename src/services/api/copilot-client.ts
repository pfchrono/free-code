import Anthropic, { type ClientOptions } from '@anthropic-ai/sdk'
import {
  COPILOT_API_BASE_URL,
} from '../../constants/copilot-oauth.js'
import { logForDebugging } from '../../utils/debug.js'
import {
  getCopilotOAuthTokens,
  saveCopilotOAuthTokens,
} from '../../utils/auth.js'
import { refreshCopilotTokens } from '../oauth/copilot-client.js'
import { COPILOT_MODELS, createCopilotFetch } from './copilot-fetch-adapter.js'

const COPILOT_REFRESH_BUFFER_MS = 60_000
const DEFAULT_COPILOT_REFRESH_TIMEOUT_MS = 15_000
const COPILOT_EDITOR_VERSION = 'vscode/1.80.1'
const COPILOT_PLUGIN_VERSION = 'copilot-chat/0.26.7'
const COPILOT_USER_AGENT = 'GitHubCopilotChat/0.26.7'
const COPILOT_API_VERSION = '2025-04-01'

export type CopilotModelCapability = {
  model: string
  supported: boolean
  status: number
  code?: string
  message?: string
}

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

async function getUsableCopilotSessionToken(): Promise<string> {
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

  return copilotTokens.copilotToken
}

async function checkCopilotModelCapability(
  copilotToken: string,
  model: string,
): Promise<CopilotModelCapability> {
  const response = await fetch(`${COPILOT_API_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${copilotToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Copilot-Integration-Id': 'vscode-chat',
      'Editor-Version': COPILOT_EDITOR_VERSION,
      'Editor-Plugin-Version': COPILOT_PLUGIN_VERSION,
      'User-Agent': COPILOT_USER_AGENT,
      'OpenAI-Intent': 'conversation-panel',
      'X-GitHub-Api-Version': COPILOT_API_VERSION,
    },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
    }),
  })

  if (response.ok) {
    return { model, supported: true, status: response.status }
  }

  let code: string | undefined
  let message: string | undefined
  const bodyText = await response.text().catch(() => '')
  try {
    const parsed = JSON.parse(bodyText) as {
      error?: { code?: string; message?: string }
    }
    code = parsed.error?.code
    message = parsed.error?.message
  } catch {
    message = bodyText || response.statusText
  }

  return {
    model,
    supported: false,
    status: response.status,
    code,
    message,
  }
}

export async function probeCopilotChatCompletionsModels(
  models: string[] = COPILOT_MODELS.map((entry) => entry.id),
): Promise<CopilotModelCapability[]> {
  const token = await getUsableCopilotSessionToken()
  const results: CopilotModelCapability[] = []

  for (const model of models) {
    results.push(await checkCopilotModelCapability(token, model))
  }

  return results
}

export async function createCopilotAnthropicClient({
  baseArgs,
  logger,
}: {
  baseArgs: ConstructorParameters<typeof Anthropic>[0]
  logger?: ClientOptions['logger']
}): Promise<Anthropic> {
  const copilotSessionToken = await getUsableCopilotSessionToken()
  const copilotFetch = createCopilotFetch(copilotSessionToken)

  return new Anthropic({
    apiKey: 'copilot-placeholder',
    ...baseArgs,
    fetch: copilotFetch as unknown as typeof globalThis.fetch,
    ...(logger && { logger }),
  })
}