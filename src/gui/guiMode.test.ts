import { describe, expect, mock, test } from 'bun:test';

import { testExports } from './guiMode.js';

describe('guiMode teardownRuntime', () => {
  test('forces shutdown when active turn never settles after interrupt', async () => {
    const interrupt = mock(() => {});
    const write = mock(() => {});

    const runtime = {
      isTurnInFlight: true,
      interruptRequested: false,
      activeTurnPromise: new Promise<void>(() => {}),
      engine: {
        interrupt,
      },
    } as Parameters<typeof testExports.teardownRuntime>[0];

    const originalStdoutWrite = process.stdout.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      if (typeof chunk === 'string') {
        write(chunk);
      }
      return true;
    }) as typeof process.stdout.write;

    try {
      await testExports.teardownRuntime(runtime);
    } finally {
      process.stdout.write = originalStdoutWrite;
    }

    expect(runtime.interruptRequested).toBe(true);
    expect(interrupt).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalled();
    expect(
      write.mock.calls.some(([chunk]) =>
        String(chunk).includes('GUI shutdown forced after interrupt timeout'),
      ),
    ).toBe(true);
  });
});
