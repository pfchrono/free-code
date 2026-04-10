import { getGlobalConfig, saveGlobalConfig } from './config.js'

export type ModelPreference = {
  provider: string
  model: string
  favoritedAt?: number
  usedAt?: number
}

export type ModelPreferences = {
  favorites: ModelPreference[]
  recent: ModelPreference[]
}

const MAX_RECENT = 10
const MAX_FAVORITES = 20

function getModelPreferences(): ModelPreferences {
  const config = getGlobalConfig()
  const prefs = (config as unknown as { modelPreferences?: ModelPreferences }).modelPreferences
  return prefs ?? { favorites: [], recent: [] }
}

function saveModelPreferences(prefs: ModelPreferences): void {
  saveGlobalConfig(current => ({
    ...current,
    modelPreferences: prefs,
  } as typeof current & { modelPreferences: ModelPreferences }))
}

export function addToRecent(provider: string, model: string): void {
  const prefs = getModelPreferences()

  prefs.recent = prefs.recent.filter(
    p => !(p.provider === provider && p.model === model),
  )

  prefs.recent.unshift({ provider, model, usedAt: Date.now() })

  if (prefs.recent.length > MAX_RECENT) {
    prefs.recent = prefs.recent.slice(0, MAX_RECENT)
  }

  saveModelPreferences(prefs)
}

export function toggleFavorite(provider: string, model: string): boolean {
  const prefs = getModelPreferences()

  const existingIndex = prefs.favorites.findIndex(
    p => p.provider === provider && p.model === model,
  )

  if (existingIndex >= 0) {
    prefs.favorites.splice(existingIndex, 1)
    saveModelPreferences(prefs)
    return false
  }

  prefs.favorites.unshift({ provider, model, favoritedAt: Date.now() })

  if (prefs.favorites.length > MAX_FAVORITES) {
    prefs.favorites = prefs.favorites.slice(0, MAX_FAVORITES)
  }

  saveModelPreferences(prefs)
  return true
}

export function isFavorite(provider: string, model: string): boolean {
  const prefs = getModelPreferences()
  return prefs.favorites.some(p => p.provider === provider && p.model === model)
}

export function getRecentModels(provider?: string): ModelPreference[] {
  const prefs = getModelPreferences()
  if (provider) {
    return prefs.recent.filter(p => p.provider === provider)
  }
  return prefs.recent
}

export function getFavoriteModels(provider?: string): ModelPreference[] {
  const prefs = getModelPreferences()
  if (provider) {
    return prefs.favorites.filter(p => p.provider === provider)
  }
  return prefs.favorites
}

export function clearRecentModels(): void {
  const prefs = getModelPreferences()
  prefs.recent = []
  saveModelPreferences(prefs)
}

export function clearAllPreferences(): void {
  saveModelPreferences({ favorites: [], recent: [] })
}
