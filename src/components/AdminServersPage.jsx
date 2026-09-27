import { useState, useEffect, useMemo } from 'react'
import {
  ServerStackIcon, MagnifyingGlassIcon, TrashIcon, ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline'
import { showToast } from '../lib/toast'

function AdminServersPage({ theme, lang, onSelectServer }) {
  const textColor = theme === 'light' ? '#111' : '#fff'
  const labelColor = theme === 'light' ? '#555' : 'rgba(255,255,255,0.6)'
  const [servers, setServers] = useState([])
  const [users, setUsers] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [confirmId, setConfirmId] = useState(null)

  const label = (vi, en) => (lang === 'vi' ? vi : en)

  const load = async () => {
    setLoading(true)
    try {
      const [s, u] = await Promise.all([
        window.electronAPI.getServerConfigs().catch(() => null),
        window.electronAPI.listUsers().catch(() => null),
      ])
      setServers(s?.servers || [])
      setUsers(u?.users || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const ownerName = (ownerId) => {
    const u = users.find(x => x.id === ownerId)
    return u ? u.username : '—'
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return servers
    return servers.filter(s =>
      String(s.name || '').toLowerCase().includes(q) ||
      String(s.game || '').toLowerCase().includes(q) ||
      String(s.egg || '').toLowerCase().includes(q) ||
      ownerName(s.ownerId).toLowerCase().includes(q) ||
      String(s.id || '').toLowerCase().startsWith(q)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servers, users, query])

  const handleDelete = async (id) => {
    setConfirmId(null)
    try {
      const r = await window.electronAPI.removeServerConfig(id)
      if (r?.error) { showToast(r.error, 'error'); return }
      showToast(label('Đã xóa server', 'Server deleted'), 'success')
      load()
    } catch {
      showToast(label('Xóa thất bại', 'Delete failed'), 'error')
    }
  }

  const inputStyle = {
    background: theme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
    border: `1px solid ${theme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
    color: textColor,
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <ServerStackIcon className="w-6 h-6" style={{ color: '#a78bfa' }} />
          <div>
            <h1 className="text-lg font-bold" style={{ color: textColor }}>{label('Tất cả server', 'All servers')}</h1>
            <p className="text-xs" style={{ color: labelColor }}>
              {label(`${servers.length} server trên panel`, `${servers.length} servers on the panel`)}
            </p>
          </div>
        </div>
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={label('Tìm theo tên, game, chủ sở hữu, ID…', 'Search by name, game, owner, ID…')}
            className="pl-9 pr-3 py-2 rounded-lg text-xs outline-none w-64"
            style={inputStyle}
          />
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: labelColor }} />
        </div>
      </div>

      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: theme === 'light' ? '#fff' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'}`,
        }}
      >
        <div
          className="grid grid-cols-12 gap-3 px-4 py-3 text-[11px] font-semibold uppercase"
          style={{
            background: theme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)',
            color: labelColor,
          }}
        >
          <div className="col-span-4">{label('Tên server', 'Server')}</div>
          <div className="col-span-3">{label('Game / Egg', 'Game / Egg')}</div>
          <div className="col-span-2">{label('Chủ sở hữu', 'Owner')}</div>
          <div className="col-span-1">{label('Port', 'Port')}</div>
          <div className="col-span-2 text-right">{label('Thao tác', 'Actions')}</div>
        </div>

        {loading && (
          <div className="px-4 py-8 text-center text-xs" style={{ color: labelColor }}>…</div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-xs" style={{ color: labelColor }}>
            {servers.length === 0
              ? label('Chưa có server nào.', 'No servers yet.')
              : label('Không tìm thấy server phù hợp.', 'No matching servers.')}
          </div>
        )}

        {!loading && filtered.map((s, i) => (
          <div
            key={s.id}
            className="grid grid-cols-12 gap-3 px-4 py-3 items-center text-xs"
            style={{
              borderTop: `1px solid ${theme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}`,
              background: i % 2 ? (theme === 'light' ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.015)') : 'transparent',
            }}
          >
            <div className="col-span-4 min-w-0">
              <div className="font-semibold truncate" style={{ color: textColor }}>{s.name}</div>
              <div className="text-[10px] font-mono truncate" style={{ color: labelColor }}>{String(s.id || '').slice(0, 8)}…</div>
            </div>
            <div className="col-span-3 min-w-0">
              <div className="truncate" style={{ color: textColor }}>{s.game || '—'}</div>
              {s.egg && s.egg !== s.game && <div className="text-[10px] truncate" style={{ color: labelColor }}>{s.egg}</div>}
            </div>
            <div className="col-span-2 min-w-0">
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-semibold truncate inline-block max-w-full"
                style={{ background: 'rgba(139,92,246,0.15)', color: '#c4b5fd' }}
              >
                {ownerName(s.ownerId)}
              </span>
            </div>
            <div className="col-span-1 font-mono" style={{ color: labelColor }}>{s.port || '—'}</div>
            <div className="col-span-2 flex items-center justify-end gap-1.5">
              <button
                onClick={() => onSelectServer?.(s.id)}
                className="p-1.5 rounded-lg transition-all hover:opacity-80"
                title={label('Mở server', 'Open server')}
                style={{ background: 'rgba(139,92,246,0.15)', color: '#c4b5fd' }}
              >
                <ArrowTopRightOnSquareIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setConfirmId(s.id)}
                className="p-1.5 rounded-lg transition-all hover:opacity-80"
                title={label('Xóa server', 'Delete server')}
                style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div
            className="w-full max-w-sm rounded-2xl p-5"
            style={{
              background: theme === 'light' ? '#fff' : '#141414',
              border: `1px solid ${theme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
            }}
          >
            <h3 className="text-sm font-bold mb-2" style={{ color: textColor }}>
              {label('Xóa server?', 'Delete server?')}
            </h3>
            <p className="text-xs mb-4" style={{ color: labelColor }}>
              {label(
                'Server sẽ bị xóa khỏi panel. Hành động này không hoàn tác.',
                'The server will be removed from the panel. This cannot be undone.'
              )}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmId(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: 'rgba(255,255,255,0.08)', color: textColor }}
              >
                {label('Hủy', 'Cancel')}
              </button>
              <button
                onClick={() => handleDelete(confirmId)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: '#ef4444', color: '#fff' }}
              >
                {label('Xóa', 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminServersPage
