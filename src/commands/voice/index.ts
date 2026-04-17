import type { Command } from '../../commands.js'
import {
  isVoiceGrowthBookEnabled,
  isVoiceModeEnabled,
} from '../../voice/voiceModeEnabled.js'
import { shouldAllowAnthropicHostedServices } from '../../utils/model/providers.js'

const voice = {
  type: 'local',
  name: 'voice',
  description: 'Toggle voice mode',
  availability: ['claude-ai'],
  isEnabled: () =>
    shouldAllowAnthropicHostedServices() && isVoiceGrowthBookEnabled(),
  get isHidden() {
    return !shouldAllowAnthropicHostedServices() || !isVoiceModeEnabled()
  },
  supportsNonInteractive: false,
  load: () => import('./voice.js'),
} satisfies Command

export default voice
