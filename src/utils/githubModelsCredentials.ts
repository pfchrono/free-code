import { isBareMode, isEnvTruthy } from './envUtils.js'
import { getSecureStorage } from './secureStorage/index.js'

export const GITHUB_MODELS_STORAGE_KEY = 'githubModels' as const

export type GithubModelsCredentialBlob = {
  accessToken: string
}

export function readGithubModelsToken(): string | undefined {
  if (isBareMode()) return undefined
  try {
    const data = getSecureStorage().read() as
      | ({ githubModels?: GithubModelsCredentialBlob } & Record<string, unknown>)
      | null
    const token = data?.githubModels?.accessToken?.trim()
    return token || undefined
  } catch {
    return undefined
  }
}

export function hydrateGithubModelsTokenFromSecureStorage(): void {
  if (!isEnvTruthy(process.env.CLAUDE_CODE_USE_GITHUB)) {
    return
  }
  if (process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim()) {
    return
  }
  if (isBareMode()) {
    return
  }
  const token = readGithubModelsToken()
  if (token) {
    process.env.GITHUB_TOKEN = token
  }
}

export function saveGithubModelsToken(token: string): {
  success: boolean
  warning?: string
} {
  if (isBareMode()) {
    return { success: false, warning: 'Bare mode: secure storage is disabled.' }
  }
  const trimmed = token.trim()
  if (!trimmed) {
    return { success: false, warning: 'Token is empty.' }
  }
  const secureStorage = getSecureStorage()
  const prev = secureStorage.read() || {}
  const merged = {
    ...(prev as Record<string, unknown>),
    [GITHUB_MODELS_STORAGE_KEY]: { accessToken: trimmed },
  }
  return secureStorage.update(merged as typeof prev)
}

export function clearGithubModelsToken(): {
  success: boolean
  warning?: string
} {
  if (isBareMode()) {
    return { success: true }
  }
  const secureStorage = getSecureStorage()
  const prev = secureStorage.read() || {}
  const next = { ...(prev as Record<string, unknown>) }
  delete next[GITHUB_MODELS_STORAGE_KEY]
  return secureStorage.update(next as typeof prev)
}
