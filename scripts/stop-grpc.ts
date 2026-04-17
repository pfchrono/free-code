import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import {
  isProcessRunning,
  terminateProcessTree,
} from '../src/utils/genericProcessUtils.js'

const PID_PATH = path.resolve(process.cwd(), '.tmp', 'grpc-server.pid')

async function main(): Promise<void> {
  let rawPid: string
  try {
    rawPid = await readFile(PID_PATH, 'utf8')
  } catch {
    console.log('No gRPC pid file found. Nothing to stop.')
    return
  }

  const pid = parseInt(rawPid.trim(), 10)
  if (!Number.isFinite(pid) || pid <= 1) {
    await rm(PID_PATH, { force: true })
    console.log('Invalid gRPC pid file removed.')
    return
  }

  if (!isProcessRunning(pid)) {
    await rm(PID_PATH, { force: true })
    console.log(`gRPC process ${pid} not running. Stale pid file removed.`)
    return
  }

  await terminateProcessTree(pid, { force: true })
  await rm(PID_PATH, { force: true })
  console.log(`gRPC process tree ${pid} force-stopped.`)
}

main().catch(error => {
  console.error(
    'Failed to stop gRPC process:',
    error instanceof Error ? error.message : String(error),
  )
  process.exit(1)
})
