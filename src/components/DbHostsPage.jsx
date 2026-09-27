import { useState, useEffect, useCallback } from 'react'
import { Database, Plus, Trash, PencilSimple, ArrowsClockwise } from '@phosphor-icons/react'

function DbHostsPage({ theme, lang }) {
  const textColor = theme === 'light' ? '#111' : '#fff'
  const labelColor = theme === 'light' ? '#555' : 'rgba(255,255,255,0.6)'
  const bg = theme === 'light' ? '#f5f5f5' : '#0a0a0a'
  const cardBg = theme === 'light' ? '#fff' : '#1a1a1a'
  const cardBorder = theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'
  const inputBg = theme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'
  const inputBorder = theme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'

  const isVi = lang === 'vi'
  const emptyForm = { name: '', host: '', port: 3306, engine: 'mysql', username: '' }
  const [hosts, setHosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await window.electronAPI.listDbHosts()
      if (r?.ok) setHosts(r.hosts || [])
      else setError(r?.error || (isVi ? 'Không tải được database hosts' : 'Failed to load database hosts'))
    } catch {
      setError(isVi ? 'Không tải được database hosts' : 'Failed to load database hosts')
    } finally {
      setLoading(false)
    }
  }, [isVi])

  useEffect(() => { load() }, [load])

  const flash = (msg, isError = false) => {
    if (isError) { setError(msg); setNotice('') } else { setNotice(msg); setError('') }
    setTimeout(() => { setError(''); setNotice('') }, 4000)
  }

  const pickEngine = (engine) => setForm({ ...form, engine, port: engine === 'postgresql' ? 5432 : 3306 })

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim() || !form.host.trim()) return
    setBusy(true)
    try {
      const r = editingId
        ? await window.electronAPI.updateDbHost({ id: editingId, ...form })
        : await window.electronAPI.createDbHost(form)
      if (r?.error) flash(r.error, true)
      else {
        flash(editingId ? (isVi ? 'Đã lưu' : 'Saved') : (isVi ? 'Đã tạo database host' : 'Database host created'))
        setForm(emptyForm); setEditingId(null); await load()
      }
    } catch { flash(isVi ? 'Thao tác thất bại' : 'Operation failed', true) } finally { setBusy(false) }
  }

  const handleDelete = async (h) => {
    if (!window.confirm(isVi ? `Xóa database host "${h.name}"?` : `Delete database host "${h.name}"?`)) return
    setBusy(true)
    try {
      const r = await window.electronAPI.deleteDbHost(h.id)
      if (r?.error) flash(r.error, true)
      else { flash(isVi ? 'Đã xóa' : 'Deleted'); await load() }
    } catch { flash(isVi ? 'Xóa thất bại' : 'Delete failed', true) } finally { setBusy(false) }
  }

  const badgeColor = (engine) => engine === 'postgresql'
    ? { background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }
    : { background: 'rgba(249,115,22,0.15)', color: '#f97316' }

  return (
    <div className="h-full overflow-auto p-6" style={{ background: bg }}>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2" style={{ color: textColor }}>
            <Database size={22} weight="duotone" style={{ color: '#3b82f6' }} />
            {isVi ? 'Database hosts' : 'Database hosts'}
          </h2>
          <p className="text-sm mt-1" style={{ color: labelColor }}>
            {isVi
              ? 'Máy chủ MySQL/PostgreSQL nơi database của user sẽ được tạo (Pterodactyl-style).'
              : 'MySQL/PostgreSQL machines where user databases will be provisioned (Pterodactyl-style).'}
          </p>
        </div>

        {(error || notice) && (
          <div className="p-3 rounded-lg text-sm" style={{
            background: error ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
            border: `1px solid ${error ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
            color: error ? '#f87171' : '#22c55e',
          }}>{error || notice}</div>
        )}

        <form onSubmit={handleSubmit} className="rounded-2xl p-5 space-y-4" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
          <p className="text-sm font-semibold" style={{ color: textColor }}>
            {editingId ? (isVi ? 'Sửa database host' : 'Edit database host') : (isVi ? 'Thêm database host' : 'Add database host')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={isVi ? 'Tên (vd: Main MySQL)' : 'Name (e.g. Main MySQL)'}
              required className="px-4 py-2.5 rounded-lg text-sm outline-none"
              style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
            />
            <input
              type="text" value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })}
              placeholder={isVi ? 'Host (vd: 127.0.0.1 hoặc db.internal)' : 'Host (e.g. 127.0.0.1 or db.internal)'}
              required className="px-4 py-2.5 rounded-lg text-sm outline-none font-mono"
              style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
            />
            <select
              value={form.engine}
              onChange={(e) => pickEngine(e.target.value)}
              className="px-4 py-2.5 rounded-lg text-sm outline-none"
              style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
            >
              <option value="mysql" style={{ color: '#111' }}>MySQL / MariaDB</option>
              <option value="postgresql" style={{ color: '#111' }}>PostgreSQL</option>
            </select>
            <input
              type="number" value={form.port} min={1} max={65535}
              onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || '' })}
              placeholder={isVi ? 'Port' : 'Port'}
              className="px-4 py-2.5 rounded-lg text-sm outline-none font-mono"
              style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
            />
            <input
              type="text" value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder={isVi ? 'Username gốc (tùy chọn)' : 'Root username (optional)'}
              className="px-4 py-2.5 rounded-lg text-sm outline-none font-mono sm:col-span-2"
              style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50" style={{ background: '#3b82f6', color: '#fff' }}>
              <Plus size={16} weight="duotone" />
              {editingId ? (isVi ? 'Lưu' : 'Save') : (isVi ? 'Thêm' : 'Add')}
            </button>
            {editingId && (
              <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm) }} className="px-4 py-2.5 rounded-lg text-sm" style={{ background: inputBg, color: labelColor }}>
                {isVi ? 'Hủy' : 'Cancel'}
              </button>
            )}
          </div>
        </form>

        <div className="rounded-2xl overflow-hidden" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
          <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${cardBorder}` }}>
            <p className="text-sm font-semibold" style={{ color: textColor }}>{isVi ? `Danh sách (${hosts.length})` : `All hosts (${hosts.length})`}</p>
            <button onClick={load} className="flex items-center gap-1.5 text-xs" style={{ color: labelColor }}>
              <ArrowsClockwise size={14} weight="duotone" />
              {isVi ? 'Tải lại' : 'Refresh'}
            </button>
          </div>
          {loading ? (
            <p className="px-5 py-8 text-sm text-center" style={{ color: labelColor }}>{isVi ? 'Đang tải…' : 'Loading…'}</p>
          ) : hosts.length === 0 ? (
            <p className="px-5 py-8 text-sm text-center" style={{ color: labelColor }}>{isVi ? 'Chưa có database host nào' : 'No database hosts yet'}</p>
          ) : (
            hosts.map((h, i) => (
              <div key={h.id} className="flex items-center gap-3 px-5 py-3" style={{ borderTop: i === 0 ? 'none' : `1px solid ${cardBorder}` }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: badgeColor(h.engine).background }}>
                  <Database size={16} weight="duotone" style={{ color: badgeColor(h.engine).color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: textColor }}>{h.name}</p>
                  <p className="text-[11px] font-mono truncate" style={{ color: labelColor }}>
                    {h.username ? `${h.username}@` : ''}{h.host}:{h.port}
                    {h.createdAt ? ` · ${isVi ? 'thêm' : 'added'} ${new Date(h.createdAt).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US')}` : ''}
                  </p>
                </div>
                <span className="text-[11px] font-semibold px-2 py-1 rounded-full shrink-0" style={badgeColor(h.engine)}>
                  {h.engine === 'postgresql' ? 'PostgreSQL' : 'MySQL'}
                </span>
                <button
                  onClick={() => { setEditingId(h.id); setForm({ name: h.name, host: h.host, port: h.port, engine: h.engine, username: h.username || '' }) }}
                  className="p-1.5 rounded-lg shrink-0" style={{ color: '#3b82f6' }} title={isVi ? 'Sửa' : 'Edit'}
                >
                  <PencilSimple size={16} weight="duotone" />
                </button>
                <button onClick={() => handleDelete(h)} disabled={busy} className="p-1.5 rounded-lg disabled:opacity-50 shrink-0" style={{ color: '#f87171' }} title={isVi ? 'Xóa' : 'Delete'}>
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

export default DbHostsPage
