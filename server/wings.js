import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { readDB, updateServerConfig, getServerByUuid, EGGS_DIR } from './db.js'

const WINGS_BASE = process.env.WINGS_API_URL || 'http://127.0.0.1:8080'
const TOKEN_STORE = path.join(os.homedir(), '.config', 'terver-panel', 'wings-api-token.json')

let wingsApiTokenId = '1'
let wingsApiToken = ''

function loadToken() {
  try {
    if (fs.existsSync(TOKEN_STORE)) {
      const stored = JSON.parse(fs.readFileSync(TOKEN_STORE, 'utf8'))
      wingsApiTokenId = stored.tokenId || '1'
      wingsApiToken = stored.token || ''
    }
  } catch {}
  if (!wingsApiToken) {
    wingsApiToken = crypto.randomBytes(32).toString('hex')
    try {
      fs.mkdirSync(path.dirname(TOKEN_STORE), { recursive: true })
      fs.writeFileSync(TOKEN_STORE, JSON.stringify({ tokenId: wingsApiTokenId, token: wingsApiToken }), { mode: 0o600 })
    } catch {}
  }
}
loadToken()

export function getWingsRemoteToken() {
  return { id: wingsApiTokenId, token: wingsApiToken }
}

export async function wingsApiCall(method, endpoint, body) {
  const url = `${WINGS_BASE}${endpoint}`
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${wingsApiTokenId}.${wingsApiToken}`,
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Wings ${method} ${endpoint} → ${res.status} ${text}`)
  }
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return res.json()
  return res.text()
}

export function resolveDockerImage(server) {
  const dockerImage = server.dockerImage || ''
  if (!dockerImage) return 'ghcr.io/pelican-eggs/yolks:java_21'
  if (dockerImage.includes('/') && dockerImage.includes(':')) return dockerImage
  try {
    const eggId = server.eggId || ''
    if (eggId && fs.existsSync(EGGS_DIR)) {
      const parts = eggId.split('/')
      const eggPath = path.join(EGGS_DIR, parts[0], parts[1] + '.json')
      if (fs.existsSync(eggPath)) {
        const egg = JSON.parse(fs.readFileSync(eggPath, 'utf8'))
        const dockerImages = egg.docker_images || {}
        if (dockerImages[dockerImage]) return dockerImages[dockerImage]
        const m = dockerImage.match(/(\d+)/)
        if (m) return `ghcr.io/pelican-eggs/yolks:java_${m[1]}`
      }
    }
  } catch {}
  const m = dockerImage.match(/(\d+)/)
  if (m && !dockerImage.includes('/')) return `ghcr.io/pelican-eggs/yolks:java_${m[1]}`
  if (dockerImage.includes(':') || dockerImage.includes('/')) return dockerImage
  return 'ghcr.io/pelican-eggs/yolks:java_21'
}

function getSchedules(serverUuid) {
  const db = readDB()
  return (db.schedules || []).filter(s => !serverUuid || s.serverId === serverUuid)
}

