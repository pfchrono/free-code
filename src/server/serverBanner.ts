import type { ServerConfig } from './types.js'

export function printBanner(config: ServerConfig): void {
  const transport = config.unix
    ? `unix:${config.unix}`
    : `http://${config.host}:${config.port}`

  process.stderr.write(`free-code server listening on ${transport}\n`)
}
