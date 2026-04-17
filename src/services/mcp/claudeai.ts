import axios from 'axios'
import memoize from 'lodash-es/memoize.js'
import { getOauthConfig } from 'src/constants/oauth.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import {
  getClaudeAIOAuthTokens,
  getCodexOAuthTokens,
  getCopilotOAuthTokens,
} from 'src/utils/auth.js'
import { getCopilotApiBaseUrl } from 'src/services/api/copilot-constants.js'
import { getGlobalConfig, saveGlobalConfig } from 'src/utils/config.js'
import { logForDebugging } from 'src/utils/debug.js'
import { isEnvDefinedFalsy } from 'src/utils/envUtils.js'
import { getAPIProvider } from 'src/utils/model/providers.js'
import { clearMcpAuthCache } from './client.js'
import { normalizeNameForMCP } from './normalization.js'
import type { ScopedMcpServerConfig } from './types.js'

type ManagedMcpServer = {
  id: string
  displayName: string
  url: string
}

type ClaudeAIMcpServer = {
  type: 'mcp_server'
  id: string
  display_name: string
  url: string
  created_at: string
}

type ClaudeAIMcpServersResponse = {
  data: ClaudeAIMcpServer[]
  has_more: boolean
  next_page: string | null
}

const FETCH_TIMEOUT_MS = 5000
const MCP_SERVERS_BETA_HEADER = 'mcp-servers-2025-12-04'

const PROVIDER_PREFIX: Record<'firstParty' | 'copilot' | 'codex' | 'openai' | 'openrouter', string> = {
  firstParty: 'claude.ai',
  copilot: 'copilot managed',
  codex: 'codex managed',
  openai: 'openai managed',
  openrouter: 'openrouter managed',
}

function normalizeManagedServersResponse(payload: unknown): ManagedMcpServer[] {
  const managed: ManagedMcpServer[] = []

  if (!payload || typeof payload !== 'object') {
    return managed
  }

  const obj = payload as Record<string, unknown>
  const directData = Array.isArray(obj.data)
    ? obj.data
    : Array.isArray(obj.servers)
      ? obj.servers
      : []

  for (const server of directData) {
    if (!server || typeof server !== 'object') continue
    const s = server as Record<string, unknown>
    const id =
      typeof s.id === 'string'
        ? s.id
        : typeof s.server_id === 'string'
          ? s.server_id
          : typeof s.name === 'string'
            ? s.name
            : null
    const displayName =
      typeof s.display_name === 'string'
        ? s.display_name
        : typeof s.name === 'string'
          ? s.name
          : null
    const url = typeof s.url === 'string' ? s.url : null
    if (!id || !displayName || !url) continue
    managed.push({ id, displayName, url })
  }

  if (managed.length > 0) {
    return managed
  }

  if (obj.servers && typeof obj.servers === 'object' && !Array.isArray(obj.servers)) {
    for (const [name, cfg] of Object.entries(
      obj.servers as Record<string, unknown>,
    )) {
      if (!cfg || typeof cfg !== 'object') continue
      const c = cfg as Record<string, unknown>
      const id =
        typeof c.id === 'string'
          ? c.id
          : typeof c.server_id === 'string'
            ? c.server_id
            : name
      const url = typeof c.url === 'string' ? c.url : null
      if (!url) continue
      managed.push({
        id,
        displayName:
          typeof c.display_name === 'string' ? c.display_name : name,
        url,
      })
    }
  }

  return managed
}

function getManagedEndpointForProvider(
  provider: 'copilot' | 'codex' | 'openai' | 'openrouter',
): string | null {
  const envByProvider: Record<typeof provider, string | undefined> = {
    copilot: process.env.COPILOT_MANAGED_MCP_SERVERS_URL,
    codex: process.env.CODEX_MANAGED_MCP_SERVERS_URL,
    openai: process.env.OPENAI_MANAGED_MCP_SERVERS_URL,
    openrouter: process.env.OPENROUTER_MANAGED_MCP_SERVERS_URL,
  }

  const configuredEndpoint =
    envByProvider[provider] ?? process.env.PROVIDER_MANAGED_MCP_SERVERS_URL
  if (configuredEndpoint) {
    return configuredEndpoint
  }

  // Automatic fallback endpoints so provider switching via /copilot, /codex,
  // or /openai does not require manual endpoint environment variables.
  if (provider === 'copilot') {
    const enterpriseUrl = getCopilotOAuthTokens()?.enterpriseUrl
    const copilotBase = getCopilotApiBaseUrl(enterpriseUrl)
    return `${copilotBase}/v1/mcp_servers?limit=1000`
  }

  // Codex/OpenAI/OpenRouter all default to OpenAI-compatible managed MCP discovery unless overridden.
  return 'https://api.openai.com/v1/mcp_servers?limit=1000'
}

