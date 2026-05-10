import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { isIP } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'

import {
  openAIShimSupportsApiFormatForModel,
  resolveOpenAIShimRuntimeContext,
} from '../../integrations/runtimeMetadata.js'
import {
  isCodexRefreshFailureCoolingDown,
  readCodexCredentials,
  type CodexCredentialBlob,
} from '../../utils/codexCredentials.js'
import { logForDebugging } from '../../utils/debug.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { parseChatgptAccountId } from './codexOAuthShared.js'

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_CODEX_BASE_URL = 'https://chatgpt.com/backend-api/codex';
const DEFAULT_ZEN_BASE_URL = 'https://opencode.ai/zen/v1';
const DEFAULT_MINIMAX_BASE_URL = 'https://api.minimax.io/anthropic';
const DEFAULT_MINIMAX_CHINA_BASE_URL = 'https://api.minimaxi.com/anthropic';
export const DEFAULT_MISTRAL_BASE_URL = 'https://api.mistral.ai/v1'
export const DEFAULT_GEMINI_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta/openai'
export const DEFAULT_GEMINI_MODEL = 'gemini-3-flash-preview'
export const DEFAULT_GITHUB_MODELS_API_MODEL = 'gpt-4o'
export const GITHUB_COPILOT_BASE_URL = 'https://api.githubcopilot.com'
export const GITHUB_MODELS_BASE_URL = 'https://models.inference.ai.azure.com'

const CODEX_ALIAS_MODELS = new Set([
  'codexplan',
  'codexspark',
  'chatgpt-5.3-codex-spark',
  'gpt-5.3-codex-spark',
  'gpt-5.4',
  'gpt-5.5',
  'gpt-5.4-mini',
  'gpt-5.3-codex',
  'gpt-5.2-codex',
  'gpt-5.2',
  'gpt-5.1-codex',
  'gpt-5.1-codex-max',
  'gpt-5.1-codex-mini',
]);

const CODEX_ALIAS_DETAILS: Record<
  string,
  {
    model: string
    reasoningEffort?: ReasoningEffort
  }
> = {
  codexplan: { model: 'gpt-5.5', reasoningEffort: 'high' },
  codexspark: { model: 'gpt-5.3-codex-spark' },
  'gpt-5.5': { model: 'gpt-5.5', reasoningEffort: 'high' },
  'gpt-5.4': { model: 'gpt-5.4', reasoningEffort: 'high' },
  'gpt-5.4-mini': { model: 'gpt-5.4-mini', reasoningEffort: 'medium' },
  'gpt-5.3-codex': { model: 'gpt-5.3-codex', reasoningEffort: 'high' },
  'gpt-5.3-codex-spark': { model: 'gpt-5.3-codex-spark' },
  'gpt-5.2-codex': { model: 'gpt-5.2-codex', reasoningEffort: 'high' },
  'gpt-5.2': { model: 'gpt-5.2', reasoningEffort: 'medium' },
  'gpt-5.1-codex': { model: 'gpt-5.1-codex', reasoningEffort: 'high' },
  'gpt-5.1-codex-max': { model: 'gpt-5.1-codex-max', reasoningEffort: 'high' },
  'gpt-5.1-codex-mini': { model: 'gpt-5.1-codex-mini' },
}

type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh'

export type ProviderTransport =
  | 'chat_completions'
  | 'responses'
  | 'codex_responses'

export type OpenAICompatibleApiFormat = 'chat_completions' | 'responses'

export type ResolvedProviderRequest = {
  transport: ProviderTransport
  requestedModel: string
  resolvedModel: string
  baseUrl: string
  reasoning?: {
    effort: ReasoningEffort
  }
}

export type ResolvedCodexCredentials = {
  apiKey: string
  accountId?: string
  authPath?: string
  source: 'env' | 'secure-storage' | 'auth.json' | 'none'
}

type ModelDescriptor = {
  raw: string
  baseModel: string
  reasoning?: {
    effort: ReasoningEffort
  }
}

