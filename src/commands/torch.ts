import type { Command, LocalCommandCall } from '../types/command.js'

const call: LocalCommandCall = async () => {
  return {
    type: 'text',
    value: [
      'Torch mode is available in this build as an experimental surface.',
      'This reconstruction currently provides the command entrypoint only.',
      'Use /websearch, /webfetch, /web_browser, and /dream for adjacent exploratory workflows.',
    ].join('\n'),
  }
}

const torch = {
  type: 'local',
  name: 'torch',
  description: 'Experimental torch workflow entrypoint',
  supportsNonInteractive: true,
  isEnabled: () => true,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default torch
