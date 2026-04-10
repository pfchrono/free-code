import capitalize from 'lodash-es/capitalize.js'
import Fuse from 'fuse.js'
import * as React from 'react'
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { Box, Text, useInput } from '../ink.js'
import { useAppState, useSetAppState } from '../state/AppState.js'
import { useExitOnCtrlCDWithKeybindings } from '../hooks/useExitOnCtrlCDWithKeybindings.js'
import { useRegisterKeybindingContext } from '../keybindings/KeybindingContext.js'
import { Select } from './CustomSelect/index.js'
import { Pane } from './design-system/Pane.js'
import type { APIProvider } from '../utils/model/providers.js'
import { discoverOllama } from '../services/provider/index.js'
import { recommendOllamaModel } from '../services/provider/recommendation.js'
import { getFavoriteModels, getRecentModels, toggleFavorite, isFavorite, addToRecent } from '../utils/modelPreferences.js'

export type ProviderOption = {
  value: APIProvider
  label: string
  description: string
  models?: string[]
}

const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    value: 'firstParty',
    label: 'Claude (Anthropic)',
    description: 'Official Anthropic API with Claude models',
    models: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
  },
  {
    value: 'openai',
    label: 'OpenAI',
    description: 'OpenAI API with GPT models',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  },
  {
    value: 'copilot',
    label: 'GitHub Copilot',
    description: 'GitHub Copilot Chat API',
    models: ['gpt-4o', 'gpt-4-turbo', 'gpt-4'],
  },
  {
    value: 'codex',
    label: 'Codex (ChatGPT)',
    description: 'OpenAI Codex API',
    models: ['gpt-4o', 'gpt-4-turbo', 'gpt-4'],
  },
  {
    value: 'zen',
    label: 'Zen',
    description: 'Zen AI platform',
    models: [],
  },
  {
    value: 'lmstudio',
    label: 'LM Studio',
    description: 'Local LM Studio server',
    models: [],
  },
  {
    value: 'minimax',
    label: 'MiniMax',
    description: 'MiniMax AI platform',
    models: [],
  },
  {
    value: 'openrouter',
    label: 'OpenRouter',
    description: 'Unified API for multiple providers',
    models: [],
  },
]

interface ProviderPickerProps {
  onSelect: (provider: APIProvider, model?: string) => void
  onCancel: () => void
  initialProvider?: APIProvider
}

