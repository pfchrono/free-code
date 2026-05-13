/**
 * Wrapper for Promise.withResolvers() (ES2024, Node 22+).
 * Free-Code requires Node 26+, so the native implementation is available.
 */
export function withResolvers<T>(): PromiseWithResolvers<T> {
  return Promise.withResolvers<T>()
}