const LOCALHOST_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0'])
const warnedUndefinedEnvNames = new Set<string>()

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function asEnvUrl(value: unknown): string | undefined {
  const trimmed = asTrimmedString(value)
  if (!trimmed || trimmed === 'undefined') {
    return undefined
  }
  return trimTrailingSlash(trimmed)
}

function asNamedEnvUrl(
  value: string | undefined,
  envName: string,
): string | undefined {
  const trimmed = asTrimmedString(value)
  if (!trimmed) return undefined
  if (trimmed === 'undefined') {
    if (!warnedUndefinedEnvNames.has(envName)) {
      warnedUndefinedEnvNames.add(envName)
      logForDebugging(
        `[provider-config] Environment variable ${envName} is the literal string "undefined"; ignoring it.`,
        { level: 'warn' },
      )
    }
    return undefined
  }
  return trimmed
}

function readNestedString(
  value: unknown,
  paths: string[][],
): string | undefined {
  for (const candidatePath of paths) {
    let current = value
    let valid = true
    for (const key of candidatePath) {
      if (!current || typeof current !== 'object' || !(key in current)) {
        valid = false
        break
      }
      current = (current as Record<string, unknown>)[key]
    }
    if (!valid) continue
    const stringValue = asTrimmedString(current)
    if (stringValue) return stringValue
  }
  return undefined
}

function hashCacheScopePartition(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}

function parseModelDescriptor(model: string): ModelDescriptor {
  const raw = model.trim()
  const [baseModel, query = ''] = raw.split('?', 2)
  const params = new URLSearchParams(query)
  const requestedEffort = params.get('reasoning_effort') ?? params.get('effort')
  const alias = CODEX_ALIAS_DETAILS[baseModel.toLowerCase()]
  const reasoningEffort =
    parseReasoningEffort(requestedEffort) ?? alias?.reasoningEffort

  return {
    raw,
    baseModel: alias?.model ?? baseModel,
    reasoning: reasoningEffort ? { effort: reasoningEffort } : undefined,
  }
}

function parseReasoningEffort(value: string | null | undefined): ReasoningEffort | undefined {
  const normalized = value?.trim().toLowerCase()
  return normalized === 'low' ||
    normalized === 'medium' ||
    normalized === 'high' ||
    normalized === 'xhigh'
    ? normalized
    : undefined
}

export function parseOpenAICompatibleApiFormat(
  value: string | undefined,
): OpenAICompatibleApiFormat | undefined {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return undefined
  if (
    normalized === 'responses' ||
    normalized === 'response' ||
    normalized === 'responses_api'
  ) {
    return 'responses'
  }
  if (
    normalized === 'chat_completions' ||
    normalized === 'chat-completions' ||
    normalized === 'chat'
  ) {
    return 'chat_completions'
  }
  return undefined
}

export function asEnvProviderBaseUrl(value: string | undefined): string | undefined {
  const trimmed = asTrimmedString(value);
  if (!trimmed || trimmed === 'undefined') {
    return undefined;
  }
  return trimmed;
}

export function getConfiguredOpenAIBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return (
    asNamedEnvUrl(env.OPENAI_BASE_URL, 'OPENAI_BASE_URL') ??
    asNamedEnvUrl(env.OPENAI_API_BASE, 'OPENAI_API_BASE')
  );
}

export function getOpenAIBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (getConfiguredOpenAIBaseUrl(env) ?? DEFAULT_OPENAI_BASE_URL).replace(
    /\/+$/,
    '',
  );
}

export function isCodexAlias(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  const baseModel = normalized.split('?', 1)[0] ?? normalized;
  return CODEX_ALIAS_MODELS.has(baseModel);
}

function isOpenAICodexShortcutAlias(model: string): boolean {
  return model.trim().toLowerCase() === 'codexplan' ||
    model.trim().toLowerCase() === 'codexspark'
}

