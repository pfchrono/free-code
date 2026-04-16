import React from 'react'
import type { DeepImmutable } from 'src/types/utils.js'
import type { CommandResultDisplay } from '../../commands.js'
import type { KeyboardEvent } from '../../ink/events/keyboard-event.js'
import { Box, Text } from '../../ink.js'
import type { LocalWorkflowTaskState } from '../../tasks/LocalWorkflowTask/LocalWorkflowTask.js'
import { formatDuration } from '../../utils/format.js'
import { getUltraplanPhaseDisplay } from '../../utils/ultraplan/phase.js'
import { Byline } from '../design-system/Byline.js'
import { Dialog } from '../design-system/Dialog.js'
import { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.js'

type Props = {
  workflow: DeepImmutable<LocalWorkflowTaskState>
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void
  onKill?: () => void
  onBack?: () => void
  onSkipAgent?: (agentId: string) => void
  onRetryAgent?: (agentId: string) => void
}

export function WorkflowDetailDialog({
  workflow,
  onDone,
  onKill,
  onBack,
}: Props): React.ReactNode {
  const phase = getUltraplanPhaseDisplay(workflow.status, workflow.summary)
  const runtimeMs = (workflow.endTime ?? Date.now()) - workflow.startTime

  function handleKeyDown(event: KeyboardEvent): void {
    if ((event.key === 'escape' || event.key === 'enter' || event.key === ' ') && !event.ctrl && !event.meta) {
      event.preventDefault()
      onDone('Workflow details dismissed', { display: 'system' })
      return
    }
    if (event.key === 'left' && onBack) {
      event.preventDefault()
      onBack()
      return
    }
    if (event.key === 'x' && workflow.status === 'running' && onKill) {
      event.preventDefault()
      onKill()
    }
  }

  return (
    <Box onKeyDown={handleKeyDown}>
      <Dialog
        title="Workflow details"
        onCancel={() => onDone('Workflow details dismissed', { display: 'system' })}
        inputGuide={exitState =>
          exitState.pending ? (
            <Text>Press {exitState.keyName} again to exit</Text>
          ) : (
            <Byline>
              {onBack ? <KeyboardShortcutHint shortcut="←" action="go back" /> : null}
              <KeyboardShortcutHint shortcut="Esc/Enter/Space" action="close" />
              {workflow.status === 'running' && onKill ? (
                <KeyboardShortcutHint shortcut="x" action="stop" />
              ) : null}
            </Byline>
          )
        }
      >
        <Box flexDirection="column" gap={1}>
          <Text>
            <Text bold>Status:</Text>{' '}
            <Text color={phase.tone}>
              [{phase.label}] {workflow.status}
            </Text>
          </Text>
          <Text>
            <Text bold>Workflow:</Text> {workflow.workflowName ?? workflow.description}
          </Text>
          <Text>
            <Text bold>Summary:</Text> {workflow.summary ?? workflow.description}
          </Text>
          <Text>
            <Text bold>Runtime:</Text> {formatDuration(runtimeMs)}
          </Text>
          <Text>
            <Text bold>Agents:</Text> {workflow.agentCount ?? workflow.agents?.length ?? 0}
          </Text>
          <Box flexDirection="column" marginTop={1}>
            {(workflow.agents ?? []).map(agent => (
              <Text key={agent.id}>
                <Text color={agent.status === 'completed' ? 'success' : agent.status === 'failed' ? 'error' : 'info'}>
                  [{agent.status}]
                </Text>{' '}
                {agent.name}
              </Text>
            ))}
          </Box>
        </Box>
      </Dialog>
    </Box>
  )
}
