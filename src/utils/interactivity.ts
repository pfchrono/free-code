export type InteractivityOptions = {
  stdoutIsTTY: boolean | undefined
  args: string[]
  env: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  sdkUrlIsNonInteractive?: boolean
}

export function isInteractiveSession(options: InteractivityOptions): boolean {
  const {
    stdoutIsTTY,
    args,
    env,
    platform = process.platform,
    sdkUrlIsNonInteractive = false,
  } = options

  const hasPrintFlag = args.includes('-p') || args.includes('--print')
  const hasInitOnlyFlag = args.includes('--init-only')
  const hasSdkUrl = args.some(arg => arg.startsWith('--sdk-url'))

  if (hasPrintFlag || hasInitOnlyFlag || (sdkUrlIsNonInteractive && hasSdkUrl)) {
    return false
  }

  if (stdoutIsTTY) return true
  if (env.SSH_TTY) return true

  // Windows terminals can report stdout.isTTY=false even when launched interactively.
  return platform === 'win32'
}
