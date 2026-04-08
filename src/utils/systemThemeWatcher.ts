import type { TerminalQuerier } from '../ink/terminal-querier.js'
import { oscColor } from '../ink/terminal-querier.js'
import {
  getSystemThemeName,
  setCachedSystemTheme,
  themeFromOscColor,
  type SystemTheme,
} from './systemTheme.js'

const POLL_INTERVAL_MS = 30_000

async function querySystemTheme(
  querier: TerminalQuerier,
): Promise<SystemTheme | undefined> {
  const [response] = await Promise.all([querier.send(oscColor(11)), querier.flush()])
  if (!response) return undefined
  return themeFromOscColor(response.data)
}

export function watchSystemTheme(
  querier: TerminalQuerier,
  onTheme: (theme: SystemTheme) => void,
): () => void {
  let disposed = false
  let interval: NodeJS.Timeout | undefined

  const updateTheme = async (): Promise<void> => {
    const detected = await querySystemTheme(querier)
    if (disposed || !detected) return
    if (detected === getSystemThemeName()) return

    setCachedSystemTheme(detected)
    onTheme(detected)
  }

  void updateTheme()

  interval = setInterval(() => {
    void updateTheme()
  }, POLL_INTERVAL_MS)
  interval.unref?.()

  return () => {
    disposed = true
    if (interval) clearInterval(interval)
  }
}