function getManagedBearerTokenForProvider(
  provider: 'copilot' | 'codex' | 'openai' | 'openrouter',
): string | null {
  if (provider === 'copilot') {
    return getCopilotOAuthTokens()?.copilotToken ?? null
  }
  if (provider === 'codex') {
    return getCodexOAuthTokens()?.accessToken ?? null
  }
  if (provider === 'openrouter') {
    return process.env.OPENROUTER_API_KEY ?? null
  }
  return process.env.OPENAI_API_KEY ?? null
}

function buildManagedConfigs(
  provider: 'firstParty' | 'copilot' | 'codex' | 'openai' | 'openrouter',
  servers: ManagedMcpServer[],
): Record<string, ScopedMcpServerConfig> {
  const configs: Record<string, ScopedMcpServerConfig> = {}
  const prefix = PROVIDER_PREFIX[provider]

  const usedNormalizedNames = new Set<string>()

  for (const server of servers) {
    const baseName = `${prefix} ${server.displayName}`

    let finalName = baseName
    let finalNormalized = normalizeNameForMCP(finalName)
    let count = 1
    while (usedNormalizedNames.has(finalNormalized)) {
      count++
      finalName = `${baseName} (${count})`
      finalNormalized = normalizeNameForMCP(finalName)
    }
    usedNormalizedNames.add(finalNormalized)

    if (provider === 'firstParty') {
      configs[finalName] = {
        type: 'claudeai-proxy',
        url: server.url,
        id: server.id,
        scope: 'claudeai',
      }
      continue
    }

    configs[finalName] = {
      type: 'provider-managed-proxy',
      provider,
      url: server.url,
      id: server.id,
      scope: 'managed',
    }
  }

  return configs
}

async function fetchFirstPartyManagedMcpConfigsIfEligible(): Promise<
  Record<string, ScopedMcpServerConfig>
