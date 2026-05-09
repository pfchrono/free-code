import { describe, expect, test } from 'bun:test';

import { decodeGuiCommand } from './protocolCodec.js';

describe('protocolCodec decodeGuiCommand', () => {
  test('decodes valid command', () => {
    const decoded = decodeGuiCommand('{"type":"heartbeat"}');

    expect(decoded).toEqual({
      ok: true,
      command: { type: 'heartbeat' },
    });
  });

  test('rejects malformed JSON', () => {
    const decoded = decodeGuiCommand('{"type":"heartbeat"');

    expect(decoded).toEqual({ ok: false, reason: 'invalid_json', lineClass: 'malformed_json' });
  });

  test('rejects unknown command type', () => {
    const decoded = decodeGuiCommand('{"type":"wat"}');

    expect(decoded).toEqual({ ok: false, reason: 'unknown_command_type', lineClass: 'unknown_type' });
  });

  test('rejects non-object payloads', () => {
    const decoded = decodeGuiCommand('123');

    expect(decoded).toEqual({ ok: false, reason: 'invalid_shape', lineClass: 'invalid_payload' });
  });
});