export function getRemoteServers() {
  const db = readDB()
  return (db.servers || []).map(s => {
    const res = s.resources || {}
    const env = s.config || {}
    const startupCmd = s.startup || 'java -Xms128M -jar {{SERVER_JARFILE}} nogui'
    const jarFile = env.SERVER_JARFILE || 'server.jar'
    let resolvedStartup = startupCmd.replace(/\{\{SERVER_JARFILE\}\}/g, jarFile)
    resolvedStartup = resolvedStartup.replace(/\{\{SERVER_MEMORY\}\}/g, String(res.memory || 1024))
    const memFlag = `-Xms128M -Xmx${res.memory || 1024}M`
    let finalStartup = resolvedStartup.replace(/-Xms\d+M -Xmx\d+M/, memFlag)
    if (/\bjava\b/.test(finalStartup) && /-jar\b/.test(finalStartup) && !/\bnogui\b/.test(finalStartup)) {
      finalStartup = `${finalStartup} nogui`
    }
    return {
      settings: {
        uuid: s.id,
        start_on_completion: false,
        meta: { name: s.name, description: s.name, startup_command: finalStartup, egg: { id: '00000000-0000-0000-0000-000000000001' } },
        suspended: false,
        invocation: finalStartup,
        skip_egg_scripts: false,
        entrypoint: null,
        environment: env,
        labels: {},
        backups: (db.backups || []).filter(b => b.serverId === s.id).map(b => ({
          id: b.uuid, name: b.name, completed_at: b.completed,
          successful: !!b.isSuccessful, size: b.bytes || 0, created_at: b.created,
        })),
        schedules: getSchedules(s.id).map(sch => ({
          id: sch.id,
          name: sch.name,
          cron: sch.cron,
          is_active: !!sch.isActive,
          is_processing: !!sch.isProcessing,
          last_run_at: sch.lastRunAt,
          next_run_at: sch.nextRunAt,
        })),
        allocations: { force_outgoing_ip: false, default: { ip: '0.0.0.0', port: s.port || 25565 }, mappings: {} },
        build: {
          memory_limit: res.memory || 1024,
          overhead_memory: 0,
          swap: 0,
          io_weight: null,
          cpu_limit: res.cpuPercent || 100,
          disk_space: res.disk || 10240,
          threads: res.cpuCores ? String(res.cpuCores) : null,
          oom_disabled: false,
        },
        mounts: [],
        firewall: [],
        egg: { id: '00000000-0000-0000-0000-000000000001', file_denylist: [] },
        container: {
          image: resolveDockerImage(s),
          timezone: null,
          hugepages_passthrough_enabled: false,
          kvm_passthrough_enabled: false,
          seccomp: { remove_allowed: [] },
        },
        auto_kill: { enabled: false, seconds: 0 },
        auto_start_behavior: 'never',
        features: { startup_cpu_boost: null, runtime_cpu_boost: null },
      },
      process_configuration: {
        startup: { done: [s.donePattern || ')! For help, type'], strip_ansi: false },
        stop: { type: 'tag', value: s.stopCommand || 'stop' },
        configs: [],
      },
    }
  })
}

export async function powerServer(uuid, action) {
  const server = getServerByUuid(uuid)
  if (!server) return { ok: false, error: 'Server not found' }
  try {
    const data = await wingsApiCall('POST', `/api/servers/${uuid}/power`, { action, wait_seconds: 0 })
    if (action === 'start' || action === 'restart') {
      updateServerConfig(uuid, { status: 'starting' })
      appendHistory(uuid, action === 'restart' ? 'restart' : 'start')
    } else if (action === 'stop') {
      updateServerConfig(uuid, { status: 'stopping' })
      appendHistory(uuid, 'stop')
    } else if (action === 'kill') {
      updateServerConfig(uuid, { status: 'stopping' })
      appendHistory(uuid, 'kill')
    }
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

function appendHistory(uuid, action) {
  try {
    const server = getServerByUuid(uuid)
    if (!server) return
    const history = Array.isArray(server.history) ? server.history : []
    const now = Date.now()
    const last = history[0]
    if (last && last.action === action && now - (last.at || 0) < 3000) return
    history.unshift({ action, at: now })
    updateServerConfig(uuid, { history: history.slice(0, 50) })
  } catch {}
}

export async function getServerState(uuid) {
  try {
    const data = await wingsApiCall('GET', `/api/servers/${uuid}`)
    return { ok: true, state: data?.state || data?.configuration?.state || 'stopped', raw: data }
  } catch {
    return { ok: false, state: 'offline' }
  }
}

export async function getStatus(uuid) {
  const server = getServerByUuid(uuid)
  if (!server) return { ok: false, error: 'Server not found' }
  try {
    const data = await wingsApiCall('GET', `/api/servers/${uuid}`)
    const state = data?.state || 'offline'
    const util = data?.utilization || {}
    const isRunning = state === 'running'
    const prev = server.status
    let nextStatus = isRunning ? 'running'
      : (state === 'starting' || state === 'stopping') ? state
      : (state === 'offline' || state === 'stopped') ? 'stopped'
      : state
    if (prev === 'stopping' && isRunning) nextStatus = 'stopping'
    updateServerConfig(uuid, { status: nextStatus, resources_usage: util })
    return { ok: true, status: nextStatus, state, resources: util, tps: server.lastTps ?? null }
  } catch {
    return { ok: true, status: 'stopped', resources: {}, tps: null }
  }
}

export async function listWingsFiles(uuid, dirPath) {
  const url = `${WINGS_BASE}/api/servers/${uuid}/files/list?directory=${encodeURIComponent(dirPath || '/')}&per_page=500&page=1`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${wingsApiTokenId}.${wingsApiToken}` },
  })
  if (!res.ok) throw new Error(`files/list ${res.status}`)
  return res.json()
}

export async function readWingsFile(uuid, filePath) {
  const url = `${WINGS_BASE}/api/servers/${uuid}/files/contents?file=${encodeURIComponent(filePath)}&download=false`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${wingsApiTokenId}.${wingsApiToken}` },
  })
  if (!res.ok) throw new Error(`files/contents ${res.status}`)
  return res.text()
}

