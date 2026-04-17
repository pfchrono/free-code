import { memoize } from 'lodash-es'
import { parseFrontmatter } from '../utils/frontmatterParser.js'
import { logForDebugging } from '../utils/debug.js'
import { errorMessage } from '../utils/errors.js'
import type { Command } from '../types/command.js'
import type { MCPServerConnection, ServerResource } from '../services/mcp/types.js'
import { getMCPSkillBuilders } from './mcpSkillBuilders.js'

function isSkillResource(resource: ServerResource): boolean {
  const uri = resource.uri.toLowerCase()
  const mimeType = resource.mimeType?.toLowerCase()
  return (
    uri.endsWith('.md') &&
    (uri.includes('/skills/') || uri.includes('\\skills\\') || uri.includes('skills/')) &&
    (mimeType === undefined || mimeType.includes('markdown'))
  )
}

function getResourceText(resource: ServerResource): string | null {
  if (typeof resource.text === 'string') return resource.text
  if (typeof resource.blob === 'string') return resource.blob
  return null
}

function getSkillNameFromResource(serverName: string, resource: ServerResource): string {
  const normalizedServer = serverName
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const baseName = resource.name
    .replace(/\.md$/i, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `${normalizedServer}:${baseName || 'skill'}`
}

async function buildSkillCommand(
  client: MCPServerConnection,
  resource: ServerResource,
): Promise<Command | null> {
  const raw = getResourceText(resource)
  if (!raw) return null

  const { frontmatter, content } = parseFrontmatter(raw, resource.uri)
  const skillName = getSkillNameFromResource(client.name, resource)
  const { createSkillCommand, parseSkillFrontmatterFields } = getMCPSkillBuilders()

  const parsed = parseSkillFrontmatterFields(frontmatter, content, skillName)

  return createSkillCommand({
    skillName,
    displayName: parsed.displayName,
    description: parsed.description,
    hasUserSpecifiedDescription: parsed.hasUserSpecifiedDescription,
    markdownContent: content,
    allowedTools: parsed.allowedTools,
    argumentHint: parsed.argumentHint,
    argumentNames: parsed.argumentNames,
    whenToUse: parsed.whenToUse,
    version: parsed.version,
    model: parsed.model,
    disableModelInvocation: parsed.disableModelInvocation,
    userInvocable: parsed.userInvocable,
    source: 'mcp',
    baseDir: undefined,
    loadedFrom: 'mcp',
    hooks: parsed.hooks,
    executionContext: parsed.executionContext,
    agent: parsed.agent,
    paths: undefined,
    effort: parsed.effort,
    shell: parsed.shell,
  })
}

async function fetchMcpSkillsForClientImpl(
  client: MCPServerConnection,
): Promise<Command[]> {
  try {
    const resources = client.resources ?? []
    const skillResources = resources.filter(isSkillResource)
    if (skillResources.length === 0) return []

    const commands = await Promise.all(
      skillResources.map(resource => buildSkillCommand(client, resource)),
    )

    return commands.filter((command): command is Command => command !== null)
  } catch (error) {
    logForDebugging(
      `Failed to fetch MCP skills for ${client.name}: ${errorMessage(error)}`,
    )
    return []
  }
}

export const fetchMcpSkillsForClient = memoize(
  fetchMcpSkillsForClientImpl,
  (client: MCPServerConnection) => client.name,
)
