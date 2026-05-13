#!/usr/bin/env bun

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type ListToolsResult,
} from '@modelcontextprotocol/sdk/types.js'

type TranscriptCandidate = {
  path: string
  source: 'free-code' | 'claude' | 'codex'
  mtimeMs: number
  size: number
}

type Chunk = {
  id: number
  category: string
  label: string
  role: string
  chars: number
  tokens: number
  timestamp?: string
  preview: string
  detail: string
}

type Category = {
  name: string
  chars: number
  tokens: number
  count: number
}

const TOKEN_DIVISOR = 4
const MAX_FILE_BYTES = 25 * 1024 * 1024

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / TOKEN_DIVISOR))
}

function projectSlug(cwd: string): string {
  return cwd.replaceAll('/', '-').replace(/^-/, '-')
}

function safeReadJson(line: string): unknown | null {
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

function textFromUnknown(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(textFromUnknown).filter(Boolean).join('\n')
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (typeof obj.text === 'string') return obj.text
    if (typeof obj.content === 'string') return obj.content
    return JSON.stringify(value, null, 2)
  }
  return String(value)
}

function extractText(entry: Record<string, unknown>): string {
  if (entry.type === 'session_meta') {
    const payload = entry.payload as Record<string, unknown> | undefined
    return textFromUnknown({
      cwd: payload?.cwd,
      model: payload?.model,
      approval_policy: payload?.approval_policy,
      sandbox_policy: payload?.sandbox_policy,
    })
  }
  if (entry.type === 'response_item') {
    const payload = entry.payload as Record<string, unknown> | undefined
    return textFromUnknown(payload?.item ?? payload ?? entry)
  }
  return textFromUnknown(entry.message ?? entry.payload ?? entry)
}

function classify(entry: Record<string, unknown>, text: string): { category: string; label: string; role: string } {
  const type = String(entry.type ?? 'unknown')
  if (type === 'session_meta') return { category: 'Session metadata', label: type, role: 'metadata' }
  if (type === 'event_msg') return { category: 'Tool events', label: type, role: 'event' }
  if (type === 'response_item') {
    const payload = entry.payload as Record<string, unknown> | undefined
    const item = (payload?.item ?? payload) as Record<string, unknown> | undefined
    const itemRole = String(item?.role ?? '')
    const itemType = String(item?.type ?? '')
    if (itemType === 'function_call') return { category: 'Tool calls', label: itemType, role: 'assistant' }
    if (itemType === 'function_call_output') return { category: 'Tool results', label: itemType, role: 'tool' }
    if (itemType === 'reasoning') return { category: 'Reasoning traces', label: itemType, role: 'assistant' }
    if (itemType === 'message' && itemRole === 'developer') return { category: 'Developer instructions', label: itemType, role: itemRole }
    if (itemType === 'message' && itemRole === 'system') return { category: 'System instructions', label: itemType, role: itemRole }
    if (itemType === 'message' && itemRole === 'user') return { category: 'User messages', label: itemType, role: itemRole }
    if (itemType === 'message') return { category: 'Assistant messages', label: itemType, role: itemRole || 'assistant' }
  }
  if (type === 'turn_context') return { category: 'Turn context', label: type, role: 'metadata' }
  const message = entry.message as Record<string, unknown> | undefined
  const role = String(message?.role ?? entry.role ?? type)
  const lower = text.slice(0, 500).toLowerCase()

  if (type.includes('compact') || lower.includes('compact')) return { category: 'Compaction', label: type, role }
  if (lower.includes('<system-reminder>') || lower.includes('<local-command-caveat>')) {
    return { category: 'System reminders', label: type, role }
  }
  if (lower.includes('<local-command-stdout>') || lower.includes('<command-name>')) {
    return { category: 'Local commands', label: type, role }
  }
  if (lower.includes('"tool_use"') || lower.includes('<tool_use') || lower.includes('"name": "bash"')) {
    return { category: 'Tool calls', label: type, role }
  }
  if (lower.includes('"tool_result"') || lower.includes('tool_use_id') || entry.toolUseResult) {
    if (lower.includes('"filepath"') || lower.includes('file":{"filepath"')) {
      return { category: 'File reads', label: type, role }
    }
    if (lower.includes('search') || lower.includes('grep') || lower.includes('rg ')) {
      return { category: 'Search results', label: type, role }
    }
    return { category: 'Tool results', label: type, role }
  }
  if (lower.includes('"type": "thinking"') || lower.includes('"thinking"')) return { category: 'Reasoning traces', label: type, role }
  if (lower.includes('data:image') || lower.includes('"media_type":"image')) return { category: 'Images', label: type, role }
  if (role === 'user') return { category: 'User messages', label: type, role }
  if (role === 'assistant') return { category: 'Assistant messages', label: type, role }
  return { category: 'Session metadata', label: type, role }
}

