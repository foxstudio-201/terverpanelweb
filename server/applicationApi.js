import { Router } from 'express'
import { handlers } from './handlers.js'
import { verifyApiKey } from './apikeys.js'
import { getServerByUuid, readDB, updateServerConfig } from './db.js'

const router = Router()

// ---- Bearer API key auth (tpk_...) ----
router.use((req, res, next) => {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query?.token || '')
  const record = verifyApiKey(token)
  if (!record) return res.status(401).json({ error: 'Invalid or missing API key' })
  if (record.admin === false && !record.userId) {
    return res.status(403).json({ error: 'API key is bound to a user that no longer exists' })
  }
  req.apiKey = record
  req.apiUser = record.admin
    ? { id: '__api_key__', admin: true, username: 'api-key' }
    : { id: record.userId, admin: false }
  next()
})

// invoke a panel handler with the key's identity as ctx.user
function call(req, channel, ...args) {
  return handlers[channel](...args, { user: req.apiUser })
}

function wrap(res, result, fallbackStatus = 200) {
  if (result && typeof result === 'object' && result.error) {
    const status = /Not found|Không tìm thấy/i.test(result.error) ? 404 : 400
    return res.status(status).json({ error: result.error })
  }
  if (result && result.ok === false) {
    const status = /Không tìm thấy|Not found/i.test(result.error || '') ? 404 : 400
    return res.status(status).json({ error: result.error || 'Request failed' })
  }
  return res.status(fallbackStatus).json({ data: result })
}

function ownsServer(req, id) {
  if (req.apiKey.admin) return true
  const s = getServerByUuid(id)
  return !!s && s.ownerId === req.apiKey.userId
}

const requireAdmin = (req, res, next) => {
  if (!req.apiKey.admin) return res.status(403).json({ error: 'Admin API key required' })
  next()
}

// ---- meta ----
router.get('/ping', (req, res) => {
  res.json({ data: { ok: true, key: { admin: req.apiKey.admin, userId: req.apiKey.userId, name: req.apiKey.name } } })
})

// ---- users (admin key only) ----
router.get('/users', requireAdmin, async (req, res) => {
  wrap(res, await call(req, 'users:list'))
})

router.post('/users', requireAdmin, async (req, res) => {
  wrap(res, await call(req, 'users:create', req.body || {}), 201)
})

router.patch('/users/:id', requireAdmin, async (req, res) => {
  const body = req.body || {}
  let result = { ok: true }
  if ('admin' in body) result = await call(req, 'users:setAdmin', req.params.id, body.admin)
  if (result?.error || result?.ok === false) return wrap(res, result)
  if (body.password) result = await call(req, 'users:setPassword', req.params.id, body.password)
  wrap(res, result)
})

router.delete('/users/:id', requireAdmin, async (req, res) => {
  wrap(res, await call(req, 'users:delete', req.params.id))
})

// ---- servers ----
router.get('/servers', async (req, res) => {
  wrap(res, await call(req, 'server:getConfigs'))
})

router.post('/servers', requireAdmin, async (req, res) => {
  const body = { ...(req.body || {}) }
  if (!body.ownerId) {
    const firstAdmin = (readDB().users || []).find(u => u.admin)
    if (firstAdmin) body.ownerId = firstAdmin.id
  }
  wrap(res, await call(req, 'server:addConfig', body), 201)
})

router.get('/servers/:id', async (req, res) => {
  if (!ownsServer(req, req.params.id)) return res.status(403).json({ error: 'No access to this server' })
  wrap(res, await call(req, 'server:getConfig', req.params.id))
})

router.patch('/servers/:id', async (req, res) => {
  if (!ownsServer(req, req.params.id)) return res.status(403).json({ error: 'No access to this server' })
  const patch = { ...(req.body || {}) }
  delete patch.id
  if (!req.apiKey.admin) delete patch.ownerId // only admins reassign ownership
  updateServerConfig(req.params.id, patch)
  wrap(res, { ok: true, server: getServerByUuid(req.params.id) })
})

router.delete('/servers/:id', async (req, res) => {
  if (!ownsServer(req, req.params.id)) return res.status(403).json({ error: 'No access to this server' })
  wrap(res, await call(req, 'server:removeConfig', req.params.id))
})

router.post('/servers/:id/install', async (req, res) => {
  if (!ownsServer(req, req.params.id)) return res.status(403).json({ error: 'No access to this server' })
  wrap(res, await call(req, 'server:install', req.params.id))
})

router.post('/servers/:id/power', async (req, res) => {
  const action = String(req.body?.action || '')
  if (!['start', 'stop', 'kill'].includes(action)) {
    return res.status(400).json({ error: 'action must be start|stop|kill' })
  }
  if (!ownsServer(req, req.params.id)) return res.status(403).json({ error: 'No access to this server' })
  wrap(res, await call(req, `server:${action}`, req.params.id))
})

router.get('/servers/:id/status', async (req, res) => {
  if (!ownsServer(req, req.params.id)) return res.status(403).json({ error: 'No access to this server' })
  wrap(res, await call(req, 'server:status', req.params.id))
})

router.get('/servers/:id/history', async (req, res) => {
  if (!ownsServer(req, req.params.id)) return res.status(403).json({ error: 'No access to this server' })
  wrap(res, await call(req, 'server:history', req.params.id))
})

router.get('/servers/:id/logs', async (req, res) => {
  if (!ownsServer(req, req.params.id)) return res.status(403).json({ error: 'No access to this server' })
  const lines = parseInt(req.query.lines) || 500
  wrap(res, await call(req, 'server:getLogs', req.params.id, lines))
})

// ---- system / node (any valid key) ----
router.get('/system/info', async (req, res) => {
  wrap(res, await call(req, 'system:getInfo'))
})

router.get('/system/node', async (req, res) => {
  const [docker, wings] = await Promise.all([
    call(req, 'docker:check'),
    call(req, 'wings:status'),
  ])
  wrap(res, { docker, wings })
})

export default router
