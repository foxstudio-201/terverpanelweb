import crypto from 'crypto'
import { readDB, writeDB, generateUUID } from './db.js'

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex')
}

// Creates a new API key. Returns the plaintext key ONCE — only its
// sha256 hash is persisted.
export function createApiKey({ name, admin = true, userId = null } = {}) {
  const db = readDB()
  const label = String(name || '').trim() || 'API key'
  const key = 'tpk_' + crypto.randomBytes(24).toString('hex')
  const record = {
    id: generateUUID(),
    name: label,
    keyHash: sha256(key),
    keyPrefix: key.slice(0, 12), // shown in the UI: tpk_ab12cd34…
    admin: !!admin,
    userId: admin ? null : (userId || null),
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  }
  db.apiKeys = db.apiKeys || []
  db.apiKeys.push(record)
  writeDB(db)
  return { key, record: sanitize(record) }
}

export function listApiKeys() {
  const db = readDB()
  return (db.apiKeys || []).map(sanitize)
}

export function deleteApiKey(id) {
  const db = readDB()
  const before = (db.apiKeys || []).length
  db.apiKeys = (db.apiKeys || []).filter(k => k.id !== id)
  writeDB(db)
  return db.apiKeys.length < before
}

export function verifyApiKey(token) {
  if (typeof token !== 'string' || !token.startsWith('tpk_')) return null
  const db = readDB()
  const hash = sha256(token)
  const record = (db.apiKeys || []).find(k => k.keyHash === hash)
  if (!record) return null
  record.lastUsedAt = new Date().toISOString()
  writeDB(db)
  return record
}

function sanitize(k) {
  return {
    id: k.id,
    name: k.name,
    admin: !!k.admin,
    userId: k.userId || null,
    keyPrefix: k.keyPrefix || null,
    createdAt: k.createdAt,
    lastUsedAt: k.lastUsedAt,
  }
}
