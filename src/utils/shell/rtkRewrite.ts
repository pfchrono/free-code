import { execa } from 'execa'
import { isEnvTruthy } from '../envUtils.js'
import { logForDebugging } from '../debug.js'

type RewriteRunnerResult = {
  exitCode: number
  stdout: string
}

export type RtkRewriteOptions = {
  cwd?: string
  env?: NodeJS.ProcessEnv
  enabled?: boolean
  timeoutMs?: number
  rtkBinary?: string
  debug?: boolean
  runRewrite?: (
    binary: string,
    args: string[],
    options: {
      cwd?: string
      env?: NodeJS.ProcessEnv
      timeoutMs: number
    },
  ) => Promise<RewriteRunnerResult>
}

const DEFAULT_RTK_BINARY = 'rtk'
const DEFAULT_TIMEOUT_MS = 750

function getCommandBinary(command: string): string {
  return command.trim().split(/\s+/, 1)[0] ?? ''
}

function getBinaryNames(binary: string): Set<string> {
  const names = new Set([binary])
  const segments = binary.split(/[\\/]/).filter(Boolean)
  const basename = segments.at(-1)
  if (basename) {
    names.add(basename)
  }
  return names
}

async function defaultRewriteRunner(
  binary: string,
  args: string[],
  options: {
    cwd?: string
    env?: NodeJS.ProcessEnv
    timeoutMs: number
  },
): Promise<RewriteRunnerResult> {
  const result = await execa(binary, args, {
    cwd: options.cwd,
    env: options.env,
    reject: false,
    stdin: 'ignore',
    timeout: options.timeoutMs,
  })

  return {
    exitCode: result.exitCode ?? 1,
    stdout: result.stdout,
  }
}

export function isRtkRewriteEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isEnvTruthy(env.FREE_CODE_RTK)
}

export async function rewriteWithRtk(
  command: string,
  options: RtkRewriteOptions = {},
): Promise<string> {
  const enabled = options.enabled ?? isRtkRewriteEnabled(options.env)
  if (!enabled) return command

  const trimmed = command.trim()
  if (!trimmed) return command
  if (trimmed.includes('\n')) return command

  const rtkBinary = options.rtkBinary ?? options.env?.FREE_CODE_RTK_BINARY ?? DEFAULT_RTK_BINARY
  const commandBinary = getCommandBinary(trimmed)
  if (getBinaryNames(rtkBinary).has(commandBinary)) {
    return command
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const runRewrite = options.runRewrite ?? defaultRewriteRunner

  try {
    const result = await runRewrite(rtkBinary, ['rewrite', command], {
      cwd: options.cwd,
      env: options.env,
      timeoutMs,
    })
    const rewritten = result.stdout.trim()

    if (result.exitCode === 0 && rewritten) {
      if (options.debug || isEnvTruthy(options.env?.FREE_CODE_RTK_DEBUG)) {
        if (rewritten === command) {
          logForDebugging(`[rtk] no rewrite: ${command}`)
        } else {
          logForDebugging(`[rtk] ${command} -> ${rewritten}`)
        }
      }
      return rewritten
    }

    if (options.debug || isEnvTruthy(options.env?.FREE_CODE_RTK_DEBUG)) {
      logForDebugging('[rtk] unavailable, using original command')
    }
  } catch (error) {
    if (options.debug || isEnvTruthy(options.env?.FREE_CODE_RTK_DEBUG)) {
      const timeoutSuffix = error instanceof Error && error.name === 'ExecaError'
        ? ` after ${timeoutMs}ms`
        : ''
      logForDebugging(`[rtk] rewrite failed${timeoutSuffix}, using original command`)
    }
  }

  return command
}