> {
  if (isEnvDefinedFalsy(process.env.ENABLE_CLAUDEAI_MCP_SERVERS)) {
    logForDebugging('[managed-mcp:firstParty] Disabled via env var')
    logEvent('tengu_claudeai_mcp_eligibility', {
      state:
        'disabled_env_var' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    return {}
  }

  const tokens = getClaudeAIOAuthTokens()
  if (!tokens?.accessToken) {
    logForDebugging('[managed-mcp:firstParty] No access token')
    logEvent('tengu_claudeai_mcp_eligibility', {
      state:
        'no_oauth_token' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    return {}
  }

  if (!tokens.scopes?.includes('user:mcp_servers')) {
    logForDebugging(
      `[managed-mcp:firstParty] Missing user:mcp_servers scope (scopes=${tokens.scopes?.join(',') || 'none'})`,
    )
    logEvent('tengu_claudeai_mcp_eligibility', {
      state:
        'missing_scope' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    return {}
  }

  const baseUrl = getOauthConfig().BASE_API_URL
  const url = `${baseUrl}/v1/mcp_servers?limit=1000`

  logForDebugging(`[managed-mcp:firstParty] Fetching from ${url}`)

  const response = await axios.get<ClaudeAIMcpServersResponse>(url, {
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json',
      'anthropic-beta': MCP_SERVERS_BETA_HEADER,
      'anthropic-version': '2023-06-01',
    },
    timeout: FETCH_TIMEOUT_MS,
  })

  const servers = (response.data.data || []).map(server => ({
    id: server.id,
    displayName: server.display_name,
    url: server.url,
  }))
  const configs = buildManagedConfigs('firstParty', servers)

  logForDebugging(
    `[managed-mcp:firstParty] Fetched ${Object.keys(configs).length} servers`,
  )
  logEvent('tengu_claudeai_mcp_eligibility', {
    state: 'eligible' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  return configs
}

async function fetchThirdPartyManagedMcpConfigsIfEligible(
  provider: 'copilot' | 'codex' | 'openai' | 'openrouter',
): Promise<Record<string, ScopedMcpServerConfig>> {
  if (isEnvDefinedFalsy(process.env.ENABLE_PROVIDER_MANAGED_MCP_SERVERS)) {
    logForDebugging(`[managed-mcp:${provider}] Disabled via env var`)
    return {}
  }

  const endpoint = getManagedEndpointForProvider(provider)
  if (!endpoint) {
    logForDebugging(
      `[managed-mcp:${provider}] No managed MCP endpoint available`,
    )
    return {}
  }

  const bearerToken = getManagedBearerTokenForProvider(provider)
  if (!bearerToken) {
    logForDebugging(`[managed-mcp:${provider}] Missing provider auth token`)
    return {}
  }

  logForDebugging(`[managed-mcp:${provider}] Fetching from ${endpoint}`)

  const response = await axios.get(endpoint, {
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
    },
    timeout: FETCH_TIMEOUT_MS,
  })

  const servers = normalizeManagedServersResponse(response.data)
  const configs = buildManagedConfigs(provider, servers)

  logForDebugging(
    `[managed-mcp:${provider}] Fetched ${Object.keys(configs).length} servers`,
  )
  return configs
}

/**
 * Fetches provider-managed MCP server configurations.
 * - firstParty: claude.ai managed connectors via Anthropic OAuth + MCP proxy
 * - copilot/codex/openai: provider-managed connectors via provider endpoint + provider token
 *
 * Results are memoized for the session lifetime (fetch once per CLI session).
 */
export const fetchProviderManagedMcpConfigsIfEligible = memoize(
  async (): Promise<Record<string, ScopedMcpServerConfig>> => {
    try {
      const provider = getAPIProvider()

      if (provider === 'firstParty') {
        return await fetchFirstPartyManagedMcpConfigsIfEligible()
      }

      if (
        provider === 'copilot' ||
        provider === 'codex' ||
        provider === 'openai'
      ) {
        return await fetchThirdPartyManagedMcpConfigsIfEligible(provider)
      }

      logForDebugging(`[managed-mcp] Skipping unsupported provider: ${provider}`)
      return {}
    } catch (error) {
      logForDebugging(`[managed-mcp] Fetch failed: ${error}`)
      return {}
    }
  },
)

// Backward-compatible alias for existing call sites.
export const fetchClaudeAIMcpConfigsIfEligible =
  fetchProviderManagedMcpConfigsIfEligible

/**
 * Clears the memoized cache for provider-managed MCP config fetches.
 * Call this after login so the next fetch will use new auth tokens.
 */
export function clearProviderManagedMcpConfigsCache(): void {
  fetchProviderManagedMcpConfigsIfEligible.cache.clear?.()
  // Also clear the auth cache so freshly-authorized servers get re-connected
  clearMcpAuthCache()
}

export function clearClaudeAIMcpConfigsCache(): void {
  clearProviderManagedMcpConfigsCache()
}

/**
 * Record that a claude.ai connector successfully connected. Idempotent.
 *
 * Gates the "N connectors unavailable/need auth" startup notifications: a
 * connector that was working yesterday and is now failed is a state change
 * worth surfacing; an org-configured connector that's been needs-auth since
 * it showed up is one the user has demonstrably ignored.
 */
export function markClaudeAiMcpConnected(name: string): void {
  saveGlobalConfig(current => {
    const seen = current.claudeAiMcpEverConnected ?? []
    if (seen.includes(name)) return current
    return { ...current, claudeAiMcpEverConnected: [...seen, name] }
  })
}

export function hasClaudeAiMcpEverConnected(name: string): boolean {
  return (getGlobalConfig().claudeAiMcpEverConnected ?? []).includes(name)
}
