import deadpoolMode from '../src/commands/deadpoolmode/index.ts'
import {
  FileStateCache,
  READ_FILE_STATE_CACHE_SIZE,
} from '../src/utils/fileStateCache.js'
import { runHeadlessLocalSlashCommand } from '../src/utils/headlessLocalCommandRunner.js'

type HarnessCase = {
  name: string
  command: string
  expectIncludes: string[]
}

const DEFAULT_CASES: HarnessCase[] = [
  {
    name: 'deadpool-status',
    command: '/deadpoolmode status',
    expectIncludes: ['Deadpool mode', 'Style stack:'],
  },
]

async function runCase(testCase: HarnessCase): Promise<{
  name: string
  ok: boolean
  output: string
}> {
  let appState: Record<string, unknown> = {}

  const result = await runHeadlessLocalSlashCommand(testCase.command, {
    cwd: process.cwd(),
    appState,
    setAppState: updater => {
      appState = updater(appState)
      return appState
    },
    fileCache: new FileStateCache(READ_FILE_STATE_CACHE_SIZE, 25 * 1024 * 1024),
    commands: [deadpoolMode],
    theme: 'dark',
  })

  if (!result) {
    throw new Error(`Command did not resolve to a supported local command: ${testCase.command}`)
  }

  const output =
    result.result.type === 'text'
      ? result.result.value
      : result.result.type === 'compact'
        ? result.result.displayText ?? ''
        : ''

  return {
    name: testCase.name,
    ok: testCase.expectIncludes.every(fragment => output.includes(fragment)),
    output,
  }
}

async function main(): Promise<void> {
  const requestedCommand = process.argv[2]
  const cases = requestedCommand
    ? [
        {
          name: 'custom',
          command: requestedCommand,
          expectIncludes: [],
        } satisfies HarnessCase,
      ]
    : DEFAULT_CASES

  const results = []
  for (const testCase of cases) {
    results.push(await runCase(testCase))
  }

  console.log(JSON.stringify({ results }, null, 2))

  if (results.some(result => !result.ok)) {
    process.exitCode = 1
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
