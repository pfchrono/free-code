import { feature } from 'bun:bundle'
import { randomBytes } from 'crypto'
import { execa } from 'execa'
import { basename, extname, isAbsolute, join } from 'path'
import { fileURLToPath } from 'url'
import {
  IMAGE_MAX_HEIGHT,
  IMAGE_MAX_WIDTH,
  IMAGE_TARGET_RAW_SIZE,
} from '../constants/apiLimits.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { getImageProcessor } from '../tools/FileReadTool/imageProcessor.js'
import { logForDebugging } from './debug.js'
import { execFileNoThrowWithCwd } from './execFileNoThrow.js'
import { getFsImplementation } from './fsOperations.js'
import {
  detectImageFormatFromBase64,
  type ImageDimensions,
  maybeResizeAndDownsampleImageBuffer,
} from './imageResizer.js'
import { logError } from './log.js'

// Native NSPasteboard reader. GrowthBook gate tengu_collage_kaleidoscope is
// a kill switch (default on). Falls through to osascript when off.
// The gate string is inlined at each callsite INSIDE the feature() condition
// — module-scope helpers are NOT tree-shaken (see docs/feature-gating.md).

type SupportedPlatform = 'darwin' | 'linux' | 'win32'

// Threshold in characters for when to consider text a "large paste"
export const PASTE_THRESHOLD = 800

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function getClipboardTempPath(extension = 'png'): string {
  const platform = process.platform as SupportedPlatform
  const baseTmpDir =
    process.env.CLAUDE_CODE_TMPDIR ||
    (platform === 'win32' ? process.env.TEMP || 'C:\\Temp' : '/tmp')
  const fs = getFsImplementation()
  if (!fs.existsSync(baseTmpDir)) {
    fs.mkdirSync(baseTmpDir, { mode: 0o700 })
  }
  const safeExtension = extension.replace(/[^a-z0-9]/gi, '') || 'png'
  return join(
    baseTmpDir,
    `free-code-clipboard-${Date.now()}-${randomBytes(6).toString('hex')}.${safeExtension}`,
  )
}

function isProbablyWsl(): boolean {
  if (process.platform !== 'linux') {
    return false
  }
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) {
    return true
  }
  try {
    const version = getFsImplementation()
      .readFileSync('/proc/version', { encoding: 'utf8' })
      .toLowerCase()
    return version.includes('microsoft') || version.includes('wsl')
  } catch {
    return false
  }
}

function convertWindowsPathToWsl(input: string): string | null {
  if (!/^[A-Za-z]:[\\/]/.test(input)) {
    return null
  }
  const drive = input[0]?.toLowerCase()
  if (!drive) {
    return null
  }
  const rest = input.slice(2).replace(/^[\\/]+/, '').split(/[\\/]+/).join('/')
  return `/mnt/${drive}/${rest}`
}