function walk(dir: string, out: TranscriptCandidate[], source: TranscriptCandidate['source'], depth = 0): void {
  if (depth > 6 || !existsSync(dir)) return
  let entries: any[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(path, out, source, depth + 1)
      continue
    }
    if (!entry.name.endsWith('.jsonl')) continue
    try {
      const st = statSync(path)
      if (st.size > 0) out.push({ path, source, mtimeMs: st.mtimeMs, size: st.size })
    } catch {
      // ignore unreadable files
    }
  }
}

function findTranscript(cwd?: string, sessionPath?: string): TranscriptCandidate | null {
  if (sessionPath) {
    const path = resolve(sessionPath)
    const st = statSync(path)
    return { path, source: path.includes('.codex') ? 'codex' : 'free-code', mtimeMs: st.mtimeMs, size: st.size }
  }

  const home = homedir()
  const roots = [
    { root: process.env.FREE_CODE_CONFIG_DIR ?? process.env.FREE_CODE_CONFIG_HOME ?? join(home, '.free-code'), source: 'free-code' as const },
    { root: process.env.CLAUDE_CONFIG_DIR ?? process.env.CLAUDE_CONFIG_HOME ?? join(home, '.claude'), source: 'claude' as const },
  ]
  const candidates: TranscriptCandidate[] = []
  const wantedSlug = cwd ? projectSlug(resolve(cwd)) : null

  for (const { root, source } of roots) {
    const projects = join(root, 'projects')
    if (wantedSlug) walk(join(projects, wantedSlug), candidates, source)
    walk(projects, candidates, source)
  }
  walk(join(home, '.codex', 'sessions'), candidates, 'codex')

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return candidates[0] ?? null
}

