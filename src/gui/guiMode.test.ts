import { describe, expect, mock, test } from 'bun:test';

import { testExports } from './guiMode.js';

describe('guiMode command inbox', () => {
  test('keeps extra commands from same stdin chunk', async () => {
    const inbox = testExports.createCommandInbox();

    try {
      process.stdin.emit('data', '{"type":"heartbeat"}\n{"type":"heartbeat"}\n');

      const first = await inbox.next();
      const second = await inbox.next();

      expect(first?.type).toBe('heartbeat');
      expect(second?.type).toBe('heartbeat');

      process.stdin.emit('end');
      expect(await inbox.next()).toBeNull();
    } finally {
      inbox.dispose();
    }
  });
});

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
    } as unknown as Parameters<typeof testExports.teardownRuntime>[0];

    const originalStdoutWrite = process.stdout.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      if (typeof chunk === 'string') {
        (write as any)(chunk);
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
      (write.mock.calls as any[]).some(([chunk]) =>
        String(chunk).includes('GUI shutdown forced after interrupt timeout'),
      ),
    ).toBe(true);
  });
});