export function isCodexBaseUrl(baseUrl: string | undefined): boolean {
  const normalizedBaseUrl = asEnvProviderBaseUrl(baseUrl);
  if (!normalizedBaseUrl) {
    return false;
  }

  try {
    const parsed = new URL(normalizedBaseUrl);
    const pathname = parsed.pathname.replace(/\/+$/, '');
    return (
      parsed.hostname === 'chatgpt.com' &&
      (pathname === '/backend-api/codex' ||
        pathname === '/backend-api/codex/responses')
    );
  } catch {
    return false;
  }
}

export function shouldUseCodexTransport(
  model: string,
  baseUrl: string | undefined,
): boolean {
  const normalizedBaseUrl = asEnvProviderBaseUrl(baseUrl);
  return (
    isCodexBaseUrl(normalizedBaseUrl) ||
    (!normalizedBaseUrl && isCodexAlias(model))
  );
}

function shouldUseGithubResponsesApi(model: string): boolean {
  const normalized = model.trim().toLowerCase()
  return normalized.startsWith('gpt-5') && !normalized.includes('mini')
}

function normalizePathWithV1(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, '')
  return normalized.endsWith('/v1') ? normalized : `${normalized}/v1`
}

function isPrivateIpv4Address(hostname: string): boolean {
  const parts = hostname.split('.').map(part => Number.parseInt(part, 10))
  if (parts.length !== 4 || parts.some(part => Number.isNaN(part))) {
    return false
  }
  const [a, b] = parts
  return a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
}

function isPrivateIpv6Address(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
}

export function isLocalProviderUrl(baseUrl: string | undefined): boolean {
  const normalizedBaseUrl = asEnvProviderBaseUrl(baseUrl)
  if (!normalizedBaseUrl) return false

  try {
    const parsed = new URL(normalizedBaseUrl)
    const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    if (LOCALHOST_HOSTNAMES.has(hostname)) return true
    if (hostname.endsWith('.local')) return true
    const ipVersion = isIP(hostname)
    if (ipVersion === 4) return isPrivateIpv4Address(hostname)
    if (ipVersion === 6) return isPrivateIpv6Address(hostname)
    return false
  } catch {
    return false
  }
}

function isLikelyOllamaEndpoint(baseUrl: string): boolean {
  try {
    const parsed = new URL(baseUrl)
    return parsed.port === '11434' || parsed.pathname.includes('/ollama')
  } catch {
    return false
  }
}

export function getLocalProviderRetryBaseUrls(
  baseUrl: string | undefined,
): string[] {
  const normalizedBaseUrl = asEnvUrl(baseUrl)
  if (!normalizedBaseUrl || !isLocalProviderUrl(normalizedBaseUrl)) {
    return []
  }

  try {
    const parsed = new URL(normalizedBaseUrl)
    const candidates = new Set<string>()
    candidates.add(
      trimTrailingSlash(
        new URL(normalizePathWithV1(parsed.pathname), parsed).toString(),
      ),
    )
    if (parsed.hostname === 'localhost') {
      for (const host of ['127.0.0.1', '0.0.0.0']) {
        const copy = new URL(parsed.toString())
        copy.hostname = host
        candidates.add(
          trimTrailingSlash(
            new URL(normalizePathWithV1(copy.pathname), copy).toString(),
          ),
        )
      }
    }
    return [...candidates]
  } catch {
    return []
  }
}

export function shouldAttemptLocalToollessRetry(options: {
  baseUrl?: string
  hasTools?: boolean
}): boolean {
  return Boolean(
    options.hasTools &&
      options.baseUrl &&
      isLocalProviderUrl(options.baseUrl) &&
      isLikelyOllamaEndpoint(options.baseUrl),
  )
}

export function getZenBaseUrl(): string {
  return DEFAULT_ZEN_BASE_URL;
}

export function getMinimaxBaseUrl(): string {
  // Set MINIMAX_API_REGION=china to use the China endpoint (api.minimaxi.com)
  if (process.env.MINIMAX_API_REGION?.toLowerCase() === 'china') {
    return DEFAULT_MINIMAX_CHINA_BASE_URL;
  }
  return DEFAULT_MINIMAX_BASE_URL;
}

