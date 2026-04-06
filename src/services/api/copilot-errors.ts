/**
 * GitHub Copilot API error classification and handling utilities
 */

export interface CopilotErrorInfo {
  type: 'auth' | 'rate_limit' | 'model_unavailable' | 'permission' | 'server' | 'unknown'
  retryable: boolean
  retryAfterMs?: number
  message: string
  suggestedAction?: string
}

/**
 * Classify a Copilot API error based on status code and response body
 */
export function classifyCopilotError(status: number, body: string, headers?: Headers): CopilotErrorInfo {
  let parsedBody: any = {}
  try {
    parsedBody = JSON.parse(body)
  } catch {
    // Body is not JSON, use as-is
  }

  const message = parsedBody?.message || parsedBody?.error || body || `HTTP ${status}`
  const code = parsedBody?.code || parsedBody?.error_code

  // Extract retry-after header if present
  const retryAfter = headers?.get('retry-after')
  const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined

  switch (status) {
    case 401:
      return {
        type: 'auth',
        retryable: false,
        message: 'Authentication failed - invalid or expired token',
        suggestedAction: 'Re-authenticate with GitHub Copilot'
      }

    case 403:
      if (code === 'copilot_not_enabled' || message.includes('Copilot')) {
        return {
          type: 'permission',
          retryable: false,
          message: 'GitHub Copilot is not enabled for this account',
          suggestedAction: 'Enable GitHub Copilot in your GitHub account settings'
        }
      }
      return {
        type: 'permission',
        retryable: false,
        message: 'Access denied',
        suggestedAction: 'Check your GitHub Copilot subscription and permissions'
      }

    case 404:
      if (message.includes('model') || code === 'model_not_found') {
        return {
          type: 'model_unavailable',
          retryable: false,
          message: 'The requested model is not available',
          suggestedAction: 'Try a different model or check model availability'
        }
      }
      return {
        type: 'server',
        retryable: false,
        message: 'Endpoint not found',
        suggestedAction: 'Check the API endpoint configuration'
      }

    case 429:
      return {
        type: 'rate_limit',
        retryable: true,
        retryAfterMs: retryAfterMs || 5000, // Default 5s if no header
        message: 'Rate limit exceeded',
        suggestedAction: 'Wait before retrying the request'
      }

    case 500:
    case 502:
    case 503:
    case 504:
      return {
        type: 'server',
        retryable: true,
        retryAfterMs: retryAfterMs || 2000, // Default 2s for server errors
        message: `Server error: ${message}`,
        suggestedAction: 'Retry the request after a short delay'
      }

    default:
      if (status >= 400 && status < 500) {
        return {
          type: 'unknown',
          retryable: false,
          message: `Client error: ${message}`,
          suggestedAction: 'Check the request parameters'
        }
      }

      return {
        type: 'unknown',
        retryable: status >= 500,
        retryAfterMs: status >= 500 ? 2000 : undefined,
        message: `Unexpected error: ${message}`,
        suggestedAction: status >= 500 ? 'Retry the request' : 'Check the request'
      }
  }
}

/**
 * Check if an error should be retried based on error type and attempt count
 */
export function shouldRetryError(
  errorInfo: CopilotErrorInfo,
  attemptCount: number,
  maxRetries: number = 3
): boolean {
  if (!errorInfo.retryable || attemptCount >= maxRetries) {
    return false
  }

  // Don't retry auth or permission errors
  if (errorInfo.type === 'auth' || errorInfo.type === 'permission') {
    return false
  }

  return true
}

/**
 * Get the delay before retrying based on error info and attempt count
 */
export function getRetryDelayMs(
  errorInfo: CopilotErrorInfo,
  attemptCount: number,
  baseDelayMs: number = 1000
): number {
  // Use retry-after header if available
  if (errorInfo.retryAfterMs) {
    return errorInfo.retryAfterMs
  }

  // Exponential backoff for other retryable errors
  if (errorInfo.retryable) {
    return Math.min(baseDelayMs * Math.pow(2, attemptCount), 30000) // Max 30s
  }

  return 0
}

/**
 * Check if a fetch error is retryable (network errors, timeouts, etc.)
 */
export function isRetryableFetchError(error: Error): boolean {
  const retryableErrors = [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ECONNREFUSED',
    'ENETDOWN',
    'ENETUNREACH',
    'EHOSTDOWN',
    'EHOSTUNREACH',
    'AbortError',
    'TimeoutError'
  ]

  const errorMessage = error.message.toLowerCase()

  return retryableErrors.some(retryableError =>
    errorMessage.includes(retryableError.toLowerCase())
  )
}