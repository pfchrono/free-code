export type UltraplanPhaseTone =
  | 'warning'
  | 'info'
  | 'success'
  | 'error'
  | 'dim'

export type UltraplanPhaseDisplay = {
  label: string
  tone: UltraplanPhaseTone
}

export function getUltraplanPhaseDisplay(
  status: string,
  summary?: string,
): UltraplanPhaseDisplay {
  const normalizedStatus = status.toLowerCase()
  const normalizedSummary = (summary ?? '').toLowerCase()

  if (normalizedStatus === 'failed') {
    return { label: 'failed', tone: 'error' }
  }
  if (normalizedStatus === 'killed') {
    return { label: 'stopped', tone: 'dim' }
  }
  if (normalizedStatus === 'completed') {
    return { label: 'done', tone: 'success' }
  }
  if (
    normalizedSummary.includes('ready for review') ||
    normalizedSummary.includes('plan ready') ||
    normalizedSummary.includes('completed')
  ) {
    return { label: 'ready', tone: 'success' }
  }
  if (
    normalizedSummary.includes('inspect') ||
    normalizedSummary.includes('reading repo') ||
    normalizedSummary.includes('scanning')
  ) {
    return { label: 'scan', tone: 'warning' }
  }
  if (
    normalizedSummary.includes('planning') ||
    normalizedSummary.includes('thinking') ||
    normalizedSummary.includes('system:')
  ) {
    return { label: 'plan', tone: 'info' }
  }
  if (normalizedStatus === 'running' || normalizedStatus === 'pending') {
    return { label: 'run', tone: 'info' }
  }
  return { label: normalizedStatus || 'idle', tone: 'dim' }
}
