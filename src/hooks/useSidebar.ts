import { useCallback, useState } from 'react'
import { useAppState, useSetAppState } from '../state/AppState.js'

export function useSidebar() {
  const appState = useAppState(s => s)
  const setAppState = useSetAppState()

  const sidebarOpen = appState.sidebarOpen ?? false
  const sidebarWidth = appState.sidebarWidth ?? 40

  const toggleSidebar = useCallback(() => {
    setAppState(prev => ({
      ...prev,
      sidebarOpen: !prev.sidebarOpen,
    }))
  }, [setAppState])

  const openSidebar = useCallback(() => {
    setAppState(prev => ({
      ...prev,
      sidebarOpen: true,
    }))
  }, [setAppState])

  const closeSidebar = useCallback(() => {
    setAppState(prev => ({
      ...prev,
      sidebarOpen: false,
    }))
  }, [setAppState])

  const setSidebarWidth = useCallback((width: number) => {
    setAppState(prev => ({
      ...prev,
      sidebarWidth: width,
    }))
  }, [setAppState])

  return {
    sidebarOpen,
    sidebarWidth,
    toggleSidebar,
    openSidebar,
    closeSidebar,
    setSidebarWidth,
  }
}
