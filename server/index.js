import express from 'express'
import http from 'http'
import path from 'path'
import fs from 'fs'
import { WebSocketServer } from 'ws'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { authMiddleware, registerUser, loginUser, logoutUser, getSessionFromToken, hasUsers } from './auth.js'
import { readSettings, writeSettings, ensureAppDataDir, APP_DATA_DIR } from './db.js'
import { invokeHandler } from './handlers.js'
import { getRemoteServers } from './wings.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const DIST = path.join(ROOT, 'dist')
const PORT = parseInt(process.env.PORT || process.env.TERVER_PORT || '8000', 10)
const HOST = process.env.HOST || '0.0.0.0'
const PACKAGE_VERSION = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || '1.0.0' }
  catch { return '1.0.0' }
})()

ensureAppDataDir()

const app = express()
app.use(cors())
app.use(express.json({ limit: '50mb' }))

// ---- event bus (WebSocket fanout) ----
const clients = new Set()
function broadcast(type, data) {
  const msg = JSON.stringify({ type, data })
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(msg)
  }
}

// ---- OOBE / auth ----
app.get('/api/oobe', (req, res) => {
  res.json({ ok: true, needsSetup: !hasUsers(), version: PACKAGE_VERSION })
})

app.post('/api/auth/register', (req, res) => {
  const result = registerUser(req.body || {})
  if (result.error) return res.status(400).json(result)
  res.json(result)
})

app.post('/api/auth/login', (req, res) => {
  const result = loginUser(req.body || {})
  if (result.error) return res.status(401).json(result)
  res.json(result)
})

app.post('/api/auth/logout', authMiddleware, (req, res) => {
  res.json(logoutUser())
})

app.get('/api/auth/session', authMiddleware, (req, res) => {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  const s = getSessionFromToken(token)
  if (!s) return res.status(401).json({ error: 'No session' })
  res.json(s)
})

// ---- settings ----
app.get('/api/settings', authMiddleware, (req, res) => {
  res.json(readSettings())
})

app.post('/api/settings', authMiddleware, (req, res) => {
  res.json({ ok: true, data: writeSettings(req.body || {}) })
})

// ---- generic IPC bridge (mirrors electronAPI) ----
app.post('/api/invoke', authMiddleware, async (req, res) => {
  const { channel, args } = req.body || {}
  if (!channel) return res.status(400).json({ error: 'channel required' })
  const token = (req.headers.authorization || '').replace(/^Bearer /, '')
  const result = await invokeHandler(channel, Array.isArray(args) ? args : [], { token, broadcast })
  res.json(result === undefined ? { ok: true } : result)
})

// ---- Wings remote API (for Wings daemon → panel) ----
app.get('/api/remote/servers', (req, res) => {
  const servers = getRemoteServers()
  const page = parseInt(req.query.page) || 1
  const perPage = parseInt(req.query.per_page) || 50
  const start = (page - 1) * perPage
  const slice = servers.slice(start, start + perPage)
  res.json({
    data: slice,
    meta: {
      current_page: page,
      from: servers.length > 0 ? start + 1 : 0,
      last_page: Math.ceil(servers.length / perPage) || 1,
      per_page: perPage,
      path: '/api/remote/servers',
      to: Math.min(start + perPage, servers.length),
      total: servers.length,
    },
  })
})

app.post('/api/remote/servers/reset', (req, res) => {
  res.json({ data: getRemoteServers() })
})

// ---- static frontend ----
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST))
  app.get(/^\/(?!api\/|ws).*/, (req, res) => {
    res.sendFile(path.join(DIST, 'index.html'))
  })
} else {
  app.get('/', (req, res) => {
    res.type('html').send('<h1>TerverPanel Web</h1><p>Run <code>npm run build</code> for the UI, or use the Vite dev server.</p>')
  })
}

// ---- HTTP + WS ----
const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })

wss.on('connection', (ws, req) => {
  clients.add(ws)
  ws.send(JSON.stringify({ type: 'hello', data: { version: PACKAGE_VERSION } }))
  ws.on('close', () => clients.delete(ws))
  ws.on('error', () => clients.delete(ws))
  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(String(raw))
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', data: { t: Date.now() } }))
      }
    } catch {}
  })
})

// expose broadcast for handlers
export { broadcast, server }

server.listen(PORT, HOST, () => {
  console.log(`[terver-panel] listening on http://${HOST}:${PORT}`)
  console.log(`[terver-panel] data dir: ${APP_DATA_DIR}`)
  console.log(`[terver-panel] mode: advanced (Wings + Docker)`)
})