export function ProviderPicker({
  onSelect,
  onCancel,
  initialProvider,
}: ProviderPickerProps): React.ReactNode {
  useRegisterKeybindingContext('ProviderPicker', true)
  useExitOnCtrlCDWithKeybindings(onCancel)
  const currentProvider = useAppState(s => s.provider)

  const [focusedField, setFocusedField] = useState<'provider' | 'model'>('provider')
  const [selectedProvider, setSelectedProvider] = useState<APIProvider>(
    initialProvider ?? currentProvider ?? 'firstParty',
  )
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [showOllama, setShowOllama] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const providerSelectRef = useRef<{ focus: () => void } | null>(null)
  const modelSelectRef = useRef<{ focus: () => void } | null>(null)

  useEffect(() => {
    if (focusedField === 'provider' && providerSelectRef.current) {
      providerSelectRef.current.focus()
    } else if (focusedField === 'model' && modelSelectRef.current) {
      modelSelectRef.current.focus()
    }
  }, [focusedField])

  const providerSelectOptions = useMemo(() => {
    return PROVIDER_OPTIONS.map(p => ({
      value: p.value,
      label: p.label,
      description: p.description,
    }))
  }, [])

  const currentProviderModels = useMemo(() => {
    const provider = PROVIDER_OPTIONS.find(p => p.value === selectedProvider)
    if (!provider) return []

    if (showOllama && ollamaModels.length > 0) {
      return ollamaModels.map(m => ({ value: m, label: m }))
    }

    return (provider.models ?? []).map(m => ({ value: m, label: m }))
  }, [selectedProvider, showOllama, ollamaModels])

  const modelSelectOptions = useMemo(() => {
    return currentProviderModels.map(opt => ({
      ...opt,
      description: isFavorite(selectedProvider, opt.value) ? '★ favorite' : undefined,
    }))
  }, [currentProviderModels, selectedProvider])

  const filteredModelOptions = useMemo(() => {
    if (!searchQuery.trim()) {
      return modelSelectOptions
    }

    const fuse = new Fuse(modelSelectOptions, {
      keys: ['label', 'description'],
      threshold: 0.3,
    })

    return fuse.search(searchQuery).map(r => r.item)
  }, [modelSelectOptions, searchQuery])

  const favoriteModels = useMemo(() => {
    return getFavoriteModels(selectedProvider)
  }, [selectedProvider])

  const recentModels = useMemo(() => {
    return getRecentModels(selectedProvider).slice(0, 5)
  }, [selectedProvider])

  const handleProviderChange = useCallback(async (provider: string) => {
    setSelectedProvider(provider as APIProvider)
    setSelectedModel('')
    setShowOllama(false)

    if (provider === 'firstParty') {
      setLoadingModels(true)
      const discovery = await discoverOllama()
      if (discovery.available && discovery.models.length > 0) {
        setOllamaModels(discovery.models.map(m => m.name))
        const recommendation = recommendOllamaModel(discovery.models, 'balanced')
        if (recommendation) {
          setSelectedModel(recommendation.name)
        }
      }
      setLoadingModels(false)
    }
  }, [])

  const handleModelChange = useCallback((model: string) => {
    setSelectedModel(model)
  }, [])

  const handleTabKey = useCallback(() => {
    if (focusedField === 'provider') {
      setFocusedField('model')
    } else {
      setFocusedField('provider')
    }
  }, [focusedField])

  const handleEnterKey = useCallback(() => {
    if (focusedField === 'provider') {
      if (currentProviderModels.length > 0) {
        setFocusedField('model')
      } else {
        handleConfirm()
      }
    } else {
      handleConfirm()
    }
  }, [focusedField, currentProviderModels.length])

  const handleToggleFavorite = useCallback(() => {
    if (selectedModel) {
      toggleFavorite(selectedProvider, selectedModel)
    }
  }, [selectedProvider, selectedModel])

  const handleConfirm = useCallback(() => {
    if (selectedModel) {
      addToRecent(selectedProvider, selectedModel)
    }
    onSelect(selectedProvider, selectedModel || undefined)
  }, [selectedProvider, selectedModel, onSelect])

  const handleDiscoverOllama = useCallback(async () => {
    setLoadingModels(true)
    const discovery = await discoverOllama()
    if (discovery.available && discovery.models.length > 0) {
      setOllamaModels(discovery.models.map(m => m.name))
      setShowOllama(true)
    }
    setLoadingModels(false)
  }, [])

  const selectedProviderOption = PROVIDER_OPTIONS.find(p => p.value === selectedProvider)
  const displayModelOptions = searchQuery ? filteredModelOptions : modelSelectOptions

  useInput((input, key) => {
    if (key.tab) {
      handleTabKey()
    } else if (key.return) {
      handleEnterKey()
    } else if (key.escape) {
      onCancel()
    }
  })

  return (
    <Pane>
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Text bold={true}>Provider & Model</Text>
          <Text dimColor={true} onClick={onCancel}>[x]</Text>
        </Box>

        <Text dimColor={true}>
          <Text bold={true} color={focusedField === 'provider' ? 'green' : undefined}>[P]</Text>
          {' Provider '}
          <Text bold={true} color={focusedField === 'model' ? 'green' : undefined}>[M]</Text>
          {' Model '}
          {'· Tab to switch · Enter to select/confirm'}
        </Text>

        <Box
          flexDirection="column"
          gap={1}
          borderStyle={focusedField === 'provider' ? 'bold' : undefined}
          borderColor={focusedField === 'provider' ? 'cyan' : undefined}
        >
          <Text bold={true} color={focusedField === 'provider' ? 'green' : undefined}>
            Provider {focusedField === 'provider' ? '←' : ''}
          </Text>
          <Select
            ref={providerSelectRef as any}
            options={providerSelectOptions}
            value={selectedProvider}
            onChange={handleProviderChange}
            dense={true}
            layout="compact-vertical"
          />
        </Box>

        {selectedProviderOption && (
          <Text dimColor={true}>
            {selectedProviderOption.description}
          </Text>
        )}

        {loadingModels && (
          <Text dimColor={true}>Discovering Ollama models...</Text>
        )}

        {displayModelOptions.length > 0 && (
          <Box
            flexDirection="column"
            gap={1}
            borderStyle={focusedField === 'model' ? 'bold' : undefined}
            borderColor={focusedField === 'model' ? 'cyan' : undefined}
          >
            <Text bold={true} color={focusedField === 'model' ? 'green' : undefined}>
              Model {focusedField === 'model' ? '←' : ''}
            </Text>
            <Select
              ref={modelSelectRef as any}
              options={displayModelOptions}
              value={selectedModel || displayModelOptions[0]?.value || ''}
              onChange={handleModelChange}
              dense={true}
              layout="compact-vertical"
            />
          </Box>
        )}

        {selectedProvider === 'firstParty' && !showOllama && !loadingModels && currentProviderModels.length === 0 && (
          <Box marginTop={1}>
            <Text
              bold={true}
              color="cyan"
              onClick={handleDiscoverOllama}
            >
              [Discover local Ollama]
            </Text>
          </Box>
        )}

        {showOllama && ollamaModels.length > 0 && (
          <Text dimColor={true}>
            Showing {ollamaModels.length} Ollama models
          </Text>
        )}

        {favoriteModels.length > 0 && (
          <Box flexDirection="column" gap={0} marginTop={1}>
            <Text dimColor={true} fontSize={10}>FAVORITES</Text>
            <Box flexDirection="row" flexWrap="wrap" gap={1}>
              {favoriteModels.map(fav => (
                <Text
                  key={fav.model}
                  dimColor={selectedModel === fav.model}
                  bold={selectedModel === fav.model}
                  onClick={() => handleModelChange(fav.model)}
                >
                  ★ {fav.model}{' '}
                </Text>
              ))}
            </Box>
          </Box>
        )}

        {recentModels.length > 0 && (
          <Box flexDirection="column" gap={0}>
            <Text dimColor={true} fontSize={10}>RECENT</Text>
            <Box flexDirection="row" flexWrap="wrap" gap={1}>
              {recentModels.map(rec => (
                <Text
                  key={rec.model}
                  dimColor={selectedModel === rec.model}
                  onClick={() => handleModelChange(rec.model)}
                >
                  › {rec.model}{' '}
                </Text>
              ))}
            </Box>
          </Box>
        )}

        {selectedModel && (
          <Box marginTop={1}>
            <Text
              dimColor={isFavorite(selectedProvider, selectedModel)}
              bold={isFavorite(selectedProvider, selectedModel)}
              onClick={handleToggleFavorite}
            >
              {isFavorite(selectedProvider, selectedModel) ? '★ Remove from favorites' : '☆ Add to favorites'}
            </Text>
          </Box>
        )}

        <Box marginTop={1} flexDirection="row" gap={2}>
          <Text
            bold={true}
            color="green"
            onClick={handleConfirm}
          >
            [Enter] Confirm
          </Text>
          <Text
            dimColor={true}
            onClick={onCancel}
          >
            [Esc] Cancel
          </Text>
        </Box>
      </Box>
    </Pane>
  )
}
