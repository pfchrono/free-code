import { describe, expect, it } from 'bun:test'
import { StreamingTokenCounter } from './streamingTokenCounter.js'

describe('StreamingTokenCounter', () => {
  describe('start', () => {
    it('resets state and sets input tokens', () => {
      const counter = new StreamingTokenCounter()
      counter.start(1000)
      expect(counter.total).toBe(1000)
    })
  })

  describe('addChunk', () => {
    it('accumulates content', () => {
      const counter = new StreamingTokenCounter()
      counter.start(500)
      counter.addChunk('Hello world ')
      expect(counter.characterCount).toBe(12)
    })

    it('updates cached token count at word boundaries during streaming', () => {
      const counter = new StreamingTokenCounter()
      counter.start(100)
      counter.addChunk('Hello ')
      const afterFirst = counter.output
      expect(afterFirst).toBeGreaterThan(0)
      counter.addChunk('world ')
      const afterSecond = counter.output
      expect(afterSecond).toBeGreaterThan(afterFirst)
    })

    it('ignores empty chunks', () => {
      const counter = new StreamingTokenCounter()
      counter.start(50)
      counter.addChunk(undefined)
      counter.addChunk('')
      expect(counter.output).toBe(0)
      expect(counter.total).toBe(50)
    })
  })

  describe('finalize', () => {
    it('counts all content after finalize', () => {
      const counter = new StreamingTokenCounter()
      counter.start(500)
      counter.addChunk('Hello world')
      counter.finalize()
      expect(counter.output).toBeGreaterThan(0)
      expect(counter.total).toBe(500 + counter.output)
    })
  })

  describe('estimates', () => {
    it('estimates remaining tokens and time from current rate', () => {
      const counter = new StreamingTokenCounter()
      counter.start()
      counter.addChunk('Hello world ')
      counter.finalize()
      expect(counter.estimateRemainingTokens(100)).toBeGreaterThan(0)
      expect(counter.estimateRemainingTokens(1)).toBe(0)
      expect(counter.estimateRemainingTimeMs(100)).toBeGreaterThanOrEqual(0)
    })
  })

  describe('reset', () => {
    it('clears all state', () => {
      const counter = new StreamingTokenCounter()
      counter.start(500)
      counter.addChunk('Hello world ')
      counter.reset()
      expect(counter.characterCount).toBe(0)
      expect(counter.total).toBe(0)
    })
  })
})
