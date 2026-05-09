export type RankedSource<T> = {
  source: T
  score: number
  sourceType: 'file' | 'mcp_resource' | 'agent'
}

const SOURCE_PRIOR: Record<RankedSource<unknown>['sourceType'], number> = {
  file: 0,
  mcp_resource: 0.03,
  agent: 0.03,
}

export function normalizeAndRank<T>(items: RankedSource<T>[]): RankedSource<T>[] {
  if (items.length === 0) return items

  const byType: Record<RankedSource<unknown>['sourceType'], RankedSource<T>[]> = {
    file: [],
    mcp_resource: [],
    agent: [],
  }

  for (const item of items) {
    byType[item.sourceType].push(item)
  }

  const normalized: RankedSource<T>[] = []
  for (const type of Object.keys(byType) as Array<RankedSource<unknown>['sourceType']>) {
    const typed = byType[type]
    if (typed.length === 0) continue
    const min = Math.min(...typed.map(v => v.score))
    const max = Math.max(...typed.map(v => v.score))
    const span = max - min
    for (const item of typed) {
      const norm = span === 0 ? 0 : (item.score - min) / span
      normalized.push({ ...item, score: norm + SOURCE_PRIOR[type] })
    }
  }

  normalized.sort((a, b) => a.score - b.score)
  return normalized
}
