import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import { readDB, writeDB, APP_DATA_DIR, USERNAME_RE, hashPassword, verifyPassword, generateUUID, writeSettings } from './db.js'

const SECRET_FILE = path.join(APP_DATA_DIR, 'jwt-secret')

function getSecret() {
  try {
    if (fs.existsSync(SECRET_FILE)) return fs.readFileSync(SECRET_FILE, 'utf8').trim()
  } catch {}
  const secret = crypto.randomBytes(32).toString('hex')
  try {
    fs.mkdirSync(APP_DATA_DIR, { recursive: true })
    fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 })
  } catch {}
  return secret
}

const SECRET = getSecret()

export function signToken(session, user) {
  return jwt.sign(
    { sid: session.id, uid: user.id, username: user.username },
    SECRET,
    { expiresIn: '30d' }
  )
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET)
  } catch {
    return null
  }
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query?.token || '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const payload = verifyToken(token)
  if (!payload) return res.status(401).json({ error: 'Invalid token' })
  const db = readDB()
  const session = (db.sessions || []).find(s => s.id === payload.sid)
  const user = (db.users || []).find(u => u.id === payload.uid)
  if (!session || !user) return res.status(401).json({ error: 'Session expired' })
  req.user = { id: user.id, username: user.username, admin: !!user.admin }
  req.session = session
  next()
}

export function registerUser({ username, password }) {
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    return { error: 'Username chi duoc chua chu, so va _ (3-16 ky tu)' }
  }
  if (typeof password !== 'string' || password.length < 6) {
    return { error: 'Mat khau phai it nhat 6 ky tu' }
  }
  const db = readDB()
  db.users = db.users || []
  if (db.users.find(u => u.username === username)) {
    return { error: 'Ten nguoi dung da ton tai' }
  }
  const newUser = {
    id: generateUUID(),
    username,
    passwordHash: hashPassword(password),
    admin: db.users.length === 0,
    createdAt: new Date().toISOString(),
  }
  db.users.push(newUser)
  writeDB(db)
  return { ok: true, user: { id: newUser.id, username: newUser.username, admin: newUser.admin, createdAt: newUser.createdAt } }
}

export function loginUser({ username, password, rememberMe }) {
  const db = readDB()
  db.users = db.users || []
  const user = db.users.find(u => u.username === username)
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { error: 'Tai khoan hoac mat khau khong dung' }
  }
  const session = {
    id: generateUUID(),
    userId: user.id,
    username: user.username,
    createdAt: new Date().toISOString(),
  }
  db.sessions = db.sessions || []
  db.sessions.push(session)
  db.currentSession = session.id
  writeDB(db)
  if (rememberMe) {
    writeSettings({ savedUsername: username, savedPassword: password, rememberMe: true })
  } else {
    writeSettings({ savedUsername: '', savedPassword: '', rememberMe: false })
  }
  const token = signToken(session, user)
  return {
    ok: true,
    token,
    session,
    user: { id: user.id, username: user.username, admin: !!user.admin, createdAt: user.createdAt },
  }
}

export function logoutUser() {
  const db = readDB()
  db.currentSession = null
  writeDB(db)
  return { ok: true }
}

export function getSessionFromToken(token) {
  const payload = verifyToken(token)
  if (!payload) return null
  const db = readDB()
  const session = (db.sessions || []).find(s => s.id === payload.sid)
  const user = (db.users || []).find(u => u.id === payload.uid)
  if (!session || !user) return null
  return {
    ok: true,
    session,
    user: { id: user.id, username: user.username, admin: !!user.admin, createdAt: user.createdAt },
  }
}

export function hasUsers() {
  const db = readDB()
  return (db.users || []).length > 0
}
