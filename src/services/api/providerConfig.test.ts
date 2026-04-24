import { afterEach, describe, expect, it } from 'bun:test';

import {
  asEnvProviderBaseUrl,
  DEFAULT_OPENAI_BASE_URL,
  getConfiguredOpenAIBaseUrl,
  getOpenAIBaseUrl,
  isCodexBaseUrl,
  shouldUseCodexTransport,
} from './providerConfig.js';

afterEach(() => {
  delete process.env.OPENAI_BASE_URL;
  delete process.env.OPENAI_API_BASE;
});

describe('providerConfig', () => {
  it('treats literal undefined base URLs as unset', () => {
    expect(asEnvProviderBaseUrl('undefined')).toBeUndefined();
    expect(asEnvProviderBaseUrl(' undefined ')).toBeUndefined();
    expect(
      getConfiguredOpenAIBaseUrl({
        ...process.env,
        OPENAI_BASE_URL: 'undefined',
        OPENAI_API_BASE: ' https://example.test/v1 ',
      }),
    ).toBe('https://example.test/v1');
  });

  it('falls back to the default OpenAI base URL when env vars are unusable', () => {
    expect(
      getOpenAIBaseUrl({
        ...process.env,
        OPENAI_BASE_URL: 'undefined',
        OPENAI_API_BASE: '   ',
      }),
    ).toBe(DEFAULT_OPENAI_BASE_URL);
  });

  it('detects Codex transport from aliases when no explicit base URL is set', () => {
    expect(shouldUseCodexTransport('codexplan', undefined)).toBe(true);
    expect(shouldUseCodexTransport('chatgpt-5.3-codex-spark', undefined)).toBe(true);
    expect(shouldUseCodexTransport('gpt-5.3-codex-spark', undefined)).toBe(true);
    expect(shouldUseCodexTransport('gpt-5.5', undefined)).toBe(true);
    expect(shouldUseCodexTransport('gpt-4o', undefined)).toBe(false);
  });

  it('detects Codex transport from the canonical Codex base URL', () => {
    expect(isCodexBaseUrl('https://chatgpt.com/backend-api/codex')).toBe(true);
    expect(
      shouldUseCodexTransport(
        'gpt-4o',
        'https://chatgpt.com/backend-api/codex/responses',
      ),
    ).toBe(true);
  });
});
