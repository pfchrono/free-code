import { logForDebugging } from '../debug.js'

const GIT_UNSAFE_ENV_RE = /[\0\r\n]/

const GIT_NO_PROMPT_ENV = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_ASKPASS: '',
}

let warnedAboutDroppedEnvKeys = false

export function sanitizeEnvForGit(
  env: NodeJS.ProcessEnv,
): { env: NodeJS.ProcessEnv; dropped: string[] } {
  const sanitized: NodeJS.ProcessEnv = {}
  const dropped: string[] = []

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue
    if (GIT_UNSAFE_ENV_RE.test(key) || GIT_UNSAFE_ENV_RE.test(value)) {
      dropped.push(key)
      continue
    }
    sanitized[key] = value
  }

  return { env: sanitized, dropped }
}

export function buildGitChildEnv(extras?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const merged = { ...process.env, ...GIT_NO_PROMPT_ENV, ...(extras ?? {}) }
  const { env, dropped } = sanitizeEnvForGit(merged)

  if (dropped.length > 0 && !warnedAboutDroppedEnvKeys) {
    warnedAboutDroppedEnvKeys = true
    logForDebugging(
      `git child env: dropped ${dropped.length} key(s) containing control characters: ${dropped.join(', ')}`,
      { level: 'warn' },
    )
  }

  return env
}

export function __resetGitEnvWarningForTesting(): void {
  warnedAboutDroppedEnvKeys = false
}
