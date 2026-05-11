import { createServer } from 'node:http'

const port = Number(process.env.FREE_CODE_SSH_IMAGE_PASTE_PORT || 17654)
const host = process.env.FREE_CODE_SSH_IMAGE_PASTE_HOST || '127.0.0.1'

// Prevent bridge process from recursively calling itself if user exports this locally.
delete process.env.FREE_CODE_SSH_IMAGE_PASTE_URL

const server = createServer(async (request, response) => {
  if (request.url !== '/image') {
    response.writeHead(404).end()
    return
  }

  try {
    const { getImageFromClipboard } = await import('../src/utils/imagePaste.js')
    const image = await getImageFromClipboard()
    if (!image) {
      response
        .writeHead(404, { 'content-type': 'application/json' })
        .end(JSON.stringify({ error: 'no image in clipboard' }))
      return
    }

    response
      .writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify(image))
  } catch (error) {
    response
      .writeHead(500, { 'content-type': 'application/json' })
      .end(JSON.stringify({ error: String(error) }))
  }
})

server.listen(port, host, () => {
  console.log(`free-code SSH image paste bridge listening on http://${host}:${port}/image`)
  console.log(`SSH with: ssh -R ${port}:127.0.0.1:${port} <host>`)
})
