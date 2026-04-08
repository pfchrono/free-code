import type { Theme } from '../../utils/theme.js'
import { EMBEDDED_THEMES } from './embeddedThemes.js'

const hexToRgb = (hex: string): [number, number, number] => {
  const cleanHex = hex.replace('#', '')
  if (cleanHex.length === 3) {
    return [
      parseInt(cleanHex[0] + cleanHex[0], 16),
      parseInt(cleanHex[1] + cleanHex[1], 16),
      parseInt(cleanHex[2] + cleanHex[2], 16)
    ]
  }
  return [
    parseInt(cleanHex.slice(0, 2), 16),
    parseInt(cleanHex.slice(2, 4), 16),
    parseInt(cleanHex.slice(4, 6), 16)
  ]
}

const rgbToHex = (r: number, g: number, b: number): string => {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')
}

// Lighten a hex color by a factor (0-1)
const lighten = (hex: string, factor: number): string => {
  const [r, g, b] = hexToRgb(hex)
  return rgbToHex(
    Math.min(255, Math.round(r + (255 - r) * factor)),
    Math.min(255, Math.round(g + (255 - g) * factor)),
    Math.min(255, Math.round(b + (255 - b) * factor))
  )
}

// Darken a hex color by a factor (0-1)
const darken = (hex: string, factor: number): string => {
  const [r, g, b] = hexToRgb(hex)
  return rgbToHex(
    Math.max(0, Math.round(r * (1 - factor))),
    Math.max(0, Math.round(g * (1 - factor))),
    Math.max(0, Math.round(b * (1 - factor)))
  )
}

// Get a color from palette or overrides, with fallback
const get = (palette: any, overrides: any, key: string, fallback: string): string => {
  return palette[key] ?? overrides[key] ?? fallback
}