export function getGithubEndpointType(
  baseUrl: string | undefined,
): 'copilot' | 'models' | 'custom' {
  const normalizedBaseUrl = asEnvProviderBaseUrl(baseUrl)
  if (!normalizedBaseUrl) return 'copilot'
  try {
    const parsed = new URL(normalizedBaseUrl)
    if (parsed.hostname === 'api.githubcopilot.com') return 'copilot'
    if (
      parsed.hostname === 'models.inference.ai.azure.com' ||
      parsed.hostname === 'models.github.ai'
    ) {
      return 'models'
    }
    return 'custom'
  } catch {
    return 'custom'
  }
}

export function normalizeGithubCopilotModel(model: string): string {
  const normalized = model.trim().toLowerCase()
  if (
    normalized === 'copilot' ||
    normalized === 'github:copilot' ||
    normalized === 'github'
  ) {
    return DEFAULT_GITHUB_MODELS_API_MODEL
  }
  return model.startsWith('github:') ? model.slice('github:'.length) : model
}

export function normalizeGithubModelsApiModel(model: string): string {
  const normalized = model.trim().toLowerCase()
  if (
    normalized === 'copilot' ||
    normalized === 'github:copilot' ||
    normalized === 'github'
  ) {
    return DEFAULT_GITHUB_MODELS_API_MODEL
  }
  return model.startsWith('github:') ? model.slice('github:'.length) : model
}

function normalizeGithubRequestedModel(model: string): string {
  const [baseModel, query] = model.split('?', 2)
  const normalizedBase = normalizeGithubModelsApiModel(baseModel)
  return query ? `${normalizedBase}?${query}` : normalizedBase
}

