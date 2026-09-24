import os from 'os'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import https from 'https'
import { readSettings, writeSettings, listServerConfigs, getServerByUuid, updateServerConfig, generateUUID, EGGS_DIR, addServerConfig, removeServerConfig } from './db.js'
import { registerUser, loginUser, logoutUser, getSessionFromToken } from './auth.js'
import {
  getRemoteServers, powerServer, getStatus, getServerState,
  listWingsFiles, readWingsFile, writeWingsFile, deleteWingsPath,
  createWingsFolder, renameWingsPath, sendWingsCommand, getWingsLogs,
  reinstallServer, deleteServerRemote, createServerRemote, syncServerConfig,
} from './wings.js'
import { readDB } from './db.js'

function execOut(cmd, timeout = 5000) {
  try {
    return execSync(cmd, { timeout, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
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
      const r = execSync(`echo ${JSON.stringify(password)} | sudo -S -v`, { timeout: 8000, encoding: 'utf8' })
      return { ok: true, user, out: r }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  },
  'system:checkAuth': async () => ({ ok: true }),
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
  'server:getConfigs': async () => ({ ok: true, servers: listServerConfigs() }),
  'server:getConfig': async (serverId) => {
    const server = getServerByUuid(serverId)
    if (!server) return { ok: false, error: 'Not found' }
    return { ok: true, server }
  },
  'server:addConfig': async (config) => {
    const server = { id: generateUUID(), ...config, createdAt: new Date().toISOString() }
    addServerConfig(server)
    return { ok: true, server }
  },
  'server:removeConfig': async (id) => {
    removeServerConfig(id)
    try { await deleteServerRemote(id) } catch {}
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
  'server:install': async (serverId) => {
    updateServerConfig(serverId, { status: 'installing' })
    try {
      await createServerRemote(serverId)
      await syncServerConfig(serverId)
      return { ok: true }
    } catch (err) {
      updateServerConfig(serverId, { status: 'error', installError: err.message })
      return { ok: false, error: err.message }
    }
  },
  'server:getLogs': async (serverId) => getWingsLogs(serverId, 500),

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
        const s = execOut('systemctl is-active docker 2>/dev/null')
        running = s === 'active'
        containers = parseInt(execOut('docker ps -q 2>/dev/null | wc -l')) || 0
      } catch {}
      return { ok: true, installed, version, composeVersion, running, containers, usingSystem: true }
    } catch {
      return { ok: true, installed: false, version: '', composeVersion: '', running: false, containers: 0 }
    }
  },
  'docker:install': async () => ({ ok: false, error: 'Use system package manager or get.docker.com on the host' }),
  'docker:start': async () => {
    try { execOut('sudo systemctl start docker', 15000); return { ok: true } }
    catch (err) { return { ok: false, error: String(err) } }
  },
  'docker:stop': async () => {
    try { execOut('sudo systemctl stop docker', 15000); return { ok: true } }
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
      const sysBin = execOut('which wings 2>/dev/null')
      if (sysBin && fs.existsSync(sysBin)) { binaryPath = sysBin; installed = true }
    } catch {}
    let running = false
    let version = ''
    if (installed) {
      try {
        const out = execOut(`${binaryPath} --version 2>&1 || true`)
        const match = out.match(/(\d+\.\d+\.\d+)/)
        if (match) version = match[1]
      } catch {}
      try {
        const status = execOut('systemctl is-active wings 2>/dev/null || systemctl is-active pterodactyl-wings 2>/dev/null || systemctl is-active lunarspace-wings 2>/dev/null')
        running = status === 'active'
      } catch {}
    }
    let hasConfig = false
    try { hasConfig = fs.existsSync('/etc/pterodactyl/config.yml') || fs.existsSync(path.join(os.homedir(), '.config', 'terver-panel', 'wings-config.yml')) } catch {}
    return { ok: true, installed, running, version, arch: '', hasConfig, hasService: running, binaryPath, configPath: '' }
  },
  'wings:install': async () => ({ ok: false, error: 'Install Wings on the host — see docs. Panel expects Wings on :8080' }),
  'wings:start': async () => {
    try {
      execOut('sudo systemctl start wings || sudo systemctl start pterodactyl-wings || sudo systemctl start lunarspace-wings', 15000)
      return { ok: true }
    } catch (err) { return { ok: false, error: String(err) } }
  },
  'wings:stop': async () => {
    try {
      execOut('sudo systemctl stop wings || sudo systemctl stop pterodactyl-wings || sudo systemctl stop lunarspace-wings', 15000)
      return { ok: true }
    } catch (err) { return { ok: false, error: String(err) } }
  },
  'wings:config:generate': async () => ({ ok: false, error: 'Generate config on host Wings install' }),
  'wings:servers:list': async () => ({ ok: true, servers: getRemoteServers() }),
  'wings:server:state': async (uuid) => getServerState(uuid),
  'wings:server:power': async (uuid, action) => powerServer(uuid, action),
  'wings:server:command': async (uuid, command) => sendWingsCommand(uuid, command),
  'wings:server:logs': async (uuid, lines) => getWingsLogs(uuid, lines || 200),
  'wings:server:files': async (uuid, dirPath) => listWingsFiles(uuid, dirPath || '/'),
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
  'wings:ws-send': async () => ({ ok: true }),
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
    return await fn(...args, ctx)
  } catch (err) {
    return { error: err?.message || String(err) }
  }
}
