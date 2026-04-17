import { createHeadlessSessionHarness } from '../src/headless/sessionHarness.js'

type HarnessCase = {
  name: string
  input: string
  expectIncludes: string[]
}

const DEFAULT_CASES: HarnessCase[] = [
  {
    name: 'deadpool-status',
    input: '/deadpoolmode status',
    expectIncludes: ['Deadpool mode', 'Style stack:'],
  },
]

async function runCase(testCase: HarnessCase): Promise<{
  name: string
  ok: boolean
  outputs: string[]
}> {
  const harness = createHeadlessSessionHarness({
    cwd: process.cwd(),
  })
  const turn = await harness.submit(testCase.input)
  const outputs: string[] = []

  for await (const event of turn.events()) {
    if (event.type === 'message') {
      outputs.push(event.content)
    }
  }

  await turn.done

  return {
    name: testCase.name,
    ok: testCase.expectIncludes.every(fragment =>
      outputs.some(output => output.includes(fragment)),
    ),
    outputs,
  }
}

async function main(): Promise<void> {
  const requestedInput = process.argv[2]
  const cases = requestedInput
    ? [
        {
          name: 'custom',
          input: requestedInput,
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
