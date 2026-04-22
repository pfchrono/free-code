import * as React from 'react'
import { useEffect, useState } from 'react'
import type { CommandResultDisplay } from '../../commands.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { Box, Newline, Text } from '../../ink.js'
import { ArchivistCheckpointProvider } from '../../services/providers/archivist/archivistCheckpointProvider.js'
import { ArchivistCodeIntelProvider, type CodeSearchResult, type ImpactResult } from '../../services/providers/archivist/archivistCodeIntelProvider.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { logForDebugging } from '../../utils/debug.js'

type CodeView = 'menu' | 'search' | 'impact' | 'checkpoints'

interface CodeCommandData {
  mode: CodeView
  query?: string
  results: CodeSearchResult[]
  impact: ImpactResult | null
  checkpoints: Awaited<ReturnType<ArchivistCheckpointProvider['list']>>
}

function emptyData(): CodeCommandData {
  return {
    mode: 'menu',
    results: [],
    impact: null,
    checkpoints: [],
  }
}

async function loadCodeCommandData(args?: string): Promise<CodeCommandData> {
  const trimmed = args?.trim() ?? ''
  const codeIntel = new ArchivistCodeIntelProvider()
  const checkpoints = new ArchivistCheckpointProvider()

  if (!trimmed) {
    return emptyData()
  }

  if (trimmed.startsWith('search ')) {
    const query = trimmed.slice(7).trim()
    if (!query) {
      throw new Error('Provide a search query, e.g. /code search session restore')
    }
    return {
      mode: 'search',
      query,
      results: await codeIntel.search(query, 8),
      impact: null,
      checkpoints: [],
    }
  }

  if (trimmed.startsWith('impact ')) {
    const files = trimmed.slice(7).split(',').map(file => file.trim()).filter(Boolean)
    if (files.length === 0) {
      throw new Error('Provide one or more files, e.g. /code impact src/query.ts,src/main.tsx')
    }
    return {
      mode: 'impact',
      results: [],
      impact: await codeIntel.getImpact(files),
      checkpoints: [],
    }
  }

  if (trimmed === 'checkpoints') {
    return {
      mode: 'checkpoints',
      results: [],
      impact: null,
      checkpoints: checkpoints.isAvailable() ? await checkpoints.list(8) : [],
    }
  }

  return {
    mode: 'search',
    query: trimmed,
    results: await codeIntel.search(trimmed, 8),
    impact: null,
    checkpoints: [],
  }
}

function CodeCommand({ onDone, args }: { onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void; args?: string }): React.ReactNode {
  const [data, setData] = useState<CodeCommandData>(emptyData())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string>()

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setIsLoading(true)
      setError(undefined)
      try {
        const nextData = await loadCodeCommandData(args)
        if (!cancelled) {
          setData(nextData)
        }
      } catch (error) {
        const message = String(error)
        if (!cancelled) {
          setError(message)
        }
        logForDebugging(`[Code] Command load error: ${message}`)
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [args])

  const handleCancel = () => onDone('Code command cancelled', { display: 'system' })

  if (isLoading) {
    return <Dialog title="Code Intel" onCancel={handleCancel} color="primary"><Text>Loading code intel…</Text></Dialog>
  }

  if (error) {
    return <Dialog title="Code Intel" onCancel={handleCancel} color="primary"><Text color="red">{error}</Text></Dialog>
  }

  if (data.mode === 'search') {
    return (
      <Dialog title={`Code Search${data.query ? `: ${data.query}` : ''}`} onCancel={handleCancel} color="primary">
        <Box flexDirection="column">
          {data.results.length > 0 ? data.results.map(result => (
            <Box key={`${result.file}:${result.symbol ?? ''}`} flexDirection="column" marginBottom={1}>
              <Text bold>{result.file}{result.symbol ? ` · ${result.symbol}` : ''}</Text>
              {result.reason ? <Text dimColor>{result.reason}</Text> : null}
              {result.snippet ? <Text>{result.snippet.slice(0, 220)}{result.snippet.length > 220 ? '...' : ''}</Text> : null}
            </Box>
          )) : <Text dimColor>No Archivist code matches.</Text>}
        </Box>
      </Dialog>
    )
  }

  if (data.mode === 'impact') {
    return (
      <Dialog title="Code Impact" onCancel={handleCancel} color="primary">
        <Box flexDirection="column">
          {data.impact ? (
            <>
              <Text bold>Summary</Text>
              <Text>{data.impact.summary || 'No summary returned.'}</Text>
              <Newline />
              <Text bold>Affected Files</Text>
              {data.impact.affectedFiles.length > 0 ? data.impact.affectedFiles.map(file => <Text key={file}>• {file}</Text>) : <Text dimColor>None</Text>}
              <Newline />
              <Text bold>Affected Symbols</Text>
              {data.impact.affectedSymbols.length > 0 ? data.impact.affectedSymbols.map(symbol => <Text key={symbol}>• {symbol}</Text>) : <Text dimColor>None</Text>}
              <Newline />
              <Text bold>Impacted Tests</Text>
              {data.impact.impactedTests.length > 0 ? data.impact.impactedTests.map(test => <Text key={test}>• {test}</Text>) : <Text dimColor>None</Text>}
            </>
          ) : <Text dimColor>No impact data available.</Text>}
        </Box>
      </Dialog>
    )
  }

  if (data.mode === 'checkpoints') {
    return (
      <Dialog title="Code Checkpoints" onCancel={handleCancel} color="primary">
        <Box flexDirection="column">
          {data.checkpoints.length > 0 ? data.checkpoints.map(checkpoint => (
            <Box key={checkpoint.id} flexDirection="column" marginBottom={1}>
              <Text bold>{checkpoint.label}</Text>
              <Text dimColor>{checkpoint.id}</Text>
              {checkpoint.note ? <Text dimColor>{checkpoint.note}</Text> : null}
            </Box>
          )) : <Text dimColor>No checkpoint data available.</Text>}
        </Box>
      </Dialog>
    )
  }

  return (
    <Dialog title="Code Intel" onCancel={handleCancel} color="primary">
      <Box flexDirection="column">
        <Text bold>Commands</Text>
        <Text>  /code search &lt;query&gt;</Text>
        <Text>  /code impact &lt;file[,file...]&gt;</Text>
        <Text>  /code checkpoints</Text>
        <Newline />
        <Text dimColor>Uses Archivist provider seams when available.</Text>
      </Box>
    </Dialog>
  )
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  return <CodeCommand onDone={onDone} args={args} />
}
