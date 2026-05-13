import { mkdir, unlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { type AnsiToPngOptions, ansiToPng } from './ansiToPng.js'
import { execFileNoThrowWithCwd } from './execFileNoThrow.js'
import { logError } from './log.js'
import { getPlatform } from './platform.js'

/**
 * Copies an image (from ANSI text) to the system clipboard.
 * Supports macOS, Linux (with wl-copy/xclip/xsel), and Windows.
 *
 * Pure-TS pipeline: ANSI text → bitmap-font render → PNG encode. No WASM,
 * no system fonts, so this works in every build (native and JS).
 */
export async function copyAnsiToClipboard(
  ansiText: string,
  options?: AnsiToPngOptions,
): Promise<{ success: boolean; message: string }> {
  try {
    const tempDir = join(tmpdir(), 'claude-code-screenshots')
    await mkdir(tempDir, { recursive: true })

    const pngPath = join(tempDir, `screenshot-${Date.now()}.png`)
    const pngBuffer = ansiToPng(ansiText, options)
    await writeFile(pngPath, pngBuffer)

    const result = await copyPngToClipboard(pngPath)

    try {
      await unlink(pngPath)
    } catch {
      // Ignore cleanup errors
    }

    return result
  } catch (error) {
    logError(error)
    return {
      success: false,
      message: `Failed to copy screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

type ClipboardCommandResult = Awaited<ReturnType<typeof execFileNoThrowWithCwd>>
type ClipboardCommandRunner = typeof execFileNoThrowWithCwd

async function runClipboardCommand(
  runner: ClipboardCommandRunner,
  command: string,
  args: string[],
): Promise<ClipboardCommandResult> {
  return runner(command, args, { timeout: 5000 })
}

async function copyPngToClipboard(
  pngPath: string,
  runCommand: ClipboardCommandRunner = execFileNoThrowWithCwd,
): Promise<{ success: boolean; message: string }> {
  const platform = getPlatform()

  if (platform === 'macos') {
    // macOS: Use osascript to copy PNG to clipboard
    // Escape backslashes and double quotes for AppleScript string
    const escapedPath = pngPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const script = `set the clipboard to (read (POSIX file "${escapedPath}") as «class PNGf»)`
    const result = await runClipboardCommand(runCommand, 'osascript', ['-e', script])

    if (result.code === 0) {
      return { success: true, message: 'Screenshot copied to clipboard' }
    }
    return {
      success: false,
      message: `Failed to copy to clipboard: ${result.stderr}`,
    }
  }

  if (platform === 'linux') {
    const wlCopy = {
      command: 'sh',
      args: ['-c', 'wl-copy --type image/png < "$1"', 'sh', pngPath],
    }
    const xclip = {
      command: 'xclip',
      args: ['-selection', 'clipboard', '-t', 'image/png', '-i', pngPath],
    }
    const xsel = {
      command: 'sh',
      args: ['-c', 'xsel --clipboard --input --type image/png < "$1"', 'sh', pngPath],
    }
    const commands: Array<{ command: string; args: string[] }> =
      process.env.WAYLAND_DISPLAY
        ? [wlCopy, xclip, xsel]
        : [xclip, wlCopy, xsel]

    for (const { command, args } of commands) {
      const result = await runClipboardCommand(runCommand, command, args)
      if (result.code === 0) {
        return { success: true, message: 'Screenshot copied to clipboard' }
      }
    }

    return {
      success: false,
      message:
        'Failed to copy to clipboard. Please install wl-clipboard, xclip, or xsel: sudo apt install wl-clipboard xclip xsel',
    }
  }

  if (platform === 'windows') {
    // Windows: Use PowerShell to copy image to clipboard
    const psScript = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetImage([System.Drawing.Image]::FromFile('${pngPath.replace(/'/g, "''")}'))`
    const result = await runCommand(
      'powershell',
      ['-NoProfile', '-Command', psScript],
      { timeout: 5000 },
    )

    if (result.code === 0) {
      return { success: true, message: 'Screenshot copied to clipboard' }
    }
    return {
      success: false,
      message: `Failed to copy to clipboard: ${result.stderr}`,
    }
  }

  return {
    success: false,
    message: `Screenshot to clipboard is not supported on ${platform}`,
  }
}

export const __test = {
  copyPngToClipboard,
}
