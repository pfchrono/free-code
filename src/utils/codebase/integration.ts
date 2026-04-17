import { getLiveDependencyGraphSystem } from './liveDependencyGraphSystem.js'
import { logForDebugging } from '../debug.js'

/**
 * Integration hooks for Live Dependency Graph system
 * Provides initialization and lifecycle management
 */

export interface LiveDependencyGraphIntegration {
  initialize(): Promise<void>
  shutdown(): Promise<void>
  getContextRecommendations(terms: string[], limit?: number): Array<{
    path: string
    score: number
    rank: number
    summary?: string
  }>
  getFileDependencies(filePath: string): {
    dependencies: string[]
    dependents: string[]
    symbols: Array<{ name: string; type: string; line: number }>
    blastRadius: number
  }
  searchFiles(query: string, limit?: number): Array<{ path: string; score?: number }>
  getStats(): {
    files: number
    dependencies: number
    symbols: number
    isInitialized: boolean
  }
}

class LiveDependencyGraphIntegrationImpl implements LiveDependencyGraphIntegration {
  private system = getLiveDependencyGraphSystem()
  private initialized = false

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    try {
      await this.system.initialize()
      this.initialized = true
      logForDebugging('[LiveDependencyGraph] Integration initialized')
    } catch (error) {
      logForDebugging('[LiveDependencyGraph] Integration initialization failed:', error)
      throw error
    }
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return
    }

    try {
      await this.system.shutdown()
      this.initialized = false
      logForDebugging('[LiveDependencyGraph] Integration shutdown complete')
    } catch (error) {
      logForDebugging('[LiveDependencyGraph] Integration shutdown failed:', error)
    }
  }

  getContextRecommendations(
    terms: string[],
    limit?: number
  ): Array<{ path: string; score: number; rank: number; summary?: string }> {
    if (!this.initialized) {
      return []
    }

    return this.system.getRecommendedContext(terms, limit)
  }

  getFileDependencies(filePath: string): {
    dependencies: string[]
    dependents: string[]
    symbols: Array<{ name: string; type: string; line: number }>
    blastRadius: number
  } {
    if (!this.initialized) {
      return { dependencies: [], dependents: [], symbols: [], blastRadius: 0 }
    }

    return this.system.getFileDependencies(filePath)
  }

  searchFiles(query: string, limit?: number): Array<{ path: string; score?: number }> {
    if (!this.initialized) {
      return []
    }

    return this.system.searchFiles(query, limit)
  }

  getStats(): {
    files: number
    dependencies: number
    symbols: number
    isInitialized: boolean
  } {
    const stats = this.system.getStats()
    return {
      files: stats.files,
      dependencies: stats.dependencies,
      symbols: stats.symbols,
      isInitialized: stats.isInitialized,
    }
  }
}

// Singleton instance
let integrationInstance: LiveDependencyGraphIntegration | null = null

export function getLiveDependencyGraphIntegration(): LiveDependencyGraphIntegration {
  if (!integrationInstance) {
    integrationInstance = new LiveDependencyGraphIntegrationImpl()
  }
  return integrationInstance
}

/**
 * Auto-initialize the Live Dependency Graph system
 * Call this during application startup
 */
export async function initializeLiveDependencyGraph(): Promise<void> {
  try {
    const integration = getLiveDependencyGraphIntegration()
    await integration.initialize()
  } catch (error) {
    // Don't fail application startup if Live Dependency Graph fails
    logForDebugging('[LiveDependencyGraph] Auto-initialization failed:', error)
  }
}

/**
 * Cleanup the Live Dependency Graph system
 * Call this during application shutdown
 */
export async function shutdownLiveDependencyGraph(): Promise<void> {
  try {
    if (integrationInstance) {
      await integrationInstance.shutdown()
    }
  } catch (error) {
    logForDebugging('[LiveDependencyGraph] Auto-shutdown failed:', error)
  }
}