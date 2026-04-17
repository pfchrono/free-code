import { appendFileSync, writeSync } from 'fs'

function isEnabled(): boolean {
  return process.env.CLAUDE_CODE_STARTUP_RAW_TRACE === '1'
}

export function startupRawTrace(label: string): void {
  if (!isEnabled()) {
    return
  }

  const line = `${new Date().toISOString()} [RAW-STARTUP] ${label}\n`
  const filePath = process.env.CLAUDE_CODE_STARTUP_RAW_TRACE_FILE

  try {
    if (filePath) {
      appendFileSync(filePath, line)
      return
    }

    writeSync(2, line)
  } catch {
    // Best-effort diagnostics only.
  }
}
