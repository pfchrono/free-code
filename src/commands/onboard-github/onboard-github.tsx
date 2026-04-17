import * as React from 'react'
import { useCallback, useState } from 'react'
import { Select } from '../../components/CustomSelect/select.js'
import { Spinner } from '../../components/Spinner.js'
import TextInput from '../../components/TextInput.js'
import { Box, Text } from '../../ink.js'
import {
  openVerificationUri,
  pollAccessToken,
  requestDeviceCode,
} from '../../services/github/deviceFlow.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import {
  hydrateGithubModelsTokenFromSecureStorage,
  saveGithubModelsToken,
} from '../../utils/githubModelsCredentials.js'
import { updateSettingsForSource } from '../../utils/settings/settings.js'

const DEFAULT_MODEL = 'github:copilot'

type Step = 'menu' | 'device-busy' | 'pat' | 'error'

function mergeUserSettingsEnv(model: string): { ok: boolean; detail?: string } {
  const { error } = updateSettingsForSource('userSettings', {
    env: {
      CLAUDE_CODE_USE_GITHUB: '1',
      OPENAI_MODEL: model,
      CLAUDE_CODE_USE_OPENAI: undefined as never,
      CLAUDE_CODE_USE_GEMINI: undefined as never,
      CLAUDE_CODE_USE_BEDROCK: undefined as never,
      CLAUDE_CODE_USE_VERTEX: undefined as never,
      CLAUDE_CODE_USE_FOUNDRY: undefined as never,
    },
  })
  if (error) {
    return { ok: false, detail: error.message }
  }
  return { ok: true }
}

function OnboardGithub(props: {
  onDone: Parameters<LocalJSXCommandCall>[0]
  onChangeAPIKey: () => void
}): React.ReactNode {
  const { onDone, onChangeAPIKey } = props
  const [step, setStep] = useState<Step>('menu')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [deviceHint, setDeviceHint] = useState<{
    user_code: string
    verification_uri: string
  } | null>(null)
  const [patDraft, setPatDraft] = useState('')
  const [cursorOffset, setCursorOffset] = useState(0)

  const finalize = useCallback(
    async (token: string, model: string = DEFAULT_MODEL) => {
      const saved = saveGithubModelsToken(token)
      if (!saved.success) {
        setErrorMsg(saved.warning ?? 'Could not save token to secure storage.')
        setStep('error')
        return
      }
      const merged = mergeUserSettingsEnv(model.trim() || DEFAULT_MODEL)
      if (!merged.ok) {
        setErrorMsg(
          `Token saved, but settings were not updated: ${merged.detail ?? 'unknown error'}. ` +
            `Add env CLAUDE_CODE_USE_GITHUB=1 and OPENAI_MODEL to ~/.claude/settings.json manually.`,
        )
        setStep('error')
        return
      }
      process.env.CLAUDE_CODE_USE_GITHUB = '1'
      process.env.OPENAI_MODEL = model.trim() || DEFAULT_MODEL
      hydrateGithubModelsTokenFromSecureStorage()
      onChangeAPIKey()
      onDone(
        'GitHub Models onboard complete. Token stored in secure storage; user settings updated. Restart if the model does not switch.',
        { display: 'user' },
      )
    },
    [onChangeAPIKey, onDone],
  )

  const runDeviceFlow = useCallback(async () => {
    setStep('device-busy')
    setErrorMsg(null)
    setDeviceHint(null)
    try {
      const device = await requestDeviceCode()
      setDeviceHint({
        user_code: device.user_code,
        verification_uri: device.verification_uri,
      })
      await openVerificationUri(device.verification_uri)
      const token = await pollAccessToken(device.device_code, {
        initialInterval: device.interval,
        timeoutSeconds: device.expires_in,
      })
      await finalize(token, DEFAULT_MODEL)
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : String(error))
      setStep('error')
    }
  }, [finalize])

  if (step === 'error' && errorMsg) {
    const options = [
      { label: 'Back to menu', value: 'back' as const },
      { label: 'Exit', value: 'exit' as const },
    ]
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="red">{errorMsg}</Text>
        <Select
          options={options}
          onChange={(value: string) => {
            if (value === 'back') {
              setStep('menu')
              setErrorMsg(null)
            } else {
              onDone('GitHub onboard cancelled', { display: 'system' })
            }
          }}
        />
      </Box>
    )
  }

  if (step === 'device-busy') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text>GitHub device login</Text>
        {deviceHint ? (
          <>
            <Text>
              Enter code <Text bold>{deviceHint.user_code}</Text> at{' '}
              {deviceHint.verification_uri}
            </Text>
            <Text dimColor>
              A browser window may have opened. Waiting for authorization...
            </Text>
          </>
        ) : (
          <Text dimColor>Requesting device code from GitHub...</Text>
        )}
        <Spinner />
      </Box>
    )
  }

  if (step === 'pat') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text>Paste a GitHub personal access token with access to GitHub Models.</Text>
        <Text dimColor>Input is masked. Enter to submit; Esc to go back.</Text>
        <TextInput
          value={patDraft}
          mask="*"
          onChange={setPatDraft}
          onSubmit={async (value: string) => {
            const token = value.trim()
            if (!token) {
              return
            }
            await finalize(token, DEFAULT_MODEL)
          }}
          onExit={() => {
            setStep('menu')
            setPatDraft('')
          }}
          columns={80}
          cursorOffset={cursorOffset}
          onChangeCursorOffset={setCursorOffset}
        />
      </Box>
    )
  }

  const menuOptions = [
    { label: 'Sign in with browser (device code)', value: 'device' as const },
    { label: 'Paste personal access token', value: 'pat' as const },
    { label: 'Cancel', value: 'cancel' as const },
  ]

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>GitHub Models setup</Text>
      <Text dimColor>
        Stores your token in secure storage and enables CLAUDE_CODE_USE_GITHUB in
        your user settings.
      </Text>
      <Select
        options={menuOptions}
        onChange={(value: string) => {
          if (value === 'cancel') {
            onDone('GitHub onboard cancelled', { display: 'system' })
            return
          }
          if (value === 'pat') {
            setStep('pat')
            return
          }
          void runDeviceFlow()
        }}
      />
    </Box>
  )
}

export const call: LocalJSXCommandCall = async (onDone, context) => {
  return (
    <OnboardGithub
      onDone={onDone}
      onChangeAPIKey={context.onChangeAPIKey}
    />
  )
}
