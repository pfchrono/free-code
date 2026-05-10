import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const pluginSource = readFileSync(join(__dirname, 'no-telemetry-plugin.ts'), 'utf-8')
const stubMatch = pluginSource.match(/'services\/analytics\/growthbook': `([\s\S]*?)`/)
if (!stubMatch) {
  throw new Error('Could not extract growthbook stub from no-telemetry-plugin.ts')
}

const testDir = join(tmpdir(), `free-code-growthbook-stub-test-${process.pid}`)
const stubFile = join(testDir, 'growthbook-stub.mjs')
const flagsFile = join(testDir, 'feature-flags.json')

mkdirSync(testDir, { recursive: true })
writeFileSync(stubFile, stubMatch[1]!)

process.env.FREE_CODE_FEATURE_FLAGS_FILE = flagsFile

const stub = await import(stubFile)

describe('growthbook no-telemetry stub', () => {
  beforeEach(() => {
    stub.resetGrowthBook()
    try {
      unlinkSync(flagsFile)
    } catch {
      // File may not exist yet.
    }
  })

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true })
    delete process.env.FREE_CODE_FEATURE_FLAGS_FILE
  })

  test('returns defaultValue when flags file is absent', () => {
    expect(stub.getFeatureValue_CACHED_MAY_BE_STALE('tengu_foo', 42)).toBe(42)
  })

  test('applies open-build defaults before call-site defaults', () => {
    expect(stub.getFeatureValue_CACHED_MAY_BE_STALE('tengu_passport_quail', false)).toBe(true)
    expect(stub.getFeatureValue_CACHED_MAY_BE_STALE('tengu_coral_fern', false)).toBe(true)
  })

  test('local Free-Code feature-flags file overrides open-build defaults', () => {
    writeFileSync(flagsFile, JSON.stringify({ tengu_passport_quail: false }))

    expect(stub.getFeatureValue_CACHED_MAY_BE_STALE('tengu_passport_quail', true)).toBe(false)
  })

  test('getAllGrowthBookFeatures returns parsed local flags', () => {
    const flags = { tengu_a: true, tengu_b: false, tengu_c: 42 }
    writeFileSync(flagsFile, JSON.stringify(flags))

    expect(stub.getAllGrowthBookFeatures()).toEqual(flags)
  })

  test('falls back to defaults on malformed or non-object JSON', () => {
    writeFileSync(flagsFile, '{not valid json')
    expect(stub.getFeatureValue_CACHED_MAY_BE_STALE('tengu_foo', 'fallback')).toBe('fallback')

    stub.resetGrowthBook()
    writeFileSync(flagsFile, '["a", "b"]')
    expect(stub.getFeatureValue_CACHED_MAY_BE_STALE('tengu_foo', 'fallback')).toBe('fallback')
  })

  test('resetGrowthBook and refreshGrowthBookFeatures reload local flags', async () => {
    writeFileSync(flagsFile, JSON.stringify({ tengu_foo: 'first' }))
    expect(stub.getFeatureValue_CACHED_MAY_BE_STALE('tengu_foo', 'x')).toBe('first')

    writeFileSync(flagsFile, JSON.stringify({ tengu_foo: 'second' }))
    expect(stub.getFeatureValue_CACHED_MAY_BE_STALE('tengu_foo', 'x')).toBe('first')

    stub.resetGrowthBook()
    expect(stub.getFeatureValue_CACHED_MAY_BE_STALE('tengu_foo', 'x')).toBe('second')

    writeFileSync(flagsFile, JSON.stringify({ tengu_foo: 'third' }))
    await stub.refreshGrowthBookFeatures()
    expect(stub.getFeatureValue_CACHED_MAY_BE_STALE('tengu_foo', 'x')).toBe('third')
  })

  test('all getter variants read local flags', async () => {
    writeFileSync(flagsFile, JSON.stringify({ tengu_gate: true, tengu_config: { a: 1 } }))

    expect(await stub.getFeatureValue_DEPRECATED('tengu_gate', false)).toBe(true)
    stub.resetGrowthBook()
    expect(stub.getFeatureValue_CACHED_WITH_REFRESH('tengu_gate', false)).toBe(true)
    stub.resetGrowthBook()
    expect(stub.checkStatsigFeatureGate_CACHED_MAY_BE_STALE('tengu_gate')).toBe(true)
    stub.resetGrowthBook()
    expect(await stub.checkGate_CACHED_OR_BLOCKING('tengu_gate')).toBe(true)
    stub.resetGrowthBook()
    expect(await stub.getDynamicConfig_BLOCKS_ON_INIT('tengu_config', {})).toEqual({ a: 1 })
    stub.resetGrowthBook()
    expect(stub.getDynamicConfig_CACHED_MAY_BE_STALE('tengu_config', {})).toEqual({ a: 1 })
  })

  test('checkSecurityRestrictionGate ignores local flags', async () => {
    writeFileSync(flagsFile, JSON.stringify({ tengu_disable_bypass_permissions_mode: true }))

    expect(await stub.checkSecurityRestrictionGate()).toBe(false)
  })
})
