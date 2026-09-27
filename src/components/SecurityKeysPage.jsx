import { useState, useEffect, useCallback } from 'react'
import { Fingerprint, Plus, Trash, ArrowsClockwise, ShieldCheck, Warning } from '@phosphor-icons/react'
import { startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser'

function SecurityKeysPage({ theme, lang, currentUser }) {
  const textColor = theme === 'light' ? '#111' : '#fff'
  const labelColor = theme === 'light' ? '#555' : 'rgba(255,255,255,0.6)'
  const bg = theme === 'light' ? '#f5f5f5' : '#0a0a0a'
  const cardBg = theme === 'light' ? '#fff' : '#1a1a1a'
  const cardBorder = theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'
  const inputBg = theme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'
  const inputBorder = theme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'

  const isVi = lang === 'vi'
  const [creds, setCreds] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')

  const supported = typeof window !== 'undefined'
    && typeof window.PublicKeyCredential !== 'undefined'
    && window.isSecureContext !== false
    && (() => { try { return browserSupportsWebAuthn() } catch { return false } })()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await window.electronAPI.listWebauthn()
      if (r?.ok) setCreds(r.credentials || [])
      else setError(r?.error || (isVi ? 'Không tải được danh sách khóa' : 'Failed to load keys'))
    } catch {
      setError(isVi ? 'Không tải được danh sách khóa' : 'Failed to load keys')
    } finally {
      setLoading(false)
    }
  }, [isVi])

  useEffect(() => { load() }, [load])

  const flash = (msg, isError = false) => {
    if (isError) { setError(msg); setNotice('') } else { setNotice(msg); setError('') }
    setTimeout(() => { setError(''); setNotice('') }, 5000)
  }

  const handleRegister = async () => {
    if (!supported) {
      flash(isVi
        ? 'Trình duyệt không hỗ trợ WebAuthn hoặc trang không phải HTTPS — WebAuthn chỉ chạy trên https:// hoặc http://localhost.'
        : 'WebAuthn is unavailable — it requires HTTPS or http://localhost.', true)
      return
    }
    setBusy(true)
    try {
      const opts = await window.electronAPI.webauthnRegisterOptions()
      if (!opts?.ok) { flash(opts?.error || 'error', true); return }
      const attestation = await startRegistration({ optionsJSON: opts.options })
      const verify = await window.electronAPI.webauthnRegisterVerify(attestation, name.trim())
      if (!verify?.ok) { flash(verify?.error || 'error', true); return }
      flash(isVi ? 'Đã đăng ký khóa bảo mật' : 'Security key registered')
      setName('')
      await load()
    } catch (err) {
      const msg = String(err?.message || err || '')
      if (msg.includes('Abort') || msg.includes('abort')) flash(isVi ? 'Đã hủy đăng ký' : 'Registration cancelled')
      else flash(msg || (isVi ? 'Đăng ký thất bại' : 'Registration failed'), true)
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (c) => {
    if (!window.confirm(isVi ? `Xóa khóa bảo mật "${c.name}"?` : `Delete security key "${c.name}"?`)) return
    setBusy(true)
    try {
      const r = await window.electronAPI.deleteWebauthn(c.id)
      if (r?.error) flash(r.error, true)
      else { flash(isVi ? 'Đã xóa khóa' : 'Key deleted'); await load() }
    } catch { flash(isVi ? 'Xóa thất bại' : 'Delete failed', true) } finally { setBusy(false) }
  }

  return (
    <div className="h-full overflow-auto p-6" style={{ background: bg }}>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2" style={{ color: textColor }}>
            <Fingerprint size={22} weight="duotone" style={{ color: '#a78bfa' }} />
            {isVi ? 'Security keys' : 'Security keys'}
          </h2>
          <p className="text-sm mt-1" style={{ color: labelColor }}>
            {isVi
              ? 'Khóa bảo mật / passkey (FIDO2, Touch ID, Windows Hello) để đăng nhập không cần mật khẩu.'
              : 'Security keys / passkeys (FIDO2, Touch ID, Windows Hello) for passwordless login.'}
          </p>
        </div>

        {!supported && (
          <div className="p-3 rounded-lg text-sm flex items-start gap-2" style={{
            background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.3)', color: '#fb923c',
          }}>
            <Warning size={16} weight="duotone" className="shrink-0 mt-0.5" />
            {isVi
              ? 'WebAuthn yêu cầu ngữ cảnh bảo mật: hãy truy cập panel qua https:// hoặc http://localhost. Khi mở bằng http://<IP>, trình duyệt sẽ chặn khóa bảo mật.'
              : 'WebAuthn needs a secure context: open the panel via https:// or http://localhost. Over http://<IP> browsers block security keys.'}
          </div>
        )}

        {(error || notice) && (
          <div className="p-3 rounded-lg text-sm" style={{
            background: error ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
            border: `1px solid ${error ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
            color: error ? '#f87171' : '#22c55e',
          }}>{error || notice}</div>
        )}

        <div className="rounded-2xl p-5 space-y-4" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
          <p className="text-sm font-semibold" style={{ color: textColor }}>{isVi ? 'Đăng ký khóa mới' : 'Register a new key'}</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text" value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isVi ? 'Tên khóa (tùy chọn, vd: YubiKey 5)' : 'Key name (optional, e.g. YubiKey 5)'}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm outline-none"
              style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
            />
            <button
              onClick={handleRegister}
              disabled={busy || !supported}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: '#a78bfa', color: '#fff' }}
            >
              <Plus size={16} weight="duotone" />
              {busy ? (isVi ? 'Đang chờ thiết bị…' : 'Waiting for device…') : (isVi ? 'Đăng ký khóa' : 'Register key')}
            </button>
          </div>
          <p className="text-[11px]" style={{ color: labelColor }}>
            {isVi
              ? 'Trình duyệt sẽ yêu cầu bạn chạm vào sensor vân tay / PIN / khóa USB. Sau khi đăng ký, có thể chọn "Đăng nhập bằng khóa bảo mật" ở màn hình đăng nhập.'
              : 'The browser will ask for fingerprint / PIN / USB key. After registering you can use "Sign in with security key" on the login screen.'}
          </p>
        </div>

        <div className="rounded-2xl overflow-hidden" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
          <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${cardBorder}` }}>
            <p className="text-sm font-semibold" style={{ color: textColor }}>{isVi ? `Khóa của ${currentUser?.username || ''} (${creds.length})` : `Keys of ${currentUser?.username || ''} (${creds.length})`}</p>
            <button onClick={load} className="flex items-center gap-1.5 text-xs" style={{ color: labelColor }}>
              <ArrowsClockwise size={14} weight="duotone" />
              {isVi ? 'Tải lại' : 'Refresh'}
            </button>
          </div>
          {loading ? (
            <p className="px-5 py-8 text-sm text-center" style={{ color: labelColor }}>{isVi ? 'Đang tải…' : 'Loading…'}</p>
          ) : creds.length === 0 ? (
            <p className="px-5 py-8 text-sm text-center" style={{ color: labelColor }}>{isVi ? 'Chưa có khóa bảo mật nào' : 'No security keys yet'}</p>
          ) : (
            creds.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 px-5 py-3" style={{ borderTop: i === 0 ? 'none' : `1px solid ${cardBorder}` }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(167,139,250,0.15)' }}>
                  <Fingerprint size={16} weight="duotone" style={{ color: '#a78bfa' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: textColor }}>{c.name}</p>
                  <p className="text-[11px] truncate" style={{ color: labelColor }}>
                    {isVi ? 'đăng ký' : 'registered'} {new Date(c.createdAt).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US')}
                    {' · '}{c.lastUsedAt
                      ? (isVi ? 'dùng lần cuối ' : 'last used ') + new Date(c.lastUsedAt).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US')
                      : (isVi ? 'chưa dùng' : 'never used')}
                    {c.credentialDeviceType ? ` · ${c.credentialDeviceType === 'multiDevice' ? (isVi ? 'passkey đám mây' : 'multi-device passkey') : (isVi ? 'thiết bị một máy' : 'single-device')}` : ''}
                  </p>
                </div>
                <span className="text-[11px] font-semibold px-2 py-1 rounded-full flex items-center gap-1 shrink-0" style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}>
                  <ShieldCheck size={12} weight="duotone" />
                  {c.credentialBackedUp ? (isVi ? 'đã sao lưu' : 'backed up') : 'FIDO2'}
                </span>
                <button onClick={() => handleDelete(c)} disabled={busy} className="p-1.5 rounded-lg disabled:opacity-50 shrink-0" style={{ color: '#f87171' }} title={isVi ? 'Xóa' : 'Delete'}>
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

export default SecurityKeysPage
