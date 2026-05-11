import React, { useCallback, useEffect, useRef, useState } from 'react';
import { type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS, logEvent } from 'src/services/analytics/index.js';
import { installOAuthTokens } from '../cli/handlers/auth.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { setClipboard } from '../ink/termio/osc.js';
import { useTerminalNotification } from '../ink/useTerminalNotification.js';
import { Box, Link, Text } from '../ink.js';
import { useKeybinding } from '../keybindings/useKeybinding.js';
import { getSSLErrorHint } from '../services/api/errorUtils.js';
import { sendNotification } from '../services/notifier.js';
import { runCopilotOAuthFlow } from '../services/oauth/copilot-client.js';
import { runCodexDeviceCodeFlow, runCodexOAuthFlow } from '../services/oauth/codex-client.js';
import { OAuthService } from '../services/oauth/index.js';
import { getOauthAccountInfo, saveCodexOAuthTokens, saveCopilotOAuthTokens, validateForceLoginOrg } from '../utils/auth.js';
import { logError } from '../utils/log.js';
import { getSettings_DEPRECATED } from '../utils/settings/settings.js';
import { Select } from './CustomSelect/select.js';
import { KeyboardShortcutHint } from './design-system/KeyboardShortcutHint.js';
import { Spinner } from './Spinner.js';
import TextInput from './TextInput.js';
type Props = {
  onDone(): void;
  startingMessage?: string;
  mode?: 'login' | 'setup-token';
  forceLoginMethod?: 'claudeai' | 'console';
};
type OAuthStatus = {
  state: 'idle';
} // Initial state, waiting to select login method
| {
  state: 'platform_setup';
} // Show platform setup info (Bedrock/Vertex/Foundry)
| {
  state: 'codex_method_setup';
} // Choose Codex browser OAuth or one-time code flow
| {
  state: 'ready_to_start';
} // Flow started, waiting for browser to open
| {
  state: 'waiting_for_login';
  url: string;
} // Browser opened, waiting for user to login
| {
  state: 'waiting_for_device_code';
  verificationUrl: string;
  userCode: string;
  expiresInSeconds: number;
} // Device code issued, waiting for user to authorize in browser
| {
  state: 'creating_api_key';
} // Got access token, creating API key
| {
  state: 'about_to_retry';
  nextState: OAuthStatus;
} | {
  state: 'success';
  token?: string;
} | {
  state: 'error';
  message: string;
  toRetry?: OAuthStatus;
};
const PASTE_HERE_MSG = 'Paste code here if prompted > ';
export function ConsoleOAuthFlow({
  onDone,
  startingMessage,
  mode = 'login',
  forceLoginMethod: forceLoginMethodProp
}: Props): React.ReactNode {
  const settings = getSettings_DEPRECATED() || {};
  const forceLoginMethod = forceLoginMethodProp ?? settings.forceLoginMethod;
  const orgUUID = settings.forceLoginOrgUUID;
  const forcedMethodMessage = forceLoginMethod === 'claudeai' ? 'Login method pre-selected: Subscription Plan' : forceLoginMethod === 'console' ? 'Login method pre-selected: API usage billing (console account)' : null;
  const terminal = useTerminalNotification();
  const [oauthStatus, setOAuthStatus] = useState<OAuthStatus>(() => {
    if (mode === 'setup-token') {
      return {
        state: 'ready_to_start'
      };
    }
    if (forceLoginMethod === 'claudeai' || forceLoginMethod === 'console') {
      return {
        state: 'ready_to_start'
      };
    }
    return {
      state: 'idle'
    };
  });
  const [pastedCode, setPastedCode] = useState('');
  const [cursorOffset, setCursorOffset] = useState(0);
  const [oauthService] = useState(() => new OAuthService());
  const [loginWithClaudeAi, setLoginWithClaudeAi] = useState(() => {
    // Use Claude AI auth for setup-token mode to support user:inference scope
    return mode === 'setup-token' || forceLoginMethod === 'claudeai';
  });
  const [loginWithCodex, setLoginWithCodex] = useState(false);
  const [loginWithCodexDeviceCode, setLoginWithCodexDeviceCode] = useState(false);
  const [loginWithCopilot, setLoginWithCopilot] = useState(false);
  // After a few seconds we suggest the user to copy/paste url if the
  // browser did not open automatically. In this flow we expect the user to
  // copy the code from the browser and paste it in the terminal
  const [showPastePrompt, setShowPastePrompt] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const textInputColumns = useTerminalSize().columns - PASTE_HERE_MSG.length - 1;

  // Log forced login method on mount
  useEffect(() => {
    if (forceLoginMethod === 'claudeai') {
      logEvent('tengu_oauth_claudeai_forced', {});
    } else if (forceLoginMethod === 'console') {
      logEvent('tengu_oauth_console_forced', {});
    }
  }, [forceLoginMethod]);

  // Retry logic
  useEffect(() => {
    if (oauthStatus.state === 'about_to_retry') {
      const timer = setTimeout(setOAuthStatus, 1000, oauthStatus.nextState);
      return () => clearTimeout(timer);
    }
  }, [oauthStatus]);

  // Handle Enter to continue on success state
  useKeybinding('confirm:yes', () => {
    logEvent('tengu_oauth_success', {
      loginWithClaudeAi
    });
    onDone();
  }, {
    context: 'Confirmation',
    isActive: oauthStatus.state === 'success' && mode !== 'setup-token'
  });

  // Handle Enter to continue from platform setup
  useKeybinding('confirm:yes', () => {
    setOAuthStatus({
      state: 'idle'
    });
  }, {
    context: 'Confirmation',
    isActive: oauthStatus.state === 'platform_setup'
  });

  // Handle Enter to retry on error state
  useKeybinding('confirm:yes', () => {
    if (oauthStatus.state === 'error' && oauthStatus.toRetry) {
      setPastedCode('');
      setOAuthStatus({
        state: 'about_to_retry',
        nextState: oauthStatus.toRetry
      });
    }
  }, {
    context: 'Confirmation',
    isActive: oauthStatus.state === 'error' && !!oauthStatus.toRetry
  });
  useEffect(() => {
    if (pastedCode === 'c' && oauthStatus.state === 'waiting_for_login' && showPastePrompt && !urlCopied) {
      void setClipboard(oauthStatus.url).then(raw => {
        if (raw) process.stdout.write(raw);
        setUrlCopied(true);
        setTimeout(setUrlCopied, 2000, false);
      });
      setPastedCode('');
    }
  }, [pastedCode, oauthStatus, showPastePrompt, urlCopied]);
  async function handleSubmitCode(value: string, url: string) {
    try {
      // Expecting format "authorizationCode#state" from the authorization callback URL
      const [authorizationCode, state] = value.split('#');
      if (!authorizationCode || !state) {
        setOAuthStatus({
          state: 'error',
          message: 'Invalid code. Please make sure the full code was copied',
          toRetry: {
            state: 'waiting_for_login',
            url
          }
        });
        return;
      }

      // Track which path the user is taking (manual code entry)
      logEvent('tengu_oauth_manual_entry', {});
      oauthService.handleManualAuthCodeInput({
        authorizationCode,
        state
      });
    } catch (err: unknown) {
      logError(err);
      setOAuthStatus({
        state: 'error',
        message: (err as Error).message,
        toRetry: {
          state: 'waiting_for_login',
          url
        }
      });
    }
  }
  const startOAuth = useCallback(async () => {
    try {
      logEvent('tengu_oauth_flow_start', {
        loginWithClaudeAi
      });
      const result = await oauthService.startOAuthFlow(async url_0 => {
        setOAuthStatus({
          state: 'waiting_for_login',
          url: url_0
        });
        setTimeout(setShowPastePrompt, 3000, true);
      }, {
        loginWithClaudeAi,
        inferenceOnly: mode === 'setup-token',
        expiresIn: mode === 'setup-token' ? 365 * 24 * 60 * 60 : undefined,
        // 1 year for setup-token
        orgUUID
      }).catch(err_1 => {
        const isTokenExchangeError = err_1.message.includes('Token exchange failed');
        // Enterprise TLS proxies (Zscaler et al.) intercept the token
        // exchange POST and cause cryptic SSL errors. Surface an
        // actionable hint so the user isn't stuck in a login loop.
        const sslHint_0 = getSSLErrorHint(err_1);
        setOAuthStatus({
          state: 'error',
          message: sslHint_0 ?? (isTokenExchangeError ? 'Failed to exchange authorization code for access token. Please try again.' : err_1.message),
          toRetry: mode === 'setup-token' ? {
            state: 'ready_to_start'
          } : {
            state: 'idle'
          }
        });
        logEvent('tengu_oauth_token_exchange_error', {
          error: err_1.message,
          ssl_error: sslHint_0 !== null
        });
        throw err_1;
      });
      if (mode === 'setup-token') {
        // For setup-token mode, return the OAuth access token directly (it can be used as an API key)
        // Don't save to keychain - the token is displayed for manual use with CLAUDE_CODE_OAUTH_TOKEN
        setOAuthStatus({
          state: 'success',
          token: result.accessToken
        });
      } else {
        await installOAuthTokens(result);
        const orgResult = await validateForceLoginOrg();
        if (!orgResult.valid) {
          throw new Error('message' in orgResult ? (orgResult as any).message : 'Invalid organization');
        }
        setOAuthStatus({
          state: 'success'
        });
        void sendNotification({
          message: 'Free-Code login successful',
          notificationType: 'auth_success'
        }, terminal);
      }
    } catch (err_0) {
      const errorMessage = (err_0 as Error).message;
      const sslHint = getSSLErrorHint(err_0);
      setOAuthStatus({
        state: 'error',
        message: sslHint ?? errorMessage,
        toRetry: {
          state: mode === 'setup-token' ? 'ready_to_start' : 'idle'
        }
      });
      logEvent('tengu_oauth_error', {
        error: errorMessage as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        ssl_error: sslHint !== null
      });
    }
  }, [oauthService, setShowPastePrompt, loginWithClaudeAi, mode, orgUUID]);

  // Codex-specific OAuth flow — completely separate from the Anthropic OAuthService
  const startCodexOAuth = useCallback(async () => {
    try {
      logEvent('tengu_oauth_codex_flow_start', {});
      const codexTokens = await runCodexOAuthFlow(async (url) => {
        setOAuthStatus({ state: 'waiting_for_login', url });
        setTimeout(setShowPastePrompt, 3000, true);
      });
      // Save directly via saveCodexOAuthTokens (bypasses installOAuthTokens Anthropic path)
      saveCodexOAuthTokens(codexTokens);
      logEvent('tengu_oauth_codex_success', {});
      setOAuthStatus({ state: 'success' });
      void sendNotification({ message: 'Codex login successful', notificationType: 'auth_success' }, terminal);
    } catch (err) {
      const msg = (err as Error).message;
      logEvent('tengu_oauth_codex_error', {
        error: msg as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
      setOAuthStatus({ state: 'error', message: msg, toRetry: { state: 'idle' } });
    }
  }, [setShowPastePrompt, terminal]);

  const startCodexDeviceCodeOAuth = useCallback(async () => {
    try {
      logEvent('tengu_oauth_codex_device_flow_start', {});
      const codexTokens = await runCodexDeviceCodeFlow(async (deviceCode) => {
        setOAuthStatus({
          state: 'waiting_for_device_code',
          verificationUrl: deviceCode.verificationUrl,
          userCode: deviceCode.userCode,
          expiresInSeconds: deviceCode.expiresInSeconds,
        });
      });
      saveCodexOAuthTokens(codexTokens);
      logEvent('tengu_oauth_codex_device_success', {});
      setOAuthStatus({ state: 'success' });
      void sendNotification({ message: 'Codex login successful', notificationType: 'auth_success' }, terminal);
    } catch (err) {
      const msg = (err as Error).message;
      logEvent('tengu_oauth_codex_device_error', {
        error: msg as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
      setOAuthStatus({ state: 'error', message: msg, toRetry: { state: 'codex_method_setup' } });
    }
  }, [terminal]);

  const startCopilotOAuth = useCallback(async () => {
    try {
      logEvent('tengu_oauth_copilot_flow_start', {});
      const copilotTokens = await runCopilotOAuthFlow(async (url) => {
        setOAuthStatus({ state: 'waiting_for_login', url });
        setTimeout(setShowPastePrompt, 3000, true);
      });
      saveCopilotOAuthTokens(copilotTokens);
      logEvent('tengu_oauth_copilot_success', {});
      setOAuthStatus({ state: 'success' });
      void sendNotification({ message: 'GitHub Copilot login successful', notificationType: 'auth_success' }, terminal);
    } catch (err) {
      const msg = (err as Error).message;
      logEvent('tengu_oauth_copilot_error', {
        error: msg as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
      setOAuthStatus({ state: 'error', message: msg, toRetry: { state: 'idle' } });
    }
  }, [setShowPastePrompt, terminal]);

  const pendingOAuthStartRef = useRef(false);
  useEffect(() => {
    if (oauthStatus.state === 'ready_to_start' && !pendingOAuthStartRef.current) {
      pendingOAuthStartRef.current = true;
      if (loginWithCopilot) {
        process.nextTick((startCopilotOAuth_0: () => Promise<void>, pendingOAuthStartRef_0: React.MutableRefObject<boolean>) => {
          void startCopilotOAuth_0();
          pendingOAuthStartRef_0.current = false;
        }, startCopilotOAuth, pendingOAuthStartRef);
      } else if (loginWithCodex && loginWithCodexDeviceCode) {
        process.nextTick((startCodexDeviceCodeOAuth_0: () => Promise<void>, pendingOAuthStartRef_0: React.MutableRefObject<boolean>) => {
          void startCodexDeviceCodeOAuth_0();
          pendingOAuthStartRef_0.current = false;
        }, startCodexDeviceCodeOAuth, pendingOAuthStartRef);
      } else if (loginWithCodex) {
        process.nextTick((startCodexOAuth_0: () => Promise<void>, pendingOAuthStartRef_0: React.MutableRefObject<boolean>) => {
          void startCodexOAuth_0();
          pendingOAuthStartRef_0.current = false;
        }, startCodexOAuth, pendingOAuthStartRef);
      } else {
        process.nextTick((startOAuth_0: () => Promise<void>, pendingOAuthStartRef_0: React.MutableRefObject<boolean>) => {
          void startOAuth_0();
          pendingOAuthStartRef_0.current = false;
        }, startOAuth, pendingOAuthStartRef);
      }
    }
  }, [
    oauthStatus.state,
    startOAuth,
    startCodexOAuth,
    startCodexDeviceCodeOAuth,
    startCopilotOAuth,
    loginWithCodex,
    loginWithCodexDeviceCode,
    loginWithCopilot,
  ]);

  // Auto-exit for setup-token mode
  useEffect(() => {
    if (mode === 'setup-token' && oauthStatus.state === 'success') {
      // Delay to ensure static content is fully rendered before exiting
      const timer_0 = setTimeout((loginWithClaudeAi_0, onDone_0) => {
        logEvent('tengu_oauth_success', {
          loginWithClaudeAi: loginWithClaudeAi_0
        });
        // Don't clear terminal so the token remains visible
        onDone_0();
      }, 500, loginWithClaudeAi, onDone);
      return () => clearTimeout(timer_0);
    }
  }, [mode, oauthStatus, loginWithClaudeAi, onDone]);

  // Cleanup OAuth service when component unmounts
  useEffect(() => {
    return () => {
      oauthService.cleanup();
    };
  }, [oauthService]);
  return <Box flexDirection="column" gap={1}>
      {oauthStatus.state === 'waiting_for_login' && showPastePrompt && <Box flexDirection="column" key="urlToCopy" gap={1} paddingBottom={1}>
          <Box paddingX={1}>
            <Text dimColor>
              Browser didn&apos;t open? Use the url below to sign in{' '}
            </Text>
            {urlCopied ? <Text color="success">(Copied!)</Text> : <Text dimColor>
                <KeyboardShortcutHint shortcut="c" action="copy" parens />
              </Text>}
          </Box>
          <Link url={oauthStatus.url}>
            <Text dimColor>{oauthStatus.url}</Text>
          </Link>
        </Box>}
      {mode === 'setup-token' && oauthStatus.state === 'success' && oauthStatus.token && <Box key="tokenOutput" flexDirection="column" gap={1} paddingTop={1}>
            <Text color="success">
              ✓ Long-lived authentication token created successfully!
            </Text>
            <Box flexDirection="column" gap={1}>
              <Text>Your OAuth token (valid for 1 year):</Text>
              <Text color="warning">{oauthStatus.token}</Text>
              <Text dimColor>
                Store this token securely. You won&apos;t be able to see it
                again.
              </Text>
              <Text dimColor>
                Use this token by setting: export
                CLAUDE_CODE_OAUTH_TOKEN=&lt;token&gt;
              </Text>
            </Box>
          </Box>}
      <Box paddingLeft={1} flexDirection="column" gap={1}>
        <OAuthStatusMessage oauthStatus={oauthStatus} mode={mode} startingMessage={startingMessage} forcedMethodMessage={forcedMethodMessage} showPastePrompt={showPastePrompt} pastedCode={pastedCode} setPastedCode={setPastedCode} cursorOffset={cursorOffset} setCursorOffset={setCursorOffset} textInputColumns={textInputColumns} handleSubmitCode={handleSubmitCode} setOAuthStatus={setOAuthStatus} setLoginWithClaudeAi={setLoginWithClaudeAi} setLoginWithCodex={setLoginWithCodex} setLoginWithCodexDeviceCode={setLoginWithCodexDeviceCode} setLoginWithCopilot={setLoginWithCopilot} />
      </Box>
    </Box>;
}
type OAuthStatusMessageProps = {
  oauthStatus: OAuthStatus;
  mode: 'login' | 'setup-token';
  startingMessage: string | undefined;
  forcedMethodMessage: string | null;
  showPastePrompt: boolean;
  pastedCode: string;
  setPastedCode: (value: string) => void;
  cursorOffset: number;
  setCursorOffset: (offset: number) => void;
  textInputColumns: number;
  handleSubmitCode: (value: string, url: string) => void;
  setOAuthStatus: (status: OAuthStatus) => void;
  setLoginWithClaudeAi: (value: boolean) => void;
  setLoginWithCodex: (value: boolean) => void;
  setLoginWithCodexDeviceCode: (value: boolean) => void;
  setLoginWithCopilot: (value: boolean) => void;
};
function OAuthStatusMessage({
    oauthStatus,
    mode,
    startingMessage,
    forcedMethodMessage,
    showPastePrompt,
    pastedCode,
    setPastedCode,
    cursorOffset,
    setCursorOffset,
    textInputColumns,
    handleSubmitCode,
    setOAuthStatus,
    setLoginWithClaudeAi,
    setLoginWithCodex,
    setLoginWithCodexDeviceCode,
    setLoginWithCopilot,
  }: OAuthStatusMessageProps) {
  const resetHostedChoices = () => {
    setLoginWithCopilot(false);
    setLoginWithCodex(false);
    setLoginWithCodexDeviceCode(false);
  };

  switch (oauthStatus.state) {
    case 'idle':
      return <Box flexDirection="column" gap={1} marginTop={1}>
          <Text bold={true}>
            {startingMessage ? startingMessage : 'Free-Code can be used with your hosted subscription or billed based on API usage through your console account.'}
          </Text>
          <Text>Select login method:</Text>
          <Box>
            <Select options={[{
              label: <Text>Hosted account with subscription · <Text dimColor={true}>Pro, Max, Team, or Enterprise</Text>{'\n'}</Text>,
              value: 'claudeai',
            }, {
              label: <Text>Anthropic Console account · <Text dimColor={true}>API usage billing</Text>{'\n'}</Text>,
              value: 'console',
            }, {
              label: <Text>3rd-party platform · <Text dimColor={true}>Amazon Bedrock, Microsoft Foundry, or Vertex AI</Text>{'\n'}</Text>,
              value: 'platform',
            }, {
              label: <Text>OpenAI Codex account · <Text dimColor={true}>ChatGPT Plus/Pro subscription</Text>{'\n'}</Text>,
              value: 'codex',
            }, {
              label: <Text>GitHub Copilot account · <Text dimColor={true}>GitHub Copilot subscription</Text>{'\n'}</Text>,
              value: 'copilot',
            }]} onChange={value => {
              if (value === 'platform') {
                logEvent('tengu_oauth_platform_selected', {});
                resetHostedChoices();
                setLoginWithClaudeAi(false);
                setOAuthStatus({ state: 'platform_setup' });
              } else if (value === 'copilot') {
                logEvent('tengu_oauth_copilot_selected', {});
                setLoginWithCopilot(true);
                setLoginWithCodex(false);
                setLoginWithCodexDeviceCode(false);
                setLoginWithClaudeAi(false);
                setOAuthStatus({ state: 'ready_to_start' });
              } else if (value === 'codex') {
                logEvent('tengu_oauth_codex_selected', {});
                setLoginWithCopilot(false);
                setLoginWithCodex(true);
                setLoginWithCodexDeviceCode(false);
                setLoginWithClaudeAi(false);
                setOAuthStatus({ state: 'codex_method_setup' });
              } else {
                resetHostedChoices();
                setOAuthStatus({ state: 'ready_to_start' });
                if (value === 'claudeai') {
                  logEvent('tengu_oauth_claudeai_selected', {});
                  setLoginWithClaudeAi(true);
                } else {
                  logEvent('tengu_oauth_console_selected', {});
                  setLoginWithClaudeAi(false);
                }
              }
            }} />
          </Box>
        </Box>;
    case 'codex_method_setup':
      return <Box flexDirection="column" gap={1} marginTop={1}>
          <Text bold={true}>Select Codex login flow:</Text>
          <Box>
            <Select options={[{
              label: <Text>Browser OAuth · <Text dimColor={true}>opens auth URL on this machine</Text>{'\n'}</Text>,
              value: 'browser',
            }, {
              label: <Text>One-time code · <Text dimColor={true}>works on headless or remote hosts</Text>{'\n'}</Text>,
              value: 'device',
            }]} onChange={value => {
              setLoginWithCopilot(false);
              setLoginWithCodex(true);
              setLoginWithClaudeAi(false);
              setLoginWithCodexDeviceCode(value === 'device');
              logEvent(value === 'device' ? 'tengu_oauth_codex_device_selected' : 'tengu_oauth_codex_browser_selected', {});
              setOAuthStatus({ state: 'ready_to_start' });
            }} />
          </Box>
        </Box>;
    case 'platform_setup':
      return <Box flexDirection="column" gap={1} marginTop={1}>
          <Text bold={true}>Using 3rd-party platforms</Text>
          <Box flexDirection="column" gap={1}>
            <Text>Free-Code supports Amazon Bedrock, Microsoft Foundry, and Vertex AI. Set the required environment variables, then restart Free-Code.</Text>
            <Text>If you are part of an enterprise organization, contact your administrator for setup instructions.</Text>
            <Box flexDirection="column" marginTop={1}>
              <Text bold={true}>Documentation:</Text>
              <Text>· Amazon Bedrock: <Link url="https://code.claude.com/docs/en/amazon-bedrock">https://code.claude.com/docs/en/amazon-bedrock</Link></Text>
              <Text>· Microsoft Foundry: <Link url="https://code.claude.com/docs/en/microsoft-foundry">https://code.claude.com/docs/en/microsoft-foundry</Link></Text>
              <Text>· Vertex AI: <Link url="https://code.claude.com/docs/en/google-vertex-ai">https://code.claude.com/docs/en/google-vertex-ai</Link></Text>
            </Box>
            <Box marginTop={1}><Text dimColor={true}>Press <Text bold={true}>Enter</Text> to go back to login options.</Text></Box>
          </Box>
        </Box>;
    case 'waiting_for_login':
      return <Box flexDirection="column" gap={1}>
          {forcedMethodMessage && <Box><Text dimColor={true}>{forcedMethodMessage}</Text></Box>}
          {!showPastePrompt && <Box><Spinner /><Text>Opening browser to sign in…</Text></Box>}
          {showPastePrompt && <Box><Text>{PASTE_HERE_MSG}</Text><TextInput value={pastedCode} onChange={setPastedCode} onSubmit={value => handleSubmitCode(value, oauthStatus.url)} cursorOffset={cursorOffset} onChangeCursorOffset={setCursorOffset} columns={textInputColumns} mask="*" /></Box>}
        </Box>;
    case 'waiting_for_device_code':
      return <Box flexDirection="column" gap={1}>
          <Box><Spinner /><Text>Waiting for Codex one-time code approval…</Text></Box>
          <Text>Open this link in any browser:</Text>
          <Link url={oauthStatus.verificationUrl}><Text>{oauthStatus.verificationUrl}</Text></Link>
          <Text>Enter this one-time code:</Text>
          <Text color="permission" bold={true}>{oauthStatus.userCode}</Text>
          <Text dimColor={true}>Code expires in {Math.round(oauthStatus.expiresInSeconds / 60)} minutes.</Text>
        </Box>;
    case 'creating_api_key':
      return <Box flexDirection="column" gap={1}><Box><Spinner /><Text>Creating API key for Free-Code…</Text></Box></Box>;
    case 'about_to_retry':
      return <Box flexDirection="column" gap={1}><Text color="permission">Retrying…</Text></Box>;
    case 'success':
      return <Box flexDirection="column">
          {mode === 'setup-token' && oauthStatus.token ? null : <>
            {getOauthAccountInfo()?.emailAddress ? <Text dimColor={true}>Logged in as <Text>{getOauthAccountInfo()?.emailAddress}</Text></Text> : null}
            <Text color="success">Login successful. Press <Text bold={true}>Enter</Text> to continue…</Text>
          </>}
        </Box>;
    case 'error':
      return <Box flexDirection="column" gap={1}>
          <Text color="error">OAuth error: {oauthStatus.message}</Text>
          {oauthStatus.toRetry && <Box marginTop={1}><Text color="permission">Press <Text bold={true}>Enter</Text> to retry.</Text></Box>}
        </Box>;
    default:
      return null;
  }
}
