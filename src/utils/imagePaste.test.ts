import { describe, expect, it } from 'bun:test'
import {
  asImageFilePath,
  buildLinuxImageSaveCommand,
  isImageFilePath,
  normalizeClipboardImagePath,
  parseClipboardBridgeImageResponse,
} from './imagePaste.js'

describe('buildLinuxImageSaveCommand', () => {
  it('tries common clipboard image MIME types instead of png only', () => {
    const command = buildLinuxImageSaveCommand('/tmp/free code/paste.png')

    expect(command).toContain("image/png")
    expect(command).toContain("image/jpeg")
    expect(command).toContain("image/webp")
    expect(command).toContain("image/gif")
    expect(command).toContain("image/bmp")
    expect(command).toContain("'/tmp/free code/paste.png'")
  })
})

describe('parseClipboardBridgeImageResponse', () => {
  it('accepts valid image payloads from SSH paste bridge', () => {
    expect(
      parseClipboardBridgeImageResponse({
        base64: 'aGVsbG8=',
        mediaType: 'image/png',
        dimensions: { displayWidth: 1, displayHeight: 1 },
      }),
    ).toMatchObject({
      base64: 'aGVsbG8=',
      mediaType: 'image/png',
    })
  })

  it('rejects non-image bridge payloads', () => {
    expect(
      parseClipboardBridgeImageResponse({
        base64: 'aGVsbG8=',
        mediaType: 'text/plain',
      }),
    ).toBeNull()
  })
})

describe('normalizeClipboardImagePath', () => {
  it('extracts file URLs from Linux clipboard file lists', () => {
    expect(normalizeClipboardImagePath('file:///home/user/My%20Image.png')).toBe(
      '/home/user/My Image.png',
    )
  })

  it('extracts file URLs from GNOME copied files payloads', () => {
    const text = 'copy\nfile:///home/user/Pictures/example.jpg\n'

    expect(normalizeClipboardImagePath(text)).toBe(
      '/home/user/Pictures/example.jpg',
    )
    expect(isImageFilePath(text)).toBe(true)
    expect(asImageFilePath(text)).toBe('/home/user/Pictures/example.jpg')
  })
})