export function resolveProviderRequest(options?: {
  model?: string
  baseUrl?: string
  fallbackModel?: string
  reasoningEffortOverride?: ReasoningEffort
  apiFormat?: OpenAICompatibleApiFormat | string
}): ResolvedProviderRequest {
  const isGithubMode = isEnvTruthy(process.env.CLAUDE_CODE_USE_GITHUB)
  const isGeminiMode = isEnvTruthy(process.env.CLAUDE_CODE_USE_GEMINI)
  const isMistralMode = isEnvTruthy(process.env.CLAUDE_CODE_USE_MISTRAL)
  const requestedModel =
    options?.model?.trim() ||
    (isGeminiMode
      ? process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL
      : undefined) ||
    (isMistralMode ? process.env.MISTRAL_MODEL?.trim() : undefined) ||
    process.env.OPENAI_MODEL?.trim() ||
    options?.fallbackModel?.trim() ||
    (isGithubMode ? 'github:copilot' : 'codexplan')
  const descriptor = parseModelDescriptor(
    isGithubMode ? normalizeGithubRequestedModel(requestedModel) : requestedModel,
  )
  const rawBaseUrl =
    asEnvUrl(options?.baseUrl) ??
    (isGeminiMode
      ? asNamedEnvUrl(process.env.GEMINI_BASE_URL, 'GEMINI_BASE_URL') ??
        DEFAULT_GEMINI_BASE_URL
      : undefined) ??
    (isMistralMode
      ? asNamedEnvUrl(process.env.MISTRAL_BASE_URL, 'MISTRAL_BASE_URL')
      : undefined) ??
    asNamedEnvUrl(process.env.OPENAI_BASE_URL, 'OPENAI_BASE_URL') ??
    asNamedEnvUrl(process.env.OPENAI_API_BASE, 'OPENAI_API_BASE')
  const githubEndpointType = isGithubMode
    ? getGithubEndpointType(rawBaseUrl)
    : 'custom'
  const isGithubCopilot = isGithubMode && githubEndpointType === 'copilot'
  const isGithubModels = isGithubMode && githubEndpointType === 'models'
  const isGithubCustom = isGithubMode && githubEndpointType === 'custom'
  const shellModel = process.env.OPENAI_MODEL?.trim() ?? ''
  const envIsCodexShortcut = isOpenAICodexShortcutAlias(shellModel)
  const requestedMatchesEnvCodexShortcut =
    Boolean(options?.model) &&
    envIsCodexShortcut &&
    descriptor.baseModel === parseModelDescriptor(shellModel).baseModel
  const isCodexAliasModel =
    isOpenAICodexShortcutAlias(requestedModel) ||
    requestedMatchesEnvCodexShortcut
  const hasUserSetBaseUrl = rawBaseUrl && rawBaseUrl !== DEFAULT_OPENAI_BASE_URL
  const finalBaseUrl =
    !isGithubMode && isCodexAliasModel && !hasUserSetBaseUrl
      ? DEFAULT_CODEX_BASE_URL
      : rawBaseUrl
  const requestedApiFormat =
    isGithubMode
      ? undefined
      : parseOpenAICompatibleApiFormat(options?.apiFormat) ??
        parseOpenAICompatibleApiFormat(process.env.OPENAI_API_FORMAT)
  const supportsRequestedApiFormat =
    requestedApiFormat !== 'responses' ||
    (() => {
      const runtimeShimContext = resolveOpenAIShimRuntimeContext({
        processEnv: process.env,
        baseUrl: finalBaseUrl,
        model: descriptor.baseModel,
        treatAsLocal: finalBaseUrl ? isLocalProviderUrl(finalBaseUrl) : false,
      })
      return openAIShimSupportsApiFormatForModel(
        runtimeShimContext.openaiShimConfig,
        'responses',
        descriptor.baseModel,
      )
    })()
  const githubResolvedModel = isGithubMode
    ? normalizeGithubModelsApiModel(requestedModel)
    : requestedModel
  const transport: ProviderTransport =
    shouldUseCodexTransport(requestedModel, finalBaseUrl) ||
    (isGithubCopilot && shouldUseGithubResponsesApi(githubResolvedModel))
      ? 'codex_responses'
      : requestedApiFormat === 'responses' && supportsRequestedApiFormat
      ? 'responses'
      : 'chat_completions'
  const resolvedModel = isGithubCopilot
    ? normalizeGithubCopilotModel(descriptor.baseModel)
    : isGithubModels || isGithubCustom
    ? normalizeGithubModelsApiModel(descriptor.baseModel)
    : descriptor.baseModel
  const reasoning = options?.reasoningEffortOverride
    ? { effort: options.reasoningEffortOverride }
    : descriptor.reasoning

  return {
    transport,
    requestedModel,
    resolvedModel,
    baseUrl: (
      finalBaseUrl ??
      (isGithubMode ? GITHUB_COPILOT_BASE_URL : DEFAULT_OPENAI_BASE_URL)
    ).replace(/\/+$/, ''),
    reasoning,
  }
}

export function getAdditionalModelOptionsCacheScope(): string | null {
  if (!isEnvTruthy(process.env.CLAUDE_CODE_USE_OPENAI)) {
    return isEnvTruthy(process.env.CLAUDE_CODE_USE_GITHUB) ? null : 'firstParty'
  }

  const request = resolveProviderRequest()
  if (request.transport !== 'chat_completions') return null
  if (!isLocalProviderUrl(request.baseUrl)) return null

  const partition = [
    request.baseUrl,
    process.env.OPENAI_API_KEY?.trim() ?? '',
    process.env.OPENAI_AUTH_HEADER?.trim() ?? '',
    process.env.OPENAI_AUTH_SCHEME?.trim() ?? '',
    process.env.OPENAI_AUTH_HEADER_VALUE?.trim() ?? '',
    process.env.OPENAI_CUSTOM_HEADERS?.trim() ?? '',
    process.env.ANTHROPIC_CUSTOM_HEADERS?.trim() ?? '',
  ].join('\n')
  return `openai:${request.baseUrl}:${hashCacheScopePartition(partition)}`
}

export function getReasoningEffortForModel(
  model: string,
): ReasoningEffort | undefined {
  return parseModelDescriptor(model).reasoning?.effort
}

