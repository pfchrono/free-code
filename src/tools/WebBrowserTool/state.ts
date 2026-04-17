type BrowserState = {
  url: string | null
  title: string | null
  status: 'idle' | 'open' | 'error'
  error: string | null
}

let browserState: BrowserState = {
  url: null,
  title: null,
  status: 'idle',
  error: null,
}

const listeners = new Set<() => void>()

export function getWebBrowserState(): BrowserState {
  return browserState
}

export function setWebBrowserState(next: Partial<BrowserState>): void {
  browserState = {
    ...browserState,
    ...next,
  }
  for (const listener of listeners) {
    listener()
  }
}

export function subscribeWebBrowserState(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