function analyzeTranscript(candidate: TranscriptCandidate): {
  candidate: TranscriptCandidate
  chunks: Chunk[]
  categories: Category[]
  totalTokens: number
  exactUsage?: Record<string, unknown>
} {
  if (candidate.size > MAX_FILE_BYTES) {
    throw new Error(`Transcript too large to inspect safely: ${candidate.path}`)
  }
  const raw = readFileSync(candidate.path, 'utf8')
  const chunks: Chunk[] = []
  let exactUsage: Record<string, unknown> | undefined

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue
    const parsed = safeReadJson(line)
    if (!parsed || typeof parsed !== 'object') continue
    const entry = parsed as Record<string, unknown>
    const text = extractText(entry)
    if (!text) continue
    const usage = (entry.message as Record<string, unknown> | undefined)?.usage
    if (usage && typeof usage === 'object') exactUsage = usage as Record<string, unknown>
    const { category, label, role } = classify(entry, text)
    chunks.push({
      id: chunks.length + 1,
      category,
      label,
      role,
      chars: text.length,
      tokens: estimateTokens(text),
      timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : undefined,
      preview: text.replace(/\s+/g, ' ').slice(0, 180),
      detail: text.slice(0, 12000),
    })
  }

  const byCategory = new Map<string, Category>()
  for (const chunk of chunks) {
    const next = byCategory.get(chunk.category) ?? {
      name: chunk.category,
      chars: 0,
      tokens: 0,
      count: 0,
    }
    next.chars += chunk.chars
    next.tokens += chunk.tokens
    next.count += 1
    byCategory.set(chunk.category, next)
  }
  const categories = [...byCategory.values()].sort((a, b) => b.tokens - a.tokens)
  return {
    candidate,
    chunks,
    categories,
    totalTokens: categories.reduce((sum, item) => sum + item.tokens, 0),
    exactUsage,
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function renderHtml(data: ReturnType<typeof analyzeTranscript>): string {
  const maxTokens = Math.max(1, data.categories[0]?.tokens ?? 1)
  const payload = JSON.stringify(data).replaceAll('</script', '<\\/script')
  const cards = data.categories
    .map(
      item => `<button class="card" data-category="${escapeHtml(item.name)}">
        <span>${escapeHtml(item.name)}</span>
        <strong>${item.tokens.toLocaleString()}</strong>
        <small>${item.count} chunks</small>
        <i style="--w:${Math.max(4, (item.tokens / maxTokens) * 100).toFixed(1)}%"></i>
      </button>`,
    )
    .join('\n')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Context Inspector</title>
<style>
:root{color-scheme:dark;--bg:#101114;--panel:#181b20;--line:#2b313a;--text:#eef2f6;--muted:#98a2b3;--cyan:#40c7d6;--green:#7ddc8a;--amber:#f0b45b;--red:#ff7a7a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif}
header{padding:22px 28px;border-bottom:1px solid var(--line);display:flex;align-items:end;justify-content:space-between;gap:16px}
h1{margin:0;font-size:28px;letter-spacing:0}.sub{color:var(--muted);margin-top:4px}.pill{border:1px solid var(--line);padding:6px 10px;border-radius:6px;color:var(--muted)}
main{display:grid;grid-template-columns:360px 1fr;min-height:calc(100vh - 86px)}aside{border-right:1px solid var(--line);padding:18px;overflow:auto}
.meter{height:18px;border:1px solid var(--line);background:#0b0d10;border-radius:5px;overflow:hidden;margin:16px 0}.meter>div{height:100%;background:linear-gradient(90deg,var(--cyan),var(--green));width:100%}
.stats{display:grid;grid-template-columns:1fr 1fr;gap:10px}.stat{background:var(--panel);border:1px solid var(--line);padding:12px;border-radius:6px}.stat b{display:block;font-size:22px}.stat span{color:var(--muted)}
.cards{display:grid;gap:8px;margin-top:18px}.card{text-align:left;color:var(--text);background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:10px;position:relative;overflow:hidden;cursor:pointer}.card:hover,.card.active{border-color:var(--cyan)}.card span,.card strong,.card small{display:block;position:relative;z-index:1}.card strong{font-size:20px}.card small{color:var(--muted)}.card i{position:absolute;left:0;bottom:0;height:3px;width:var(--w);background:var(--cyan)}
section{padding:18px;overflow:auto}.toolbar{display:flex;gap:10px;margin-bottom:14px}.toolbar input{width:100%;background:#0b0d10;color:var(--text);border:1px solid var(--line);border-radius:6px;padding:10px}
table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line);border-radius:6px;overflow:hidden}th,td{padding:10px;border-bottom:1px solid var(--line);vertical-align:top}th{text-align:left;color:var(--muted);font-weight:500}tr{cursor:pointer}tr:hover{background:#20252d}.num{text-align:right;font-variant-numeric:tabular-nums}.preview{color:var(--muted);max-width:640px}
dialog{width:min(980px,90vw);height:min(760px,86vh);background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:0}dialog::backdrop{background:#0008}.modalHead{padding:14px 16px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:12px}.modalBody{padding:16px;overflow:auto;height:calc(100% - 54px)}pre{white-space:pre-wrap;word-break:break-word;background:#0b0d10;border:1px solid var(--line);border-radius:6px;padding:14px}button{font:inherit}
@media(max-width:860px){main{grid-template-columns:1fr}aside{border-right:0;border-bottom:1px solid var(--line)}}
</style>
</head>
<body>
<header>
  <div><h1>Context Inspector</h1><div class="sub">${escapeHtml(data.candidate.path)}</div></div>
  <div class="pill">${escapeHtml(data.candidate.source)} · ${new Date(data.candidate.mtimeMs).toLocaleString()}</div>
</header>
<main>
<aside>
  <div class="stats">
    <div class="stat"><b>${data.totalTokens.toLocaleString()}</b><span>estimated tokens</span></div>
    <div class="stat"><b>${data.chunks.length.toLocaleString()}</b><span>chunks</span></div>
  </div>
  <div class="meter"><div></div></div>
  <div class="sub">Estimated from transcript text. Latest provider usage: ${escapeHtml(JSON.stringify(data.exactUsage ?? 'none'))}</div>
  <div class="cards"><button class="card active" data-category="__all"><span>All context</span><strong>${data.totalTokens.toLocaleString()}</strong><small>${data.chunks.length} chunks</small><i style="--w:100%"></i></button>${cards}</div>
</aside>
<section>
  <div class="toolbar"><input id="search" placeholder="Filter chunks by text, role, category, tool output..."></div>
  <table><thead><tr><th>Category</th><th>Role</th><th class="num">Tokens</th><th>Preview</th></tr></thead><tbody id="rows"></tbody></table>
</section>
</main>
<dialog id="detail"><div class="modalHead"><strong id="detailTitle"></strong><button onclick="detail.close()">Close</button></div><div class="modalBody"><pre id="detailBody"></pre></div></dialog>
<script>const DATA=${payload};
let selected='__all';const rows=document.getElementById('rows'), search=document.getElementById('search'), detail=document.getElementById('detail');
function draw(){const q=search.value.toLowerCase();const list=DATA.chunks.filter(c=>(selected==='__all'||c.category===selected)&&(!q||JSON.stringify(c).toLowerCase().includes(q))).sort((a,b)=>b.tokens-a.tokens);rows.innerHTML=list.map(c=>'<tr data-id="'+c.id+'"><td>'+esc(c.category)+'</td><td>'+esc(c.role)+'</td><td class="num">'+c.tokens.toLocaleString()+'</td><td class="preview">'+esc(c.preview)+'</td></tr>').join('')}
function esc(s){return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')}
document.querySelectorAll('.card').forEach(b=>b.onclick=()=>{document.querySelectorAll('.card').forEach(x=>x.classList.remove('active'));b.classList.add('active');selected=b.dataset.category;draw()});
search.oninput=draw;rows.onclick=e=>{const tr=e.target.closest('tr');if(!tr)return;const c=DATA.chunks.find(x=>x.id===Number(tr.dataset.id));detailTitle.textContent=c.category+' · '+c.tokens.toLocaleString()+' tokens';detailBody.textContent=c.detail;detail.showModal()};draw();</script>
</body></html>`
}

function openFile(path: string): void {
  const opener =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', path] : [path]
  const child = spawn(opener, args, { detached: true, stdio: 'ignore' })
  child.unref()
}

function writeDashboard(cwd?: string, sessionPath?: string, open = true): { htmlPath: string; summary: string } {
  const candidate = findTranscript(cwd, sessionPath)
  if (!candidate) throw new Error('No transcript found in .free-code, .claude, or .codex')
  const data = analyzeTranscript(candidate)
  const outDir = join(homedir(), '.free-code', 'cache', 'context-inspector')
  mkdirSync(outDir, { recursive: true })
  const htmlPath = join(outDir, `context-${Date.now()}.html`)
  writeFileSync(htmlPath, renderHtml(data), 'utf8')
  if (open) openFile(htmlPath)
  const top = data.categories.slice(0, 5).map(c => `${c.name}: ${c.tokens.toLocaleString()}`).join(', ')
  return {
    htmlPath,
    summary: `Opened context dashboard for ${basename(candidate.path)}. Estimated ${data.totalTokens.toLocaleString()} tokens. Top: ${top}.`,
  }
}

if (process.argv.includes('--once')) {
  const noOpen = process.argv.includes('--no-open')
  const result = writeDashboard(process.cwd(), undefined, !noOpen)
  console.log(`${result.summary}\n${result.htmlPath}`)
  process.exit(0)
}

const server = new Server(
  { name: 'context-inspector', version: '0.1.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async (): Promise<ListToolsResult> => ({
  tools: [
    {
      name: 'open_context_dashboard',
      description:
        'Open a beautiful local HTML dashboard that breaks down where current session context is going, with drill-down by category and chunk.',
      inputSchema: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: 'Project cwd to prefer when selecting a transcript.' },
          session_path: { type: 'string', description: 'Explicit transcript JSONL path.' },
          open: { type: 'boolean', description: 'Open browser automatically.', default: true },
        },
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async ({ params }): Promise<CallToolResult> => {
  if (params.name !== 'open_context_dashboard') {
    throw new Error(`Unknown tool: ${params.name}`)
  }
  const args = (params.arguments ?? {}) as Record<string, unknown>
  const result = writeDashboard(
    typeof args.cwd === 'string' ? args.cwd : process.cwd(),
    typeof args.session_path === 'string' ? args.session_path : undefined,
    typeof args.open === 'boolean' ? args.open : true,
  )
  return {
    content: [
      {
        type: 'text',
        text: `${result.summary}\n${pathToFileURL(result.htmlPath).href}\n${result.htmlPath}`,
      },
    ],
  }
})

await server.connect(new StdioServerTransport())
