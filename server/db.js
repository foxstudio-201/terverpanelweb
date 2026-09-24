import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'

export const APP_DATA_DIR = process.env.TERVER_DATA_DIR
  || path.join(os.homedir(), '.config', '.TerverPanel')
export const LOCAL_DB_FILE = path.join(APP_DATA_DIR, 'terverpanel.db')
export const WINGS_DATA_DIR = path.join(APP_DATA_DIR, 'wings', 'servers')
export const EGGS_DIR = path.join(process.cwd(), 'eggs')

const USERNAME_RE = /^[a-zA-Z0-9_]{3,16}$/

export function ensureAppDataDir() {
  if (!fs.existsSync(APP_DATA_DIR)) fs.mkdirSync(APP_DATA_DIR, { recursive: true })
  if (!fs.existsSync(WINGS_DATA_DIR)) fs.mkdirSync(WINGS_DATA_DIR, { recursive: true, mode: 0o755 })
}

export function generateUUID() {
  return crypto.randomUUID()
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex')
  return salt + ':' + hash
}

export function verifyPassword(password, stored) {
  try {
    const [salt, hash] = String(stored).split(':')
    const verify = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex')
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verify, 'hex'))
  } catch {
    return false
  }
}

export function readDB() {
  ensureAppDataDir()
  try {
    if (!fs.existsSync(LOCAL_DB_FILE)) {
      const initial = { users: [], sessions: [], servers: [], settings: { appMode: 'advanced' }, schedules: [], backups: [] }
      fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(initial, null, 2), { mode: 0o600 })
      return initial
    }
    return JSON.parse(fs.readFileSync(LOCAL_DB_FILE, 'utf-8'))
  } catch {
    return { users: [], sessions: [], servers: [], settings: { appMode: 'advanced' }, schedules: [], backups: [] }
  }
}

export function writeDB(data) {
  ensureAppDataDir()
  const tmp = LOCAL_DB_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, LOCAL_DB_FILE)
}

export const DEFAULT_SETTINGS = {
  language: 'vi',
  theme: 'dark',
  autoCheckDocker: true,
  savedUsername: '',
  savedPassword: '',
  rememberMe: false,
  appMode: 'advanced',
}

export function sanitizeSettings(input) {
  const safe = Object.assign({}, DEFAULT_SETTINGS)
  if (!input || typeof input !== 'object') return safe
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (key in input) safe[key] = input[key]
  }
  safe.appMode = 'advanced'
  if (input.paths && typeof input.paths === 'object') safe.paths = input.paths
  if ('setupComplete' in input) safe.setupComplete = input.setupComplete
  if (input.autoStart && typeof input.autoStart === 'object') safe.autoStart = input.autoStart
  if ('closeBehavior' in input) safe.closeBehavior = input.closeBehavior
  return safe
}

export function readSettings() {
  const db = readDB()
  return sanitizeSettings(db.settings || {})
}

export function writeSettings(patch) {
  const db = readDB()
  db.settings = sanitizeSettings(Object.assign({}, db.settings || {}, patch))
  db.settings.appMode = 'advanced'
  writeDB(db)
  return db.settings
}

export function listServerConfigs() {
  return readDB().servers || []
}

export function getServerByUuid(uuid) {
  return (readDB().servers || []).find(s => s.id === uuid || s.uuid === uuid) || null
}

export function addServerConfig(server) {
  const db = readDB()
  db.servers = db.servers || []
  db.servers.push(server)
  writeDB(db)
  return db.servers
}

export function removeServerConfig(id) {
  const db = readDB()
  db.servers = (db.servers || []).filter(s => s.id !== id)
  writeDB(db)
  return db.servers
}

export function updateServerConfig(id, updates) {
  const db = readDB()
  db.servers = (db.servers || []).map(s => s.id === id ? { ...s, ...updates } : s)
  writeDB(db)
  return db.servers.find(s => s.id === id) || null
}

export function appendServerHistory(serverId, action) {
  try {
    const server = getServerByUuid(serverId)
    if (!server) return
    const history = Array.isArray(server.history) ? server.history : []
    const now = Date.now()
    const last = history[0]
    if (last && last.action === action) {
      if (action === 'start' || action === 'stop' || action === 'kill') return
      if (now - (last.at || 0) < 3000) return
    }
    history.unshift({ action, at: now })
    updateServerConfig(serverId, { history: history.slice(0, 50) })
  } catch {}
}

export { USERNAME_RE }