const convertOpencodeTheme = (opencodeTheme: any): Theme => {
  const isDark = !!opencodeTheme.dark
  const mode = isDark ? opencodeTheme.dark : opencodeTheme.light
  const palette = mode.palette
  const overrides = mode.overrides || {}

  // Derive colors intelligently from available palette
  const text = get(palette, overrides, 'ink', isDark ? '#f0f0f0' : '#1a1a1a')
  const background = get(palette, overrides, 'neutral', isDark ? '#1a1a1a' : '#ffffff')
  const primary = palette.primary || '#4a90e2'
  const accent = palette.accent || palette.interactive || palette.info || primary
  const success = palette.success || '#50fa7b'
  const warning = palette.warning || '#ffb86c'
  const error = palette.error || '#ff5555'
  const info = palette.info || '#8be9fd'

  // Derive subtle/inactive from text-weak or by dimming text
  const textWeak = get(palette, overrides, 'text-weak', lighten(text, 0.5))
  const subtle = textWeak
  const inactive = darken(text, 0.4)
  const inactiveShimmer = lighten(inactive, 0.3)

  // Shimmer colors - lighten base colors
  const claudeBase = '#ff6b35'
  const claudeShimmer = lighten(claudeBase, 0.3)
  const permissionShimmer = lighten(primary, 0.3)
  const warningShimmer = lighten(warning, 0.3)
  const promptBorderShimmer = lighten(subtle, 0.2)

  // Diff colors
  const diffAdd = palette.diffAdd || success
  const diffDelete = palette.diffDelete || error
  const diffAddedDimmed = isDark ? darken(diffAdd, 0.3) : lighten(diffAdd, 0.3)
  const diffRemovedDimmed = isDark ? darken(diffDelete, 0.3) : lighten(diffDelete, 0.3)

  // Syntax colors for additional derivation
  const syntaxComment = get(palette, overrides, 'syntax-comment', textWeak)
  const syntaxProperty = get(palette, overrides, 'syntax-property', accent)
  const syntaxConstant = get(palette, overrides, 'syntax-constant', primary)

  return {
    text: `rgb(${hexToRgb(text).join(',')})`,
    inverseText: `rgb(${hexToRgb(isDark ? '#000000' : '#ffffff').join(',')})`,
    inactive: `rgb(${hexToRgb(inactive).join(',')})`,
    inactiveShimmer: `rgb(${hexToRgb(inactiveShimmer).join(',')})`,
    subtle: `rgb(${hexToRgb(subtle).join(',')})`,
    background: `rgb(${hexToRgb(background).join(',')})`,
    autoAccept: `rgb(${hexToRgb(primary).join(',')})`,
    bashBorder: `rgb(${hexToRgb(accent).join(',')})`,
    claude: `rgb(${hexToRgb(claudeBase).join(',')})`,
    startupAccent: `rgb(${hexToRgb(primary).join(',')})`,
    claudeShimmer: `rgb(${hexToRgb(claudeShimmer).join(',')})`,
    claudeBlue_FOR_SYSTEM_SPINNER: `rgb(${hexToRgb(primary).join(',')})`,
    claudeBlueShimmer_FOR_SYSTEM_SPINNER: `rgb(${hexToRgb(lighten(primary, 0.3)).join(',')})`,
    permission: `rgb(${hexToRgb(primary).join(',')})`,
    permissionShimmer: `rgb(${hexToRgb(permissionShimmer).join(',')})`,
    planMode: `rgb(${hexToRgb(darken(primary, 0.3)).join(',')})`,
    ide: `rgb(${hexToRgb(syntaxProperty).join(',')})`,
    promptBorder: `rgb(${hexToRgb(subtle).join(',')})`,
    promptBorderShimmer: `rgb(${hexToRgb(promptBorderShimmer).join(',')})`,
    suggestion: `rgb(${hexToRgb(info).join(',')})`,
    remember: `rgb(${hexToRgb(syntaxConstant).join(',')})`,
    success: `rgb(${hexToRgb(success).join(',')})`,
    error: `rgb(${hexToRgb(error).join(',')})`,
    warning: `rgb(${hexToRgb(warning).join(',')})`,
    merged: `rgb(${hexToRgb(primary).join(',')})`,
    warningShimmer: `rgb(${hexToRgb(warningShimmer).join(',')})`,
    diffAdded: `rgb(${hexToRgb(diffAdd).join(',')})`,
    diffRemoved: `rgb(${hexToRgb(diffDelete).join(',')})`,
    diffAddedDimmed: `rgb(${hexToRgb(diffAddedDimmed).join(',')})`,
    diffRemovedDimmed: `rgb(${hexToRgb(diffRemovedDimmed).join(',')})`,
    diffAddedWord: `rgb(${hexToRgb(isDark ? lighten(diffAdd, 0.2) : darken(diffAdd, 0.2)).join(',')})`,
    diffRemovedWord: `rgb(${hexToRgb(isDark ? lighten(diffDelete, 0.2) : darken(diffDelete, 0.2)).join(',')})`,
    red_FOR_SUBAGENTS_ONLY: 'rgb(220,38,38)',
    blue_FOR_SUBAGENTS_ONLY: 'rgb(37,99,235)',
    green_FOR_SUBAGENTS_ONLY: 'rgb(22,163,74)',
    yellow_FOR_SUBAGENTS_ONLY: 'rgb(202,138,4)',
    purple_FOR_SUBAGENTS_ONLY: 'rgb(147,51,234)',
    orange_FOR_SUBAGENTS_ONLY: 'rgb(234,88,12)',
    pink_FOR_SUBAGENTS_ONLY: 'rgb(219,39,119)',
    cyan_FOR_SUBAGENTS_ONLY: 'rgb(8,145,178)',
    professionalBlue: `rgb(${hexToRgb(info).join(',')})`,
    chromeYellow: `rgb(${hexToRgb(warning).join(',')})`,
    clawd_body: `rgb(${hexToRgb(text).join(',')})`,
    clawd_background: `rgb(${hexToRgb(background).join(',')})`,
    userMessageBackground: `rgb(${hexToRgb(isDark ? lighten(background, 0.1) : darken(background, 0.05)).join(',')})`,
    userMessageBackgroundHover: `rgb(${hexToRgb(isDark ? lighten(background, 0.15) : darken(background, 0.08)).join(',')})`,
    messageActionsBackground: `rgb(${hexToRgb(isDark ? lighten(background, 0.08) : darken(background, 0.03)).join(',')})`,
    selectionBg: `rgb(${hexToRgb(isDark ? lighten(primary, 0.4) : darken(primary, 0.3)).join(',')})`,
    bashMessageBackgroundColor: `rgb(${hexToRgb(isDark ? lighten(background, 0.05) : darken(background, 0.02)).join(',')})`,
    memoryBackgroundColor: `rgb(${hexToRgb(isDark ? lighten(background, 0.08) : darken(background, 0.03)).join(',')})`,
    rate_limit_fill: `rgb(${hexToRgb(primary).join(',')})`,
    rate_limit_empty: `rgb(${hexToRgb(isDark ? darken(background, 0.2) : lighten(background, 0.2)).join(',')})`,
    fastMode: `rgb(${hexToRgb(warning).join(',')})`,
    fastModeShimmer: `rgb(${hexToRgb(lighten(warning, 0.2)).join(',')})`,
    briefLabelYou: `rgb(${hexToRgb(primary).join(',')})`,
    briefLabelClaude: `rgb(${hexToRgb(claudeBase).join(',')})`,
    rainbow_red: 'rgb(235,95,87)',
    rainbow_orange: 'rgb(245,139,87)',
    rainbow_yellow: 'rgb(250,195,95)',
    rainbow_green: 'rgb(145,200,130)',
    rainbow_blue: 'rgb(130,170,220)',
    rainbow_indigo: 'rgb(155,130,200)',
    rainbow_violet: 'rgb(200,130,180)',
    rainbow_red_shimmer: 'rgb(250,155,147)',
    rainbow_orange_shimmer: 'rgb(255,185,137)',
    rainbow_yellow_shimmer: 'rgb(255,225,155)',
    rainbow_green_shimmer: 'rgb(185,230,180)',
    rainbow_blue_shimmer: 'rgb(180,205,240)',
    rainbow_indigo_shimmer: 'rgb(195,180,230)',
    rainbow_violet_shimmer: 'rgb(230,180,210)'
  }
}

const discoveredThemes: Record<string, Theme> = {}
const discoveredThemeNames: string[] = []

for (const entry of EMBEDDED_THEMES) {
  try {
    const themeJson = JSON.parse(entry.json)
    discoveredThemes[entry.name] = convertOpencodeTheme(themeJson)
    discoveredThemeNames.push(entry.name)
  } catch (err) {
    console.error(`Failed to load theme ${entry.name}:`, err)
  }
}

discoveredThemeNames.sort()

export { discoveredThemes, discoveredThemeNames }
