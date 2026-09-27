import { useState, useEffect, useCallback } from 'react'
import { Key, Copy, Trash, Plus, ArrowsClockwise, ShieldCheck, User } from '@phosphor-icons/react'

function ApiKeysPage({ theme, lang, currentUser }) {
  const textColor = theme === 'light' ? '#111' : '#fff'
  const labelColor = theme === 'light' ? '#555' : 'rgba(255,255,255,0.6)'
  const bg = theme === 'light' ? '#f5f5f5' : '#0a0a0a'
  const cardBg = theme === 'light' ? '#fff' : '#1a1a1a'
  const cardBorder = theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'
  const inputBg = theme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'
  const inputBorder = theme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'

  const isVi = lang === 'vi'
  const [keys, setKeys] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ name: '', scope: 'admin', userId: currentUser?.id || '' })
  const [newKey, setNewKey] = useState(null) // shown once after creation

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [kr, ur] = await Promise.all([
        window.electronAPI.listApiKeys(),
        window.electronAPI.listUsers(),
      ])
      if (kr?.ok) setKeys(kr.keys || [])
      else setError(kr?.error || (isVi ? 'Không tải được danh sách key' : 'Failed to load keys'))
      if (ur?.ok) setUsers(ur.users || [])
    } catch {
      setError(isVi ? 'Không tải được danh sách key' : 'Failed to load keys')
    } finally {
      setLoading(false)
    }
  }, [isVi, currentUser])

  useEffect(() => { load() }, [load])

  const flash = (msg, isError = false) => {
    if (isError) { setError(msg); setNotice('') } else { setNotice(msg); setError('') }
    setTimeout(() => { setError(''); setNotice('') }, 4000)
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    if (form.scope === 'user' && !form.userId) {
      flash(isVi ? 'Chọn người dùng' : 'Pick a user', true)
      return
    }
    setBusy(true)
    try {
      const res = await window.electronAPI.createApiKey(form.name.trim(), form.scope, form.userId)
      if (res?.error) flash(res.error, true)
      else {
        setNewKey(res.key)
        setForm({ ...form, name: '' })
        await load()
      }
    } catch {
      flash(isVi ? 'Tạo key thất bại' : 'Failed to create key', true)
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (k) => {
    if (!window.confirm(isVi ? `Xóa API key "${k.name}"?` : `Delete API key "${k.name}"?`)) return
    setBusy(true)
    try {
      const res = await window.electronAPI.deleteApiKey(k.id)
      if (res?.error) flash(res.error, true)
      else {
        flash(isVi ? `Đã xóa "${k.name}"` : `Deleted "${k.name}"`)
        await load()
      }
    } catch {
      flash(isVi ? 'Xóa thất bại' : 'Delete failed', true)
    } finally {
      setBusy(false)
    }
  }

  const copyKey = (value) => {
    navigator.clipboard?.writeText(value)
    flash(isVi ? 'Đã sao chép' : 'Copied')
  }

  return (
    <div className="h-full overflow-auto p-6" style={{ background: bg }}>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2" style={{ color: textColor }}>
            <Key size={22} weight="duotone" style={{ color: '#a78bfa' }} />
            {isVi ? 'API Keys' : 'API Keys'}
          </h2>
          <p className="text-sm mt-1" style={{ color: labelColor }}>
            {isVi
              ? 'Kết nối phần mềm ngoài qua REST API: gửi header Authorization: Bearer tpk_… tới /api/application/* (danh sách server, users, power, logs, system…).'
              : 'Connect external software via REST API: send Authorization: Bearer tpk_… to /api/application/* (servers, users, power, logs, system…).'}
          </p>
        </div>

        {(error || notice) && (
          <div
            className="p-3 rounded-lg text-sm"
            style={{
              background: error ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
              border: `1px solid ${error ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
              color: error ? '#f87171' : '#22c55e',
            }}
          >
            {error || notice}
          </div>
        )}

        {newKey && (
          <div className="rounded-2xl p-4 space-y-2" style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.35)' }}>
            <p className="text-sm font-semibold" style={{ color: '#a78bfa' }}>
              {isVi ? 'Key mới — chỉ hiển thị một lần!' : 'New key — shown only once!'}
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs px-3 py-2 rounded-lg break-all" style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}>
                {newKey}
              </code>
              <button onClick={() => copyKey(newKey)} className="p-2 rounded-lg" style={{ color: '#a78bfa' }} title={isVi ? 'Sao chép' : 'Copy'}>
                <Copy size={16} weight="duotone" />
              </button>
              <button onClick={() => setNewKey(null)} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: '#a78bfa', color: '#fff' }}>
                {isVi ? 'Đã lưu' : 'Done'}
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleCreate} className="rounded-2xl p-5 space-y-4" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
          <p className="text-sm font-semibold" style={{ color: textColor }}>{isVi ? 'Tạo API key mới' : 'Create API key'}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={isVi ? 'Tên key (vd: desktop-app)' : 'Key name (e.g. desktop-app)'}
              required
              className="px-4 py-2.5 rounded-lg text-sm outline-none"
              style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
            />
            <select
              value={form.scope}
              onChange={(e) => setForm({ ...form, scope: e.target.value })}
              className="px-4 py-2.5 rounded-lg text-sm outline-none"
              style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
            >
              <option value="admin" style={{ color: '#111' }}>{isVi ? 'Toàn quyền (admin)' : 'Full access (admin)'}</option>
              <option value="user" style={{ color: '#111' }}>{isVi ? 'Giới hạn theo người dùng' : 'Limited to one user'}</option>
            </select>
            {form.scope === 'user' && (
              <select
                value={form.userId}
                onChange={(e) => setForm({ ...form, userId: e.target.value })}
                className="px-4 py-2.5 rounded-lg text-sm outline-none sm:col-span-2"
                style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
              >
                {users.map(u => (
                  <option key={u.id} value={u.id} style={{ color: '#111' }}>
                    {u.username}{u.admin ? (isVi ? ' (quản trị)' : ' (admin)') : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
          <button
            type="submit"
            disabled={busy}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 transition-opacity disabled:opacity-50"
            style={{ background: '#a78bfa', color: '#fff' }}
          >
            <Plus size={16} weight="duotone" />
            {isVi ? 'Tạo key' : 'Create key'}
          </button>
        </form>

        <div className="rounded-2xl overflow-hidden" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
          <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${cardBorder}` }}>
            <p className="text-sm font-semibold" style={{ color: textColor }}>{isVi ? `Danh sách (${keys.length})` : `All keys (${keys.length})`}</p>
            <button onClick={load} className="flex items-center gap-1.5 text-xs" style={{ color: labelColor }}>
              <ArrowsClockwise size={14} weight="duotone" />
              {isVi ? 'Tải lại' : 'Refresh'}
            </button>
          </div>

          {loading ? (
            <p className="px-5 py-8 text-sm text-center" style={{ color: labelColor }}>{isVi ? 'Đang tải…' : 'Loading…'}</p>
          ) : keys.length === 0 ? (
            <p className="px-5 py-8 text-sm text-center" style={{ color: labelColor }}>{isVi ? 'Chưa có API key nào' : 'No API keys yet'}</p>
          ) : (
            keys.map((k, i) => (
              <div
                key={k.id}
                className="flex items-center gap-3 px-5 py-3"
                style={{ borderTop: i === 0 ? 'none' : `1px solid ${cardBorder}` }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: k.admin ? 'rgba(167,139,250,0.2)' : 'rgba(59,130,246,0.15)' }}
                >
                  <Key size={16} weight="duotone" style={{ color: k.admin ? '#a78bfa' : '#3b82f6' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: textColor }}>{k.name}</p>
                  <p className="text-[11px] font-mono truncate" style={{ color: labelColor }}>
                    {k.keyPrefix ? `${k.keyPrefix}…` : ''}
                    {k.lastUsedAt ? ` · ${isVi ? 'dùng lần cuối' : 'last used'} ${new Date(k.lastUsedAt).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US')}` : ` · ${isVi ? 'chưa dùng' : 'unused'}`}
                  </p>
                </div>

                <span
                  className="text-[11px] font-semibold px-2 py-1 rounded-full flex items-center gap-1 shrink-0"
                  style={k.admin
                    ? { background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }
                    : { background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}
                >
                  {k.admin ? <ShieldCheck size={12} weight="duotone" /> : <User size={12} weight="duotone" />}
                  {k.admin
                    ? (isVi ? 'Toàn quyền' : 'Admin')
                    : (users.find(u => u.id === k.userId)?.username || (isVi ? 'theo user' : 'per user'))}
                </span>

                <button
                  onClick={() => handleDelete(k)}
                  disabled={busy}
                  className="p-1.5 rounded-lg transition-colors disabled:opacity-50 shrink-0"
                  style={{ color: '#f87171' }}
                  title={isVi ? 'Xóa' : 'Delete'}
                >
                  <Trash size={16} weight="duotone" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default ApiKeysPage
