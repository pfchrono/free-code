import { z } from 'zod/v4'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { setWebBrowserState } from './state.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    url: z.string().url().describe('The URL to open in the embedded browser'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    ok: z.boolean(),
    url: z.string(),
    title: z.string().nullable(),
  }),
)

function hasWebView(): boolean {
  return typeof Bun !== 'undefined' && 'WebView' in Bun
}

export const WebBrowserTool = buildTool({
  name: 'web_browser',
  userFacingName() {
    return 'Web Browser'
  },
  description() {
    return 'Open a URL in the embedded web browser panel'
  },
  get inputSchema() {
    return inputSchema()
  },
  get outputSchema() {
    return outputSchema()
  },
  isEnabled() {
    return hasWebView()
  },
  isReadOnly() {
    return true
  },
  isConcurrencySafe() {
    return false
  },
  async prompt() {
    return 'Use this tool to open a URL in the embedded browser when the user needs an in-app page view.'
  },
  renderToolUseMessage(input) {
    const url = typeof input.url === 'string' ? input.url : 'URL'
    return `Opening browser: ${url}`
  },
  renderToolResultMessage(output) {
    return output.ok
      ? `Browser opened ${output.url}`
      : `Browser failed to open ${output.url}`
  },
  async call({ url }) {
    if (!hasWebView()) {
      setWebBrowserState({
        status: 'error',
        error: 'Embedded browser is unavailable in this build.',
      })
      throw new Error('Embedded browser is unavailable in this build.')
    }

    const WebViewCtor = (Bun as typeof Bun & {
      WebView: new (options: { url: string; title?: string }) => {
        title?: string
        show?: () => void
      }
    }).WebView

    const view = new WebViewCtor({
      url,
      title: 'free-code browser',
    })

    view.show?.()

    setWebBrowserState({
      url,
      title: view.title ?? 'free-code browser',
      status: 'open',
      error: null,
    })

    return {
      ok: true,
      url,
      title: view.title ?? 'free-code browser',
    }
  },
})
