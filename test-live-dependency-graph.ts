#!/usr/bin/env bun

/**
 * Live Dependency Graph System Test Suite
 * Direct testing of SQLite database, parser, and PageRank components
 */

import { getLiveDependencyGraphDB } from './src/utils/codebase/liveDependencyGraphDB.js'
import { getDependencyParser } from './src/utils/codebase/dependencyParser.js'
import { createPageRankCalculator } from './src/utils/codebase/pageRank.js'
import { getLiveDependencyGraphSystem } from './src/utils/codebase/liveDependencyGraphSystem.js'
import { readFile } from 'fs/promises'
import { resolve } from 'path'

console.log('🧪 Live Dependency Graph System Test Suite\n')

async function testDatabase() {
  console.log('📊 Testing SQLite Database...')

  try {
    const db = getLiveDependencyGraphDB()
    const stats = db.getStats()
    console.log('✅ Database connection successful')
    console.log(`   Files: ${stats.files}, Dependencies: ${stats.dependencies}, Symbols: ${stats.symbols}`)

    // Test file insertion
    const testFileId = db.upsertFile({
      path: '/test/file.ts',
      hash: 'test123',
      size: 1000,
      mtime: Date.now(),
      language: 'typescript'
    })
    console.log(`✅ File upsert successful (ID: ${testFileId})`)

    // Test symbol insertion
    const symbolId = db.addSymbol({
      file_id: testFileId,
      name: 'testFunction',
      type: 'function',
      start_line: 1,
      end_line: 5,
      scope: null,
      exported: true
    })
    console.log(`✅ Symbol insertion successful (ID: ${symbolId})`)

    return true
  } catch (error) {
    console.log('❌ Database test failed:', error.message)
    return false
  }
}

async function testDependencyParser() {
  console.log('\n🔍 Testing Dependency Parser...')

  try {
    const parser = getDependencyParser()
    const supportedLangs = parser.getSupportedLanguages()
    console.log(`✅ Parser initialized with ${supportedLangs.length} languages: ${supportedLangs.join(', ')}`)

    // Test parsing a real file
    const testFilePath = resolve('./src/tools/FileEditTool/FileEditTool.ts')
    const content = await readFile(testFilePath, 'utf8')

    const parsed = parser.parseFile(testFilePath, content)
    if (parsed) {
      console.log(`✅ Parsed ${testFilePath}:`)
      console.log(`   Language: ${parsed.file.language}`)
      console.log(`   Dependencies: ${parsed.dependencies.length}`)
      console.log(`   Symbols: ${parsed.symbols.length}`)

      // Show sample dependencies
      if (parsed.dependencies.length > 0) {
        console.log('   Sample dependencies:')
        parsed.dependencies.slice(0, 3).forEach(dep => {
          console.log(`     ${dep.type}: ${dep.path}`)
        })
      }

      // Show sample symbols
      if (parsed.symbols.length > 0) {
        console.log('   Sample symbols:')
        parsed.symbols.slice(0, 3).forEach(sym => {
          console.log(`     ${sym.type}: ${sym.name} (line ${sym.start_line})`)
        })
      }
    } else {
      console.log('❌ Failed to parse test file')
      return false
    }

    return true
  } catch (error) {
    console.log('❌ Parser test failed:', error.message)
    return false
  }
}

async function testPageRank() {
  console.log('\n📈 Testing PageRank Calculator...')

  try {
    const db = getLiveDependencyGraphDB()
    const pageRank = createPageRankCalculator(db)

    // Add some test data for PageRank calculation
    const file1Id = db.upsertFile({
      path: '/test/a.ts',
      hash: 'hash1',
      size: 100,
      mtime: Date.now(),
      language: 'typescript'
    })

    const file2Id = db.upsertFile({
      path: '/test/b.ts',
      hash: 'hash2',
      size: 200,
      mtime: Date.now(),
      language: 'typescript'
    })

    // Add dependency: b.ts imports a.ts
    db.addDependency({
      from_file_id: file2Id,
      to_file_id: file1Id,
      dependency_type: 'import',
      line_number: 1
    })

    // Calculate PageRank
    const rankings = await pageRank.calculatePageRank()
    console.log(`✅ PageRank calculated for ${rankings.length} files`)

    if (rankings.length > 0) {
      console.log('   Top ranked files:')
      rankings.slice(0, 3).forEach((ranking, index) => {
        const file = db.getFileById(ranking.file_id)
        console.log(`     ${index + 1}. ${file?.path} (score: ${ranking.score.toFixed(4)})`)
      })
    }

    return true
  } catch (error) {
    console.log('❌ PageRank test failed:', error.message)
    return false
  }
}

async function testSystemIntegration() {
  console.log('\n⚙️ Testing System Integration...')

  try {
    const system = getLiveDependencyGraphSystem()
    const stats = system.getStats()

    console.log('✅ System integration successful')
    console.log(`   Status: ${stats.isInitialized ? 'initialized' : 'not initialized'}`)
    console.log(`   Files: ${stats.files}, Dependencies: ${stats.dependencies}, Symbols: ${stats.symbols}`)

    // Test search functionality
    const searchResults = system.searchFiles('FileEdit', 5)
    console.log(`✅ Search functionality working (${searchResults.length} results)`)

    // Test context recommendations
    const context = system.getRecommendedContext(['edit', 'tool'], 5)
    console.log(`✅ Context recommendations working (${context.length} suggestions)`)

    return true
  } catch (error) {
    console.log('❌ System integration test failed:', error.message)
    return false
  }
}

async function runAllTests() {
  console.log('Starting comprehensive test suite...\n')

  const results = {
    database: await testDatabase(),
    parser: await testDependencyParser(),
    pagerank: await testPageRank(),
    system: await testSystemIntegration()
  }

  console.log('\n📋 Test Results Summary:')
  console.log('========================')
  Object.entries(results).forEach(([test, passed]) => {
    console.log(`${passed ? '✅' : '❌'} ${test.charAt(0).toUpperCase() + test.slice(1)}: ${passed ? 'PASSED' : 'FAILED'}`)
  })

  const allPassed = Object.values(results).every(result => result)
  console.log(`\n🎯 Overall Status: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`)

  if (allPassed) {
    console.log('\n🚀 Live Dependency Graph system is ready for use!')
    console.log('\nManual testing commands:')
    console.log('1. ./cli (start interactive session)')
    console.log('2. In CLI: /dependency-graph init')
    console.log('3. In CLI: /dependency-graph context')
    console.log('4. In CLI: /dependency-graph deps src/tools/FileEditTool/FileEditTool.ts')
  } else {
    console.log('\n🔧 Some components need attention before production use.')
  }
}

// Run tests if this file is executed directly
if (import.meta.main) {
  runAllTests().catch(console.error)
}