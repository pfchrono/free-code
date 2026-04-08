type ParsedConnectUrl = {
  serverUrl: string
  authToken?: string
}

function normalizeHttpProtocol(protocol: string): 'http:' | 'https:' {
  return protocol === 'cc:' ? 'https:' : 'http:'
}

export function parseConnectUrl(input: string): ParsedConnectUrl {
  if (input.startsWith('cc+unix://')) {
    throw new Error(
      'cc+unix:// URLs are not supported in this build yet. Use a cc:// host URL instead.',
    )
  }

  if (!input.startsWith('cc://')) {
    throw new Error('Direct connect URL must start with cc:// or cc+unix://')
  }

  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    throw new Error('Invalid direct connect URL')
  }

  if (!parsed.hostname) {
    throw new Error('Direct connect URL is missing a host')
  }

  const authToken = parsed.searchParams.get('token') || parsed.username || undefined
  const protocol = normalizeHttpProtocol(parsed.protocol)
  const serverUrl = `${protocol}//${parsed.host}`

  return {
    serverUrl,
    authToken,
  }
}
