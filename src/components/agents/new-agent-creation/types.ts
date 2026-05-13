import type { AgentMemoryScope } from '../../../tools/AgentTool/agentMemory.js'
import type { AgentColorName } from '../../../tools/AgentTool/agentColorManager.js'
import type { CustomAgentDefinition } from '../../../tools/AgentTool/loadAgentsDir.js'
import type { SettingSource } from '../../../utils/settings/constants.js'

type GeneratedAgent = {
  identifier: string
  whenToUse: string
  systemPrompt: string
}

export type AgentWizardData = {
  location?: SettingSource
  creationMethod?: 'generate' | 'manual'
  generationPrompt?: string
  isGenerating?: boolean
  wasGenerated?: boolean
  generatedAgent?: GeneratedAgent
  agentType?: string
  whenToUse?: string
  systemPrompt?: string
  selectedTools?: string[]
  selectedModel?: string
  selectedColor?: AgentColorName
  memory?: AgentMemoryScope
  finalAgent?: CustomAgentDefinition
}
