import { useState, useEffect } from 'react'
import {
  ChartBarIcon, CpuChipIcon, ServerStackIcon, UsersIcon,
  KeyIcon, CircleStackIcon, ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline'

function fmtBytes(n) {
  if (!n && n !== 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
}

function Stat({ label, value, icon, theme, hint }) {
  const textColor = theme === 'light' ? '#111' : '#fff'
  const labelColor = theme === 'light' ? '#555' : 'rgba(255,255,255,0.6)'
  return (
    <div
      className="rounded-xl p-4 flex items-start justify-between gap-2"
      style={{
        background: theme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'}`,
      }}
    >
      <div className="min-w-0">
        <div className="text-[11px] mb-1" style={{ color: labelColor }}>{label}</div>
        <div className="text-lg font-bold truncate" style={{ color: textColor }}>{value}</div>
        {hint && <div className="text-[10px] mt-0.5 truncate" style={{ color: labelColor }}>{hint}</div>}
      </div>
      <span className="shrink-0" style={{ color: '#a78bfa' }}>{icon}</span>
    </div>
  )
}

function PanelCard({ title, icon, children, theme }) {
  const textColor = theme === 'light' ? '#111' : '#fff'
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: theme === 'light' ? '#fff' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'}`,
      }}
    >
      <div className="flex items-center gap-2.5 mb-4">
        <span style={{ color: '#a78bfa' }}>{icon}</span>
        <h2 className="text-sm font-bold" style={{ color: textColor }}>{title}</h2>
      </div>
      {children}
    </div>
  )
}

function ServiceRow({ name, installed, running, detail, lang, theme }) {
  const textColor = theme === 'light' ? '#111' : '#fff'
  const labelColor = theme === 'light' ? '#555' : 'rgba(255,255,255,0.6)'
  const color = !installed ? '#ef4444' : running ? '#22c55e' : '#eab308'
  const state = !installed
    ? (lang === 'vi' ? 'chưa cài' : 'not installed')
    : running ? (lang === 'vi' ? 'đang chạy' : 'running') : (lang === 'vi' ? 'chưa chạy' : 'stopped')
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
        <span className="text-xs font-semibold" style={{ color: textColor }}>{name}</span>
        <span className="text-[11px] truncate" style={{ color: labelColor }}>{detail}</span>
      </div>
      <span className="text-[11px] font-semibold shrink-0" style={{ color }}>{state}</span>
    </div>
  )
}

