import { logEvent } from 'src/services/analytics/index.js'
import {
  COPILOT_ACCESS_TOKEN_URL,
  COPILOT_DEVICE_CODE_URL,
  COPILOT_GITHUB_APP_ID,
  COPILOT_SCOPES,
  COPILOT_TOKEN_URL,
  COPILOT_USER_URL,
  COPILOT_VERIFY_URL,
} from '../../constants/copilot-oauth.js'
import { openBrowser } from '../../utils/browser.js'
import { logError } from '../../utils/log.js'

const COPILOT_EDITOR_VERSION = 'vscode/1.80.1'
const COPILOT_PLUGIN_VERSION = 'copilot-chat/0.26.7'
const COPILOT_USER_AGENT = 'GitHubCopilotChat/0.26.7'

function normalizeDomain(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

function getCopilotApiBaseUrl(enterpriseUrl?: string): string {
  return enterpriseUrl
    ? `https://copilot-api.${normalizeDomain(enterpriseUrl)}`
    : COPILOT_API_BASE_URL
}

export type CopilotTokens = {
  githubToken: string
  copilotToken: string
  expiresAt: number
  login: string
  scopes?: string[]
  enterpriseUrl?: string
}

type DeviceCodeResponse = {
  device_code: string
  user_code: string
  verification_uri?: string
  verification_uri_complete?: string
  expires_in: number
  interval: number
}

type DeviceTokenResponse = {
  access_token?: string
  token_type?: string
  scope?: string
  error?: string
  error_description?: string
  interval?: number
}

type CopilotTokenResponse = {
  token?: string
  expires_at?: number | string
  expires_in?: number
}

type GitHubUserResponse = {
  login?: string
}

async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const body = new URLSearchParams({
    client_id: COPILOT_GITHUB_APP_ID,
    scope: COPILOT_SCOPES,
  })

  const response = await fetch(COPILOT_DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  if (!response.ok) {
    throw new Error(`GitHub device flow failed with status ${response.status}`)
  }

  return (await response.json()) as DeviceCodeResponse
}

async function pollForGitHubAccessToken(
  deviceCode: string,
  intervalSeconds: number,
  expiresInSeconds: number,
): Promise<{ accessToken: string; scopes: string[] }> {
  const startedAt = Date.now()
  let pollIntervalMs = Math.max(intervalSeconds, 1) * 1000

  while (Date.now() - startedAt < expiresInSeconds * 1000) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))

    const body = new URLSearchParams({
      client_id: COPILOT_GITHUB_APP_ID,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    })

    const response = await fetch(COPILOT_ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    })

    const json = (await response.json()) as DeviceTokenResponse
    if (json.access_token) {
      return {
        accessToken: json.access_token,
        scopes: (json.scope ?? '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      }
    }

    if (json.error === 'authorization_pending') {
      continue
    }

    if (json.error === 'slow_down') {
      pollIntervalMs += 5000
      continue
    }

    if (json.error === 'expired_token') {
      throw new Error('GitHub device flow expired before authorization completed')
    }

    if (json.error) {
      throw new Error(json.error_description ?? `GitHub device flow failed: ${json.error}`)
    }
  }

  throw new Error('Timed out waiting for GitHub device authorization')
}

function getCopilotHeaders(githubToken: string): HeadersInit {
  return {
    Authorization: `token ${githubToken}`,
    Accept: 'application/json',
    'User-Agent': COPILOT_USER_AGENT,
    'Editor-Version': COPILOT_EDITOR_VERSION,
    'Editor-Plugin-Version': COPILOT_PLUGIN_VERSION,
  }
}

function parseCopilotExpiry(json: CopilotTokenResponse): number {
  if (typeof json.expires_at === 'number') {
    return json.expires_at > 1_000_000_000_000
      ? json.expires_at
      : json.expires_at * 1000
  }

  if (typeof json.expires_at === 'string') {
    const parsed = Date.parse(json.expires_at)
    if (!Number.isNaN(parsed)) {
      return parsed
    }
  }

  if (typeof json.expires_in === 'number') {
    return Date.now() + json.expires_in * 1000
  }

  return Date.now() + 25 * 60 * 1000
}

export async function exchangeCopilotToken(
  githubToken: string,
  enterpriseUrl?: string,
): Promise<{ copilotToken: string; expiresAt: number }> {
  const response = await fetch(
    enterpriseUrl
      ? `${getCopilotApiBaseUrl(enterpriseUrl)}/copilot_internal/v2/token`
      : COPILOT_TOKEN_URL,
    {
      headers: getCopilotHeaders(githubToken),
    },
  )

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `GitHub Copilot token exchange failed with status ${response.status}: ${body}`,
    )
  }

  const json = (await response.json()) as CopilotTokenResponse
  if (!json.token) {
    throw new Error('GitHub Copilot token exchange did not return a session token')
  }

  return {
    copilotToken: json.token,
    expiresAt: parseCopilotExpiry(json),
  }
}

async function fetchGitHubLogin(githubToken: string): Promise<string> {
  const response = await fetch(COPILOT_USER_URL, {
    headers: getCopilotHeaders(githubToken),
  })

  if (!response.ok) {
    throw new Error(`GitHub user lookup failed with status ${response.status}`)
  }

  const json = (await response.json()) as GitHubUserResponse
  if (!json.login) {
    throw new Error('GitHub user lookup did not return a login name')
  }

  return json.login
}

export async function refreshCopilotTokens(
  tokens: Pick<CopilotTokens, 'githubToken' | 'login' | 'scopes'>,
): Promise<CopilotTokens> {
  const exchanged = await exchangeCopilotToken(tokens.githubToken)
  return {
    githubToken: tokens.githubToken,
    copilotToken: exchanged.copilotToken,
    expiresAt: exchanged.expiresAt,
    login: tokens.login,
    scopes: tokens.scopes,
  }
}

export async function runCopilotOAuthFlow(
  onUrlReady: (url: string) => Promise<void>,
): Promise<CopilotTokens> {
  logEvent('tengu_oauth_copilot_flow_start', {})

  try {
    const deviceCode = await requestDeviceCode()
    const verificationUrl =
      deviceCode.verification_uri_complete ?? deviceCode.verification_uri ?? COPILOT_VERIFY_URL

    await onUrlReady(`${verificationUrl}${verificationUrl.includes(deviceCode.user_code) ? '' : `\nCode: ${deviceCode.user_code}`}`)
    await openBrowser(deviceCode.verification_uri_complete ?? verificationUrl)

    const { accessToken, scopes } = await pollForGitHubAccessToken(
      deviceCode.device_code,
      deviceCode.interval,
      deviceCode.expires_in,
    )
    const [login, exchanged] = await Promise.all([
      fetchGitHubLogin(accessToken),
      exchangeCopilotToken(accessToken),
    ])

    logEvent('tengu_oauth_copilot_success', {})

    return {
      githubToken: accessToken,
      copilotToken: exchanged.copilotToken,
      expiresAt: exchanged.expiresAt,
      login,
      scopes,
    }
  } catch (error) {
    logEvent('tengu_oauth_copilot_error', {})
    logError(error as Error)
    throw error
  }
}