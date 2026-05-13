import { PassThrough } from 'node:stream'

import { afterEach, describe, expect, test } from 'bun:test'
import { Text } from 'ink'
import React from 'react'

import { createRoot } from '../../ink.js'
import type { ThemeSetting } from '../../utils/theme.js'
import {
  ThemeProvider,
  usePreviewTheme,
  useTheme,
  useThemeSetting,
} from './ThemeProvider.js'

function createTestStreams(): {
  stdout: PassThrough
  stdin: PassThrough & {
    isTTY: boolean
    setRawMode: (mode: boolean) => void
    ref: () => void
    unref: () => void
  }
} {
  const stdout = new PassThrough()
  const stdin = new PassThrough() as PassThrough & {
    isTTY: boolean
    setRawMode: (mode: boolean) => void
    ref: () => void
    unref: () => void
  }

  stdin.isTTY = true
  stdin.setRawMode = () => {}
  stdin.ref = () => {}
  stdin.unref = () => {}
  ;(stdout as unknown as { columns: number }).columns = 120
  stdout.resume()

  return { stdout, stdin }
}

async function waitForCondition(
  predicate: () => boolean,
  options?: { timeoutMs?: number; intervalMs?: number },
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 2000
  const intervalMs = options?.intervalMs ?? 10
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return
    }
    await Bun.sleep(intervalMs)
  }

  throw new Error('Timed out waiting for ThemeProvider test condition')
}

async function renderThemeHarness(
  children: React.ReactNode,
): Promise<{
  dispose: () => Promise<void>
}> {
  const { stdout, stdin } = createTestStreams()
  const root = await createRoot({
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    patchConsole: false,
  })

  root.render(
    <ThemeProvider initialState="dark" onThemeSave={() => {}}>
      {children}
    </ThemeProvider>,
  )

  return {
    dispose: async () => {
      root.unmount()
      stdin.end()
      stdout.end()
      await Bun.sleep(0)
    },
  }
}

afterEach(async () => {
  await Bun.sleep(0)
})

describe('ThemeProvider hooks', () => {
  test('useTheme returns fresh current theme after updates', async () => {
    let currentTheme: string | undefined
    let setThemeSetting: ((setting: ThemeSetting) => void) | undefined

    function Harness(): React.ReactNode {
      const [theme, setTheme] = useTheme()
      currentTheme = theme
      setThemeSetting = setTheme
      return <Text>{theme}</Text>
    }

    const mounted = await renderThemeHarness(<Harness />)

    try {
      await waitForCondition(() => currentTheme === 'dark')
      setThemeSetting?.('light')
      await waitForCondition(() => currentTheme === 'light')
    } finally {
      await mounted.dispose()
    }
  })

  test('usePreviewTheme returns actions that update and cancel fresh preview state', async () => {
    let currentTheme: string | undefined
    let themeSetting: ThemeSetting | undefined
    let previewActions: ReturnType<typeof usePreviewTheme> | undefined

    function Harness(): React.ReactNode {
      const [theme] = useTheme()
      currentTheme = theme
      themeSetting = useThemeSetting()
      previewActions = usePreviewTheme()
      return <Text>{`${theme}:${themeSetting}`}</Text>
    }

    const mounted = await renderThemeHarness(<Harness />)

    try {
      await waitForCondition(() => currentTheme === 'dark')
      previewActions?.setPreviewTheme('light')
      await waitForCondition(() => currentTheme === 'light')
      expect(themeSetting).toBe('dark')

      previewActions?.cancelPreview()
      await waitForCondition(() => currentTheme === 'dark')
      expect(themeSetting).toBe('dark')
    } finally {
      await mounted.dispose()
    }
  })
})
