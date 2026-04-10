import { useCallback } from 'react'
import {
  addToRecent,
  toggleFavorite as toggleFavoriteUtil,
  isFavorite as isFavoriteUtil,
  getRecentModels,
  getFavoriteModels,
  type ModelPreference,
} from '../utils/modelPreferences.js'

export function useModelPreferences(provider: string) {
  const recentModels = getRecentModels(provider)
  const favoriteModels = getFavoriteModels(provider)

  const addRecent = useCallback(
    (model: string) => {
      addToRecent(provider, model)
    },
    [provider],
  )

  const toggleFavorite = useCallback(
    (model: string) => {
      return toggleFavoriteUtil(provider, model)
    },
    [provider],
  )

  const isFavorite = useCallback(
    (model: string) => {
      return isFavoriteUtil(provider, model)
    },
    [provider],
  )

  return {
    recentModels,
    favoriteModels,
    addRecent,
    toggleFavorite,
    isFavorite,
  }
}
