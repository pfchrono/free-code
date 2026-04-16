import figures from 'figures'
import * as React from 'react'
import { Suspense, use } from 'react'

import { getSessionId } from '../../bootstrap/state.js'
import type { LocalJSXCommandContext } from '../../commands.js'
import { useIsInsideModal } from '../../context/modalContext.js'
import { Box, Text, useTheme } from '../../ink.js'
import { useCodexUsage, type CodexUsageSnapshot } from '../../services/api/codexUsage.js'
import { type AppState, useAppState } from '../../state/AppState.js'
import { isCodexSubscriber, isCopilotSubscriber } from '../../utils/auth.js'
import { getCwd } from '../../utils/cwd.js'
import { formatNumber } from '../../utils/format.js'
import { getCurrentSessionTitle } from '../../utils/sessionStorage.js'
import {
  buildAccountProperties,
  buildAPIProviderProperties,
  buildIDEProperties,
  buildInstallationDiagnostics,
  buildInstallationHealthDiagnostics,
  buildMcpProperties,
  buildMemoryDiagnostics,
  buildRemoteProperties,
  buildSandboxProperties,
  buildSettingSourcesProperties,
  type Diagnostic,
  getModelDisplayLabel,
  type Property,
} from '../../utils/status.js'
import type { ThemeName } from '../../utils/theme.js'
import { ConfigurableShortcutHint } from '../ConfigurableShortcutHint.js'
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js'

type Props = {
  context: LocalJSXCommandContext
  diagnosticsPromise: Promise<Diagnostic[]>
}

function buildCodexUsageProperties(codexUsage: CodexUsageSnapshot): Property[] {
  if (!isCodexSubscriber() && !isCopilotSubscriber()) {
    return []
  }

  const properties: Property[] = []

  if (codexUsage.context_window?.context_window_size) {
    const used = codexUsage.context_window.used_tokens ?? 0
    const total = codexUsage.context_window.context_window_size ?? 0
    const remaining = codexUsage.context_window.remaining_tokens

    properties.push({
      label: 'Usage',
      value: `Context ${formatNumber(used)} / ${formatNumber(total)}${
        remaining !== null && remaining !== undefined
          ? ` · ${formatNumber(remaining)} remaining`
          : ''
      }`,
    })
  }

  if (codexUsage.rate_limits.length > 0) {
    properties.push({
      label: 'Rate limits',
      value: codexUsage.rate_limits.map(
        limit =>
          `${limit.label}: ${
            limit.used_percentage !== null && limit.used_percentage !== undefined
              ? `${Math.floor(limit.used_percentage)}% used`
              : 'usage unavailable'
          }${
            limit.remaining !== null && limit.remaining !== undefined
              ? ` · ${formatNumber(limit.remaining)} remaining`
              : ''
          }`,
      ),
    })
  }

  return properties
}

function buildPrimarySection(codexUsage: CodexUsageSnapshot): Property[] {
  const sessionId = getSessionId()
  const customTitle = getCurrentSessionTitle(sessionId)
  const nameValue = customTitle ?? <Text dimColor>/rename to add a name</Text>

  return [
    {
      label: 'Version',
      value: MACRO.VERSION,
    },
    {
      label: 'Session name',
      value: nameValue,
    },
    {
      label: 'Session ID',
      value: sessionId,
    },
    {
      label: 'cwd',
      value: getCwd(),
    },
    ...buildAccountProperties(),
    ...buildAPIProviderProperties(),
    ...buildCodexUsageProperties(codexUsage),
  ]
}

function buildSecondarySection({
  mainLoopModel,
  mcp,
  theme,
  context,
  remoteConnectionStatus,
  remoteBackgroundTaskCount,
}: {
  mainLoopModel: AppState['mainLoopModel']
  mcp: AppState['mcp']
  theme: ThemeName
  context: LocalJSXCommandContext
  remoteConnectionStatus: AppState['remoteConnectionStatus']
  remoteBackgroundTaskCount: AppState['remoteBackgroundTaskCount']
}): Property[] {
  const modelLabel = getModelDisplayLabel(mainLoopModel)

  return [
    {
      label: 'Model',
      value: modelLabel,
    },
    ...buildRemoteProperties(
      remoteConnectionStatus,
      remoteBackgroundTaskCount,
      theme,
    ),
    ...buildIDEProperties(
      mcp.clients,
      context.options.ideInstallationStatus,
      theme,
    ),
    ...buildMcpProperties(mcp.clients, theme),
    ...buildSandboxProperties(),
    ...buildSettingSourcesProperties(),
  ]
}

export async function buildDiagnostics(): Promise<Diagnostic[]> {
  return [
    ...(await buildInstallationDiagnostics()),
    ...(await buildInstallationHealthDiagnostics()),
    ...(await buildMemoryDiagnostics()),
  ]
}

function PropertyValue({ value }: { value: Property['value'] }) {
  if (Array.isArray(value)) {
    return (
      <Box flexWrap="wrap" columnGap={1} flexShrink={99}>
        {value.map((item, index) => (
          <Text key={index}>
            {item}
            {index < value.length - 1 ? ',' : ''}
          </Text>
        ))}
      </Box>
    )
  }

  if (typeof value === 'string') {
    return <Text>{value}</Text>
  }

  return value
}

export function Status({ context, diagnosticsPromise }: Props) {
  const mainLoopModel = useMainLoopModel()
  const codexUsage = useCodexUsage()
  const mcp = useAppState(s => s.mcp)
  const remoteConnectionStatus = useAppState(s => s.remoteConnectionStatus)
  const remoteBackgroundTaskCount = useAppState(s => s.remoteBackgroundTaskCount)
  const [theme] = useTheme()

  const sections = [
    buildPrimarySection(codexUsage),
    buildSecondarySection({
      mainLoopModel,
      mcp,
      theme,
      context,
      remoteConnectionStatus,
      remoteBackgroundTaskCount,
    }),
  ]

  const grow = useIsInsideModal() ? 1 : undefined

  return (
    <Box flexDirection="column" flexGrow={grow}>
      <Box flexDirection="column" gap={1} flexGrow={grow}>
        {sections.map(
          (properties, index) =>
            properties.length > 0 && (
              <Box key={index} flexDirection="column">
                {properties.map(({ label, value }, propertyIndex) => (
                  <Box
                    key={propertyIndex}
                    flexDirection="row"
                    gap={1}
                    flexShrink={0}
                  >
                    {label !== undefined && <Text bold>{label}:</Text>}
                    <PropertyValue value={value} />
                  </Box>
                ))}
              </Box>
            ),
        )}
        <Suspense fallback={null}>
          <Diagnostics promise={diagnosticsPromise} />
        </Suspense>
      </Box>
      <Text dimColor>
        <ConfigurableShortcutHint
          action="confirm:no"
          context="Settings"
          fallback="Esc"
          description="cancel"
        />
      </Text>
    </Box>
  )
}

function Diagnostics({ promise }: { promise: Promise<Diagnostic[]> }) {
  const diagnostics = use(promise)

  if (diagnostics.length === 0) {
    return null
  }

  return (
    <Box flexDirection="column" paddingBottom={1}>
      <Text bold>System Diagnostics</Text>
      {diagnostics.map((diagnostic, index) => (
        <Box key={index} flexDirection="row" gap={1} paddingX={1}>
          <Text color="error">{figures.warning}</Text>
          {typeof diagnostic === 'string' ? (
            <Text wrap="wrap">{diagnostic}</Text>
          ) : (
            diagnostic
          )}
        </Box>
      ))}
    </Box>
  )
}
