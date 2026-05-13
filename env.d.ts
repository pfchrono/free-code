declare const MACRO: {
  VERSION: string
  BUILD_TIME: string
  PACKAGE_URL?: string
  NATIVE_PACKAGE_URL?: string
  FEEDBACK_CHANNEL?: string
  ISSUES_EXPLAINER?: string
  VERSION_CHANGELOG?: string
}

declare module '@ant/computer-use-input' {
  export type ComputerUseInput = any
  export type ComputerUseInputAPI = any
}

declare module '@ant/computer-use-mcp' {
  export const API_RESIZE_PARAMS: any
  export const DEFAULT_GRANT_FLAGS: any
  export function bindSessionContext(...args: any[]): any
  export function buildComputerUseTools(...args: any[]): any
  export function createComputerUseMcpServer(...args: any[]): any
  export function targetImageSize(...args: any[]): any
  export type ComputerExecutor = any
  export type ComputerUseSessionContext = any
  export type CuCallToolResult = any
  export type CuPermissionRequest = any
  export type CuPermissionResponse = any
  export type DisplayGeometry = any
  export type FrontmostApp = any
  export type InstalledApp = any
  export type ResolvePrepareCaptureResult = any
  export type RunningApp = any
  export type ScreenshotDims = any
  export type ScreenshotResult = any
}

declare module '@ant/computer-use-mcp/types' {
  export const DEFAULT_GRANT_FLAGS: any
  export type ComputerUseHostAdapter = any
  export type CoordinateMode = any
  export type CuPermissionRequest = any
  export type CuPermissionResponse = any
  export type CuSubGates = any
  export type Logger = any
}

declare module '@ant/computer-use-mcp/sentinelApps' {
  export function getSentinelCategory(...args: any[]): any
}

declare module '@ant/computer-use-swift' {
  export type ComputerUseAPI = any
}

declare module '@anthropic-ai/mcpb' {
  export type McpbManifest = any
  export type McpbUserConfigurationOption = any
}

declare module 'highlight.js' {
  export const getLanguage: any
  export const highlight: any
}

declare module 'image-processor-napi' {
  export const getNativeModule: any
  export const sharp: any
}

declare module 'url-handler-napi' {
  export const waitForUrlEvent: any
}

declare module 'react/compiler-runtime' {
  export function c(size: number): any[]
}

declare module '*?*' {
  const moduleWithCacheBuster: any
  export = moduleWithCacheBuster
}

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any
  }
}

declare namespace React {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any
    }
  }
}

declare module '*.node' {
  const value: unknown
  export default value
}

declare module '*.md' {
  const content: string
  export default content
}

declare module '*?*'

declare module '@ant/computer-use-mcp' {
  const value: any
  export default value
}

declare module '@ant/computer-use-mcp/types' {
  export type DesktopState = any
  export type Screenshot = any
}

declare module '@ant/computer-use-mcp/sentinelApps' {
  export const sentinelApps: any
}

declare module '@ant/computer-use-input' {
  const value: any
  export default value
}

declare module '@ant/computer-use-swift' {
  const value: any
  export default value
}

declare module '@ant/claude-for-chrome-mcp' {
  const value: any
  export default value
}

declare module 'audio-capture-napi' {
  const value: any
  export default value
}

declare module 'image-processor-napi' {
  const value: any
  export default value
}

declare module 'url-handler-napi' {
  const value: any
  export default value
}

declare module 'vitest' {
  export const describe: any
  export const it: any
  export const expect: any
  export const vi: any
  export const beforeEach: any
  export const afterEach: any
}

declare module 'react/compiler-runtime' {
  export const c: (size: number) => any[]
}
