import { describe, expect, it } from 'bun:test'

import type { LoadedPlugin, PluginManifest } from '../../types/plugin.js'
import { mergePluginSources } from './pluginLoader.js'

function createPlugin(options: {
  name: string
  source: string
  enabled?: boolean
}): LoadedPlugin {
  return {
    name: options.name,
    source: options.source,
    repository: options.source,
    path: `C:/plugins/${options.name}`,
    manifest: { name: options.name } as PluginManifest,
    enabled: options.enabled,
  }
}

describe('mergePluginSources', () => {
  it('deduplicates marketplace plugins by short name and prefers enabled copies', () => {
    const result = mergePluginSources({
      session: [],
      marketplace: [
        createPlugin({
          name: 'context-mode',
          source: 'context-mode@marketplace-a',
          enabled: false,
        }),
        createPlugin({
          name: 'context-mode',
          source: 'context-mode@marketplace-b',
          enabled: true,
        }),
      ],
      builtin: [],
    })

    expect(result.plugins).toHaveLength(1)
    expect(result.plugins[0]?.source).toBe('context-mode@marketplace-b')
    expect(result.errors).toHaveLength(0)
  })

  it('reports an error when two enabled marketplace plugins collide by short name', () => {
    const result = mergePluginSources({
      session: [],
      marketplace: [
        createPlugin({
          name: 'frontend-design',
          source: 'frontend-design@marketplace-a',
          enabled: true,
        }),
        createPlugin({
          name: 'frontend-design',
          source: 'frontend-design@marketplace-b',
          enabled: true,
        }),
      ],
      builtin: [],
    })

    expect(result.plugins).toHaveLength(1)
    expect(result.plugins[0]?.source).toBe('frontend-design@marketplace-b')
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.type).toBe('generic-error')
  })
})
