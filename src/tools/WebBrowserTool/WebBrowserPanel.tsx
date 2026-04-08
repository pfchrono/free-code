import React, { useEffect, useState } from 'react'
import { Box, Text } from '../../ink.js'
import {
  getWebBrowserState,
  subscribeWebBrowserState,
} from './state.js'

export function WebBrowserPanel(): React.ReactNode {
  const [state, setState] = useState(getWebBrowserState())

  useEffect(() => {
    return subscribeWebBrowserState(() => {
      setState(getWebBrowserState())
    })
  }, [])

  if (state.status === 'idle') {
    return null
  }

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} marginTop={1}>
      <Text bold>Browser</Text>
      {state.url ? <Text>{state.url}</Text> : null}
      {state.title ? <Text dimColor>{state.title}</Text> : null}
      {state.error ? <Text color="red">{state.error}</Text> : null}
    </Box>
  )
}