export async function writeWingsFile(uuid, filePath, content) {
  const url = `${WINGS_BASE}/api/servers/${uuid}/files/write?file=${encodeURIComponent(filePath)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${wingsApiTokenId}.${wingsApiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content, encoding: 'utf-8' }),
  })
  if (!res.ok) throw new Error(`files/write ${res.status}`)
  return res.json().catch(() => ({ success: true }))
}

export async function deleteWingsPath(uuid, targetPath) {
  const url = `${WINGS_BASE}/api/servers/${uuid}/files/delete`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${wingsApiTokenId}.${wingsApiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ files: [targetPath] }),
  })
  if (!res.ok) throw new Error(`files/delete ${res.status}`)
  return res.json().catch(() => ({ success: true }))
}

export async function createWingsFolder(uuid, dirPath, name) {
  const rel = path.posix.join(dirPath || '/', name)
  const url = `${WINGS_BASE}/api/servers/${uuid}/files/create-folder?file=${encodeURIComponent(rel)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${wingsApiTokenId}.${wingsApiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error(`files/create-folder ${res.status}`)
  return res.json().catch(() => ({ success: true }))
}

export async function renameWingsPath(uuid, from, to) {
  const url = `${WINGS_BASE}/api/servers/${uuid}/files/rename`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${wingsApiTokenId}.${wingsApiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to }),
  })
  if (!res.ok) throw new Error(`files/rename ${res.status}`)
  return res.json().catch(() => ({ success: true }))
}

export async function sendWingsCommand(uuid, command) {
  const data = await wingsApiCall('POST', `/api/servers/${uuid}/command`, { command })
  return { ok: true, data }
}

export async function getWingsLogs(uuid, lines = 200) {
  const url = `${WINGS_BASE}/api/servers/${uuid}/logs?lines=${lines}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${wingsApiTokenId}.${wingsApiToken}` },
  })
  if (!res.ok) throw new Error(`logs ${res.status}`)
  return res.json()
}

export async function reinstallServer(uuid) {
  try {
    const data = await wingsApiCall('POST', `/api/servers/${uuid}/reinstall`, {})
    updateServerConfig(uuid, { status: 'installing' })
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

export async function deleteServerRemote(uuid) {
  try {
    const data = await wingsApiCall('DELETE', `/api/servers/${uuid}`)
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

export async function createServerRemote(uuid) {
  try {
    const data = await wingsApiCall('POST', `/api/servers/${uuid}/create`, {})
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

export async function syncServerConfig(uuid) {
  try {
    const servers = getRemoteServers()
    const cfg = servers.find(s => s.settings.uuid === uuid)
    if (!cfg) return { ok: false, error: 'not found' }
    const data = await wingsApiCall('POST', `/api/servers/${uuid}/sync`, cfg)
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}