export function supportsCodexReasoningEffort(model: string): boolean {
  const normalized = model.trim().toLowerCase()
  const base = normalized.split('?', 1)[0] ?? normalized

  if (base === 'gpt-5.3-codex-spark' || base === 'codexspark') {
    return false
  }

  if (getReasoningEffortForModel(base) !== undefined) {
    return true
  }

  return /^gpt-5(?:[.-]|$)/.test(base)
}

export function resolveCodexAuthPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const explicit = asTrimmedString(env.CODEX_AUTH_JSON_PATH)
  if (explicit) return explicit

  const codexHome = asTrimmedString(env.CODEX_HOME)
  if (codexHome) return join(codexHome, 'auth.json')

  return join(homedir(), '.codex', 'auth.json')
}

function loadCodexAuthJson(
  authPath: string,
): Record<string, unknown> | undefined {
  if (!existsSync(authPath)) return undefined
  try {
    const raw = readFileSync(authPath, 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

function resolveCodexAuthJsonCredentials(options: {
  authJson: Record<string, unknown> | undefined
  authPath: string
  envAccountId?: string
  missingSource?: ResolvedCodexCredentials['source']
}): ResolvedCodexCredentials {
  const { authJson, authPath, envAccountId } = options

  if (!authJson) {
    return {
      apiKey: '',
      authPath,
      source: options.missingSource ?? 'none',
    }
  }

  const apiKey = readNestedString(authJson, [
    ['openai_api_key'],
    ['openaiApiKey'],
    ['access_token'],
    ['accessToken'],
    ['tokens', 'access_token'],
    ['tokens', 'accessToken'],
    ['auth', 'access_token'],
    ['auth', 'accessToken'],
    ['token', 'access_token'],
    ['token', 'accessToken'],
  ])
  const idToken = readNestedString(authJson, [
    ['id_token'],
    ['idToken'],
    ['tokens', 'id_token'],
    ['tokens', 'idToken'],
  ])
  const accountId =
    envAccountId ??
    readNestedString(authJson, [
      ['account_id'],
      ['accountId'],
      ['tokens', 'account_id'],
      ['tokens', 'accountId'],
      ['auth', 'account_id'],
      ['auth', 'accountId'],
    ]) ??
    parseChatgptAccountId(apiKey) ??
    parseChatgptAccountId(idToken)

  if (!apiKey) {
    return {
      apiKey: '',
      accountId,
      authPath,
      source: options.missingSource ?? 'none',
    }
  }

  return {
    apiKey,
    accountId,
    authPath,
    source: 'auth.json',
  }
}

export function resolveStoredCodexCredentials(options: {
  storedCredentials: Pick<
    CodexCredentialBlob,
    'apiKey' | 'accessToken' | 'idToken' | 'accountId'
  >
  envAccountId?: string
}): ResolvedCodexCredentials {
  const { storedCredentials, envAccountId } = options

  return {
    apiKey: storedCredentials.apiKey ?? storedCredentials.accessToken,
    accountId:
      envAccountId ??
      storedCredentials.accountId ??
      parseChatgptAccountId(storedCredentials.idToken) ??
      parseChatgptAccountId(storedCredentials.accessToken),
    source: 'secure-storage',
  }
}

function resolveEnvOrAuthJsonCodexCredentials(
  env: NodeJS.ProcessEnv,
  options?: {
    explicitAuthPathOnly?: boolean
  },
): ResolvedCodexCredentials {
  const envApiKey = asTrimmedString(env.CODEX_API_KEY)
  const envAccountId =
    asTrimmedString(env.CODEX_ACCOUNT_ID) ??
    asTrimmedString(env.CHATGPT_ACCOUNT_ID)

  if (envApiKey) {
    return {
      apiKey: envApiKey,
      accountId: envAccountId ?? parseChatgptAccountId(envApiKey),
      source: 'env',
    }
  }

  const explicitAuthPathConfigured = Boolean(
    asTrimmedString(env.CODEX_AUTH_JSON_PATH) ?? asTrimmedString(env.CODEX_HOME),
  )

  if (!explicitAuthPathConfigured && options?.explicitAuthPathOnly) {
    return {
      apiKey: '',
      accountId: envAccountId,
      source: 'none',
    }
  }

  const authPath = resolveCodexAuthPath(env)
  const authJson = loadCodexAuthJson(authPath)
  return resolveCodexAuthJsonCredentials({
    authJson,
    authPath,
    envAccountId,
  })
}

export function resolveRuntimeCodexCredentials(options?: {
  env?: NodeJS.ProcessEnv
  storedCredentials?: Pick<
    CodexCredentialBlob,
    'apiKey' | 'accessToken' | 'idToken' | 'accountId'
  >
}): ResolvedCodexCredentials {
  const env = options?.env ?? process.env
  const explicitCredentials = resolveEnvOrAuthJsonCodexCredentials(env, {
    explicitAuthPathOnly: true,
  })
  const explicitAuthPathConfigured = Boolean(
    asTrimmedString(env.CODEX_AUTH_JSON_PATH) ?? asTrimmedString(env.CODEX_HOME),
  )
  const hasStoredCredentialsOption = Boolean(
    options &&
      Object.prototype.hasOwnProperty.call(options, 'storedCredentials'),
  )

  if (
    explicitAuthPathConfigured ||
    explicitCredentials.source === 'env' ||
    explicitCredentials.source === 'auth.json'
  ) {
    return explicitCredentials
  }

  if (options?.storedCredentials?.accessToken) {
    return resolveStoredCodexCredentials({
      storedCredentials: options.storedCredentials,
      envAccountId:
        asTrimmedString(env.CODEX_ACCOUNT_ID) ??
        asTrimmedString(env.CHATGPT_ACCOUNT_ID),
    })
  }

  if (hasStoredCredentialsOption) {
    return resolveEnvOrAuthJsonCodexCredentials(env)
  }

  return resolveCodexApiCredentials(env)
}

export function resolveCodexApiCredentials(
  env: NodeJS.ProcessEnv = process.env,
): ResolvedCodexCredentials {
  const envAccountId =
    asTrimmedString(env.CODEX_ACCOUNT_ID) ??
    asTrimmedString(env.CHATGPT_ACCOUNT_ID)
  const envOrExplicitAuthJsonCredentials = resolveEnvOrAuthJsonCodexCredentials(
    env,
    {
      explicitAuthPathOnly: true,
    },
  )

  if (
    envOrExplicitAuthJsonCredentials.source === 'env' ||
    envOrExplicitAuthJsonCredentials.source === 'auth.json' ||
    envOrExplicitAuthJsonCredentials.authPath
  ) {
    return envOrExplicitAuthJsonCredentials
  }

  const storedCredentials = readCodexCredentials()
  if (storedCredentials?.accessToken) {
    const resolvedStoredCredentials = resolveStoredCodexCredentials({
      storedCredentials,
      envAccountId,
    })

    const shouldCheckDefaultAuthJson =
      !resolvedStoredCredentials.accountId ||
      isCodexRefreshFailureCoolingDown(storedCredentials)

    if (!shouldCheckDefaultAuthJson) {
      return resolvedStoredCredentials
    }

    const authPath = resolveCodexAuthPath(env)
    const authJson = loadCodexAuthJson(authPath)
    const resolvedAuthJsonCredentials = resolveCodexAuthJsonCredentials({
      authJson,
      authPath,
      envAccountId,
    })

    if (resolvedAuthJsonCredentials.apiKey) {
      return {
        ...resolvedAuthJsonCredentials,
        accountId:
          resolvedAuthJsonCredentials.accountId ??
          resolvedStoredCredentials.accountId,
      }
    }

    return resolvedStoredCredentials
  }

  return resolveEnvOrAuthJsonCodexCredentials(env)
}

export { DEFAULT_CODEX_BASE_URL, DEFAULT_MINIMAX_BASE_URL, DEFAULT_MINIMAX_CHINA_BASE_URL, DEFAULT_OPENAI_BASE_URL, DEFAULT_ZEN_BASE_URL };
