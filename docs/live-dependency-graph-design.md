# Live Dependency Graph System Design
*Inspired by SoulForge's Soul Map with SQLite-backed PageRank*

## Overview
Implement a real-time codebase intelligence system that provides context-aware file importance ranking through SQLite-backed dependency graphs, PageRank algorithms, and semantic summaries.

## Architecture Components

### 1. SQLite Database Schema
```sql
-- Core tables for dependency graph
CREATE TABLE files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT UNIQUE NOT NULL,
  hash TEXT,
  size INTEGER,
  mtime INTEGER,
  language TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE dependencies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_file_id INTEGER REFERENCES files(id),
  to_file_id INTEGER REFERENCES files(id),
  dependency_type TEXT, -- 'import', 'require', 'include', 'reference'
  line_number INTEGER,
  created_at INTEGER,
  UNIQUE(from_file_id, to_file_id, dependency_type)
);

CREATE TABLE symbols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id INTEGER REFERENCES files(id),
  name TEXT NOT NULL,
  type TEXT, -- 'function', 'class', 'variable', 'interface', 'type'
  start_line INTEGER,
  end_line INTEGER,
  scope TEXT,
  exported BOOLEAN DEFAULT FALSE,
  created_at INTEGER
);

CREATE TABLE pagerank_scores (
  file_id INTEGER PRIMARY KEY REFERENCES files(id),
  score REAL NOT NULL,
  rank INTEGER,
  calculated_at INTEGER
);

CREATE TABLE semantic_summaries (
  file_id INTEGER PRIMARY KEY REFERENCES files(id),
  summary TEXT,
  tokens_used INTEGER,
  model_version TEXT,
  created_at INTEGER
);

CREATE TABLE git_cochange (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file1_id INTEGER REFERENCES files(id),
  file2_id INTEGER REFERENCES files(id),
  cochange_count INTEGER DEFAULT 1,
  last_commit_hash TEXT,
  updated_at INTEGER,
  UNIQUE(file1_id, file2_id)
);

-- Indexes for performance
CREATE INDEX idx_dependencies_from ON dependencies(from_file_id);
CREATE INDEX idx_dependencies_to ON dependencies(to_file_id);
CREATE INDEX idx_symbols_file ON symbols(file_id);
CREATE INDEX idx_symbols_name ON symbols(name);
CREATE INDEX idx_pagerank_score ON pagerank_scores(score DESC);
CREATE INDEX idx_files_mtime ON files(mtime);

-- FTS5 for symbol and content search
CREATE VIRTUAL TABLE files_fts USING fts5(
  path, content, symbols, summary, 
  content='files'
);
```

### 2. Core System Components

#### A. Dependency Parser (`src/utils/codebase/dependencyParser.ts`)
- Tree-sitter integration for 30+ languages
- Extract imports, exports, function calls, class inheritance
- Handle TypeScript, JavaScript, Python, Go, Rust, C++, Java patterns
- Real-time parsing on file changes

#### B. PageRank Calculator (`src/utils/codebase/pageRank.ts`)
- Graph-based importance scoring using dependency relationships
- Weighted edges based on dependency type and frequency
- Damping factor of 0.85 (standard PageRank)
- Incremental updates for changed files
- Boost scores for recently modified files

#### C. Git Integration (`src/utils/codebase/gitAnalysis.ts`)
- Parse git logs to identify co-changing files
- Track commit relationships and blast radius
- File modification patterns and hotspots
- Integration with existing git utilities

#### D. Semantic Summarizer (`src/utils/codebase/semanticSummary.ts`)
- LLM-generated one-line summaries for top-ranked files
- Cached by file content hash and mtime
- Configurable via settings (enable/disable)
- Token budget management

### 3. Integration Points

#### A. File Operations Integration
- Hook into FileEditTool, FileReadTool, and file system watchers
- Real-time dependency graph updates
- Invalidate PageRank scores on structural changes
- Update semantic summaries for modified files

#### B. Context Selection Enhancement
- Replace simple file reads with ranked context selection
- Prioritize files by PageRank + conversation relevance
- Include co-change partners in context
- Combine dependency-graph recommendations with session/memory signals for better file suggestions
- 30-50% token savings through intelligent selection

#### C. Tool Enhancement
- Enhanced FileReadTool with dependency-aware suggestions
- Smart context recommendations in tool descriptions
- Dependency visualization capabilities

## Implementation Phases

### Phase 1: Core Infrastructure
1. SQLite database setup and migrations
2. Basic dependency parsing for TypeScript/JavaScript
3. Simple PageRank calculation
4. File system watcher integration

### Phase 2: Intelligence Features
1. Git co-change analysis
2. Semantic summary generation
3. Context selection optimization
4. Performance optimization and caching

### Phase 3: Advanced Features
1. Multi-language support (Python, Go, Rust, etc.)
2. Real-time dependency visualization
3. Unused export detection
4. Code clone and similarity detection

## Configuration

```typescript
interface LiveDependencyGraphConfig {
  enabled: boolean;
  database_path: string;
  languages: string[]; // ['typescript', 'javascript', 'python', ...]
  pagerank: {
    damping_factor: number; // 0.85
    iterations: number; // 100
    convergence_threshold: number; // 0.0001
  };
  semantic_summaries: {
    enabled: boolean;
    model: string; // 'claude-3-haiku'
    max_tokens_per_summary: number; // 100
    cache_ttl_hours: number; // 24
  };
  context_selection: {
    max_files: number; // 50
    relevance_weight: number; // 0.3
    pagerank_weight: number; // 0.4
    recency_weight: number; // 0.3
  };
}
```

## Benefits

1. **Context Efficiency**: 30-50% reduction in prompt tokens through intelligent file selection
2. **Code Intelligence**: Understanding of codebase structure and importance
3. **Change Impact**: Identify files affected by modifications
4. **Navigation**: Smart suggestions for related files
5. **Maintenance**: Detect unused exports and dead code
6. **Performance**: SQLite-backed caching for fast lookups

## Technical Considerations

- **Performance**: Incremental updates, efficient SQLite queries, background processing
- **Memory**: Lazy loading, configurable cache sizes
- **Scalability**: Handles large codebases (10k+ files) through pagination and indexing
- **Privacy**: All data stored locally, no external API calls for basic functionality
- **Reliability**: Graceful degradation when parsing fails, fallback to simple file reads