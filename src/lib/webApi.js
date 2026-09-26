/**
 * Web shim for window.electronAPI — same surface as desktop preload.cjs,
 * backed by HTTP /api/invoke + WebSocket /ws events.
 */
const TOKEN_KEY = 'terver_token'

function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || '' } catch { return '' }
}

function setToken(t) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {}
}

async function api(pathname, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(pathname, { ...options, headers })
  const ct = res.headers.get('content-type') || ''
  const body = ct.includes('application/json') ? await res.json() : await res.text()
  if (!res.ok && res.status === 401 && !pathname.startsWith('/api/auth/')) {
    // session expired — leave to app
  }
  return body
}

async function invoke(channel, ...args) {
  return api('/api/invoke', {
    method: 'POST',
    body: JSON.stringify({ channel, args }),
  })
}

// ---- WebSocket event bus ----
const listeners = new Map() // event -> Set<fn>
let ws = null
let wsRetry = 0

function emit(event, data) {
  const set = listeners.get(event)
  if (!set) return
  for (const fn of set) {
    try { fn(data) } catch {}
  }
}

function on(event, cb) {
  if (!listeners.has(event)) listeners.set(event, new Set())
  listeners.get(event).add(cb)
  return () => listeners.get(event)?.delete(cb)
}

function connectWs() {
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return
  try {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    ws = new WebSocket(`${proto}://${location.host}/ws`)
    ws.onopen = () => { wsRetry = 0 }
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg?.type) emit(msg.type, msg.data)
        // also fan out as electron-style event names
        if (msg?.type === 'server:log') emit('server:log', msg.data)
      } catch {}
    }
    ws.onclose = () => {
      ws = null
      const delay = Math.min(15000, 1000 * 2 ** Math.min(wsRetry++, 4))
      setTimeout(connectWs, delay)
    }
    ws.onerror = () => { try { ws?.close() } catch {} }
  } catch {}
}

