import { useState, useEffect, useCallback } from 'react'
import { TerminalWindow, Plus, Trash, PencilSimple, Copy, ArrowsClockwise } from '@phosphor-icons/react'

function SnippetsPage({ theme, lang }) {
  const textColor = theme === 'light' ? '#111' : '#fff'
  const labelColor = theme === 'light' ? '#555' : 'rgba(255,255,255,0.6)'
  const bg = theme === 'light' ? '#f5f5f5' : '#0a0a0a'
  const cardBg = theme === 'light' ? '#fff' : '#1a1a1a'
  const cardBorder = theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'
  const inputBg = theme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'
  const inputBorder = theme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'

  const isVi = lang === 'vi'
  const [snippets, setSnippets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ name: '', command: '' })
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', command: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await window.electronAPI.listSnippets()
      if (r?.ok) setSnippets(r.snippets || [])
      else setError(r?.error || (isVi ? 'Không tải được snippets' : 'Failed to load snippets'))
    } catch {
      setError(isVi ? 'Không tải được snippets' : 'Failed to load snippets')
    } finally {
      setLoading(false)
    }
  }, [isVi])

  useEffect(() => { load() }, [load])

  const flash = (msg, isError = false) => {
    if (isError) { setError(msg); setNotice('') } else { setNotice(msg); setError('') }
    setTimeout(() => { setError(''); setNotice('') }, 4000)
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.name.trim() || !form.command.trim()) return
    setBusy(true)
    try {
      const r = await window.electronAPI.createSnippet(form.name.trim(), form.command)
      if (r?.error) flash(r.error, true)
      else { flash(isVi ? 'Đã tạo snippet' : 'Snippet created'); setForm({ name: '', command: '' }); await load() }
    } catch { flash(isVi ? 'Tạo thất bại' : 'Create failed', true) } finally { setBusy(false) }
  }

  const handleUpdate = async (id) => {
    if (!editForm.name.trim() || !editForm.command.trim()) return
    setBusy(true)
    try {
      const r = await window.electronAPI.updateSnippet(id, editForm)
      if (r?.error) flash(r.error, true)
      else { flash(isVi ? 'Đã lưu' : 'Saved'); setEditingId(null); await load() }
    } catch { flash(isVi ? 'Lưu thất bại' : 'Save failed', true) } finally { setBusy(false) }
  }

  const handleDelete = async (s) => {
    if (!window.confirm(isVi ? `Xóa snippet "${s.name}"?` : `Delete snippet "${s.name}"?`)) return
    setBusy(true)
    try {
      const r = await window.electronAPI.deleteSnippet(s.id)
      if (r?.error) flash(r.error, true)
      else { flash(isVi ? 'Đã xóa' : 'Deleted'); await load() }
    } catch { flash(isVi ? 'Xóa thất bại' : 'Delete failed', true) } finally { setBusy(false) }
  }

  const copyCmd = (cmd) => {
    navigator.clipboard?.writeText(cmd)
    flash(isVi ? 'Đã sao chép lệnh' : 'Command copied')
  }

  return (
    <div className="h-full overflow-auto p-6" style={{ background: bg }}>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2" style={{ color: textColor }}>
            <TerminalWindow size={22} weight="duotone" style={{ color: '#38bdf8' }} />
            {isVi ? 'Command snippets' : 'Command snippets'}
          </h2>
          <p className="text-sm mt-1" style={{ color: labelColor }}>
            {isVi
              ? 'Lệnh hay dùng — cop và dán vào console server, hoặc dùng thanh snippet trong tab Console.'
              : 'Frequently used commands — copy into a server console, or use the snippet bar in the Console tab.'}
          </p>
        </div>

        {(error || notice) && (
          <div className="p-3 rounded-lg text-sm" style={{
            background: error ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
            border: `1px solid ${error ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
            color: error ? '#f87171' : '#22c55e',
          }}>{error || notice}</div>
        )}

        <form onSubmit={handleCreate} className="rounded-2xl p-5 space-y-4" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
          <p className="text-sm font-semibold" style={{ color: textColor }}>{isVi ? 'Snippet mới' : 'New snippet'}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={isVi ? 'Tên (vd: Hiện online)' : 'Name (e.g. list online)'}
              required className="px-4 py-2.5 rounded-lg text-sm outline-none"
              style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
            />
            <input
              type="text" value={form.command}
              onChange={(e) => setForm({ ...form, command: e.target.value })}
              placeholder={isVi ? 'Lệnh (vd: list)' : 'Command (e.g. list)'}
              required className="px-4 py-2.5 rounded-lg text-sm outline-none font-mono sm:col-span-2"
              style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
            />
          </div>
          <button type="submit" disabled={busy} className="px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50" style={{ background: '#38bdf8', color: '#111' }}>
            <Plus size={16} weight="duotone" />
            {isVi ? 'Tạo snippet' : 'Create snippet'}
          </button>
        </form>

        <div className="rounded-2xl overflow-hidden" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
          <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${cardBorder}` }}>
            <p className="text-sm font-semibold" style={{ color: textColor }}>{isVi ? `Snippets của tôi (${snippets.length})` : `My snippets (${snippets.length})`}</p>
            <button onClick={load} className="flex items-center gap-1.5 text-xs" style={{ color: labelColor }}>
              <ArrowsClockwise size={14} weight="duotone" />
              {isVi ? 'Tải lại' : 'Refresh'}
            </button>
          </div>
          {loading ? (
            <p className="px-5 py-8 text-sm text-center" style={{ color: labelColor }}>{isVi ? 'Đang tải…' : 'Loading…'}</p>
          ) : snippets.length === 0 ? (
            <p className="px-5 py-8 text-sm text-center" style={{ color: labelColor }}>{isVi ? 'Chưa có snippet nào' : 'No snippets yet'}</p>
          ) : (
            snippets.map((s, i) => (
              <div key={s.id} className="px-5 py-3" style={{ borderTop: i === 0 ? 'none' : `1px solid ${cardBorder}` }}>
                {editingId === s.id ? (
                  <div className="space-y-2">
                    <input
                      type="text" value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                      style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
                    />
                    <input
                      type="text" value={editForm.command}
                      onChange={(e) => setEditForm({ ...editForm, command: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none font-mono"
                      style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
                    />
                    <div className="flex gap-2">
                      <button onClick={() => handleUpdate(s.id)} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50" style={{ background: '#38bdf8', color: '#111' }}>
                        {isVi ? 'Lưu' : 'Save'}
                      </button>
                      <button onClick={() => setEditingId(null)} className="px-3 py-1.5 rounded-lg text-xs" style={{ background: inputBg, color: labelColor }}>
                        {isVi ? 'Hủy' : 'Cancel'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(56,189,248,0.15)' }}>
                      <TerminalWindow size={16} weight="duotone" style={{ color: '#38bdf8' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: textColor }}>{s.name}</p>
                      <p className="text-[11px] font-mono truncate" style={{ color: labelColor }}>{s.command}</p>
                    </div>
                    <button onClick={() => copyCmd(s.command)} className="p-1.5 rounded-lg shrink-0" style={{ color: '#22c55e' }} title={isVi ? 'Sao chép lệnh' : 'Copy command'}>
                      <Copy size={16} weight="duotone" />
                    </button>
                    <button
                      onClick={() => { setEditingId(s.id); setEditForm({ name: s.name, command: s.command }) }}
                      className="p-1.5 rounded-lg shrink-0" style={{ color: '#3b82f6' }} title={isVi ? 'Sửa' : 'Edit'}
                    >
                      <PencilSimple size={16} weight="duotone" />
                    </button>
                    <button onClick={() => handleDelete(s)} disabled={busy} className="p-1.5 rounded-lg disabled:opacity-50 shrink-0" style={{ color: '#f87171' }} title={isVi ? 'Xóa' : 'Delete'}>
                      <Trash size={16} weight="duotone" />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default SnippetsPage
