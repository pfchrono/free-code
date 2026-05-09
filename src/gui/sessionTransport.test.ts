import { describe, expect, mock, test } from 'bun:test';

import { createGuiCommandStream } from './sessionTransport.js';

describe('sessionTransport createGuiCommandStream', () => {
  test('emits commands across chunk boundaries', () => {
    const onCommand = mock(() => {});
    const stream = createGuiCommandStream({ onCommand });

    stream.onData('{"type":"heart');
    stream.onData('beat"}\n');

    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(onCommand).toHaveBeenCalledWith({ type: 'heartbeat' });
  });

  test('emits multiple commands in one chunk', () => {
    const onCommand = mock(() => {});
    const stream = createGuiCommandStream({ onCommand });

    stream.onData('{"type":"get_models"}\n{"type":"get_commands"}\n');

    expect(onCommand).toHaveBeenCalledTimes(2);
    expect(onCommand.mock.calls[0]?.[0]).toEqual({ type: 'get_models' });
    expect(onCommand.mock.calls[1]?.[0]).toEqual({ type: 'get_commands' });
  });

  test('surfaces malformed lines through decode error callback', () => {
    const onCommand = mock(() => {});
    const onDecodeError = mock(() => {});
    const stream = createGuiCommandStream({ onCommand, onDecodeError });

    stream.onData('not-json\n');

    expect(onCommand).not.toHaveBeenCalled();
    expect(onDecodeError).toHaveBeenCalledTimes(1);
    expect(onDecodeError).toHaveBeenCalledWith('not-json', {
      ok: false,
      reason: 'invalid_json',
      lineClass: 'malformed_json',
    });
  });

  test('ignores empty lines', () => {
    const onCommand = mock(() => {});
    const onDecodeError = mock(() => {});
    const stream = createGuiCommandStream({ onCommand, onDecodeError });

    stream.onData('\n');

    expect(onCommand).not.toHaveBeenCalled();
    expect(onDecodeError).not.toHaveBeenCalled();
  });
});