async function tryDumpWindowsClipboardImage(): Promise<string | null> {
  const script = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $img = Get-Clipboard -Format Image; if ($img -ne $null) { $p=[System.IO.Path]::GetTempFileName(); $p = [System.IO.Path]::ChangeExtension($p,'png'); $img.Save($p,[System.Drawing.Imaging.ImageFormat]::Png); Write-Output $p } else { exit 1 }`

  for (const command of ['powershell.exe', 'pwsh', 'powershell']) {
    const result = await execa(command, ['-NoProfile', '-Command', script], {
      reject: false,
    })
    if (result.exitCode === 0 && result.stdout.trim()) {
      const mappedPath = convertWindowsPathToWsl(result.stdout.trim())
      if (mappedPath) {
        return mappedPath
      }
    }
  }

  return null
}

export function buildLinuxImageSaveCommand(path: string): string {
  const quotedPath = shellQuote(path)
  const targets = [
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/gif',
    'image/bmp',
  ]
  const xclipCommands = targets.map(
    target =>
      `xclip -selection clipboard -t ${shellQuote(target)} -o > ${quotedPath} 2>/dev/null`,
  )
  const wlPasteCommands = targets.map(
    target => `wl-paste --type ${shellQuote(target)} > ${quotedPath} 2>/dev/null`,
  )
  return [...xclipCommands, ...wlPasteCommands].join(' || ')
}

function getClipboardCommands() {
  const platform = process.platform as SupportedPlatform

  const screenshotPath = getClipboardTempPath('png')
  const quotedScreenshotPath = shellQuote(screenshotPath)
  const windowsScreenshotPath = screenshotPath.replace(/\\/g, '\\\\')

  // Platform-specific clipboard commands
  const commands: Record<
    SupportedPlatform,
    {
      checkImage: string
      saveImage: string
      getPath: string
      deleteFile: string
    }
  > = {
    darwin: {
      checkImage: `osascript -e 'the clipboard as «class PNGf»'`,
      saveImage: `osascript -e 'set png_data to (the clipboard as «class PNGf»)' -e 'set fp to open for access POSIX file "${screenshotPath}" with write permission' -e 'write png_data to fp' -e 'close access fp'`,
      getPath: `osascript -e 'get POSIX path of (the clipboard as «class furl»)'`,
      deleteFile: `rm -f ${quotedScreenshotPath}`,
    },
    linux: {
      checkImage:
        'xclip -selection clipboard -t TARGETS -o 2>/dev/null | grep -E "image/(png|jpeg|jpg|gif|webp|bmp)|text/uri-list|x-special/gnome-copied-files" || wl-paste -l 2>/dev/null | grep -E "image/(png|jpeg|jpg|gif|webp|bmp)|text/uri-list|x-special/gnome-copied-files"',
      saveImage: buildLinuxImageSaveCommand(screenshotPath),
      getPath:
        'xclip -selection clipboard -t text/uri-list -o 2>/dev/null || xclip -selection clipboard -t x-special/gnome-copied-files -o 2>/dev/null || xclip -selection clipboard -t text/plain -o 2>/dev/null || wl-paste --type text/uri-list 2>/dev/null || wl-paste --type x-special/gnome-copied-files 2>/dev/null || wl-paste 2>/dev/null',
      deleteFile: `rm -f ${quotedScreenshotPath}`,
    },
    win32: {
      checkImage:
        'powershell -NoProfile -Command "(Get-Clipboard -Format Image) -ne $null"',
      saveImage: `powershell -NoProfile -Command "$img = Get-Clipboard -Format Image; if ($img) { $img.Save('${windowsScreenshotPath}', [System.Drawing.Imaging.ImageFormat]::Png) }"`,
      getPath: 'powershell -NoProfile -Command "Get-Clipboard"',
      deleteFile: `del /f "${screenshotPath}"`,
    },
  }

  return {
    commands: commands[platform] || commands.linux,
    screenshotPath,
  }
}

export type ImageWithDimensions = {
  base64: string
  mediaType: string
  dimensions?: ImageDimensions
}

const SSH_IMAGE_PASTE_URL_ENV = 'FREE_CODE_SSH_IMAGE_PASTE_URL'
const DEFAULT_SSH_IMAGE_PASTE_URL = 'http://127.0.0.1:17654/image'
const SSH_IMAGE_PASTE_TIMEOUT_MS = 1500

function isSshSession(): boolean {
  return Boolean(process.env.SSH_CONNECTION || process.env.SSH_TTY)
}

export function parseClipboardBridgeImageResponse(
  value: unknown,
): ImageWithDimensions | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const image = value as Partial<ImageWithDimensions>
  if (
    typeof image.base64 !== 'string' ||
    image.base64.length === 0 ||
    typeof image.mediaType !== 'string' ||
    !image.mediaType.startsWith('image/')
  ) {
    return null
  }
  return {
    base64: image.base64,
    mediaType: image.mediaType,
    dimensions: image.dimensions,
  }
}

async function getImageFromSshPasteBridge(): Promise<ImageWithDimensions | null> {
  if (!isSshSession() && !process.env[SSH_IMAGE_PASTE_URL_ENV]) {
    return null
  }

  const url = process.env[SSH_IMAGE_PASTE_URL_ENV] || DEFAULT_SSH_IMAGE_PASTE_URL
  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), SSH_IMAGE_PASTE_TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: abortController.signal })
    if (!response.ok) {
      return null
    }
    return parseClipboardBridgeImageResponse(await response.json())
  } catch (e) {
    logForDebugging(`SSH image paste bridge unavailable: ${e}`, { level: 'debug' })
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Check if clipboard contains an image without retrieving it.
 */
export async function hasImageInClipboard(): Promise<boolean> {
  if (process.platform !== 'darwin') {
    return false
  }
  if (
    feature('NATIVE_CLIPBOARD_IMAGE') &&
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_collage_kaleidoscope', true)
  ) {
    // Native NSPasteboard check (~0.03ms warm). Fall through to osascript
    // when the module/export is missing. Catch a throw too: it would surface
    // as an unhandled rejection in useClipboardImageHint's setTimeout.
    try {
      const { getNativeModule } = await import('image-processor-napi')
      const hasImage = getNativeModule()?.hasClipboardImage
      if (hasImage) {
        return hasImage()
      }
    } catch (e) {
      logError(e as Error)
    }
  }
  const result = await execFileNoThrowWithCwd('osascript', [
    '-e',
    'the clipboard as «class PNGf»',
  ])
  return result.code === 0
}

export async function getImageFromClipboard(): Promise<ImageWithDimensions | null> {
  const sshBridgeImage = await getImageFromSshPasteBridge()
  if (sshBridgeImage) {
    return sshBridgeImage
  }

  // Fast path: native NSPasteboard reader (macOS only). Reads PNG bytes
  // directly in-process and downsamples via CoreGraphics if over the
  // dimension cap. ~5ms cold, sub-ms warm — vs. ~1.5s for the osascript
  // path below. Throws if the native module is unavailable, in which case
  // the catch block falls through to osascript. A `null` return from the
  // native call is authoritative (clipboard has no image).
  if (
    feature('NATIVE_CLIPBOARD_IMAGE') &&
    process.platform === 'darwin' &&
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_collage_kaleidoscope', true)
  ) {
    try {
      const { getNativeModule } = await import('image-processor-napi')
      const readClipboard = getNativeModule()?.readClipboardImage
      if (!readClipboard) {
        throw new Error('native clipboard reader unavailable')
      }
      const native = readClipboard(IMAGE_MAX_WIDTH, IMAGE_MAX_HEIGHT)
      if (!native) {
        return null
      }
      // The native path caps dimensions but not file size. A complex
      // 2000×2000 PNG can still exceed the 3.75MB raw / 5MB base64 API
      // limit — for that edge case, run through the same size-cap that
      // the osascript path uses (degrades to JPEG if needed). Cheap if
      // already under: just a sharp metadata read.
      const buffer: Buffer = native.png
      if (buffer.length > IMAGE_TARGET_RAW_SIZE) {
        const resized = await maybeResizeAndDownsampleImageBuffer(
          buffer,
          buffer.length,
          'png',
        )
        return {
          base64: resized.buffer.toString('base64'),
          mediaType: `image/${resized.mediaType}`,
          // resized.dimensions sees the already-downsampled buffer; native knows the true originals.
          dimensions: {
            originalWidth: native.originalWidth,
            originalHeight: native.originalHeight,
            displayWidth: resized.dimensions?.displayWidth ?? native.width,
            displayHeight: resized.dimensions?.displayHeight ?? native.height,
          },
        }
      }
      return {
        base64: buffer.toString('base64'),
        mediaType: 'image/png',
        dimensions: {
          originalWidth: native.originalWidth,
          originalHeight: native.originalHeight,
          displayWidth: native.width,
          displayHeight: native.height,
        },
      }
    } catch (e) {
      logError(e as Error)
      // Fall through to osascript fallback.
    }
  }

  const { commands, screenshotPath } = getClipboardCommands()
  let imagePath = screenshotPath
  try {
    // Check if clipboard has image
    const checkResult = await execa(commands.checkImage, {
      shell: true,
      reject: false,
    })
    if (checkResult.exitCode !== 0) {
      if (process.platform === 'linux' && isProbablyWsl()) {
        const savedPath = await tryDumpWindowsClipboardImage()
        if (!savedPath) {
          return null
        }
        imagePath = savedPath
      } else {
        return await getImageFromClipboardPathFallback()
      }
    } else {
      // Save the image
      const saveResult = await execa(commands.saveImage, {
        shell: true,
        reject: false,
      })
      if (saveResult.exitCode !== 0) {
        const pathImage = await getImageFromClipboardPathFallback()
        if (pathImage) {
          return pathImage
        }
        if (process.platform === 'linux' && isProbablyWsl()) {
          const savedPath = await tryDumpWindowsClipboardImage()
          if (!savedPath) {
            return null
          }
          imagePath = savedPath
        } else {
          return null
        }
      }
    }

    // Read the image and convert to base64
    let imageBuffer = getFsImplementation().readFileBytesSync(imagePath)
    if (imageBuffer.length === 0) {
      return null
    }

    // BMP is not supported by the API — convert to PNG via Sharp.
    // This handles WSL2 where Windows copies images as BMP by default.
    if (
      imageBuffer.length >= 2 &&
      imageBuffer[0] === 0x42 &&
      imageBuffer[1] === 0x4d
    ) {
      const sharp = await getImageProcessor()
      imageBuffer = await sharp(imageBuffer).png().toBuffer()
    }

    // Resize if needed to stay under 5MB API limit
    const resized = await maybeResizeAndDownsampleImageBuffer(
      imageBuffer,
      imageBuffer.length,
      'png',
    )
    const base64Image = resized.buffer.toString('base64')

    // Detect format from magic bytes
    const mediaType = detectImageFormatFromBase64(base64Image)

    // Cleanup (fire-and-forget, don't await)
    if (imagePath === screenshotPath) {
      void execa(commands.deleteFile, { shell: true, reject: false })
    } else {
      void execa(`rm -f ${shellQuote(imagePath)}`, { shell: true, reject: false })
    }

    return {
      base64: base64Image,
      mediaType,
      dimensions: resized.dimensions,
    }
  } catch {
    return null
  }
}

export async function getImagePathFromClipboard(): Promise<string | null> {
  const { commands } = getClipboardCommands()

  try {
    // Try to get text from clipboard
    const result = await execa(commands.getPath, {
      shell: true,
      reject: false,
    })
    if (result.exitCode !== 0 || !result.stdout) {
      return null
    }
    return result.stdout.trim()
  } catch (e) {
    logError(e as Error)
    return null
  }
}

async function getImageFromClipboardPathFallback(): Promise<ImageWithDimensions | null> {
  const clipboardPath = await getImagePathFromClipboard()
  if (!clipboardPath) {
    return null
  }
  return tryReadImageFromPath(clipboardPath)
}

/**
 * Regex pattern to match supported image file extensions. Kept in sync with
 * MIME_BY_EXT in BriefTool/upload.ts — attachments.ts uses this to set isImage
 * on the wire, and remote viewers fetch /preview iff isImage is true. An ext
 * here but not in MIME_BY_EXT (e.g. bmp) uploads as octet-stream and has no
 * /preview variant → broken thumbnail.
 */
export const IMAGE_EXTENSION_REGEX = /\.(png|jpe?g|gif|webp)$/i

/**
 * Remove outer single or double quotes from a string
 * @param text Text to clean
 * @returns Text without outer quotes
 */
function removeOuterQuotes(text: string): string {
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1)
  }
  return text
}

/**
 * Remove shell escape backslashes from a path (for macOS/Linux/WSL)
 * On Windows systems, this function returns the path unchanged
 * @param path Path that might contain shell-escaped characters
 * @returns Path with escape backslashes removed (on macOS/Linux/WSL only)
 */
function stripBackslashEscapes(path: string): string {
  const platform = process.platform as SupportedPlatform

  // On Windows, don't remove backslashes as they're part of the path
  if (platform === 'win32') {
    return path
  }

  // On macOS/Linux/WSL, handle shell-escaped paths
  // Double-backslashes (\\) represent actual backslashes in the filename
  // Single backslashes followed by special chars are shell escapes

  // First, temporarily replace double backslashes with a placeholder
  // Use random salt to prevent injection attacks where path contains literal placeholder
  const salt = randomBytes(8).toString('hex')
  const placeholder = `__DOUBLE_BACKSLASH_${salt}__`
  const withPlaceholder = path.replace(/\\\\/g, placeholder)

  // Remove single backslashes that are shell escapes
  // This handles cases like "name\ \(15\).png" -> "name (15).png"
  const withoutEscapes = withPlaceholder.replace(/\\(.)/g, '$1')

  // Replace placeholders back to single backslashes
  return withoutEscapes.replace(new RegExp(placeholder, 'g'), '\\')
}

export function normalizeClipboardImagePath(text: string): string | null {
  const cleaned = removeOuterQuotes(text.trim())
  const candidates = cleaned
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && line !== 'copy' && line !== 'cut' && !line.startsWith('#'))

  for (const candidate of candidates) {
    const unquoted = removeOuterQuotes(candidate)
    if (unquoted.startsWith('file://')) {
      try {
        return fileURLToPath(unquoted)
      } catch {
        continue
      }
    }
    if (process.platform === 'linux' && isProbablyWsl()) {
      const converted = convertWindowsPathToWsl(unquoted)
      if (converted) {
        return converted
      }
    }
    return stripBackslashEscapes(unquoted)
  }

  return null
}

/**
 * Check if a given text represents an image file path
 * @param text Text to check
 * @returns Boolean indicating if text is an image path
 */
export function isImageFilePath(text: string): boolean {
  const normalized = normalizeClipboardImagePath(text)
  return normalized ? IMAGE_EXTENSION_REGEX.test(normalized) : false
}

/**
 * Clean and normalize a text string that might be an image file path
 * @param text Text to process
 * @returns Cleaned text with quotes removed, whitespace trimmed, and shell escapes removed, or null if not an image path
 */
export function asImageFilePath(text: string): string | null {
  const unescaped = normalizeClipboardImagePath(text)

  if (unescaped && IMAGE_EXTENSION_REGEX.test(unescaped)) {
    return unescaped
  }

  return null
}

/**
 * Try to find and read an image file, falling back to clipboard search
 * @param text Pasted text that might be an image filename or path
 * @returns Object containing the image path and base64 data, or null if not found
 */
export async function tryReadImageFromPath(
  text: string,
): Promise<(ImageWithDimensions & { path: string }) | null> {
  // Strip terminal added spaces or quotes to dragged in paths
  const cleanedPath = asImageFilePath(text)

  if (!cleanedPath) {
    return null
  }

  const imagePath = cleanedPath
  let imageBuffer

  try {
    if (isAbsolute(imagePath)) {
      imageBuffer = getFsImplementation().readFileBytesSync(imagePath)
    } else {
      // VSCode Terminal just grabs the text content which is the filename
      // instead of getting the full path of the file pasted with cmd-v. So
      // we check if it matches the filename of the image in the clipboard.
      const clipboardPath = await getImagePathFromClipboard()
      if (clipboardPath && imagePath === basename(clipboardPath)) {
        imageBuffer = getFsImplementation().readFileBytesSync(clipboardPath)
      }
    }
  } catch (e) {
    logError(e as Error)
    return null
  }
  if (!imageBuffer) {
    return null
  }
  if (imageBuffer.length === 0) {
    logForDebugging(`Image file is empty: ${imagePath}`, { level: 'warn' })
    return null
  }

  // BMP is not supported by the API — convert to PNG via Sharp.
  if (
    imageBuffer.length >= 2 &&
    imageBuffer[0] === 0x42 &&
    imageBuffer[1] === 0x4d
  ) {
    const sharp = await getImageProcessor()
    imageBuffer = await sharp(imageBuffer).png().toBuffer()
  }

  // Resize if needed to stay under 5MB API limit
  // Extract extension from path for format hint
  const ext = extname(imagePath).slice(1).toLowerCase() || 'png'
  const resized = await maybeResizeAndDownsampleImageBuffer(
    imageBuffer,
    imageBuffer.length,
    ext,
  )
  const base64Image = resized.buffer.toString('base64')

  // Detect format from the actual file contents using magic bytes
  const mediaType = detectImageFormatFromBase64(base64Image)
  return {
    path: imagePath,
    base64: base64Image,
    mediaType,
    dimensions: resized.dimensions,
  }
}
