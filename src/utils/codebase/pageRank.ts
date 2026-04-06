import { logForDebugging } from '../debug.js'
import type {
  LiveDependencyGraphDB,
  FileRecord,
  DependencyRecord,
  PageRankScore
} from './liveDependencyGraphDB.js'

/**
 * PageRank Calculator for Live Dependency Graph
 * Implements PageRank algorithm for file importance scoring
 * Inspired by SoulForge's Soul Map PageRank system
 */

export interface PageRankConfig {
  dampingFactor: number        // Standard PageRank damping factor (0.85)
  maxIterations: number        // Maximum iterations before convergence (100)
  convergenceThreshold: number // Convergence threshold (0.0001)
  recencyBoost: number         // Boost factor for recently modified files (1.5)
  recencyWindow: number        // Window in seconds for recency boost (7 days)
}

export interface FileNode {
  id: number
  path: string
  inDegree: number
  outDegree: number
  score: number
  previousScore: number
  mtime: number
}

export interface DependencyEdge {
  from: number
  to: number
  weight: number
}

const DEFAULT_CONFIG: PageRankConfig = {
  dampingFactor: 0.85,
  maxIterations: 100,
  convergenceThreshold: 0.0001,
  recencyBoost: 1.5,
  recencyWindow: 7 * 24 * 60 * 60, // 7 days in seconds
}

export class PageRankCalculator {
  private config: PageRankConfig
  private db: LiveDependencyGraphDB

