import os from 'os'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import https from 'https'
import { readSettings, writeSettings, listServerConfigs, getServerByUuid, updateServerConfig, generateUUID, EGGS_DIR, addServerConfig, removeServerConfig, hashPassword, verifyPassword, appendActivity } from './db.js'
import { registerUser, loginUser, logoutUser, getSessionFromToken, signToken } from './auth.js'
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import { createApiKey, listApiKeys, deleteApiKey } from './apikeys.js'
import {
  getWingsRemoteToken, getRemoteServers, powerServer, getStatus, getServerState,
  listWingsFiles, readWingsFile, writeWingsFile, deleteWingsPath,
  createWingsFolder, renameWingsPath, sendWingsCommand, getWingsLogs,
  reinstallServer, deleteServerRemote, createServerRemote, syncServerConfig,
} from './wings.js'
import { hasInstallWatch, startInstallWatch } from './installWatch.js'
import { readDB, writeDB } from './db.js'

function execOut(cmd, timeout = 5000) {
  try {
    return execSync(cmd, { timeout, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

// Isolated Docker instance — never touches system or desktop TerverPanel Docker
const DOCKER_UNIT = 'terver-panel-docker'
const DOCKER_SOCK = '/run/terver-panel-docker/docker.sock'
const DOCKER_DATA = '/var/lib/terver-panel-docker/data'
const DOCKER_HOST_URL = `unix://${DOCKER_SOCK}`
const WINGS_UNIT = 'terver-panel-wings'
const WINGS_CONFIG_DIR = '/etc/terver-panel-wings'
const WINGS_CONFIG_PATH = `${WINGS_CONFIG_DIR}/config.yml`
process.env.DOCKER_HOST = process.env.DOCKER_HOST || DOCKER_HOST_URL

function writeDockerUnit() {
  const dockerd = execOut('command -v dockerd') || '/usr/bin/dockerd'
  const unit = `[Unit]
Description=TerverPanel Web Docker Engine (isolated)
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=0

[Service]
Type=notify
ExecStartPre=/bin/bash -c 'ip link show tpweb0 >/dev/null 2>&1 || { ip link add tpweb0 type bridge && ip addr add 172.21.0.1/16 dev tpweb0; }; ip link set tpweb0 up'
ExecStart=${dockerd} -H ${DOCKER_HOST_URL} --pidfile /run/terver-panel-docker/docker.pid --data-root ${DOCKER_DATA} --bridge=tpweb0 --default-address-pool=base=172.21.0.0/16,size=16
ExecReload=/bin/kill -s HUP $MAINPID
Restart=on-failure
RestartSec=2
LimitNOFILE=1048576
RuntimeDirectory=terver-panel-docker
Delegate=yes
KillMode=process
OOMScoreAdjust=-500

[Install]
WantedBy=multi-user.target
`
  fs.writeFileSync(`/etc/systemd/system/${DOCKER_UNIT}.service`, unit, { mode: 0o644 })
}

function fetchJson(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout }, (res) => {
      let data = ''
      res.on('data', (c) => { data += c })
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

// ---- admin / ownership guards (Calagopus-style admin vs user panels) ----
const ADMIN_CHANNELS = new Set([
  'server:addConfig',
  'docker:config:get', 'docker:config:save', 'docker:install', 'docker:start', 'docker:stop',
  'wings:install', 'wings:start', 'wings:stop', 'wings:config:generate',
  'systemd:status', 'systemd:start', 'systemd:stop', 'systemd:logs',
  'system:auth', 'system:checkAuth', 'system:cleanup',
  'node:loadConfigs',
  'cloudflare:install', 'cloudflare:tunnel:create', 'cloudflare:tunnel:install-service', 'cloudflare:tunnel:login',
  'database:setup', 'database:install',
  'users:list', 'users:create', 'users:delete', 'users:setAdmin', 'users:setPassword',
  'locations:create', 'locations:update', 'locations:delete', 'nodes:setLocation',
  'nests:create', 'nests:save', 'nests:deleteEgg', 'nests:deleteNest',
  'dbhosts:create', 'dbhosts:update', 'dbhosts:delete',
  'sshkeys:install', 'sshkeys:uninstall',
])

// channels whose first argument is a server id/uuid — non-admins may only
// touch servers they own
const SERVER_ARG_CHANNELS = new Set([
  'server:getConfig', 'server:removeConfig', 'server:status', 'server:history', 'server:tps',
  'server:start', 'server:stop', 'server:kill', 'server:install', 'server:getLogs',
  'stats:serverNetwork',
  'wings:server:state', 'wings:server:power', 'wings:server:command', 'wings:server:logs',
  'wings:server:files', 'wings:server:readFile', 'wings:server:writeFile', 'wings:server:deleteFile',
  'wings:server:createFile', 'wings:server:createFolder', 'wings:server:uploadFile',
  'wings:server:moveFile', 'wings:server:sync', 'wings:server:reinstall',
  'wings:server:delete', 'wings:server:create',
  'wings:ws-connect', 'wings:ws-disconnect', 'wings:ws-send',
  'backup:list', 'backup:create', 'backup:update', 'backup:delete', 'backup:restore', 'backup:download',
  'schedule:list', 'schedule:create',
])

function canAccessServer(user, serverId) {
  if (!user) return false
  if (user.admin) return true
  const s = getServerByUuid(String(serverId ?? ''))
  return !!s && s.ownerId === user.id
}

function webauthnRp(ctx) {
  try {
    const url = new URL(ctx?.origin || 'http://localhost')
    return { rpID: url.hostname, origin: url.origin }
  } catch { return null }
}

const AUTHORIZED_KEYS_FILE = path.join(os.homedir(), '.ssh', 'authorized_keys')

function authorizedKeyBlock(id) {
  return { begin: `# BEGIN TerverPanel ${id}`, end: `# END TerverPanel ${id}` }
}

function installAuthorizedKey(key) {
  try {
    const dir = path.dirname(AUTHORIZED_KEYS_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    let content = fs.existsSync(AUTHORIZED_KEYS_FILE) ? fs.readFileSync(AUTHORIZED_KEYS_FILE, 'utf8') : ''
    const { begin, end } = authorizedKeyBlock(key.id)
    if (!content.includes(begin)) {
      if (content && !content.endsWith('\n')) content += '\n'
      content += `${begin}\n${key.publicKey} terver-panel:${key.username || 'user'}\n${end}\n`
      fs.writeFileSync(AUTHORIZED_KEYS_FILE, content, { mode: 0o600 })
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
}

function removeAuthorizedKey(id) {
  try {
    if (!fs.existsSync(AUTHORIZED_KEYS_FILE)) return { ok: true }
    const { begin, end } = authorizedKeyBlock(id)
    const lines = fs.readFileSync(AUTHORIZED_KEYS_FILE, 'utf8').split('\n')
    const start = lines.indexOf(begin)
    if (start === -1) return { ok: true }
    let finish = -1
    for (let i = start + 1; i < lines.length; i++) {
      if (lines[i].trim() === end) { finish = i; break }
    }
    if (finish === -1) return { ok: false, error: 'Khối authorized_keys bị hỏng — hãy sửa tệp thủ công' }
    lines.splice(start, finish - start + 1)
    fs.writeFileSync(AUTHORIZED_KEYS_FILE, lines.join('\n'), { mode: 0o600 })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
}

export const handlers = {
  // ---- app ----
  'app:version': async () => {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'))
      return pkg.version || '1.0.0'
    } catch { return '1.0.0' }
  },
  'app:platform': async () => process.platform,
  'app:openExternal': async (url) => { try { execOut(`xdg-open "${String(url).replace(/"/g, '')}"`) } catch {}; return true },
  'clipboard:write': async (text) => ({ ok: true, text: String(text ?? '') }),

  // ---- settings ----
  'settings:get': async () => readSettings(),
  'settings:save': async (patch) => {
    if (!patch || typeof patch !== 'object') return { error: 'Du lieu khong hop le' }
    return { ok: true, data: writeSettings(patch) }
  },

  // ---- auth ----
  'auth:register': async (payload) => registerUser(payload || {}),
  'auth:login': async (payload) => loginUser(payload || {}),
  'auth:logout': async () => logoutUser(),
  'auth:getSession': async (token) => getSessionFromToken(token),
  'auth:checkDocker': async () => {
    try {
      const version = execOut('docker --version')
      return { installed: !!version, version: version || null }
    } catch { return { installed: false, version: null } }
  },
  'auth:checkDockerRunning': async () => {
    try {
      execOut('docker info')
      return { running: true }
    } catch { return { running: false } }
  },

  // ---- user management (admin only) ----
  'users:list': async () => {
    const db = readDB()
    return {
      ok: true,
      users: (db.users || []).map(u => ({ id: u.id, username: u.username, admin: !!u.admin, createdAt: u.createdAt })),
    }
  },
  'users:create': async (payload) => registerUser(payload || {}),
  'users:delete': async (id, ctx) => {
    const db = readDB()
    const target = (db.users || []).find(u => u.id === id)
    if (!target) return { ok: false, error: 'Không tìm thấy người dùng' }
    if (ctx?.user && target.id === ctx.user.id) return { ok: false, error: 'Không thể xóa chính mình' }
    if (target.admin && (db.users || []).filter(u => u.admin).length <= 1) {
      return { ok: false, error: 'Phải giữ lại ít nhất một quản trị viên' }
    }
    db.users = db.users.filter(u => u.id !== id)
    db.sessions = (db.sessions || []).filter(s => s.userId !== id)
    writeDB(db)
    appendActivity({ userId: ctx?.user?.id, username: ctx?.user?.username, type: 'admin', message: `Xóa người dùng "${target.username}"` })
    return { ok: true }
  },
  'users:setAdmin': async (id, admin, ctx) => {
    const db = readDB()
    const target = (db.users || []).find(u => u.id === id)
    if (!target) return { ok: false, error: 'Không tìm thấy người dùng' }
    const want = !!admin
    if (target.admin && !want && (db.users || []).filter(u => u.admin).length <= 1) {
      return { ok: false, error: 'Phải giữ lại ít nhất một quản trị viên' }
    }
    target.admin = want
    writeDB(db)
    appendActivity({ userId: ctx?.user?.id, username: ctx?.user?.username, type: 'admin', message: `${want ? 'Cấp' : 'Thu hồi'} quyền quản trị của "${target.username}"` })
    return { ok: true, user: { id: target.id, username: target.username, admin: target.admin } }
  },
  'users:setPassword': async (id, password, ctx) => {
    if (typeof password !== 'string' || password.length < 6) {
      return { ok: false, error: 'Mật khẩu phải ít nhất 6 ký tự' }
    }
    const db = readDB()
    const target = (db.users || []).find(u => u.id === id)
    if (!target) return { ok: false, error: 'Không tìm thấy người dùng' }
    target.passwordHash = hashPassword(password)
    writeDB(db)
    appendActivity({ userId: ctx?.user?.id, username: ctx?.user?.username, type: 'admin', message: `Đặt lại mật khẩu của "${target.username}"` })
    return { ok: true }
  },

  // ---- account self-service ----
  'account:changePassword': async (payload, ctx) => {
    const user = ctx?.user
    if (!user) return { ok: false, error: 'Chưa đăng nhập' }
    const { oldPassword, newPassword } = payload || {}
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return { ok: false, error: 'Mật khẩu mới phải ít nhất 6 ký tự' }
    }
    const db = readDB()
    const target = (db.users || []).find(u => u.id === user.id)
    if (!target) return { ok: false, error: 'Không tìm thấy người dùng' }
    if (!verifyPassword(String(oldPassword || ''), target.passwordHash)) {
      return { ok: false, error: 'Mật khẩu hiện tại không đúng' }
    }
    target.passwordHash = hashPassword(newPassword)
    // revoke all other sessions — only the current one stays alive
    db.sessions = (db.sessions || []).filter(s => s.userId !== user.id || s.id === ctx?.session?.id)
    writeDB(db)
    appendActivity({ userId: user.id, username: user.username, type: 'security', message: 'Đổi mật khẩu' })
    return { ok: true }
  },
  'account:sessions:list': async (...callArgs) => {
    // invoked with empty args — ctx is the only argument
    const ctx = callArgs[callArgs.length - 1] || {}
    const user = ctx?.user
    if (!user) return { ok: false, error: 'Chưa đăng nhập' }
    const db = readDB()
    const sessions = (db.sessions || [])
      .filter(s => s.userId === user.id)
      .map(s => ({ id: s.id, createdAt: s.createdAt, current: s.id === ctx?.session?.id }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    return { ok: true, sessions }
  },
  'account:sessions:revoke': async (sessionId, ctx) => {
    const user = ctx?.user
    if (!user) return { ok: false, error: 'Chưa đăng nhập' }
    const db = readDB()
    const target = (db.sessions || []).find(s => s.id === sessionId && s.userId === user.id)
    if (!target) return { ok: false, error: 'Không tìm thấy phiên đăng nhập' }
    db.sessions = db.sessions.filter(s => s.id !== sessionId)
    writeDB(db)
    return { ok: true }
  },

  // ---- API keys (admin manages all; users manage their own scoped keys) ----
  'apikeys:list': async (...callArgs) => {
    // invoked with empty args — ctx is the only argument
    const ctx = callArgs[callArgs.length - 1] || {}
    let keys = listApiKeys()
    if (!ctx?.user?.admin) {
      keys = keys.filter(k => !k.admin && k.userId === ctx?.user?.id)
    }
    return { ok: true, keys }
  },
  'apikeys:create': async (payload, ctx) => {
    if (!ctx?.user) return { ok: false, error: 'Chưa đăng nhập' }
    let opts = payload || {}
    if (!ctx.user.admin) {
      opts = { name: opts.name, admin: false, userId: ctx.user.id }
    }
    const { key, record } = createApiKey(opts)
    appendActivity({ userId: ctx.user.id, username: ctx.user.username, type: 'apikey', message: `Tạo API key "${record.name}"` })
    return { ok: true, key, record }
  },
  'apikeys:delete': async (id, ctx) => {
    if (!ctx?.user) return { ok: false, error: 'Chưa đăng nhập' }
    const record = listApiKeys().find(k => k.id === id)
    if (!record) return { ok: false, error: 'Không tìm thấy API key' }
    if (!ctx.user.admin && (record.admin || record.userId !== ctx.user.id)) {
      return { ok: false, error: 'Không có quyền xóa API key này' }
    }
    const ok = deleteApiKey(id)
    if (ok) appendActivity({ userId: ctx.user.id, username: ctx.user.username, type: 'apikey', message: `Xóa API key "${record.name}"` })
    return { ok }
  },

  // ---- activity / audit log (users see their own; admins may see all) ----
  'activity:list': async (payload, ctx) => {
    if (!ctx?.user) return { ok: false, error: 'Chưa đăng nhập' }
    const p = payload || {}
    const db = readDB()
    let items = db.activity || []
    const wantAll = ctx.user.admin && p.scope === 'all'
    if (!wantAll) items = items.filter(a => a.userId === ctx.user.id)
    items = [...items].reverse()
    const limit = Math.min(Math.max(parseInt(p.limit) || 100, 1), 500)
    return { ok: true, total: items.length, items: items.slice(0, limit) }
  },

  // ---- locations (group nodes, Calagopus-style) ----
  'locations:list': async () => {
    const db = readDB()
    return { ok: true, locations: db.locations || [], nodes: db.nodes || [] }
  },
  'locations:create': async (payload, ctx) => {
    const name = String(payload?.name || '').trim().slice(0, 60)
    if (!name) return { ok: false, error: 'Tên location không được để trống' }
    const db = readDB()
    db.locations = db.locations || []
    const location = { id: generateUUID(), name, description: String(payload?.description || '').slice(0, 200), createdAt: new Date().toISOString() }
    db.locations.push(location)
    writeDB(db)
    appendActivity({ userId: ctx?.user?.id, username: ctx?.user?.username, type: 'admin', message: `Tạo location "${location.name}"` })
    return { ok: true, location }
  },
  'locations:update': async (payload, ctx) => {
    const db = readDB()
    const target = (db.locations || []).find(l => l.id === payload?.id)
    if (!target) return { ok: false, error: 'Không tìm thấy location' }
    if (payload.name !== undefined) {
      const name = String(payload.name).trim().slice(0, 60)
      if (!name) return { ok: false, error: 'Tên location không được để trống' }
      target.name = name
    }
    if (payload.description !== undefined) target.description = String(payload.description).slice(0, 200)
    writeDB(db)
    appendActivity({ userId: ctx?.user?.id, username: ctx?.user?.username, type: 'admin', message: `Sửa location "${target.name}"` })
    return { ok: true, location: target }
  },
  'locations:delete': async (id, ctx) => {
    const db = readDB()
    const target = (db.locations || []).find(l => l.id === id)
    if (!target) return { ok: false, error: 'Không tìm thấy location' }
    db.locations = db.locations.filter(l => l.id !== id)
    for (const n of db.nodes || []) {
      if (n.locationId === id) n.locationId = null
    }
    writeDB(db)
    appendActivity({ userId: ctx?.user?.id, username: ctx?.user?.username, type: 'admin', message: `Xóa location "${target.name}"` })
    return { ok: true }
  },
  'nodes:list': async () => {
    const db = readDB()
    if (!Array.isArray(db.nodes) || db.nodes.length === 0) {
      db.nodes = [{ id: 'local', name: 'Node địa phương', local: true, locationId: null, createdAt: new Date().toISOString() }]
      writeDB(db)
    }
    return { ok: true, nodes: db.nodes }
  },
  'nodes:setLocation': async (payload, ctx) => {
    const db = readDB()
    const node = (db.nodes || []).find(n => n.id === payload?.nodeId)
    if (!node) return { ok: false, error: 'Không tìm thấy node' }
    const locationId = payload?.locationId || null
    if (locationId && !(db.locations || []).some(l => l.id === locationId)) {
      return { ok: false, error: 'Location không tồn tại' }
    }
    node.locationId = locationId
    writeDB(db)
    const locName = locationId ? (db.locations || []).find(l => l.id === locationId)?.name : '—'
    appendActivity({ userId: ctx?.user?.id, username: ctx?.user?.username, type: 'admin', message: `Gán node "${node.name}" vào location "${locName || '—'}"` })
    return { ok: true, node }
  },

  // ---- nests & eggs (files under eggs/<nest>/<egg>.json) ----
  'nests:create': async (payload, ctx) => {
    const game = String(payload?.name || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40)
    if (game.length < 2) return { ok: false, error: 'Tên nest không hợp lệ (a-z, 0-9, -, _, tối thiểu 2 ký tự)' }
    const dir = path.join(EGGS_DIR, game)
    if (fs.existsSync(dir)) return { ok: false, error: 'Nest đã tồn tại' }
    fs.mkdirSync(dir, { recursive: true })
    appendActivity({ userId: ctx?.user?.id, username: ctx?.user?.username, type: 'admin', message: `Tạo nest "${game}"` })
    return { ok: true, nest: game }
  },
  'nests:save': async (payload, ctx) => {
    const game = String(payload?.nest || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
    let file = String(payload?.file || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
    if (!game || !file) return { ok: false, error: 'Thiếu nest/file hợp lệ' }
    if (file.endsWith('.json')) file = file.slice(0, -5)
    if (!payload?.data || typeof payload.data !== 'object') return { ok: false, error: 'Dữ liệu egg phải là object JSON' }
    if (!payload.data.name) return { ok: false, error: 'Egg phải có trường name' }
    const dir = path.join(EGGS_DIR, game)
    if (!fs.existsSync(dir)) return { ok: false, error: 'Nest không tồn tại' }
    const filePath = path.join(dir, file + '.json')
    fs.writeFileSync(filePath, JSON.stringify(payload.data, null, 2), { mode: 0o644 })
    appendActivity({ userId: ctx?.user?.id, username: ctx?.user?.username, type: 'admin', message: `Lưu egg "${game}/${file}"` })
    return { ok: true, eggId: `${game}/${file}` }
  },
  'nests:deleteEgg': async (eggId, ctx) => {
    const parts = String(eggId || '').split('/')
    const game = String(parts[0] || '').replace(/[^a-z0-9_-]/g, '')
    let file = String(parts[1] || '').replace(/[^a-z0-9_-]/g, '')
    if (!game || !file) return { ok: false, error: 'Egg ID không hợp lệ' }
    if (file.endsWith('.json')) file = file.slice(0, -5)
    const filePath = path.join(EGGS_DIR, game, file + '.json')
    if (!fs.existsSync(filePath)) return { ok: false, error: 'Không tìm thấy egg' }
    fs.unlinkSync(filePath)
    appendActivity({ userId: ctx?.user?.id, username: ctx?.user?.username, type: 'admin', message: `Xóa egg "${game}/${file}"` })
    return { ok: true }
  },
  'nests:deleteNest': async (nest, ctx) => {
    const game = String(nest || '').replace(/[^a-z0-9_-]/g, '')
    const dir = path.join(EGGS_DIR, game)
    if (!game || !fs.existsSync(dir)) return { ok: false, error: 'Không tìm thấy nest' }
    const remaining = fs.readdirSync(dir).filter(f => !f.startsWith('.'))
    if (remaining.length > 0) return { ok: false, error: `Nest còn ${remaining.length} egg — hãy xóa egg trước` }
    fs.rmdirSync(dir)
    appendActivity({ userId: ctx?.user?.id, username: ctx?.user?.username, type: 'admin', message: `Xóa nest "${game}"` })
    return { ok: true }
  },

  // ---- database hosts (where user databases will live) ----
  'dbhosts:list': async () => ({ ok: true, hosts: readDB().dbhosts || [] }),
  'dbhosts:create': async (payload, ctx) => {
    const name = String(payload?.name || '').trim().slice(0, 60)
    const host = String(payload?.host || '').trim().slice(0, 255)
    const engine = payload?.engine === 'postgresql' ? 'postgresql' : 'mysql'
    const port = parseInt(payload?.port) || (engine === 'postgresql' ? 5432 : 3306)
    const username = String(payload?.username || '').trim().slice(0, 64)
    if (!name || !host) return { ok: false, error: 'Tên và host là bắt buộc' }
    if (port < 1 || port > 65535) return { ok: false, error: 'Port không hợp lệ' }
    const db = readDB()
    db.dbhosts = db.dbhosts || []
    const record = { id: generateUUID(), name, host, port, engine, username, createdAt: new Date().toISOString() }
    db.dbhosts.push(record)
    writeDB(db)
    appendActivity({ userId: ctx?.user?.id, username: ctx?.user?.username, type: 'admin', message: `Tạo database host "${name}" (${engine})` })
    return { ok: true, host: record }
  },
  'dbhosts:update': async (payload, ctx) => {
    const db = readDB()
    const target = (db.dbhosts || []).find(h => h.id === payload?.id)
    if (!target) return { ok: false, error: 'Không tìm thấy database host' }
    if (payload.name !== undefined) target.name = String(payload.name).trim().slice(0, 60) || target.name
    if (payload.host !== undefined) target.host = String(payload.host).trim().slice(0, 255) || target.host
    if (payload.engine !== undefined) target.engine = payload.engine === 'postgresql' ? 'postgresql' : 'mysql'
    if (payload.port !== undefined) {
      const port = parseInt(payload.port)
      if (port < 1 || port > 65535) return { ok: false, error: 'Port không hợp lệ' }
      target.port = port
    }
    if (payload.username !== undefined) target.username = String(payload.username).trim().slice(0, 64)
    writeDB(db)
    appendActivity({ userId: ctx?.user?.id, username: ctx?.user?.username, type: 'admin', message: `Sửa database host "${target.name}"` })
    return { ok: true, host: target }
  },
  'dbhosts:delete': async (id, ctx) => {
    const db = readDB()
    const target = (db.dbhosts || []).find(h => h.id === id)
    if (!target) return { ok: false, error: 'Không tìm thấy database host' }
    db.dbhosts = db.dbhosts.filter(h => h.id !== id)
    writeDB(db)
    appendActivity({ userId: ctx?.user?.id, username: ctx?.user?.username, type: 'admin', message: `Xóa database host "${target.name}"` })
    return { ok: true }
  },

  // ---- command snippets (per-user console shortcuts) ----
  'snippets:list': async (...rest) => {
    const ctx = rest[rest.length - 1] || {}
    if (!ctx?.user) return { ok: false, error: 'Chưa đăng nhập' }
    const db = readDB()
    return { ok: true, snippets: (db.snippets || []).filter(s => s.userId === ctx.user.id) }
  },
  'snippets:create': async (payload, ctx) => {
    if (!ctx?.user) return { ok: false, error: 'Chưa đăng nhập' }
    const name = String(payload?.name || '').trim().slice(0, 60)
    const command = String(payload?.command || '').trim().slice(0, 500)
    if (!name || !command) return { ok: false, error: 'Tên và lệnh là bắt buộc' }
    const db = readDB()
    db.snippets = db.snippets || []
    const snippet = { id: generateUUID(), userId: ctx.user.id, name, command, createdAt: new Date().toISOString() }
    db.snippets.push(snippet)
    writeDB(db)
    return { ok: true, snippet }
  },
  'snippets:update': async (payload, ctx) => {
    if (!ctx?.user) return { ok: false, error: 'Chưa đăng nhập' }
    const db = readDB()
    const target = (db.snippets || []).find(s => s.id === payload?.id && s.userId === ctx.user.id)
    if (!target) return { ok: false, error: 'Không tìm thấy snippet' }
    if (payload.name !== undefined) target.name = String(payload.name).trim().slice(0, 60) || target.name
    if (payload.command !== undefined) target.command = String(payload.command).trim().slice(0, 500) || target.command
    writeDB(db)
    return { ok: true, snippet: target }
  },
  'snippets:delete': async (id, ctx) => {
    if (!ctx?.user) return { ok: false, error: 'Chưa đăng nhập' }
    const db = readDB()
    const target = (db.snippets || []).find(s => s.id === id && s.userId === ctx.user.id)
    if (!target) return { ok: false, error: 'Không tìm thấy snippet' }
    db.snippets = db.snippets.filter(s => s.id !== id)
    writeDB(db)
    return { ok: true }
  },

  // ---- SSH keys (stored; admins may install them into the machine) ----
  'sshkeys:list': async (...rest) => {
    const ctx = rest[rest.length - 1] || {}
    if (!ctx?.user) return { ok: false, error: 'Chưa đăng nhập' }
    const payload = rest.length > 1 ? (rest[0] || {}) : {}
    const db = readDB()
    let keys = db.sshKeys || []
    const wantAll = ctx.user.admin && payload.scope === 'all'
    if (!wantAll) keys = keys.filter(k => k.userId === ctx.user.id)
    return { ok: true, keys }
  },
  'sshkeys:add': async (payload, ctx) => {
    if (!ctx?.user) return { ok: false, error: 'Chưa đăng nhập' }
    const name = String(payload?.name || '').trim().slice(0, 60)
    const publicKey = String(payload?.publicKey || '').trim()
    if (!name || !publicKey) return { ok: false, error: 'Tên và khóa công khai là bắt buộc' }
    const PUBKEY_RE = /^(ssh-ed25519|ssh-rsa|ssh-dss|ecdsa-sha2-nistp256|ecdsa-sha2-nistp384|ecdsa-sha2-nistp521|sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com) [A-Za-z0-9+/=]+/
    if (!PUBKEY_RE.test(publicKey) || publicKey.length > 4096) {
      return { ok: false, error: 'Khóa công khai không hợp lệ (phải là ssh-ed25519 / ssh-rsa / ecdsa...)' }
    }
    const db = readDB()
    db.sshKeys = db.sshKeys || []
    const key = { id: generateUUID(), userId: ctx.user.id, username: ctx.user.username, name, publicKey, createdAt: new Date().toISOString(), installedAt: null }
    db.sshKeys.push(key)
    writeDB(db)
    appendActivity({ userId: ctx.user.id, username: ctx.user.username, type: 'security', message: `Thêm SSH key "${name}"` })
    return { ok: true, key }
  },
  'sshkeys:delete': async (id, ctx) => {
    if (!ctx?.user) return { ok: false, error: 'Chưa đăng nhập' }
    const db = readDB()
    const target = (db.sshKeys || []).find(k => k.id === id)
    if (!target) return { ok: false, error: 'Không tìm thấy SSH key' }
    if (!ctx.user.admin && target.userId !== ctx.user.id) return { ok: false, error: 'Không có quyền xóa key này' }
    if (target.installedAt) {
      const r = removeAuthorizedKey(target.id)
      if (!r.ok) return r
    }
    db.sshKeys = db.sshKeys.filter(k => k.id !== id)
    writeDB(db)
    appendActivity({ userId: ctx.user.id, username: ctx.user.username, type: 'security', message: `Xóa SSH key "${target.name}"` })
    return { ok: true }
  },
  'sshkeys:install': async (id, ctx) => {
    const db = readDB()
    const target = (db.sshKeys || []).find(k => k.id === id)
    if (!target) return { ok: false, error: 'Không tìm thấy SSH key' }
    const r = installAuthorizedKey(target)
    if (!r.ok) return r
    target.installedAt = new Date().toISOString()
    writeDB(db)
    appendActivity({ userId: ctx?.user?.id, username: ctx?.user?.username, type: 'security', message: `Cài SSH key "${target.name}" vào máy (authorized_keys)` })
    return { ok: true }
  },
  'sshkeys:uninstall': async (id, ctx) => {
    const db = readDB()
    const target = (db.sshKeys || []).find(k => k.id === id)
    if (!target) return { ok: false, error: 'Không tìm thấy SSH key' }
    const r = removeAuthorizedKey(target.id)
    if (!r.ok) return r
    target.installedAt = null
    writeDB(db)
    appendActivity({ userId: ctx?.user?.id, username: ctx?.user?.username, type: 'security', message: `Gỡ SSH key "${target.name}" khỏi máy` })
    return { ok: true }
  },

  // ---- security keys (WebAuthn / passkeys) ----
  'webauthn:list': async (...rest) => {
    const ctx = rest[rest.length - 1] || {}
    if (!ctx?.user) return { ok: false, error: 'Chưa đăng nhập' }
    const db = readDB()
    const creds = (db.webauthn || [])
      .filter(c => c.userId === ctx.user.id)
      .map(c => ({ id: c.id, name: c.name, createdAt: c.createdAt, lastUsedAt: c.lastUsedAt, transports: c.transports || [] }))
    return { ok: true, credentials: creds }
  },
  'webauthn:delete': async (id, ctx) => {
    if (!ctx?.user) return { ok: false, error: 'Chưa đăng nhập' }
    const db = readDB()
    const target = (db.webauthn || []).find(c => c.id === id && c.userId === ctx.user.id)
    if (!target) return { ok: false, error: 'Không tìm thấy khóa bảo mật' }
    db.webauthn = db.webauthn.filter(c => c.id !== id)
    writeDB(db)
    appendActivity({ userId: ctx.user.id, username: ctx.user.username, type: 'security', message: `Xóa khóa bảo mật "${target.name}"` })
    return { ok: true }
  },
  'webauthn:registerOptions': async (_payload, ctx) => {
    if (!ctx?.user) return { ok: false, error: 'Chưa đăng nhập' }
    const rp = webauthnRp(ctx)
    if (!rp) return { ok: false, error: 'Origin không hợp lệ' }
    const db = readDB()
    const excludeCredentials = (db.webauthn || [])
      .filter(c => c.userId === ctx.user.id)
      .map(c => ({ id: c.id, transports: c.transports }))
    const options = await generateRegistrationOptions({
      rpName: 'Terver Panel',
      rpID: rp.rpID,
      userID: new TextEncoder().encode(ctx.user.id),
      userName: ctx.user.username,
      userDisplayName: ctx.user.username,
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    })
    db.webauthnChallenges = db.webauthnChallenges || {}
    db.webauthnChallenges.reg = db.webauthnChallenges.reg || {}
    db.webauthnChallenges.reg[ctx.user.id] = { challenge: options.challenge, exp: Date.now() + 5 * 60 * 1000 }
    writeDB(db)
    return { ok: true, options }
  },
  'webauthn:registerVerify': async (payload, ctx) => {
    if (!ctx?.user) return { ok: false, error: 'Chưa đăng nhập' }
    const rp = webauthnRp(ctx)
    if (!rp) return { ok: false, error: 'Origin không hợp lệ' }
    const db = readDB()
    const stored = db.webauthnChallenges?.reg?.[ctx.user.id]
    if (!stored || stored.exp < Date.now()) return { ok: false, error: 'Thử thách đã hết hạn — hãy thử lại' }
    let result
    try {
      result = await verifyRegistrationResponse({
        response: payload?.response,
        expectedChallenge: stored.challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        requireUserVerification: false,
      })
    } catch (err) {
      return { ok: false, error: `Xác thực khóa thất bại: ${err?.message || err}` }
    }
    if (!result.verified || !result.registrationInfo) return { ok: false, error: 'Xác thực khóa thất bại' }
    const info = result.registrationInfo
    db.webauthn = db.webauthn || []
    // re-register of the same credential replaces the old record
    db.webauthn = db.webauthn.filter(c => c.id !== info.credentialID)
    const record = {
      id: info.credentialID,
      userId: ctx.user.id,
      username: ctx.user.username,
      name: String(payload?.name || '').trim().slice(0, 60) || `Khóa bảo mật ${new Date().toLocaleDateString('vi-VN')}`,
      publicKey: Buffer.from(info.credentialPublicKey).toString('base64'),
      counter: info.counter || 0,
      transports: payload?.response?.response?.transports || [],
      credentialDeviceType: info.credentialDeviceType || 'unknown',
      credentialBackedUp: !!info.credentialBackedUp,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    }
    db.webauthn.push(record)
    delete db.webauthnChallenges.reg[ctx.user.id]
    writeDB(db)
    appendActivity({ userId: ctx.user.id, username: ctx.user.username, type: 'security', message: `Đăng ký khóa bảo mật "${record.name}"` })
    return { ok: true }
  },
  'webauthn:authOptions': async (payload) => {
    const username = String(payload?.username || '')
    const db = readDB()
    const user = (db.users || []).find(u => u.username === username)
    if (!user) return { ok: false, error: 'Không tìm thấy người dùng' }
    const creds = (db.webauthn || []).filter(c => c.userId === user.id)
    if (creds.length === 0) return { ok: false, error: 'Tài khoản này chưa có khóa bảo mật' }
    const origin = String(payload?.origin || '')
    let rpID = ''
    try { rpID = new URL(origin).hostname } catch { return { ok: false, error: 'Origin không hợp lệ' } }
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: creds.map(c => ({ id: c.id, transports: c.transports })),
      userVerification: 'preferred',
    })
    db.webauthnChallenges = db.webauthnChallenges || {}
    db.webauthnChallenges.auth = db.webauthnChallenges.auth || {}
    db.webauthnChallenges.auth[username] = { challenge: options.challenge, exp: Date.now() + 5 * 60 * 1000 }
    writeDB(db)
    return { ok: true, options }
  },
  'webauthn:authVerify': async (payload, ctx) => {
    const username = String(payload?.username || '')
    const db = readDB()
    const user = (db.users || []).find(u => u.username === username)
    if (!user) return { ok: false, error: 'Không tìm thấy người dùng' }
    const stored = db.webauthnChallenges?.auth?.[username]
    if (!stored || stored.exp < Date.now()) return { ok: false, error: 'Thử thách đã hết hạn — hãy thử lại' }
    const rp = webauthnRp(ctx)
    if (!rp) return { ok: false, error: 'Origin không hợp lệ' }
    const cred = (db.webauthn || []).find(c => c.userId === user.id && c.id === payload?.response?.id)
    if (!cred) return { ok: false, error: 'Khóa bảo mật không khớp tài khoản' }
    let result
    try {
      result = await verifyAuthenticationResponse({
        response: payload?.response,
        expectedChallenge: stored.challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        credential: {
          id: cred.id,
          publicKey: new Uint8Array(Buffer.from(cred.publicKey, 'base64')),
          counter: cred.counter || 0,
          transports: cred.transports || [],
        },
        requireUserVerification: false,
      })
    } catch (err) {
      return { ok: false, error: `Xác thực thất bại: ${err?.message || err}` }
    }
    if (!result.verified) return { ok: false, error: 'Xác thực khóa bảo mật thất bại' }
    const session = { id: generateUUID(), userId: user.id, username: user.username, createdAt: new Date().toISOString() }
    db.sessions = db.sessions || []
    db.sessions.push(session)
    db.currentSession = session.id
    cred.counter = result.authenticationInfo.newCounter
    cred.lastUsedAt = new Date().toISOString()
    delete db.webauthnChallenges.auth[username]
    writeDB(db)
    const token = signToken(session, user)
    appendActivity({ userId: user.id, username: user.username, type: 'auth', message: 'Đăng nhập bằng khóa bảo mật' })
    return {
      ok: true,
      token,
      session,
      user: { id: user.id, username: user.username, admin: !!user.admin, createdAt: user.createdAt },
    }
  },

  // ---- system ----
  'system:getInfo': async () => {
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const cpus = os.cpus()
    const cpuModel = cpus.length > 0 ? cpus[0].model : 'Unknown'
    const cpuCores = cpus.length
    let totalDisk = 0
    let freeDisk = 0
    try {
      const out = execOut('df -B1 / | tail -1')
      const parts = out.split(/\s+/)
      totalDisk = parseInt(parts[1]) || 0
      freeDisk = parseInt(parts[3]) || 0
    } catch {}
    return {
      ok: true,
      ram: { total: totalMem, free: freeMem },
      cpu: { model: cpuModel, cores: cpuCores },
      disk: { total: totalDisk, free: freeDisk },
      platform: os.platform(),
      arch: os.arch(),
    }
  },
  'system:auth': async (password) => {
    try {
      const user = os.userInfo().username
      // web panel runs as root (systemd User=root) — no sudo prompt needed
      if (typeof process.getuid === 'function' && process.getuid() === 0) {
        return { ok: true, authenticated: true, user }
      }
      const r = execSync(`echo ${JSON.stringify(password)} | sudo -S -v`, { timeout: 8000, encoding: 'utf8' })
      return { ok: true, authenticated: true, user, out: r }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  },
  'system:checkAuth': async () => ({
    ok: true,
    authenticated: typeof process.getuid === 'function' && process.getuid() === 0,
  }),
  'system:cleanup': async (type) => ({ ok: true, type }),

  // ---- eggs ----
  'eggs:list': async () => {
    const result = {}
    try {
      const games = fs.readdirSync(EGGS_DIR)
      for (const game of games) {
        const gameDir = path.join(EGGS_DIR, game)
        if (fs.statSync(gameDir).isDirectory()) {
          result[game] = []
          for (const file of fs.readdirSync(gameDir)) {
            if (!file.endsWith('.json')) continue
            try {
              const egg = JSON.parse(fs.readFileSync(path.join(gameDir, file), 'utf8'))
              result[game].push({
                id: `${game}/${file.replace('.json', '')}`,
                file,
                name: egg.name || file.replace('.json', ''),
                description: egg.description || '',
                docker_images: egg.docker_images || {},
                variables: egg.variables || [],
                startup: egg.Startup || egg.startup || '',
                config: egg.config || {},
                scripts: egg.scripts || {},
                features: egg.features || [],
              })
            } catch {}
          }
        }
      }
    } catch {}
    return { ok: true, eggs: result }
  },
  'eggs:get': async (eggId) => {
    try {
      const parts = String(eggId).split('/')
      const filePath = path.join(EGGS_DIR, parts[0], parts[1] + '.json')
      return { ok: true, egg: JSON.parse(fs.readFileSync(filePath, 'utf8')) }
    } catch { return { ok: false } }
  },

  // ---- minecraft meta ----
  'mc:getVersions': async () => {
    try {
      const json = await fetchJson('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json')
      return { ok: true, latest: json.latest, versions: json.versions }
    } catch { return { error: 'Network error' } }
  },
  'mc:getChangelog': async (version) => {
    try {
      const url = `https://xyrios.com/minecraft/tools/changelog/${encodeURIComponent(version)}`
      const html = await new Promise((resolve, reject) => {
        https.get(url, { timeout: 15000 }, (res) => {
          let data = ''
          res.on('data', (c) => { data += c })
          res.on('end', () => resolve(data))
        }).on('error', reject)
      })
      const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/s)
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : ''
      const dateMatch = html.match(/Published on (\d{4}\.\d{2}\.\d{2})/)
      const date = dateMatch ? dateMatch[1] : ''
      const imgMatch = html.match(/launchercontent\.mojang\.com\/v2\/images\/([^"'\s]+)/)
      const image = imgMatch ? `https://launchercontent.mojang.com/v2/images/${imgMatch[1]}` : ''
      return { ok: true, title, date, image, content: '' }
    } catch { return { error: 'Network error' } }
  },
  'mc:getModpacks': async () => {
    try {
      const facets = encodeURIComponent(JSON.stringify([['project_type:modpack']]))
      const json = await fetchJson(`https://api.modrinth.com/v3/search?index=downloads&limit=10&facets=${facets}`)
      return { ok: true, hits: json.hits || [] }
    } catch { return { error: 'Network error' } }
  },

  // ---- servers ----
  'server:getConfigs': async (ctx) => {
    const user = ctx?.user
    if (!user) return { ok: true, servers: [] }
    const servers = listServerConfigs()
    return { ok: true, servers: user.admin ? servers : servers.filter(s => s.ownerId === user.id) }
  },
  'server:getConfig': async (serverId) => {
    const server = getServerByUuid(serverId)
    if (!server) return { ok: false, error: 'Not found' }
    return { ok: true, server }
  },
  'server:addConfig': async (config, ctx) => {
    // Calagopus-style: only admins create servers, and they choose the owner
    if (!ctx?.user?.admin) return { ok: false, error: 'Chỉ quản trị viên mới tạo server' }
    const ownerId = config?.ownerId || ctx.user.id
    const owner = (readDB().users || []).find(u => u.id === ownerId)
    if (!owner) return { ok: false, error: 'Chủ sở hữu server không tồn tại' }
    const server = { id: generateUUID(), ...config, ownerId: owner.id, createdAt: new Date().toISOString() }
    addServerConfig(server)
    appendActivity({ userId: ctx?.user?.id, username: ctx?.user?.username, type: 'admin', message: `Tạo server "${server.name || server.id}" (chủ sở hữu: ${owner.username})` })
    return { ok: true, server }
  },
  'server:removeConfig': async (id, ctx) => {
    const server = getServerByUuid(id)
    removeServerConfig(id)
    try { await deleteServerRemote(id) } catch {}
    appendActivity({ userId: ctx?.user?.id, username: ctx?.user?.username, type: 'admin', message: `Xóa server "${server?.name || id}"` })
    return { ok: true }
  },
  'server:status': async (serverId) => getStatus(serverId),
  'server:history': async (serverId) => {
    const server = getServerByUuid(serverId)
    return { ok: true, history: server?.history || [] }
  },
  'server:tps': async (serverId) => {
    const server = getServerByUuid(serverId)
    return { ok: true, tps: server?.lastTps ?? null, at: server?.lastTpsAt || null }
  },
  'server:start': async (serverId) => powerServer(serverId, 'start'),
  'server:stop': async (serverId) => powerServer(serverId, 'stop'),
  'server:kill': async (serverId) => powerServer(serverId, 'kill'),
  'server:install': async (serverId, ctx) => {
    const server = getServerByUuid(serverId)
    if (!server) return { ok: false, error: 'Server not found' }
    if (hasInstallWatch(serverId)) return { ok: true, already: true }
    const bc = (type, data) => { try { ctx?.broadcast?.(type, data) } catch {} }
    updateServerConfig(serverId, { status: 'installing', installError: null })
    bc('server:progress', { serverId, percent: 2, message: 'Đang chuẩn bị cài đặt...' })
    try {
      const state = await getServerState(serverId)
      let res = state.ok ? await reinstallServer(serverId) : await createServerRemote(serverId)
      if (!res.ok) {
        res = state.ok ? await createServerRemote(serverId) : await reinstallServer(serverId)
      }
      if (!res.ok) throw new Error(res.error || 'Không khởi động được cài đặt trên Wings')
      startInstallWatch(serverId, bc)
      return { ok: true }
    } catch (err) {
      updateServerConfig(serverId, { status: 'error', installError: err.message })
      bc('server:progress', { serverId, percent: 0, message: 'Cài đặt thất bại: ' + err.message })
      return { ok: false, error: err.message }
    }
  },
  // wings HTTP logs are surfaced via wings:server:logs (string). Web edition
  // has no persisted per-server console log store — return an empty history.
  'server:getLogs': async () => ({ ok: true, logs: [] }),

  // ---- docker ----
  'docker:check': async () => {
    try {
      let installed = false
      let version = ''
      let composeVersion = ''
      let running = false
      let containers = 0
      try {
        version = execOut('docker --version')
        installed = !!version
        composeVersion = execOut('docker compose version')
        const s = execOut(`systemctl is-active ${DOCKER_UNIT} 2>/dev/null`)
        running = s === 'active'
        containers = parseInt(execOut('docker ps -q 2>/dev/null | wc -l')) || 0
      } catch {}
      return { ok: true, installed, version, composeVersion, running, containers, usingSystem: false, socket: DOCKER_SOCK }
    } catch {
      return { ok: true, installed: false, version: '', composeVersion: '', running: false, containers: 0 }
    }
  },
  'docker:install': async () => {
    try {
      let already = true
      if (!execOut('docker --version')) {
        already = false
        // distro-aware: pacman/apt/dnf first, get.docker.com only as fallback
        execOut(`
        if command -v docker >/dev/null 2>&1; then echo 'already installed'; exit 0; fi
        if command -v pacman >/dev/null 2>&1; then pacman -Sy --noconfirm --needed docker docker-buildx docker-compose
        elif command -v apt-get >/dev/null 2>&1; then
          (curl -fsSL https://get.docker.com/ | CHANNEL=stable bash) || apt-get install -y docker.io docker-compose
        elif command -v dnf >/dev/null 2>&1; then dnf install -y docker docker-cli-compose
        elif command -v yum >/dev/null 2>&1; then yum install -y docker docker-compose
        elif command -v zypper >/dev/null 2>&1; then zypper --non-interactive install docker
        elif command -v apk >/dev/null 2>&1; then apk add docker docker-compose
        else curl -fsSL https://get.docker.com/ | CHANNEL=stable bash; fi
        command -v docker && docker --version || true
      `, 300000)
      }
      if (!execOut('command -v dockerd')) return { ok: false, error: 'dockerd not found after install' }
      // ensure isolated instance unit exists + running (own socket/data, never system docker)
      writeDockerUnit()
      execOut('systemctl daemon-reload', 10000)
      execOut(`systemctl enable --now ${DOCKER_UNIT} 2>/dev/null || true`, 30000)
      return { ok: true, already }
    } catch (err) {
      return { ok: false, error: String(err?.message || err) }
    }
  },
  'docker:start': async () => {
    try { execOut(`sudo systemctl start ${DOCKER_UNIT}`, 15000); return { ok: true } }
    catch (err) { return { ok: false, error: String(err) } }
  },
  'docker:stop': async () => {
    try { execOut(`sudo systemctl stop ${DOCKER_UNIT}`, 15000); return { ok: true } }
    catch (err) { return { ok: false, error: String(err) } }
  },
  'docker:config:get': async () => ({ ok: true, config: readSettings().paths || {} }),
  'docker:config:save': async (config) => ({ ok: true, data: writeSettings({ paths: { ...(readSettings().paths || {}), ...config } }) }),
  'systemd:status': async (name) => {
    const s = execOut(`systemctl is-active ${String(name).replace(/[^a-zA-Z0-9_.@-]/g, '')} 2>/dev/null`)
    return { ok: true, status: s || 'unknown', active: s === 'active' }
  },
  'systemd:start': async (name) => {
    execOut(`sudo systemctl start ${String(name).replace(/[^a-zA-Z0-9_.@-]/g, '')}`, 15000)
    return { ok: true }
  },
  'systemd:stop': async (name) => {
    execOut(`sudo systemctl stop ${String(name).replace(/[^a-zA-Z0-9_.@-]/g, '')}`, 15000)
    return { ok: true }
  },
  'systemd:logs': async (name, lines) => {
    const n = Math.min(500, Math.max(10, parseInt(lines) || 100))
    const out = execOut(`journalctl -u ${String(name).replace(/[^a-zA-Z0-9_.@-]/g, '')} -n ${n} --no-pager 2>/dev/null`, 8000)
    return { ok: true, logs: out }
  },
  'cloudflared:start': async () => ({ ok: false, error: 'not implemented' }),
  'cloudflared:stop': async () => ({ ok: false, error: 'not implemented' }),
  'docker:listServers': async () => ({ ok: true, containers: [] }),
  'docker:startServer': async () => ({ ok: false, error: 'Use wings power' }),
  'docker:stopServer': async () => ({ ok: false, error: 'Use wings power' }),
  'docker:getServerLogs': async () => ({ ok: true, logs: [] }),

  // ---- wings ----
  'wings:status': async () => {
    let binaryPath = ''
    let installed = false
    try {
      if (fs.existsSync('/usr/local/bin/wings')) { binaryPath = '/usr/local/bin/wings'; installed = true }
      else {
        const sysBin = execOut('which wings 2>/dev/null')
        if (sysBin && fs.existsSync(sysBin)) { binaryPath = sysBin; installed = true }
      }
    } catch {}
    let running = false
    let version = ''
    if (installed) {
      try {
        const out = execOut(`"${binaryPath}" --version 2>&1 || true`)
        const match = out.match(/(\d+\.\d+\.\d+)/)
        if (match) version = match[1]
      } catch {}
      try {
        const status = execOut(`systemctl is-active ${WINGS_UNIT} 2>/dev/null`)
        running = status === 'active'
      } catch {}
    }
    const configPath = WINGS_CONFIG_PATH
    let hasConfig = false
    try { hasConfig = fs.existsSync(configPath) } catch {}
    let hasService = false
    try { hasService = fs.existsSync(`/etc/systemd/system/${WINGS_UNIT}.service`) } catch {}
    return { ok: true, installed, running, version, arch: '', hasConfig, hasService, binaryPath, configPath: hasConfig ? configPath : '' }
  },
  'wings:install': async () => {
    // Prefer the full installer path; in-panel re-install downloads the binary only.
    try {
      const archMap = { x86_64: 'x86_64', aarch64: 'aarch64', armv7l: 'armv7l' }
      const arch = archMap[execOut('uname -m')] || 'x86_64'
      const url = `https://github.com/foxstudio-201/lunarspacewinglunar/releases/latest/download/wings-rs-${arch}-linux`
      const tmp = `/tmp/wings-rs-${arch}-linux`
      execOut(`curl -fL --retry 3 "${url}" -o "${tmp}"`, 180000)
      const size = fs.existsSync(tmp) ? fs.statSync(tmp).size : 0
      if (size < 1000000) {
        try { fs.unlinkSync(tmp) } catch {}
        return { ok: false, error: `Wings download too small (${size} bytes)` }
      }
      execOut(`install -m 755 "${tmp}" /usr/local/bin/wings`, 15000)
      try { fs.unlinkSync(tmp) } catch {}
      // ensure service unit exists
      if (!fs.existsSync(`/etc/systemd/system/${WINGS_UNIT}.service`)) {
        return handlers['wings:config:generate']()
      }
      execOut('systemctl daemon-reload', 10000)
      return { ok: true, arch }
    } catch (err) {
      return { ok: false, error: String(err?.message || err) }
    }
  },
  'wings:start': async () => {
    try {
      execOut(`systemctl start ${WINGS_UNIT}`, 15000)
      return { ok: true }
    } catch (err) { return { ok: false, error: String(err) } }
  },
  'wings:stop': async () => {
    try {
      execOut(`systemctl stop ${WINGS_UNIT}`, 15000)
      return { ok: true }
    } catch (err) { return { ok: false, error: String(err) } }
  },
  'wings:config:generate': async () => {
    try {
      const yaml = (await import('js-yaml')).default
      const crypto = await import('crypto')
      const configDir = WINGS_CONFIG_DIR
      const dataDir = '/var/lib/terver-panel-wings'
      const configPath = WINGS_CONFIG_PATH
      fs.mkdirSync(configDir, { recursive: true })
      for (const d of ['servers', 'logs', 'diffs', 'vmounts', 'archives', 'backups', 'tmp']) {
        fs.mkdirSync(`${dataDir}/${d}`, { recursive: true })
      }
      const token = getWingsRemoteToken()
      const port = parseInt(process.env.PORT || process.env.TERVER_PORT || '8000', 10)
      const config = {
        uuid: crypto.randomUUID(),
        token_id: String(token.id),
        token: token.token,
        remote: `http://127.0.0.1:${port}`,
        api: { host: '0.0.0.0', port: 8080, ssl: { enabled: false }, send_offline_server_logs: true, websocket_log_count: 500 },
        system: {
          root_directory: dataDir,
          data: `${dataDir}/servers`,
          log_directory: `${dataDir}/logs`,
          diffs_directory: `${dataDir}/diffs`,
          vmount_directory: `${dataDir}/vmounts`,
          archive_directory: `${dataDir}/archives`,
          backup_directory: `${dataDir}/backups`,
          tmp_directory: `${dataDir}/tmp`,
          username: 'lunarspace',
        },
        allowed_mounts: ['/home', `${dataDir}/servers`],
        docker: { socket: DOCKER_SOCK, network: { interface: '172.22.0.1', name: 'tpweb-net', mode: 'tpweb-net', interfaces: { v4: { subnet: '172.22.0.0/16', gateway: '172.22.0.1' }, v6: { subnet: 'fdba:17c8:6c96::/64', gateway: 'fdba:17c8:6c96::1011' } } } },
      }
      fs.writeFileSync(configPath, yaml.dump(config), { mode: 0o600 })
      // write systemd unit if missing
      const unitPath = `/etc/systemd/system/${WINGS_UNIT}.service`
      if (!fs.existsSync(unitPath)) {
        const unit = `[Unit]
Description=TerverPanel Web Wings Daemon
After=network-online.target ${DOCKER_UNIT}.service
Requires=${DOCKER_UNIT}.service

[Service]
User=root
KillMode=process
LimitNOFILE=4096
Environment=DOCKER_HOST=${DOCKER_HOST_URL}
ExecStartPre=/bin/bash -c 'for i in $(seq 1 30); do [ -S ${DOCKER_SOCK} ] && exit 0; sleep 1; done; echo "Docker socket not ready"; exit 1'
ExecStart=/usr/local/bin/wings --config ${configPath}
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
`
        fs.writeFileSync(unitPath, unit, { mode: 0o644 })
        execOut('systemctl daemon-reload', 10000)
      }
      return { ok: true, path: configPath, token: config.token, uuid: config.uuid }
    } catch (err) {
      return { ok: false, error: String(err?.message || err) }
    }
  },
  'wings:servers:list': async () => ({ ok: true, servers: getRemoteServers() }),
  'wings:server:state': async (uuid) => getServerState(uuid),
  'wings:server:power': async (uuid, action) => powerServer(uuid, action),
  'wings:server:command': async (uuid, command) => sendWingsCommand(uuid, command),
  'wings:server:logs': async (uuid, lines) => getWingsLogs(uuid, lines || 200),
  'wings:server:files': async (uuid, dirPath) => {
    if (!uuid || uuid === 'null' || uuid === 'undefined') return { ok: false, error: 'Chưa chọn server' }
    return listWingsFiles(uuid, dirPath || '/')
  },
  'wings:server:readFile': async (uuid, filePath) => ({ ok: true, content: await readWingsFile(uuid, filePath) }),
  'wings:server:writeFile': async (uuid, filePath, content) => ({ ok: true, data: await writeWingsFile(uuid, filePath, content) }),
  'wings:server:deleteFile': async (uuid, targetPath) => ({ ok: true, data: await deleteWingsPath(uuid, targetPath) }),
  'wings:server:createFile': async (uuid, dirPath, fileName) => {
    const rel = path.posix.join(dirPath || '/', fileName)
    return { ok: true, data: await writeWingsFile(uuid, rel, '') }
  },
  'wings:server:createFolder': async (uuid, dirPath, folderName) => ({ ok: true, data: await createWingsFolder(uuid, dirPath, folderName) }),
  'wings:server:uploadFile': async (uuid, filePath, data) => ({ ok: true, data: await writeWingsFile(uuid, filePath, data) }),
  'wings:server:moveFile': async (uuid, fromPath, toPath) => ({ ok: true, data: await renameWingsPath(uuid, fromPath, toPath) }),
  'wings:server:sync': async (uuid) => syncServerConfig(uuid),
  'wings:server:reinstall': async (uuid) => reinstallServer(uuid),
  'wings:server:delete': async (uuid) => deleteServerRemote(uuid),
  'wings:server:create': async (uuid) => createServerRemote(uuid),
  'wings:ws-connect': async () => ({ ok: true }),
  'wings:ws-disconnect': async () => ({ ok: true }),
  // no persistent wings WS relay in web edition — report not-sent so the
  // console falls back to the HTTP /commands API (wings:server:command)
  'wings:ws-send': async () => ({ ok: false, error: 'WS relay not available' }),
  'wings:ws-status': async () => ({ ok: true, connected: false, authenticated: false }),

  // ---- stats ----
  'stats:docker': async () => handlers['docker:check'](),
  'stats:database': async () => ({ ok: true, installed: false, running: false, version: '' }),
  'stats:ping': async () => ({ ok: true, ping: Math.round(Math.random() * 20) + 5, ms: Math.round(Math.random() * 20) + 5 }),
  'stats:network': async () => {
    try {
      const out = execOut("cat /proc/net/dev | awk '/eth0|ens|enp/{rx+=$2; tx+=$10} END{print rx, tx}'")
      const [rx, tx] = out.split(/\s+/).map(Number)
      return { ok: true, rx: rx || 0, tx: tx || 0, rxSpeed: 0, txSpeed: 0 }
    } catch { return { ok: true, rx: 0, tx: 0, rxSpeed: 0, txSpeed: 0 } }
  },
  'stats:serverNetwork': async () => ({ ok: true, rx: 0, tx: 0 }),

  // ---- backups / schedules (minimal stubs for UI) ----
  'backup:list': async (serverId) => {
    const db = readDB()
    return { ok: true, backups: (db.backups || []).filter(b => b.serverId === serverId) }
  },
  'backup:create': async () => ({ ok: false, error: 'Backup via Wings API not wired yet' }),
  'backup:update': async () => ({ ok: false, error: 'not implemented' }),
  'backup:delete': async () => ({ ok: false, error: 'not implemented' }),
  'backup:restore': async () => ({ ok: false, error: 'not implemented' }),
  'backup:download': async () => ({ ok: false, error: 'not implemented' }),
  'schedule:list': async (serverId) => {
    const db = readDB()
    return { ok: true, schedules: (db.schedules || []).filter(s => s.serverId === serverId) }
  },
  'schedule:create': async () => ({ ok: false, error: 'not implemented' }),
  'schedule:update': async () => ({ ok: false, error: 'not implemented' }),
  'schedule:delete': async () => ({ ok: false, error: 'not implemented' }),
  'schedule:toggle': async () => ({ ok: false, error: 'not implemented' }),
  'schedule:run': async () => ({ ok: false, error: 'not implemented' }),
  'schedule:preview': async (cron) => ({ ok: true, cron, next: null }),

  // ---- node / cloudflare / database stubs ----
  'node:loadConfigs': async () => ({ ok: true, configs: {} }),
  'cloudflare:check': async () => ({ ok: true, installed: false }),
  'cloudflare:install': async () => ({ ok: false, error: 'not implemented' }),
  'cloudflare:tunnel:create': async () => ({ ok: false, error: 'not implemented' }),
  'cloudflare:tunnel:install-service': async () => ({ ok: false, error: 'not implemented' }),
  'cloudflare:tunnel:login': async () => ({ ok: false, error: 'not implemented' }),
  'cloudflare:tunnel:check-auth': async () => ({ ok: false }),
  'database:setup': async () => ({ ok: false, error: 'not implemented' }),
  'database:install': async () => ({ ok: false, error: 'not implemented' }),

  // ---- dialog stubs ----
  'dialog:openFolder': async (defaultPath) => ({ ok: false, path: defaultPath || '' }),
}

export async function invokeHandler(channel, args = [], ctx = {}) {
  const fn = handlers[channel]
  if (!fn) return { error: `Unknown channel: ${channel}` }
  try {
    if (!ctx.user && ctx.token) {
      const s = getSessionFromToken(ctx.token)
      if (s) {
        ctx.user = s.user
        ctx.session = s.session
      }
    }
    if (ADMIN_CHANNELS.has(channel) && !ctx.user?.admin) {
      return { error: 'Chỉ quản trị viên mới thực hiện được thao tác này' }
    }
    if (SERVER_ARG_CHANNELS.has(channel) && !canAccessServer(ctx.user, args[0])) {
      return { error: 'Không có quyền truy cập server này' }
    }
    return await fn(...args, ctx)
  } catch (err) {
    return { error: err?.message || String(err) }
  }
}
