import { afterEach, describe, expect, spyOn, test } from 'bun:test';

import { buildContinueLaunchAppProps, getInputPrompt } from './main.js';

describe('buildContinueLaunchAppProps', () => {
  test('preserves appendSystemPrompt for continue launches', () => {
    const getFpsMetrics = () => undefined;
    const stats = undefined;
    const initialState = {} as Parameters<typeof buildContinueLaunchAppProps>[0]['initialState'];

    expect(
      buildContinueLaunchAppProps({
        getFpsMetrics,
        stats,
        initialState,
        appendSystemPrompt: 'resume addendum',
      }),
    ).toEqual({
      getFpsMetrics,
      stats,
      initialState,
      appendSystemPrompt: 'resume addendum',
    });
  });
});

describe('getInputPrompt', () => {
  afterEach(() => {
    spyOn(process.argv, 'includes').mockRestore();
    spyOn(process.stdin, 'setEncoding').mockRestore();
  });

  test('sets utf8 encoding before returning stream-json stdin iterator', async () => {
    spyOn(process.argv, 'includes').mockReturnValue(false);
    const setEncodingSpy = spyOn(process.stdin, 'setEncoding').mockImplementation(
      () => process.stdin,
    );

    const input = await getInputPrompt('', 'stream-json');

    expect(setEncodingSpy).toHaveBeenCalledWith('utf8');
    expect(input).not.toBe(process.stdin);
    expect(input[Symbol.asyncIterator]).toBeDefined();
  });
});
