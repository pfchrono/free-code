import type { APIProvider } from '../utils/model/providers.js'
import { setRuntimeProvider } from '../utils/model/providers.js'
import { useAppState, useSetAppState } from '../state/AppState.js'

/**
 * Switch the active API provider both at the runtime level and in AppState.
 * This ensures the UI and all components see the correct provider immediately.
 */
export function useProviderSwitch() {
  const setAppState = useSetAppState()

  const switchProvider = (provider: APIProvider) => {
    setRuntimeProvider(provider)
    setAppState(prev => ({ ...prev, provider }))
  }

  return { switchProvider }
}

/**
 * Non-hook version for use in commands that have access to context
 */
export function switchProviderDirectly(
  provider: APIProvider,
  setAppState?: (updater: (prev: { provider: APIProvider }) => { provider: APIProvider }) => void,
): void {
  setRuntimeProvider(provider)
  if (setAppState) {
    setAppState(prev => ({ ...prev, provider }))
  }
}
