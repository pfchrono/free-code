import type { InternalAxiosRequestConfig } from 'axios'
import { getAPIProvider } from './model/providers.js'
import { logForDebugging } from './debug.js'

const ANTHROPIC_HOST_SUFFIXES = ['anthropic.com', 'claude.ai', 'claude.com']
const reportedLeaks = new Set<string>()

type AnthropicHostedTransport = 'fetch' | 'axios'

type AnthropicHostedRequestParams = {
  transport: AnthropicHostedTransport
  url: string | URL | undefined
  baseUrl?: string
  context?: string
  operation?: string
}

function isAnthropicHostedHost(hostname: string): boolean {
  const normalizedHost = hostname.toLowerCase()
  return ANTHROPIC_HOST_SUFFIXES.some(
    suffix =>
      normalizedHost === suffix || normalizedHost.endsWith(`.${suffix}`),
  )
}

function toUrl(
  input: string | URL | undefined,
  baseUrl?: string,
): URL | undefined {
  if (!input) return undefined
  try {
    if (baseUrl) {
      return new URL(String(input), baseUrl)
    }
    return new URL(String(input))
  } catch {
    return undefined
  }
}

function resolveAnthropicHostedRequest(
  params: AnthropicHostedRequestParams,
): { provider: string; url: URL } | null {
  const provider = getAPIProvider()
  if (provider === 'firstParty') {
    return null
  }

  const url = toUrl(params.url, params.baseUrl)
  if (!url || !isAnthropicHostedHost(url.hostname)) {
    return null
  }

  return { provider, url }
}

function shouldBlockAnthropicHostedRequest(): boolean {
  return process.env.ALLOW_THIRD_PARTY_ANTHROPIC_HOSTED_REQUESTS !== '1'
}

type LeakDiagnostics = {
  caller?: string
  stack?: string[]
}

function normalizeStackFrame(frame: string): string {
  return frame.replace(/^at\s+/, '').trim()
}

function isInternalLeakFrame(frame: string): boolean {
  const normalized = normalizeStackFrame(frame)
  return (
    normalized.includes('anthropicLeakDetection.') ||
    normalized.includes('wrappedFetch') ||
    normalized.includes('reportAnthropicHostedRequest') ||
    normalized.includes('enforceAnthropicHostedRequestPolicy') ||
    normalized.includes('installAnthropicLeakFetchDetector') ||
    normalized.includes('node:internal') ||
    normalized.includes('internal/') ||
    normalized.includes('processTicksAndRejections')
  )
}

function getLeakDiagnostics(): LeakDiagnostics {
  const stack = new Error().stack
  if (!stack) {
    return {}
  }

  const frames = stack
    .split('\n')
    .slice(1)
    .map(normalizeStackFrame)
    .filter(frame => frame.length > 0)

  const appFrames = frames.filter(frame => !isInternalLeakFrame(frame))

  return {
    caller: appFrames[0],
    stack: appFrames.slice(0, 4),
  }
}

function buildWarningMessage(
  provider: string,
  params: AnthropicHostedRequestParams,
  url: URL,
  diagnostics: LeakDiagnostics,
): string {
  return (
    `[Anthropic leak detected] apiProvider=${provider} ` +
    `transport=${params.transport} ` +
    `url=${url.origin}${url.pathname}` +
    (params.context ? ` context=${params.context}` : '') +
    (params.operation ? ` operation=${params.operation}` : '') +
    (diagnostics.caller ? ` caller=${diagnostics.caller}` : '') +
    (diagnostics.stack?.length
      ? ` stack=${diagnostics.stack.join(' <- ')}`
      : '')
  )
}

export function reportAnthropicHostedRequest(
  params: AnthropicHostedRequestParams,
): void {
  const resolved = resolveAnthropicHostedRequest(params)
  if (!resolved) {
    return
  }

  const { provider, url } = resolved

  const key = [
    provider,
    params.transport,
    params.context ?? 'unknown',
    url.origin,
    url.pathname,
  ].join('|')
  if (reportedLeaks.has(key)) {
    return
  }
  reportedLeaks.add(key)

  const diagnostics = getLeakDiagnostics()
  const warning = buildWarningMessage(provider, params, url, diagnostics)

  logForDebugging(warning, { level: 'warn' })
  process.stderr.write(`${warning}\n`)
}

function enforceAnthropicHostedRequestPolicy(
  params: AnthropicHostedRequestParams,
): void {
  const resolved = resolveAnthropicHostedRequest(params)
  if (!resolved) {
    return
  }

  const { provider, url } = resolved
  const diagnostics = getLeakDiagnostics()
  const warning = buildWarningMessage(provider, params, url, diagnostics)
  reportAnthropicHostedRequest(params)

  if (!shouldBlockAnthropicHostedRequest()) {
    return
  }

  const blockingMessage =
    `${warning} [blocked] ` +
    'Third-party provider mode may not call Anthropic-hosted services. ' +
    'Set ALLOW_THIRD_PARTY_ANTHROPIC_HOSTED_REQUESTS=1 to bypass.'

  logForDebugging(blockingMessage, { level: 'error' })
  process.stderr.write(`${blockingMessage}\n`)
  throw new Error(blockingMessage)
}

let fetchLeakDetectorInstalled = false

export function installAnthropicLeakFetchDetector(): void {
  if (fetchLeakDetectorInstalled) {
    return
  }
  fetchLeakDetectorInstalled = true

  const originalFetch = globalThis.fetch
  const wrappedFetch = Object.assign(
    async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      enforceAnthropicHostedRequestPolicy({
        transport: 'fetch',
        url: input instanceof Request ? input.url : String(input),
        context: 'global-fetch',
        operation: input instanceof Request ? input.method : init?.method || 'GET',
      })
      return originalFetch(input, init)
    },
    {
      preconnect: originalFetch.preconnect?.bind(originalFetch),
    },
  ) as typeof fetch

  globalThis.fetch = wrappedFetch
}

export function reportAxiosAnthropicHostedRequest(
  config: InternalAxiosRequestConfig,
  context: string,
): void {
  enforceAnthropicHostedRequestPolicy({
    transport: 'axios',
    url: config.url,
    baseUrl: config.baseURL,
    context,
    operation: config.method?.toUpperCase(),
  })
}
