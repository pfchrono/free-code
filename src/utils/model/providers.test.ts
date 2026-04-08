import { afterEach, describe, expect, it } from 'bun:test';

import {
  getAPIProvider,
  getUserSpecifiedModelEnvironmentSetting,
} from './providers.js';

afterEach(() => {
  delete process.env.CLAUDE_CODE_USE_OPENAI;
  delete process.env.CLAUDE_CODE_USE_CODEX;
  delete process.env.CLAUDE_CODE_USE_ZEN;
  delete process.env.OPENAI_MODEL;
  delete process.env.OPENAI_BASE_URL;
  delete process.env.OPENAI_API_BASE;
  delete process.env.ANTHROPIC_MODEL;
});

describe('getAPIProvider', () => {
  it('detects Zen provider from CLAUDE_CODE_USE_ZEN', () => {
    process.env.CLAUDE_CODE_USE_ZEN = '1';

    expect(getAPIProvider()).toBe('zen');
  });

  it('treats OpenAI codex aliases as codex transport', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1';
    process.env.OPENAI_MODEL = 'codexplan';

    expect(getAPIProvider()).toBe('codex');
  });

  it('treats the Codex base URL as codex transport', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1';
    process.env.OPENAI_MODEL = 'gpt-4o';
    process.env.OPENAI_BASE_URL = 'https://chatgpt.com/backend-api/codex';

    expect(getAPIProvider()).toBe('codex');
  });

  it('ignores literal undefined OpenAI base URLs', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1';
    process.env.OPENAI_MODEL = 'gpt-4o';
    process.env.OPENAI_BASE_URL = 'undefined';

    expect(getAPIProvider()).toBe('openai');
  });
});

describe('getUserSpecifiedModelEnvironmentSetting', () => {
  it('reads ANTHROPIC_MODEL only for first-party sessions', () => {
    process.env.ANTHROPIC_MODEL = 'claude-sonnet-4-6';
    process.env.OPENAI_MODEL = 'gpt-5.4';

    expect(getUserSpecifiedModelEnvironmentSetting('firstParty')).toBe(
      'claude-sonnet-4-6',
    );
  });

  it('reads OPENAI_MODEL for OpenAI-compatible providers without leaking ANTHROPIC_MODEL', () => {
    process.env.ANTHROPIC_MODEL = 'claude-sonnet-4-6';
    process.env.OPENAI_MODEL = 'openai/gpt-4.1';

    expect(getUserSpecifiedModelEnvironmentSetting('openrouter')).toBe(
      'openai/gpt-4.1',
    );
    expect(getUserSpecifiedModelEnvironmentSetting('openai')).toBe(
      'openai/gpt-4.1',
    );
    expect(getUserSpecifiedModelEnvironmentSetting('codex')).toBe(
      'openai/gpt-4.1',
    );
  });

  it('does not expose provider-specific model env vars to unrelated providers', () => {
    process.env.ANTHROPIC_MODEL = 'claude-sonnet-4-6';
    process.env.OPENAI_MODEL = 'gpt-5.4';

    expect(getUserSpecifiedModelEnvironmentSetting('copilot')).toBeUndefined();
  });
});
