import WebSocket from 'ws'
import jwt from 'jsonwebtoken'
import { getWingsRemoteToken } from './wings.js'
import { updateServerConfig } from './db.js'

const WINGS_WS_BASE = process.env.WINGS_WS_URL || 'ws://127.0.0.1:8080'
const WATCHDOG_MS = 45 * 60 * 1000
const MAX_RETRIES = 30

const watches = new Map()

export function hasInstallWatch(uuid) {
  return watches.has(uuid)
}

function signWsJwt(uuid) {
  const { token } = getWingsRemoteToken()
  const now = Math.floor(Date.now() / 1000)
  return jwt.sign({
    scope: 'websocket',
    iss: 'panel',
    aud: [],
    exp: now + 600,
    iat: now,
    jti: '00000000-0000-0000-0000-000000000001',
    user_uuid: '00000000-0000-0000-0000-000000000001',
    user_name: 'terver',
    server_uuid: uuid,
    permissions: [
      'websocket.connect',
      'control.read-console',
      'control.console',
      'control.start',
      'control.stop',
      'control.restart',
      'admin.websocket.errors',
      'admin.websocket.install',
      'admin.websocket.transfer',
      'backup.read',
      'schedule.read',
      'file.read',
      'file.read-content',
      'file.create',
      'file.update',
      'file.delete',
      'file.archive',
    ],
    ignored_files: [],
  }, token, { algorithm: 'HS256' })
}

function bc(w, type, data) {
  try { w.broadcast?.(type, data) } catch {}
}

function progress(w, percent, message) {
  bc(w, 'server:progress', { serverId: w.uuid, percent, message })
}

export function markInstallFinished(uuid, ok, message, broadcast) {
  const w = watches.get(uuid)
  if (w) {
    finish(w, ok, message)
    return
  }
  try {
    if (ok) updateServerConfig(uuid, { status: 'stopped', installedAt: new Date().toISOString(), installError: null })
    else updateServerConfig(uuid, { status: 'error', installError: message })
  } catch {}
  try { broadcast?.('server:progress', { serverId: uuid, percent: ok ? 100 : 0, message }) } catch {}
}

function finish(w, ok, message) {
  if (!watches.has(w.uuid)) return
  watches.delete(w.uuid)
  w.done = true
  clearTimeout(w.watchdog)
  clearTimeout(w.retryTimer)
  try { w.ws?.close() } catch {}
  w.ws = null
  try {
    if (ok) updateServerConfig(w.uuid, { status: 'stopped', installedAt: new Date().toISOString(), installError: null })
    else updateServerConfig(w.uuid, { status: 'error', installError: message })
  } catch {}
  progress(w, ok ? 100 : 0, message)
}

function connect(w) {
  if (w.done || !watches.has(w.uuid)) return
  let ws
  try {
    ws = new WebSocket(`${WINGS_WS_BASE}/api/servers/${w.uuid}/ws`, {
      headers: { Origin: 'http://127.0.0.1:8080' },
    })
  } catch (err) {
    scheduleRetry(w, err.message)
    return
  }
  w.ws = ws

  ws.on('open', () => {
    try { ws.send(JSON.stringify({ event: 'auth', args: [signWsJwt(w.uuid)] })) } catch {}
  })

  ws.on('message', (raw) => {
    let msg
    try { msg = JSON.parse(raw.toString()) } catch { return }
    const ev = msg.event
    const args = msg.args || []

    if (ev === 'auth success') {
      w.tries = 0
      return
    }
    if (ev === 'ping') { try { ws.send(JSON.stringify({ event: 'pong', args: [] })) } catch {} return }
    if (ev === 'token expiring' || ev === 'token expired') {
      try { ws.send(JSON.stringify({ event: 'auth', args: [signWsJwt(w.uuid)] })) } catch {}
      return
    }
    if (ev === 'install started') {
      progress(w, 5, 'Wings đã bắt đầu cài đặt...')
      return
    }
    if (ev === 'install progress') {
      const p = args[0]
      let percent = null
      if (typeof p === 'number') percent = p
      else if (p && typeof p === 'object') percent = p.percent ?? p.progress ?? p.value ?? null
      if (percent != null) {
        progress(w, Math.max(1, Math.min(99, Math.round(percent))), 'Đang cài đặt...')
      }
      return
    }
    if (ev === 'install output') {
      const linesArg = args[0]
      const lines = typeof linesArg === 'string' ? [linesArg] : Array.isArray(linesArg) ? linesArg : []
      for (const line of lines) bc(w, 'server:log', { serverId: w.uuid, message: line })
      return
    }
    if (ev === 'install completed') {
      const p = args[0]
      const failed = p && typeof p === 'object' && (p.successful === false || p.failed === true || p.error)
      finish(w, !failed, failed ? `Cài đặt thất bại: ${p.error || 'lỗi từ Wings'}` : 'Cài đặt hoàn tất! Server đã sẵn sàng.')
      return
    }
    if (ev === 'daemon error') {
      const p = args[0]
      const text = typeof p === 'string' ? p : p?.message
      if (text && /install/i.test(text)) finish(w, false, `Cài đặt thất bại: ${text}`)
      return
    }
  })

  ws.on('close', () => {
    if (w.done || !watches.has(w.uuid)) return
    scheduleRetry(w, 'ws closed')
  })

  ws.on('error', () => {
    try { ws.close() } catch {}
  })
}

function scheduleRetry(w, reason) {
  if (w.done || !watches.has(w.uuid)) return
  w.tries += 1
  if (w.tries > MAX_RETRIES) {
    finish(w, false, `Mất kết nối Wings khi đang cài đặt (${reason})`)
    return
  }
  clearTimeout(w.retryTimer)
  w.retryTimer = setTimeout(() => connect(w), 3000)
}

export function startInstallWatch(uuid, broadcast) {
  if (!uuid || watches.has(uuid)) return false
  const w = { uuid, broadcast, ws: null, done: false, tries: 0, watchdog: null, retryTimer: null }
  watches.set(uuid, w)
  w.watchdog = setTimeout(() => finish(w, false, 'Quá thời gian chờ cài đặt (45 phút)'), WATCHDOG_MS)
  connect(w)
  return true
}

export function stopInstallWatch(uuid) {
  const w = watches.get(uuid)
  if (!w) return
  w.done = true
  watches.delete(uuid)
  clearTimeout(w.watchdog)
  clearTimeout(w.retryTimer)
  try { w.ws?.close() } catch {}
}
