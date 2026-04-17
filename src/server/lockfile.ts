import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'

type ServerLock = {
  pid: number
  port?: number
  host?: string
  httpUrl: string
  startedAt: number
}

function getServerLockPath(): string {
  return join(getClaudeConfigHomeDir(), 'server.lock.json')
}

async function readServerLock(): Promise<ServerLock | null> {
  try {
    const raw = await readFile(getServerLockPath(), 'utf8')
    return JSON.parse(raw) as ServerLock
  } catch {
    return null
  }
}

export async function probeRunningServer(): Promise<ServerLock | null> {
  const lock = await readServerLock()
  if (!lock) return null

  try {
    process.kill(lock.pid, 0)
    return lock
  } catch {
    await removeServerLock()
    return null
  }
}

export async function writeServerLock(lock: ServerLock): Promise<void> {
  await mkdir(getClaudeConfigHomeDir(), { recursive: true })
  await writeFile(getServerLockPath(), JSON.stringify(lock, null, 2), 'utf8')
}

export async function removeServerLock(): Promise<void> {
  try {
    await rm(getServerLockPath(), { force: true })
  } catch {
    // Best-effort cleanup only.
  }
}