  constructor(db: LiveDependencyGraphDB, config: Partial<PageRankConfig> = {}) {
    this.db = db
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Calculate PageRank scores for all files in the dependency graph
   */
  async calculatePageRank(): Promise<PageRankScore[]> {
    const startTime = Date.now()

    // Build the dependency graph
    const graph = await this.buildDependencyGraph()

    if (graph.nodes.size === 0) {
      logForDebugging('[PageRank] No files found in dependency graph')
      return []
    }

    // Initialize scores
    this.initializeScores(graph.nodes)

    // Run PageRank iterations
    const iterations = this.runPageRankIterations(graph)

    // Apply recency boost
    this.applyRecencyBoost(graph.nodes)

    // Sort by score and assign ranks
    const rankedFiles = this.assignRanks(graph.nodes)

    // Update database with new scores
    await this.updatePageRankScores(rankedFiles)

    const duration = Date.now() - startTime
    logForDebugging(
      `[PageRank] Calculated PageRank for ${graph.nodes.size} files in ${iterations} iterations (${duration}ms)`
    )

    return rankedFiles
  }

  /**
   * Calculate incremental PageRank update for specific files
   */
  async calculateIncrementalUpdate(changedFileIds: number[]): Promise<void> {
    logForDebugging(`[PageRank] Incremental update for ${changedFileIds.length} files`)

    // For now, recalculate the entire graph
    // TODO: Implement true incremental PageRank
    await this.calculatePageRank()
  }

  private async buildDependencyGraph(): Promise<{
    nodes: Map<number, FileNode>
    edges: DependencyEdge[]
  }> {
    const nodes = new Map<number, FileNode>()
    const edges: DependencyEdge[] = []

    // Get all files with their basic info
    const stats = this.db.getStats()
    const topFiles = this.db.getTopRankedFiles(stats.files) // Get all files

    // Initialize nodes
    for (const file of topFiles) {
      nodes.set(file.id!, {
        id: file.id!,
        path: file.path,
        inDegree: 0,
        outDegree: 0,
        score: 1.0, // Initial score
        previousScore: 1.0,
        mtime: file.mtime,
      })
    }

    // Build edges from dependencies
    for (const file of topFiles) {
      const dependencies = this.db.getDependenciesForFile(file.id!)

      for (const dep of dependencies) {
        const fromNode = nodes.get(dep.from_file_id)
        const toNode = nodes.get(dep.to_file_id)

        if (fromNode && toNode) {
          // Calculate edge weight based on dependency type
          const weight = this.calculateEdgeWeight(dep)

          edges.push({
            from: dep.from_file_id,
            to: dep.to_file_id,
            weight,
          })

          fromNode.outDegree++
          toNode.inDegree++
        }
      }
    }

    return { nodes, edges }
  }

  private calculateEdgeWeight(dependency: DependencyRecord): number {
    // Weight edges based on dependency type
    switch (dependency.dependency_type) {
      case 'import':
      case 'require':
        return 1.0 // Standard weight for imports
      case 'reference':
        return 0.5 // Lower weight for references
      case 'include':
        return 0.8 // Medium weight for includes
      default:
        return 1.0
    }
  }

  private initializeScores(nodes: Map<number, FileNode>): void {
    const initialScore = 1.0 / nodes.size

    for (const node of nodes.values()) {
      node.score = initialScore
      node.previousScore = initialScore
    }
  }

  private runPageRankIterations(graph: {
    nodes: Map<number, FileNode>
    edges: DependencyEdge[]
  }): number {
    const { nodes, edges } = graph
    const { dampingFactor, maxIterations, convergenceThreshold } = this.config
    const teleportationProbability = (1 - dampingFactor) / nodes.size

    let iteration = 0
    let hasConverged = false

    while (iteration < maxIterations && !hasConverged) {
      // Store previous scores
      for (const node of nodes.values()) {
        node.previousScore = node.score
        node.score = teleportationProbability // Reset with teleportation probability
      }

      // Calculate new scores based on incoming links
      for (const edge of edges) {
        const fromNode = nodes.get(edge.from)
        const toNode = nodes.get(edge.to)

        if (fromNode && toNode && fromNode.outDegree > 0) {
          const contribution = (dampingFactor * fromNode.previousScore * edge.weight) / fromNode.outDegree
          toNode.score += contribution
        }
      }

      // Check for convergence
      hasConverged = this.checkConvergence(nodes, convergenceThreshold)
      iteration++
    }

    if (!hasConverged) {
      logForDebugging(`[PageRank] Did not converge after ${maxIterations} iterations`)
    }

    return iteration
  }

  private checkConvergence(nodes: Map<number, FileNode>, threshold: number): boolean {
    let maxDifference = 0

    for (const node of nodes.values()) {
      const difference = Math.abs(node.score - node.previousScore)
      maxDifference = Math.max(maxDifference, difference)
    }

    return maxDifference < threshold
  }

  private applyRecencyBoost(nodes: Map<number, FileNode>): void {
    const now = Math.floor(Date.now() / 1000)
    const { recencyBoost, recencyWindow } = this.config

    for (const node of nodes.values()) {
      const age = now - node.mtime

      if (age < recencyWindow) {
        // Apply exponential decay for recency boost
        const recencyFactor = Math.exp(-age / (recencyWindow / 3))
        node.score *= (1 + (recencyBoost - 1) * recencyFactor)
      }
    }
  }

  private assignRanks(nodes: Map<number, FileNode>): PageRankScore[] {
    // Sort nodes by score (descending)
    const sortedNodes = Array.from(nodes.values()).sort((a, b) => b.score - a.score)

    // Assign ranks
    const rankedFiles: PageRankScore[] = []
    const now = Math.floor(Date.now() / 1000)

    for (let i = 0; i < sortedNodes.length; i++) {
      const node = sortedNodes[i]
      rankedFiles.push({
        file_id: node.id,
        score: node.score,
        rank: i + 1,
        calculated_at: now,
      })
    }

    return rankedFiles
  }

  private async updatePageRankScores(rankedFiles: PageRankScore[]): Promise<void> {
    for (const ranking of rankedFiles) {
      this.db.updatePageRankScore(ranking.file_id, ranking.score, ranking.rank)
    }
  }

  /**
   * Get context-aware file recommendations based on PageRank and relevance
   */
  getRecommendedFiles(
    conversationTerms: string[] = [],
    recentlyEditedFiles: number[] = [],
    limit: number = 20
  ): Array<FileRecord & PageRankScore> {
    // Get top-ranked files
    const topFiles = this.db.getTopRankedFiles(limit * 2) // Get more than needed for filtering

    // Apply conversation relevance scoring
    const scoredFiles = topFiles.map(file => {
      let relevanceBoost = 0

      // Boost files mentioned in conversation terms
      for (const term of conversationTerms) {
        if (file.path.toLowerCase().includes(term.toLowerCase())) {
          relevanceBoost += 0.5
        }
      }

      // Boost recently edited files
      if (recentlyEditedFiles.includes(file.id!)) {
        relevanceBoost += 1.0
      }

      // Get co-changed files for recently edited files
      for (const editedFileId of recentlyEditedFiles) {
        const coChanged = this.db.getCoChangedFiles(editedFileId, 5)
        if (coChanged.some(cf => cf.id === file.id)) {
          relevanceBoost += 0.3
        }
      }

      return {
        ...file,
        adjustedScore: file.score + relevanceBoost,
      }
    })

    // Sort by adjusted score and return top files
    return scoredFiles
      .sort((a, b) => b.adjustedScore - a.adjustedScore)
      .slice(0, limit)
      .map(({ adjustedScore, ...file }) => file) // Remove adjustedScore from result
  }

  /**
   * Calculate blast radius for a file change
   */
  calculateBlastRadius(fileId: number): {
    directDependents: number[]
    indirectDependents: number[]
    totalImpact: number
  } {
    const visited = new Set<number>()
    const directDependents: number[] = []
    const indirectDependents: number[] = []

    // Get direct dependents
    const direct = this.db.getDependents(fileId)
    for (const dep of direct) {
      directDependents.push(dep.from_file_id)
      visited.add(dep.from_file_id)
    }

    // Get indirect dependents (BFS)
    const queue = [...directDependents]
    while (queue.length > 0) {
      const currentFileId = queue.shift()!
      const dependents = this.db.getDependents(currentFileId)

      for (const dep of dependents) {
        if (!visited.has(dep.from_file_id)) {
          indirectDependents.push(dep.from_file_id)
          visited.add(dep.from_file_id)
          queue.push(dep.from_file_id)
        }
      }
    }

    return {
      directDependents,
      indirectDependents,
      totalImpact: directDependents.length + indirectDependents.length,
    }
  }
}

export function createPageRankCalculator(
  db: LiveDependencyGraphDB,
  config?: Partial<PageRankConfig>
): PageRankCalculator {
  return new PageRankCalculator(db, config)
}