const webApi = {
  // window chrome — no-ops
  minimizeWindow: () => {},
  maximizeWindow: () => {},
  closeWindow: () => {},
  quitApp: () => { try { window.close() } catch {} },

  getVersion: () => invoke('app:version'),
  getPlatform: () => invoke('app:platform'),
  clipboardWrite: (text) => invoke('clipboard:write', text),
  openExternal: (url) => invoke('app:openExternal', url),

  getSettings: () => invoke('settings:get'),
  saveSettings: (patch) => invoke('settings:save', patch),
  openFolderPicker: (defaultPath) => invoke('dialog:openFolder', defaultPath),

  // auth — special-cased to store token
  register: async (username, password) => {
    const r = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) })
    return r
  },
  login: async (username, password, rememberMe) => {
    const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password, rememberMe }) })
    if (r?.ok && r.token) setToken(r.token)
    return r
  },
  logout: async () => {
    const r = await api('/api/auth/logout', { method: 'POST', body: '{}' })
    setToken('')
    return r
  },
  getSession: async () => {
    if (!getToken()) return null
    return api('/api/auth/session')
  },

  // user management (admin panel)
  listUsers: () => invoke('users:list'),
  createUser: (username, password) => invoke('users:create', { username, password }),
  deleteUser: (id) => invoke('users:delete', id),
  setUserAdmin: (id, admin) => invoke('users:setAdmin', id, admin),

  // rest — 1:1 with preload
  checkDocker: () => invoke('docker:check'),
  installDocker: () => invoke('docker:install'),
  getDockerConfig: () => invoke('docker:config:get'),
  saveDockerConfig: (config) => invoke('docker:config:save', config),
  startServer: (opts) => invoke('docker:startServer', opts),
  stopServer: (name) => invoke('docker:stopServer', name),
  listServers: () => invoke('docker:listServers'),
  getServerLogs: (name) => invoke('docker:getServerLogs', name),

  getServerConfigs: () => invoke('server:getConfigs'),
  getServerConfig: (serverId) => invoke('server:getConfig', serverId),
  addServerConfig: (config) => invoke('server:addConfig', config),
  removeServerConfig: (id) => invoke('server:removeConfig', id),

  getMcVersions: () => invoke('mc:getVersions'),
  getMcChangelog: (version) => invoke('mc:getChangelog', version),
  getModpacks: () => invoke('mc:getModpacks'),
  getSystemInfo: () => invoke('system:getInfo'),
  listEggs: () => invoke('eggs:list'),
  getEgg: (eggId) => invoke('eggs:get', eggId),

  getDockerStatus: () => invoke('stats:docker'),
  getDatabaseStatus: () => invoke('stats:database'),
  loadNodeConfigs: () => invoke('node:loadConfigs'),
  getPing: () => invoke('stats:ping'),
  getNetworkStats: () => invoke('stats:network'),
  getServerNetworkStats: (serverId) => invoke('stats:serverNetwork', serverId),

  getWingsStatus: () => invoke('wings:status'),
  installWings: () => invoke('wings:install'),
  startWings: () => invoke('wings:start'),
  stopWings: () => invoke('wings:stop'),
  startDocker: () => invoke('docker:start'),
  stopDocker: () => invoke('docker:stop'),
  startCloudflared: () => invoke('cloudflared:start'),
  stopCloudflared: () => invoke('cloudflared:stop'),
  systemdStatus: (serviceName) => invoke('systemd:status', serviceName),
  systemdStart: (serviceName) => invoke('systemd:start', serviceName),
  systemdStop: (serviceName) => invoke('systemd:stop', serviceName),
  systemdLogs: (serviceName, lines) => invoke('systemd:logs', serviceName, lines),
  generateWingsConfig: () => invoke('wings:config:generate'),

  checkCloudflared: () => invoke('cloudflare:check'),
  installCloudflared: (arch) => invoke('cloudflare:install', arch),
  createTunnel: (tunnelName, appDomain) => invoke('cloudflare:tunnel:create', tunnelName, appDomain),
  installTunnelService: (token) => invoke('cloudflare:tunnel:install-service', token),
  cloudflaredLogin: () => invoke('cloudflare:tunnel:login'),
  cloudflaredCheckAuth: () => invoke('cloudflare:tunnel:check-auth'),

  systemAuth: (password) => invoke('system:auth', password),
  systemCheckAuth: () => invoke('system:checkAuth'),
  systemCleanup: (type) => invoke('system:cleanup', type),
  databaseSetup: (dbName, dbUser, dbPass) => invoke('database:setup', dbName, dbUser, dbPass),
  installDatabase: () => invoke('database:install'),

  wingsServerState: (uuid) => invoke('wings:server:state', uuid),
  wingsServerPower: (uuid, action) => invoke('wings:server:power', uuid, action),
  wingsServerCommand: (uuid, command) => invoke('wings:server:command', uuid, command),
  wingsServerLogs: (uuid, lines) => invoke('wings:server:logs', uuid, lines),
  wingsListFiles: (uuid, dir) => invoke('wings:server:files', uuid, dir),
  wingsReadFile: (uuid, path) => invoke('wings:server:readFile', uuid, path),
  wingsWriteFile: (uuid, path, content) => invoke('wings:server:writeFile', uuid, path, content),
  wingsDeleteFile: (uuid, path) => invoke('wings:server:deleteFile', uuid, path),
  wingsCreateFile: (uuid, dir, name) => invoke('wings:server:createFile', uuid, dir, name),
  wingsCreateFolder: (uuid, dir, name) => invoke('wings:server:createFolder', uuid, dir, name),
  wingsUploadFile: (uuid, path, data) => invoke('wings:server:uploadFile', uuid, path, data),
  wingsMoveFile: (uuid, from, to) => invoke('wings:server:moveFile', uuid, from, to),
  wingsSyncConfig: (uuid, config) => invoke('wings:server:sync', uuid, config),
  wingsReinstall: (uuid) => invoke('wings:server:reinstall', uuid),
  wingsDeleteServer: (uuid) => invoke('wings:server:delete', uuid),
  wingsCreateServer: (uuid) => invoke('wings:server:create', uuid),
  wingsListServers: () => invoke('wings:servers:list'),

  backupList: (serverId) => invoke('backup:list', serverId),
  backupCreate: (serverId, opts) => invoke('backup:create', serverId, opts),
  backupUpdate: (serverId, backupId, patch) => invoke('backup:update', serverId, backupId, patch),
  backupDelete: (serverId, backupId) => invoke('backup:delete', serverId, backupId),
  backupRestore: (serverId, backupId, opts) => invoke('backup:restore', serverId, backupId, opts),
  backupDownload: (serverId, backupId) => invoke('backup:download', serverId, backupId),

  scheduleList: (serverId) => invoke('schedule:list', serverId),
  scheduleCreate: (serverId, data) => invoke('schedule:create', serverId, data),
  scheduleUpdate: (scheduleId, data) => invoke('schedule:update', scheduleId, data),
  scheduleDelete: (scheduleId) => invoke('schedule:delete', scheduleId),
  scheduleToggle: (scheduleId, isActive) => invoke('schedule:toggle', scheduleId, isActive),
  scheduleRun: (scheduleId) => invoke('schedule:run', scheduleId),
  schedulePreview: (cron) => invoke('schedule:preview', cron),

  installServer: (serverId) => invoke('server:install', serverId),
  startGameServer: (serverId) => invoke('server:start', serverId),
  stopGameServer: (serverId) => invoke('server:stop', serverId),
  killGameServer: (serverId) => invoke('server:kill', serverId),
  getServerStatus: (serverId) => invoke('server:status', serverId),
  getServerHistory: (serverId) => invoke('server:history', serverId),
  getServerTps: (serverId) => invoke('server:tps', serverId),
  serverGetLogs: (serverId) => invoke('server:getLogs', serverId),

  wingsWsConnect: (serverId) => invoke('wings:ws-connect', serverId),
  wingsWsDisconnect: (serverId) => invoke('wings:ws-disconnect', serverId),
  wingsWsSend: (serverId, event, args) => invoke('wings:ws-send', serverId, event, args),
  wingsWsStatus: (serverId) => invoke('wings:ws-status', serverId),

  // event subscriptions (electron-style)
  onInstallProgress: (cb) => on('install:progress', cb),
  onServerProgress: (cb) => on('server:progress', cb),
  onServerLog: (cb) => on('server:log', cb),
  onServerLogSnapshot: (cb) => on('server:log-snapshot', cb),
  onServerLogReset: (cb) => on('server:log-reset', cb),
  onServerBootLine: (cb) => on('server:boot-line', cb),
  onServerTps: (cb) => on('server:tps', cb),
  onBackupUpdate: (cb) => on('backup:update', cb),
  onScheduleUpdate: (cb) => on('schedule:update', cb),
  onScheduleDeleted: (cb) => on('schedule:deleted', cb),
  onScheduleRan: (cb) => on('schedule:ran', cb),
  onWingsWsEvent: (cb) => on('wings:ws-event', cb),
}

export function installWebApi() {
  if (typeof window === 'undefined') return webApi
  // force advanced mode flag for App.jsx
  try { localStorage.setItem('terver_appMode', 'advanced') } catch {}
  window.electronAPI = webApi
  window.__TERVER_WEB__ = true
  connectWs()
  return webApi
}

export default webApi
export { getToken, setToken, invoke, api }

// Auto-install on import so modules that check window.electronAPI at
// top-level (TitleBar, AppContext, etc.) see the shim immediately.
if (typeof window !== 'undefined') installWebApi()
