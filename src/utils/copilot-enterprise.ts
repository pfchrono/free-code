/**
 * GitHub Copilot Enterprise configuration utilities
 */

import { getCopilotOAuthTokens } from './auth.js'
import { getCopilotApiBaseUrl } from '../services/api/copilot-constants.js'

export interface CopilotEnterpriseConfig {
  apiBaseUrl: string
  hostname: string
  isEnterprise: boolean
}

/**
 * Get the Copilot enterprise configuration from various sources
 */
export function getCopilotEnterpriseConfig(): CopilotEnterpriseConfig {
  // Priority:
  // 1. COPILOT_ENTERPRISE_URL environment variable
  // 2. OAuth token's enterpriseUrl
  // 3. Default to public Copilot API

  const envUrl = process.env.COPILOT_ENTERPRISE_URL
  const tokenUrl = getCopilotOAuthTokens()?.enterpriseUrl

  const enterpriseUrl = envUrl || tokenUrl
  if (enterpriseUrl) {
    try {
      const baseUrl = getCopilotApiBaseUrl(enterpriseUrl)
      const hostname = new URL(enterpriseUrl.includes('://') ? enterpriseUrl : `https://${enterpriseUrl}`).hostname

      return {
        apiBaseUrl: baseUrl,
        hostname,
        isEnterprise: true
      }
    } catch (error) {
      console.warn(`Invalid enterprise URL: ${enterpriseUrl}, falling back to public API`)
    }
  }

  return {
    apiBaseUrl: getCopilotApiBaseUrl(),
    hostname: 'api.githubcopilot.com',
    isEnterprise: false
  }
}

/**
 * Check if a model is available in the current enterprise context
 */
export function isModelAvailableInEnterprise(
  modelId: string,
  enterpriseConfig: CopilotEnterpriseConfig
): boolean {
  // Enterprise deployments may have restrictions on certain models
  // This is a placeholder for future enterprise-specific filtering logic
  // For now, we assume all models are available unless specifically restricted

  if (!enterpriseConfig.isEnterprise) {
    return true // Public API has no restrictions
  }

  // Future: Add enterprise-specific model filtering here
  // This could be based on organization policies, license tiers, etc.
  return true
}

/**
 * Get enterprise-specific headers if needed
 */
export function getEnterpriseHeaders(enterpriseConfig: CopilotEnterpriseConfig): Record<string, string> {
  const headers: Record<string, string> = {}

  if (enterpriseConfig.isEnterprise) {
    // Add enterprise-specific headers if needed
    headers['X-GitHub-Enterprise'] = 'true'
    headers['X-GitHub-Enterprise-Host'] = enterpriseConfig.hostname
  }

  return headers
}