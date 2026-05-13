import { afterEach, describe, expect, mock, test } from 'bun:test'

const originalWaylandDisplay = process.env.WAYLAND_DISPLAY

afterEach(() => {
  if (originalWaylandDisplay === undefined) {
    delete process.env.WAYLAND_DISPLAY
  } else {
    process.env.WAYLAND_DISPLAY = originalWaylandDisplay
  }
  mock.restore()
})

describe('screenshot clipboard Linux backend selection', () => {
  test('tries wl-copy before X11 backends under Wayland', async () => {
    process.env.WAYLAND_DISPLAY = 'wayland-1'
    const calls: Array<{ command: string; args: string[] }> = []
    const runner = mock(async (command: string, args: string[]) => {
      calls.push({ command, args })
      return { stdout: '', stderr: '', code: command === 'sh' ? 0 : 1 }
    })

    mock.module('./platform.js', () => ({ getPlatform: () => 'linux' }))
    const { __test } = await import(`./screenshotClipboard.ts?wayland=${Date.now()}`)
    const result = await __test.copyPngToClipboard('/tmp/screen.png', runner)

    expect(result.success).toBe(true)
    expect(calls[0]).toEqual({
      command: 'sh',
      args: ['-c', 'wl-copy --type image/png < "$1"', 'sh', '/tmp/screen.png'],
    })
  })

  test('keeps xclip first when Wayland is not active', async () => {
    delete process.env.WAYLAND_DISPLAY
    const calls: Array<{ command: string; args: string[] }> = []
    const runner = mock(async (command: string, args: string[]) => {
      calls.push({ command, args })
      return { stdout: '', stderr: '', code: command === 'xclip' ? 0 : 1 }
    })

    mock.module('./platform.js', () => ({ getPlatform: () => 'linux' }))
    const { __test } = await import(`./screenshotClipboard.ts?x11=${Date.now()}`)
    const result = await __test.copyPngToClipboard('/tmp/screen.png', runner)

    expect(result.success).toBe(true)
    expect(calls[0]).toEqual({
      command: 'xclip',
      args: ['-selection', 'clipboard', '-t', 'image/png', '-i', '/tmp/screen.png'],
    })
  })

  test('failure hint mentions Wayland and X11 packages', async () => {
    process.env.WAYLAND_DISPLAY = 'wayland-1'
    const runner = mock(async () => ({ stdout: '', stderr: 'missing', code: 1 }))

    mock.module('./platform.js', () => ({ getPlatform: () => 'linux' }))
    const { __test } = await import(`./screenshotClipboard.ts?fail=${Date.now()}`)
    const result = await __test.copyPngToClipboard('/tmp/screen.png', runner)

    expect(result.success).toBe(false)
    expect(result.message).toContain('wl-clipboard')
    expect(result.message).toContain('xclip')
    expect(result.message).toContain('xsel')
  })
})
