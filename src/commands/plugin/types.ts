import type { LocalJSXCommandOnDone } from '../../types/command.js'

export type ViewState =
  | string
  | {
      type: string
      [key: string]: unknown
    }

export type PluginSettingsProps = {
  onComplete: LocalJSXCommandOnDone
  args?: string
}
