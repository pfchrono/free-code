import { useEffect } from 'react'

type Props = {
  agentType: string
  scope: unknown
  snapshotTimestamp: string
  onComplete: (choice: 'merge' | 'keep' | 'replace') => void
  onCancel: () => void
}

export function SnapshotUpdateDialog({ onCancel }: Props) {
  useEffect(() => {
    onCancel()
  }, [onCancel])

  return null
}

export function buildMergePrompt(agentType: string, scope: unknown): string {
  return `Merge pending memory snapshot updates for ${agentType} (${String(scope)}).`
}
