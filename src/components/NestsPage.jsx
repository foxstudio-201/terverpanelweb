import { useState, useEffect, useCallback } from 'react'
import { Egg, Stack, Plus, Trash, PencilSimple, ArrowsClockwise, CaretRight } from '@phosphor-icons/react'

function NestsPage({ theme, lang }) {
  const textColor = theme === 'light' ? '#111' : '#fff'
  const labelColor = theme === 'light' ? '#555' : 'rgba(255,255,255,0.6)'
  const bg = theme === 'light' ? '#f5f5f5' : '#0a0a0a'
  const cardBg = theme === 'light' ? '#fff' : '#1a1a1a'
  const cardBorder = theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'
  const inputBg = theme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'
  const inputBorder = theme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'

  const isVi = lang === 'vi'
  const [nests, setNests] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [newNest, setNewNest] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [eggForm, setEggForm] = useState({ nest: '', file: '', json: '' })
  const [editingEgg, setEditingEgg] = useState(null)

  const EMPTY_EGG = { name: '', description: '', docker_images: { default: 'ghcr.io/parkervcp/yolks:vanilla' }, variables: [], startup: '', config: {}, scripts: { installation: { script: '', container: 'ghcr.io/parkervcp/yolks:debian', entrypoint: '/bin/bash' } }, features: [] }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await window.electronAPI.listEggs()
      if (r?.ok) setNests(r.eggs || {})
      else setError(r?.error || (isVi ? 'Không tải được nests' : 'Failed to load nests'))
    } catch {
      setError(isVi ? 'Không tải được nests' : 'Failed to load nests')
    } finally {
      setLoading(false)
    }
  }, [isVi])

  useEffect(() => { load() }, [load])

  const flash = (msg, isError = false) => {
    if (isError) { setError(msg); setNotice('') } else { setNotice(msg); setError('') }
    setTimeout(() => { setError(''); setNotice('') }, 4000)
  }

  const handleCreateNest = async (e) => {
    e.preventDefault()
    if (!newNest.trim()) return
    setBusy(true)
    try {
      const r = await window.electronAPI.createNest(newNest.trim())
      if (r?.error) flash(r.error, true)
      else { flash(isVi ? 'Đã tạo nest' : 'Nest created'); setNewNest(''); await load() }
    } catch { flash(isVi ? 'Tạo thất bại' : 'Create failed', true) } finally { setBusy(false) }
  }

  const handleDeleteNest = async (name) => {
    if (!window.confirm(isVi ? `Xóa nest "${name}" (phải trống egg)?` : `Delete nest "${name}" (must be empty)?`)) return
    setBusy(true)
    try {
      const r = await window.electronAPI.deleteNest(name)
      if (r?.error) flash(r.error, true)
      else { flash(isVi ? 'Đã xóa nest' : 'Nest deleted'); await load() }
    } catch { flash(isVi ? 'Xóa thất bại' : 'Delete failed', true) } finally { setBusy(false) }
  }

  const startNewEgg = (nest) => {
    setEditingEgg(null)
    setEggForm({ nest, file: '', json: JSON.stringify(EMPTY_EGG, null, 2) })
  }

  const startEditEgg = (nest, egg) => {
    setEditingEgg(`${nest}/${egg.id}`)
    setEggForm({ nest, file: egg.file || egg.id, json: JSON.stringify(egg.raw || egg, null, 2) })
  }

  const handleSaveEgg = async (e) => {
    e.preventDefault()
    let data
    try { data = JSON.parse(eggForm.json) } catch {
      flash(isVi ? 'JSON không hợp lệ' : 'Invalid JSON', true)
      return
    }
    setBusy(true)
    try {
      const r = await window.electronAPI.saveEgg(eggForm.nest, eggForm.file, data)
      if (r?.error) flash(r.error, true)
      else {
        flash(isVi ? `Đã lưu egg "${r.eggId}"` : `Saved egg "${r.eggId}"`)
        setEditingEgg(null)
        setEggForm({ nest: '', file: '', json: '' })
        setExpanded(eggForm.nest)
        await load()
      }
    } catch { flash(isVi ? 'Lưu thất bại' : 'Save failed', true) } finally { setBusy(false) }
  }

  const handleDeleteEgg = async (nest, egg) => {
    const eggId = `${nest}/${egg.file || egg.id}`
    if (!window.confirm(isVi ? `Xóa egg "${eggId}"?` : `Delete egg "${eggId}"?`)) return
    setBusy(true)
    try {
      const r = await window.electronAPI.deleteEgg(eggId)
      if (r?.error) flash(r.error, true)
      else { flash(isVi ? 'Đã xóa egg' : 'Egg deleted'); await load() }
    } catch { flash(isVi ? 'Xóa thất bại' : 'Delete failed', true) } finally { setBusy(false) }
  }

  const nestNames = Object.keys(nests)

  return (
    <div className="h-full overflow-auto p-6" style={{ background: bg }}>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2" style={{ color: textColor }}>
            <Egg size={22} weight="duotone" style={{ color: '#facc15' }} />
            {isVi ? 'Nests & Eggs' : 'Nests & Eggs'}
          </h2>
          <p className="text-sm mt-1" style={{ color: labelColor }}>
            {isVi
              ? 'Thư mục eggs/<nest>/<egg>.json — định hình loại server (Minecraft, Rust…) có thể tạo.'
              : 'Files under eggs/<nest>/<egg>.json — define the server types you can create.'}
          </p>
        </div>

        {(error || notice) && (
          <div className="p-3 rounded-lg text-sm" style={{
            background: error ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
            border: `1px solid ${error ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
            color: error ? '#f87171' : '#22c55e',
          }}>{error || notice}</div>
        )}

        <form onSubmit={handleCreateNest} className="rounded-2xl p-5 flex flex-col sm:flex-row gap-3 items-start sm:items-center" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
          <input
            type="text"
            value={newNest}
            onChange={(e) => setNewNest(e.target.value)}
            placeholder={isVi ? 'Tên nest mới (a-z, 0-9, -, _)' : 'New nest name (a-z, 0-9, -, _)'}
            required
            className="flex-1 px-4 py-2.5 rounded-lg text-sm outline-none"
            style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
          />
          <button type="submit" disabled={busy} className="px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50" style={{ background: '#eab308', color: '#111' }}>
            <Plus size={16} weight="duotone" />
            {isVi ? 'Tạo nest' : 'Create nest'}
          </button>
        </form>

        {(eggForm.nest || editingEgg) && (
          <form onSubmit={handleSaveEgg} className="rounded-2xl p-5 space-y-3" style={{ background: cardBg, border: `1px solid rgba(250,204,21,0.35)` }}>
            <p className="text-sm font-semibold" style={{ color: textColor }}>
              {editingEgg
                ? (isVi ? `Sửa egg "${editingEgg}"` : `Edit egg "${editingEgg}"`)
                : (isVi ? `Egg mới trong nest "${eggForm.nest}"` : `New egg in nest "${eggForm.nest}"`)}
            </p>
            {!editingEgg && (
              <input
                type="text"
                value={eggForm.file}
                onChange={(e) => setEggForm({ ...eggForm, file: e.target.value })}
                placeholder={isVi ? 'Tên file egg (vd: paper, rust-oxide)' : 'Egg file name (e.g. paper, rust-oxide)'}
                required
                className="w-full px-4 py-2.5 rounded-lg text-sm outline-none font-mono"
                style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
              />
            )}
            <textarea
              value={eggForm.json}
              onChange={(e) => setEggForm({ ...eggForm, json: e.target.value })}
              rows={14}
              spellCheck={false}
              className="w-full px-4 py-3 rounded-lg text-xs outline-none font-mono resize-y"
              style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
            />
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className="px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: '#eab308', color: '#111' }}>
                {isVi ? 'Lưu egg' : 'Save egg'}
              </button>
              <button type="button" onClick={() => { setEditingEgg(null); setEggForm({ nest: '', file: '', json: '' }) }} className="px-4 py-2.5 rounded-lg text-sm" style={{ background: inputBg, color: labelColor }}>
                {isVi ? 'Hủy' : 'Cancel'}
              </button>
            </div>
          </form>
        )}

        <div className="rounded-2xl overflow-hidden" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
          <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${cardBorder}` }}>
            <p className="text-sm font-semibold flex items-center gap-2" style={{ color: textColor }}>
              <Stack size={16} weight="duotone" style={{ color: '#facc15' }} />
              {isVi ? `Nests (${nestNames.length})` : `Nests (${nestNames.length})`}
            </p>
            <button onClick={load} className="flex items-center gap-1.5 text-xs" style={{ color: labelColor }}>
              <ArrowsClockwise size={14} weight="duotone" />
              {isVi ? 'Tải lại' : 'Refresh'}
            </button>
          </div>

          {loading ? (
            <p className="px-5 py-8 text-sm text-center" style={{ color: labelColor }}>{isVi ? 'Đang tải…' : 'Loading…'}</p>
          ) : nestNames.length === 0 ? (
            <p className="px-5 py-8 text-sm text-center" style={{ color: labelColor }}>
              {isVi ? 'Chưa có nest nào — hãy tạo nest trước, rồi thêm egg JSON vào.' : 'No nests yet — create a nest first, then add egg JSON files.'}
            </p>
          ) : (
            nestNames.map((nestName, i) => {
              const eggs = nests[nestName] || []
              const open = expanded === nestName
              return (
                <div key={nestName} style={{ borderTop: i === 0 ? 'none' : `1px solid ${cardBorder}` }}>
                  <div className="flex items-center gap-3 px-5 py-3">
                    <button onClick={() => setExpanded(open ? null : nestName)} className="flex-1 flex items-center gap-2 min-w-0 text-left">
                      <CaretRight size={14} weight="duotone" style={{ color: labelColor, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                      <span className="text-sm font-semibold truncate" style={{ color: textColor }}>{nestName}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(250,204,21,0.15)', color: '#eab308' }}>
                        {eggs.length} egg{eggs.length === 1 ? '' : 's'}
                      </span>
                    </button>
                    <button onClick={() => startNewEgg(nestName)} className="p-1.5 rounded-lg" style={{ color: '#22c55e' }} title={isVi ? 'Thêm egg' : 'Add egg'}>
                      <Plus size={16} weight="duotone" />
                    </button>
                    <button onClick={() => handleDeleteNest(nestName)} disabled={busy} className="p-1.5 rounded-lg disabled:opacity-50" style={{ color: '#f87171' }} title={isVi ? 'Xóa nest' : 'Delete nest'}>
                      <Trash size={16} weight="duotone" />
                    </button>
                  </div>
                  {open && (
                    <div style={{ borderTop: `1px solid ${cardBorder}`, background: inputBg }}>
                      {eggs.length === 0 ? (
                        <p className="px-8 py-4 text-xs" style={{ color: labelColor }}>{isVi ? 'Nest trống — chưa có egg' : 'Empty nest — no eggs'}</p>
                      ) : (
                        eggs.map((egg, j) => (
                          <div key={egg.id || egg.file || j} className="flex items-center gap-3 px-8 py-2.5" style={{ borderTop: j === 0 ? 'none' : `1px solid ${cardBorder}` }}>
                            <Egg size={14} weight="duotone" style={{ color: '#facc15' }} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold truncate" style={{ color: textColor }}>{egg.name || egg.id}</p>
                              <p className="text-[10px] font-mono truncate" style={{ color: labelColor }}>
                                {nestName}/{egg.file || egg.id}
                                {egg.description ? ` — ${egg.description}` : ''}
                              </p>
                            </div>
                            <button onClick={() => startEditEgg(nestName, egg)} className="p-1.5 rounded-lg" style={{ color: '#3b82f6' }} title={isVi ? 'Sửa JSON' : 'Edit JSON'}>
                              <PencilSimple size={14} weight="duotone" />
                            </button>
                            <button onClick={() => handleDeleteEgg(nestName, egg)} disabled={busy} className="p-1.5 rounded-lg disabled:opacity-50" style={{ color: '#f87171' }} title={isVi ? 'Xóa' : 'Delete'}>
                              <Trash size={14} weight="duotone" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

export default NestsPage
