import { getArchivistClient, isArchivistClientAvailable } from './archivistClient.js'

export interface CheckpointSummary {
  id: string
  label: string
  createdAt: number
  branchRef?: string
  note?: string
}

function normalizeCheckpointSummary(result: unknown): CheckpointSummary | null {
  if (!result || typeof result !== 'object') {
    return null
  }

  const value = result as Record<string, unknown>
  const id = typeof value.id === 'string'
    ? value.id
    : typeof value.checkpoint_id === 'string'
      ? value.checkpoint_id
      : null
  if (!id) {
    return null
  }

  return {
    id,
    label: typeof value.label === 'string'
      ? value.label
      : typeof value.name === 'string'
        ? value.name
        : id,
    createdAt: typeof value.createdAt === 'number'
      ? value.createdAt
      : typeof value.created_at === 'number'
        ? value.created_at
        : Date.now(),
    branchRef: typeof value.branchRef === 'string'
      ? value.branchRef
      : typeof value.branch_ref === 'string'
        ? value.branch_ref
        : undefined,
    note: typeof value.note === 'string' ? value.note : undefined,
  }
}

function normalizeCheckpointList(result: unknown): CheckpointSummary[] {
  if (!Array.isArray(result)) {
    return []
  }

  return result
    .map(normalizeCheckpointSummary)
    .filter((item): item is CheckpointSummary => item !== null)
}

export class ArchivistCheckpointProvider {
  isAvailable(): boolean {
    return isArchivistClientAvailable()
  }

  async create(label: string, note?: string): Promise<CheckpointSummary | null> {
    const client = getArchivistClient()
    if (!client) {
      return null
    }

    const result = await client.callTool('create_checkpoint', {
      label,
      note,
    })
    return normalizeCheckpointSummary(result)
  }

  async list(limit: number = 10): Promise<CheckpointSummary[]> {
    const client = getArchivistClient()
    if (!client) {
      return []
    }

    const result = await client.callTool('list_checkpoints', { limit })
    return normalizeCheckpointList(result)
  }

  async compare(a: string, b: string): Promise<string | null> {
    const client = getArchivistClient()
    if (!client) {
      return null
    }

    const result = await client.callTool<string>('compare_checkpoint_by_symbol', { a, b })
    return typeof result === 'string' ? result : null
  }
}
