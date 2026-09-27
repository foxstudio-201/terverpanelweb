import { useState, useEffect, useCallback } from 'react'
import { LockKey, Plus, Trash, ArrowsClockwise, ShieldCheck, DownloadSimple, X } from '@phosphor-icons/react'

function SshKeysPage({ theme, lang, currentUser }) {
  const textColor = theme === 'light' ? '#111' : '#fff'
  const labelColor = theme === 'light' ? '#555' : 'rgba(255,255,255,0.6)'
  const bg = theme === 'light' ? '#f5f5f5' : '#0a0a0a'
  const cardBg = theme === 'light' ? '#fff' : '#1a1a1a'
  const cardBorder = theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'
  const inputBg = theme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'
  const inputBorder = theme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'

  const isVi = lang === 'vi'
  const isAdmin = !!currentUser?.admin
  const [keys, setKeys] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ name: '', publicKey: '' })
  const [scope, setScope] = useState('own')

  const load = useCallback(async (s = scope) => {
    setLoading(true)
    try {
      const r = await window.electronAPI.listSshKeys(isAdmin && s === 'all' ? 'all' : 'own')
      if (r?.ok) setKeys(r.keys || [])
      else setError(r?.error || (isVi ? 'Không tải được SSH keys' : 'Failed to load SSH keys'))
    } catch {
      setError(isVi ? 'Không tải được SSH keys' : 'Failed to load SSH keys')
    } finally {
      setLoading(false)
    }
  }, [isVi, isAdmin, scope])

  useEffect(() => { load(scope) }, [load, scope])

  const flash = (msg, isError = false) => {
    if (isError) { setError(msg); setNotice('') } else { setNotice(msg); setError('') }
    setTimeout(() => { setError(''); setNotice('') }, 4000)
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.name.trim() || !form.publicKey.trim()) return
    setBusy(true)
    try {
      const r = await window.electronAPI.addSshKey(form.name.trim(), form.publicKey.trim())
      if (r?.error) flash(r.error, true)
      else { flash(isVi ? 'Đã thêm SSH key' : 'SSH key added'); setForm({ name: '', publicKey: '' }); await load(scope) }
    } catch { flash(isVi ? 'Thêm thất bại' : 'Add failed', true) } finally { setBusy(false) }
  }

  const handleDelete = async (k) => {
    if (!window.confirm(isVi ? `Xóa SSH key "${k.name}"?` : `Delete SSH key "${k.name}"?`)) return
    setBusy(true)
    try {
      const r = await window.electronAPI.deleteSshKey(k.id)
      if (r?.error) flash(r.error, true)
      else { flash(isVi ? 'Đã xóa' : 'Deleted'); await load(scope) }
    } catch { flash(isVi ? 'Xóa thất bại' : 'Delete failed', true) } finally { setBusy(false) }
  }

  const handleInstall = async (k, install) => {
    setBusy(true)
    try {
      const r = install
        ? await window.electronAPI.installSshKey(k.id)
        : await window.electronAPI.uninstallSshKey(k.id)
      if (r?.error) flash(r.error, true)
      else { flash(install ? (isVi ? 'Đã cài vào ~/.ssh/authorized_keys' : 'Installed into ~/.ssh/authorized_keys') : (isVi ? 'Đã gỡ khỏi máy' : 'Removed from machine')); await load(scope) }
    } catch { flash(isVi ? 'Thao tác thất bại' : 'Operation failed', true) } finally { setBusy(false) }
  }

  const shortKey = (pk) => {
    const parts = String(pk || '').split(' ')
    return `${parts[0] || ''} ${String(parts[1] || '').slice(0, 24)}…`
  }

  return (
    <div className="h-full overflow-auto p-6" style={{ background: bg }}>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2" style={{ color: textColor }}>
              <LockKey size={22} weight="duotone" style={{ color: '#34d399' }} />
              {isVi ? 'SSH keys' : 'SSH keys'}
            </h2>
            <p className="text-sm mt-1" style={{ color: labelColor }}>
              {isVi
                ? 'Khóa SSH của bạn. Quản trị viên có thể cài key vào máy (authorized_keys) để truy cập shell.'
                : 'Your SSH keys. Admins can install a key into the machine (authorized_keys) for shell access.'}
            </p>
          </div>
          {isAdmin && (
            <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: `1px solid ${cardBorder}` }}>
              <button onClick={() => setScope('own')} className="px-3 py-1.5 text-xs font-semibold" style={{ background: scope === 'own' ? '#34d399' : cardBg, color: scope === 'own' ? '#111' : labelColor }}>
                {isVi ? 'Của tôi' : 'Mine'}
              </button>
              <button onClick={() => setScope('all')} className="px-3 py-1.5 text-xs font-semibold" style={{ background: scope === 'all' ? '#34d399' : cardBg, color: scope === 'all' ? '#111' : labelColor, borderLeft: `1px solid ${cardBorder}` }}>
                {isVi ? 'Tất cả' : 'Everyone'}
              </button>
            </div>
          )}
        </div>

        {(error || notice) && (
          <div className="p-3 rounded-lg text-sm" style={{
            background: error ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
            border: `1px solid ${error ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
            color: error ? '#f87171' : '#22c55e',
          }}>{error || notice}</div>
        )}

        <form onSubmit={handleAdd} className="rounded-2xl p-5 space-y-4" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
          <p className="text-sm font-semibold" style={{ color: textColor }}>{isVi ? 'Thêm SSH key' : 'Add SSH key'}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={isVi ? 'Tên (vd: laptop-cá nhân)' : 'Name (e.g. personal-laptop)'}
              required className="px-4 py-2.5 rounded-lg text-sm outline-none"
              style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
            />
            <textarea
              value={form.publicKey}
              onChange={(e) => setForm({ ...form, publicKey: e.target.value })}
              placeholder="ssh-ed25519 AAAA… user@host"
              required rows={2}
              className="px-4 py-2.5 rounded-lg text-xs outline-none font-mono resize-none sm:col-span-2"
              style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
            />
          </div>
          <p className="text-[11px]" style={{ color: labelColor }}>
            {isVi ? 'Dán toàn bộ dòng khóa công khai (id_ed25519.pub / id_rsa.pub). Dòng bắt đầu bằng sk- (FIDO2) cũng được hỗ trợ.' : 'Paste the full public key line (id_ed25519.pub / id_rsa.pub). FIDO2 sk- keys are supported too.'}
          </p>
          <button type="submit" disabled={busy} className="px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50" style={{ background: '#34d399', color: '#111' }}>
            <Plus size={16} weight="duotone" />
            {isVi ? 'Thêm key' : 'Add key'}
          </button>
        </form>

        <div className="rounded-2xl overflow-hidden" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
          <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${cardBorder}` }}>
            <p className="text-sm font-semibold" style={{ color: textColor }}>{isVi ? `Danh sách (${keys.length})` : `All keys (${keys.length})`}</p>
            <button onClick={() => load(scope)} className="flex items-center gap-1.5 text-xs" style={{ color: labelColor }}>
              <ArrowsClockwise size={14} weight="duotone" />
              {isVi ? 'Tải lại' : 'Refresh'}
            </button>
          </div>
          {loading ? (
            <p className="px-5 py-8 text-sm text-center" style={{ color: labelColor }}>{isVi ? 'Đang tải…' : 'Loading…'}</p>
          ) : keys.length === 0 ? (
            <p className="px-5 py-8 text-sm text-center" style={{ color: labelColor }}>{isVi ? 'Chưa có SSH key nào' : 'No SSH keys yet'}</p>
          ) : (
            keys.map((k, i) => (
              <div key={k.id} className="flex items-center gap-3 px-5 py-3" style={{ borderTop: i === 0 ? 'none' : `1px solid ${cardBorder}` }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(52,211,153,0.15)' }}>
                  <LockKey size={16} weight="duotone" style={{ color: '#34d399' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: textColor }}>
                    {k.name}
                    {k.installedAt && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                        {isVi ? 'đã cài' : 'installed'}
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] font-mono truncate" style={{ color: labelColor }}>
                    {shortKey(k.publicKey)}{k.username ? ` · ${k.username}` : ''}
                  </p>
                </div>

                {isAdmin && (
                  <button
                    onClick={() => handleInstall(k, !k.installedAt)} disabled={busy}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-50 shrink-0"
                    style={{
                      background: k.installedAt ? 'rgba(248,113,113,0.15)' : 'rgba(59,130,246,0.15)',
                      color: k.installedAt ? '#f87171' : '#3b82f6',
                    }}
                    title={isVi ? 'Cài/gỡ khỏi ~/.ssh/authorized_keys của máy' : 'Install/remove in machine ~/.ssh/authorized_keys'}
                  >
                    {k.installedAt ? <X size={12} weight="duotone" /> : <DownloadSimple size={12} weight="duotone" />}
                    {k.installedAt ? (isVi ? 'Gỡ' : 'Remove') : (isVi ? 'Cài vào máy' : 'Install')}
                  </button>
                )}

                {isAdmin && scope === 'all' && (
                  <span className="text-[11px] px-2 py-1 rounded-full shrink-0" style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}>
                    <ShieldCheck size={11} weight="duotone" className="inline" /> {k.username}
                  </span>
                )}

                <button onClick={() => handleDelete(k)} disabled={busy} className="p-1.5 rounded-lg disabled:opacity-50 shrink-0" style={{ color: '#f87171' }} title={isVi ? 'Xóa' : 'Delete'}>
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

export default SshKeysPage
