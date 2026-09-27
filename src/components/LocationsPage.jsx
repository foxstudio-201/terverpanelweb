import { useState, useEffect, useCallback } from 'react'
import { MapPin, Stack, Plus, Trash, PencilSimple, ArrowsClockwise, HardDrives } from '@phosphor-icons/react'

function LocationsPage({ theme, lang }) {
  const textColor = theme === 'light' ? '#111' : '#fff'
  const labelColor = theme === 'light' ? '#555' : 'rgba(255,255,255,0.6)'
  const bg = theme === 'light' ? '#f5f5f5' : '#0a0a0a'
  const cardBg = theme === 'light' ? '#fff' : '#1a1a1a'
  const cardBorder = theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'
  const inputBg = theme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'
  const inputBorder = theme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'

  const isVi = lang === 'vi'
  const [locations, setLocations] = useState([])
  const [nodes, setNodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', description: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await window.electronAPI.listLocations()
      if (r?.ok) {
        setLocations(r.locations || [])
        setNodes(r.nodes || [])
      } else setError(r?.error || (isVi ? 'Không tải được locations' : 'Failed to load locations'))
    } catch {
      setError(isVi ? 'Không tải được locations' : 'Failed to load locations')
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
    if (!form.name.trim()) return
    setBusy(true)
    try {
      const r = await window.electronAPI.createLocation(form.name.trim(), form.description)
      if (r?.error) flash(r.error, true)
      else { flash(isVi ? 'Đã tạo location' : 'Location created'); setForm({ name: '', description: '' }); await load() }
    } catch { flash(isVi ? 'Tạo thất bại' : 'Create failed', true) } finally { setBusy(false) }
  }

  const handleUpdate = async (id) => {
    if (!editForm.name.trim()) return
    setBusy(true)
    try {
      const r = await window.electronAPI.updateLocation(id, editForm)
      if (r?.error) flash(r.error, true)
      else { flash(isVi ? 'Đã lưu' : 'Saved'); setEditingId(null); await load() }
    } catch { flash(isVi ? 'Lưu thất bại' : 'Save failed', true) } finally { setBusy(false) }
  }

  const handleDelete = async (loc) => {
    if (!window.confirm(isVi ? `Xóa location "${loc.name}"?` : `Delete location "${loc.name}"?`)) return
    setBusy(true)
    try {
      const r = await window.electronAPI.deleteLocation(loc.id)
      if (r?.error) flash(r.error, true)
      else { flash(isVi ? 'Đã xóa' : 'Deleted'); await load() }
    } catch { flash(isVi ? 'Xóa thất bại' : 'Delete failed', true) } finally { setBusy(false) }
  }

  const handleNodeLocation = async (nodeId, locationId) => {
    setBusy(true)
    try {
      const r = await window.electronAPI.setNodeLocation(nodeId, locationId || null)
      if (r?.error) flash(r.error, true)
      else { flash(isVi ? 'Đã gán node' : 'Node updated'); await load() }
    } catch { flash(isVi ? 'Gán thất bại' : 'Assign failed', true) } finally { setBusy(false) }
  }

  return (
    <div className="h-full overflow-auto p-6" style={{ background: bg }}>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2" style={{ color: textColor }}>
            <MapPin size={22} weight="duotone" style={{ color: '#f97316' }} />
            {isVi ? 'Locations' : 'Locations'}
          </h2>
          <p className="text-sm mt-1" style={{ color: labelColor }}>
            {isVi
              ? 'Nhóm node theo vị trí vật lý (một location có nhiều node).'
              : 'Group nodes by physical location (one location holds many nodes).'}
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
          <p className="text-sm font-semibold" style={{ color: textColor }}>{isVi ? 'Tạo location mới' : 'Create location'}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={isVi ? 'Tên location (vd: Hà Nội)' : 'Location name (e.g. Hanoi)'}
              required
              className="px-4 py-2.5 rounded-lg text-sm outline-none"
              style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
            />
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={isVi ? 'Mô tả (tùy chọn)' : 'Description (optional)'}
              className="px-4 py-2.5 rounded-lg text-sm outline-none"
              style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
            />
          </div>
          <button type="submit" disabled={busy} className="px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50" style={{ background: '#f97316', color: '#fff' }}>
            <Plus size={16} weight="duotone" />
            {isVi ? 'Tạo' : 'Create'}
          </button>
        </form>

        <div className="rounded-2xl overflow-hidden" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
          <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${cardBorder}` }}>
            <p className="text-sm font-semibold" style={{ color: textColor }}>{isVi ? `Locations (${locations.length})` : `Locations (${locations.length})`}</p>
            <button onClick={load} className="flex items-center gap-1.5 text-xs" style={{ color: labelColor }}>
              <ArrowsClockwise size={14} weight="duotone" />
              {isVi ? 'Tải lại' : 'Refresh'}
            </button>
          </div>
          {loading ? (
            <p className="px-5 py-8 text-sm text-center" style={{ color: labelColor }}>{isVi ? 'Đang tải…' : 'Loading…'}</p>
          ) : locations.length === 0 ? (
            <p className="px-5 py-8 text-sm text-center" style={{ color: labelColor }}>{isVi ? 'Chưa có location nào' : 'No locations yet'}</p>
          ) : (
            locations.map((loc, i) => {
              const count = nodes.filter(n => n.locationId === loc.id).length
              const editing = editingId === loc.id
              return (
                <div key={loc.id} className="px-5 py-3" style={{ borderTop: i === 0 ? 'none' : `1px solid ${cardBorder}` }}>
                  {editing ? (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                        style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
                      />
                      <input
                        type="text"
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        placeholder={isVi ? 'Mô tả' : 'Description'}
                        className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                        style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
                      />
                      <button onClick={() => handleUpdate(loc.id)} disabled={busy} className="px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50" style={{ background: '#f97316', color: '#fff' }}>
                        {isVi ? 'Lưu' : 'Save'}
                      </button>
                      <button onClick={() => setEditingId(null)} className="px-3 py-2 rounded-lg text-xs" style={{ background: inputBg, color: labelColor }}>
                        {isVi ? 'Hủy' : 'Cancel'}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(249,115,22,0.15)' }}>
                        <MapPin size={16} weight="duotone" style={{ color: '#f97316' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: textColor }}>{loc.name}</p>
                        <p className="text-[11px] truncate" style={{ color: labelColor }}>
                          {loc.description || (isVi ? 'Không có mô tả' : 'No description')}
                          {' · '}{count} {isVi ? 'node' : 'node(s)'}
                        </p>
                      </div>
                      <button
                        onClick={() => { setEditingId(loc.id); setEditForm({ name: loc.name, description: loc.description || '' }) }}
                        className="p-1.5 rounded-lg shrink-0" style={{ color: '#3b82f6' }}
                        title={isVi ? 'Sửa' : 'Edit'}
                      >
                        <PencilSimple size={16} weight="duotone" />
                      </button>
                      <button
                        onClick={() => handleDelete(loc)} disabled={busy}
                        className="p-1.5 rounded-lg disabled:opacity-50 shrink-0" style={{ color: '#f87171' }}
                        title={isVi ? 'Xóa' : 'Delete'}
                      >
                        <Trash size={16} weight="duotone" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        <div className="rounded-2xl overflow-hidden" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
          <div className="px-5 py-3" style={{ borderBottom: `1px solid ${cardBorder}` }}>
            <p className="text-sm font-semibold flex items-center gap-2" style={{ color: textColor }}>
              <Stack size={16} weight="duotone" style={{ color: '#3b82f6' }} />
              {isVi ? `Node & vị trí (${nodes.length})` : `Nodes & placement (${nodes.length})`}
            </p>
          </div>
          {nodes.length === 0 ? (
            <p className="px-5 py-8 text-sm text-center" style={{ color: labelColor }}>{isVi ? 'Chưa có node' : 'No nodes'}</p>
          ) : (
            nodes.map((n, i) => (
              <div key={n.id} className="flex items-center gap-3 px-5 py-3" style={{ borderTop: i === 0 ? 'none' : `1px solid ${cardBorder}` }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(59,130,246,0.15)' }}>
                  <HardDrives size={16} weight="duotone" style={{ color: '#3b82f6' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: textColor }}>
                    {n.name}
                    {n.local && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>{isVi ? 'máy này' : 'this machine'}</span>}
                  </p>
                  <p className="text-[11px] font-mono truncate" style={{ color: labelColor }}>{n.id}</p>
                </div>
                <select
                  value={n.locationId || ''}
                  onChange={(e) => handleNodeLocation(n.id, e.target.value)}
                  disabled={busy}
                  className="px-3 py-2 rounded-lg text-xs outline-none disabled:opacity-50"
                  style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
                >
                  <option value="" style={{ color: '#111' }}>{isVi ? '— Chưa gán —' : '— Unassigned —'}</option>
                  {locations.map(l => (
                    <option key={l.id} value={l.id} style={{ color: '#111' }}>{l.name}</option>
                  ))}
                </select>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default LocationsPage
