import { applyProviderRuntimeBootstrap, formatProviderRuntimeStatus } from '../src/utils/providerRuntime.js'

Object.assign(globalThis, {
  MACRO: {
    VERSION: '0.3.1',
    DISPLAY_VERSION: '0.3.1',
    PACKAGE_URL: 'free-code-source',
  },
})

async function main(): Promise<void> {
  applyProviderRuntimeBootstrap()
  const { enableConfigs } = await import('../src/utils/config.js')
  enableConfigs()
  const { applySafeConfigEnvironmentVariables } = await import(
    '../src/utils/managedEnv.js'
  )
  applySafeConfigEnvironmentVariables()
  console.log(formatProviderRuntimeStatus())
}

main().catch(err => {
  console.error('Provider doctor failed:', err)
  process.exit(1)
})
