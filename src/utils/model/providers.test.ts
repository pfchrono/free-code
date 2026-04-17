import { afterEach, describe, expect, it } from 'bun:test';

import { getAPIProvider } from './providers.js';
import { switchProviderDirectly } from '../../hooks/useProviderSwitch.js';

afterEach(() => {
  delete process.env.CLAUDE_CODE_USE_OPENAI;
  delete process.env.CLAUDE_CODE_USE_CODEX;
  delete process.env.CLAUDE_CODE_USE_ZEN;
  delete process.env.CLAUDE_CODE_USE_OPENROUTER;
  delete process.env.CLAUDE_CODE_USE_COPILOT;
  delete process.env.CLAUDE_CODE_USE_LMSTUDIO;
  delete process.env.CLAUDE_CODE_USE_MINIMAX;
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


  it('ignores literal undefined OpenAI base URLs', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1';
    process.env.OPENAI_MODEL = 'gpt-4o';
    process.env.OPENAI_BASE_URL = 'undefined';

    expect(getAPIProvider()).toBe('openai');
  });
});

describe('switchProviderDirectly', () => {
  it('sets runtime env for minimax', () => {
    switchProviderDirectly('minimax');

    expect(process.env.CLAUDE_CODE_USE_MINIMAX).toBe('1');
    expect(process.env.CLAUDE_CODE_USE_OPENAI).toBeUndefined();
    expect(process.env.CLAUDE_CODE_USE_CODEX).toBeUndefined();
  });

  it('sets runtime env for openai', () => {
    switchProviderDirectly('openai');

    expect(process.env.CLAUDE_CODE_USE_OPENAI).toBe('1');
    expect(process.env.CLAUDE_CODE_USE_MINIMAX).toBeUndefined();
  });
});