function AdminHomePage({ theme, lang, onNavigate }) {
  const [sys, setSys] = useState(null)
  const [counts, setCounts] = useState({ users: 0, servers: 0, keys: 0 })
  const [version, setVersion] = useState('')
  const [docker, setDocker] = useState(null)
  const [wings, setWings] = useState(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const r = await window.electronAPI.getSystemInfo()
        if (alive && r?.ok) setSys(r)
      } catch {}
      try {
        const [u, s, k, v] = await Promise.all([
          window.electronAPI.listUsers().catch(() => null),
          window.electronAPI.getServerConfigs().catch(() => null),
          window.electronAPI.listApiKeys().catch(() => null),
          window.electronAPI.getVersion().catch(() => null),
        ])
        if (!alive) return
        setCounts({
          users: (u?.users || []).length,
          servers: (s?.servers || []).length,
          keys: (k?.keys || []).length,
        })
        setVersion(typeof v === 'string' ? v : (v?.version || ''))
      } catch {}
      try {
        const [d, w] = await Promise.all([
          window.electronAPI.checkDocker().catch(() => null),
          window.electronAPI.getWingsStatus().catch(() => null),
        ])
        if (alive) { setDocker(d); setWings(w) }
      } catch {}
    }
    load()
    return () => { alive = false }
  }, [])

  const label = (vi, en) => (lang === 'vi' ? vi : en)
  const ramPct = sys?.ram ? Math.round(((sys.ram.total - sys.ram.free) / sys.ram.total) * 100) : null
  const diskPct = sys?.disk ? Math.round(((sys.disk.total - sys.disk.free) / sys.disk.total) * 100) : null

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      <div className="flex items-center gap-2.5">
        <ChartBarIcon className="w-6 h-6" style={{ color: '#a78bfa' }} />
        <div>
          <h1 className="text-lg font-bold" style={{ color: theme === 'light' ? '#111' : '#fff' }}>
            {label('Bảng điều khiển quản trị', 'Admin dashboard')}
          </h1>
          <p className="text-xs" style={{ color: theme === 'light' ? '#555' : 'rgba(255,255,255,0.6)' }}>
            {label('Tổng quan hệ thống', 'Instance overview')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <PanelCard title={label('Tổng quan hệ thống', 'System overview')} icon={<CpuChipIcon className="w-4 h-4" />} theme={theme}>
          <div className="space-y-2 text-xs" style={{ color: theme === 'light' ? '#333' : 'rgba(255,255,255,0.75)' }}>
            <div className="flex justify-between gap-3">
              <span style={{ color: theme === 'light' ? '#555' : 'rgba(255,255,255,0.6)' }}>CPU</span>
              <span className="text-right truncate">{sys ? `${sys.cpu.model} (${sys.cpu.cores})` : '…'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span style={{ color: theme === 'light' ? '#555' : 'rgba(255,255,255,0.6)' }}>RAM</span>
              <span className="text-right">{sys ? `${fmtBytes(sys.ram.total - sys.ram.free)} / ${fmtBytes(sys.ram.total)}${ramPct !== null ? ` (${ramPct}%)` : ''}` : '…'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span style={{ color: theme === 'light' ? '#555' : 'rgba(255,255,255,0.6)' }}>Disk</span>
              <span className="text-right">{sys ? `${fmtBytes(sys.disk.total - sys.disk.free)} / ${fmtBytes(sys.disk.total)}${diskPct !== null ? ` (${diskPct}%)` : ''}` : '…'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span style={{ color: theme === 'light' ? '#555' : 'rgba(255,255,255,0.6)' }}>{label('Nền tảng', 'Platform')}</span>
              <span className="text-right">{sys ? `${sys.platform}/${sys.arch}` : '…'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span style={{ color: theme === 'light' ? '#555' : 'rgba(255,255,255,0.6)' }}>{label('Phiên bản panel', 'Panel version')}</span>
              <span className="text-right">{version || '…'}</span>
            </div>
          </div>
        </PanelCard>

        <PanelCard title={label('Thống kê chung', 'General statistics')} icon={<ServerStackIcon className="w-4 h-4" />} theme={theme}>
          <div className="grid grid-cols-3 gap-3">
            <Stat label={label('Người dùng', 'Users')} value={counts.users} icon={<UsersIcon className="w-5 h-5" />} theme={theme} />
            <Stat label={label('Server', 'Servers')} value={counts.servers} icon={<ServerStackIcon className="w-5 h-5" />} theme={theme} />
            <Stat label="API keys" value={counts.keys} icon={<KeyIcon className="w-5 h-5" />} theme={theme} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => onNavigate?.('users')}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all hover:opacity-80"
              style={{ background: 'rgba(139,92,246,0.15)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.35)' }}
            >
              {label('Quản lý người dùng', 'Manage users')} <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onNavigate?.('servers-admin')}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all hover:opacity-80"
              style={{ background: 'rgba(139,92,246,0.15)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.35)' }}
            >
              {label('Tất cả server', 'All servers')} <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onNavigate?.('docker')}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all hover:opacity-80"
              style={{ background: 'rgba(139,92,246,0.15)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.35)' }}
            >
              {label('Quản lý node', 'Manage node')} <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </PanelCard>

        <PanelCard title={label('Trạng thái node', 'Node health')} icon={<CircleStackIcon className="w-4 h-4" />} theme={theme}>
          <ServiceRow
            name="Docker"
            installed={!!docker?.installed}
            running={!!docker?.running}
            detail={docker?.installed ? (docker.version || '').replace('Docker version ', '') : ''}
            lang={lang}
            theme={theme}
          />
          <ServiceRow
            name="Wings"
            installed={!!wings?.installed}
            running={!!wings?.running}
            detail={wings?.installed ? `v${wings.version || '?'}` : ''}
            lang={lang}
            theme={theme}
          />
          <p className="text-[11px] mt-3" style={{ color: theme === 'light' ? '#555' : 'rgba(255,255,255,0.6)' }}>
            {label('Chi tiết và điều khiển nằm trong trang Quản lý node.', 'Details and controls live on the Node page.')}
          </p>
        </PanelCard>
      </div>
    </div>
  )
}

export default AdminHomePage
