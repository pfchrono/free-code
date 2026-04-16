import { GrpcServer } from '../src/grpc/server.ts'
import { init } from '../src/entrypoints/init.ts'
import {
  applyProviderRuntimeBootstrap,
  formatProviderRuntimeStatus,
  getProviderRuntimeValidationError,
} from '../src/utils/providerRuntime.js'

Object.assign(globalThis, {
  MACRO: {
    VERSION: '0.3.1',
    DISPLAY_VERSION: '0.3.1',
    PACKAGE_URL: 'free-code-source',
  },
})

async function main(): Promise<void> {
  console.log('Starting free-code gRPC server...')
  applyProviderRuntimeBootstrap()
  await init()

  const { enableConfigs } = await import('../src/utils/config.js')
  enableConfigs()
  const { applySafeConfigEnvironmentVariables } = await import(
    '../src/utils/managedEnv.js'
  )
  applySafeConfigEnvironmentVariables()
  const { hydrateGithubModelsTokenFromSecureStorage } = await import(
    '../src/utils/githubModelsCredentials.js'
  )
  hydrateGithubModelsTokenFromSecureStorage()
  console.log(formatProviderRuntimeStatus())

  const validationError = getProviderRuntimeValidationError()
  if (validationError) {
    throw new Error(validationError)
  }

  const port = process.env.GRPC_PORT ? parseInt(process.env.GRPC_PORT, 10) : 50051
  const host = process.env.GRPC_HOST || 'localhost'
  const server = new GrpcServer()
  server.start(port, host)
}

main().catch(err => {
  console.error('Fatal error starting gRPC server:', err)
  process.exit(1)
})
