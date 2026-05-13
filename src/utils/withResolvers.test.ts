import { describe, expect, test } from 'bun:test'
import { withResolvers } from './withResolvers.js'

describe('withResolvers', () => {
  test('uses the native Promise.withResolvers contract', async () => {
    const resolvers = withResolvers<string>()

    expect(resolvers).toHaveProperty('promise')
    expect(resolvers.resolve).toBeFunction()
    expect(resolvers.reject).toBeFunction()

    resolvers.resolve('ok')
    await expect(resolvers.promise).resolves.toBe('ok')
  })
})
