import { useState, useEffect } from 'react'
import {
  UserCircleIcon, KeyIcon, ComputerDesktopIcon, ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import { showToast } from '../lib/toast'

function Card({ title, icon, children, theme }) {
  const textColor = theme === 'light' ? '#111' : '#fff'
  return (
    <div
      className="rounded-2xl p-6"
      style={{
        background: theme === 'light' ? '#fff' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'}`,
      }}
    >
      <div className="flex items-center gap-2.5 mb-5">
        <span style={{ color: '#a78bfa' }}>{icon}</span>
        <h2 className="text-sm font-bold" style={{ color: textColor }}>{title}</h2>
      </div>
      {children}
    </div>
  )
}

function AccountPage({ theme, lang, user, onLogout }) {
  const textColor = theme === 'light' ? '#111' : '#fff'
  const labelColor = theme === 'light' ? '#555' : 'rgba(255,255,255,0.6)'
  const inputStyle = {
    background: theme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
    border: `1px solid ${theme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
    color: textColor,
  }

  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPw, setSavingPw] = useState(false)
  const [sessions, setSessions] = useState([])

  const loadSessions = async () => {
    try {
      const r = await window.electronAPI.listSessions()
      if (r?.ok) setSessions(r.sessions || [])
    } catch {}
  }

  useEffect(() => { loadSessions() }, [])

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (newPassword.length < 6) {
      showToast(lang === 'vi' ? 'Mật khẩu mới phải ít nhất 6 ký tự' : 'New password must be at least 6 characters', 'error')
      return
    }
    if (newPassword !== confirmPassword) {
      showToast(lang === 'vi' ? 'Mật khẩu xác nhận không khớp' : 'Passwords do not match', 'error')
      return
    }
    setSavingPw(true)
    try {
      const r = await window.electronAPI.changePassword(oldPassword, newPassword)
      if (r?.ok) {
        showToast(lang === 'vi' ? 'Đã đổi mật khẩu!' : 'Password changed!', 'success')
        setOldPassword(''); setNewPassword(''); setConfirmPassword('')
        loadSessions()
      } else {
        showToast(r?.error || (lang === 'vi' ? 'Đổi mật khẩu thất bại' : 'Change failed'), 'error')
      }
    } catch {
      showToast(lang === 'vi' ? 'Đổi mật khẩu thất bại' : 'Change failed', 'error')
    }
    setSavingPw(false)
  }

  const handleRevoke = async (id) => {
    try {
      const r = await window.electronAPI.revokeSession(id)
      if (r?.ok) {
        showToast(lang === 'vi' ? 'Đã đăng xuất phiên' : 'Session revoked', 'success')
        loadSessions()
      } else {
        showToast(r?.error || 'Error', 'error')
      }
    } catch {}
  }

  const handleRevokeOthers = async () => {
    const others = sessions.filter(s => !s.current)
    for (const s of others) {
      await window.electronAPI.revokeSession(s.id).catch(() => {})
    }
    showToast(lang === 'vi' ? `Đã đăng xuất ${others.length} phiên khác` : `Revoked ${others.length} other sessions`, 'success')
    loadSessions()
  }

  const formatDate = (iso) => {
    if (!iso) return '—'
    try { return new Date(iso).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US') } catch { return iso }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <UserCircleIcon className="w-7 h-7" style={{ color: '#a78bfa' }} />
        <div>
          <h1 className="text-lg font-bold" style={{ color: textColor }}>{user?.username}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{
                background: user?.admin ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.08)',
                color: user?.admin ? '#c4b5fd' : labelColor,
                border: `1px solid ${user?.admin ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.1)'}`,
              }}
            >
              {user?.admin ? (lang === 'vi' ? 'Quản trị viên' : 'Administrator') : (lang === 'vi' ? 'Người dùng' : 'User')}
            </span>
            <span className="text-[11px]" style={{ color: labelColor }}>
              {lang === 'vi' ? 'Tham gia' : 'Joined'} {formatDate(user?.createdAt)}
            </span>
          </div>
        </div>
      </div>

      <Card title={lang === 'vi' ? 'Đổi mật khẩu' : 'Change password'} icon={<KeyIcon className="w-4 h-4" />} theme={theme}>
        <form onSubmit={handleChangePassword} className="space-y-3">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: labelColor }}>{lang === 'vi' ? 'Mật khẩu hiện tại' : 'Current password'}</label>
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
              style={inputStyle}
              minLength={6}
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1.5" style={{ color: labelColor }}>{lang === 'vi' ? 'Mật khẩu mới' : 'New password'}</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={inputStyle}
                minLength={6}
                required
              />
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: labelColor }}>{lang === 'vi' ? 'Xác nhận mật khẩu mới' : 'Confirm new password'}</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={inputStyle}
                minLength={6}
                required
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px]" style={{ color: labelColor }}>
              {lang === 'vi' ? 'Các phiên khác sẽ bị đăng xuất sau khi đổi.' : 'Other sessions will be signed out.'}
            </p>
            <button type="submit" disabled={savingPw} className="btn-primary px-5 py-2 rounded-lg text-xs font-semibold disabled:opacity-50">
              {savingPw ? '…' : (lang === 'vi' ? 'Đổi mật khẩu' : 'Change password')}
            </button>
          </div>
        </form>
      </Card>

      <Card title={lang === 'vi' ? 'Phiên đăng nhập' : 'Active sessions'} icon={<ComputerDesktopIcon className="w-4 h-4" />} theme={theme}>
        {sessions.length === 0 && (
          <p className="text-xs" style={{ color: labelColor }}>{lang === 'vi' ? 'Không có phiên nào.' : 'No sessions.'}</p>
        )}
        <div className="space-y-2">
          {sessions.map(s => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg"
              style={{
                background: theme === 'light' ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold flex items-center gap-2" style={{ color: textColor }}>
                  <span className="truncate font-mono">{s.id.slice(0, 8)}…</span>
                  {s.current && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                      {lang === 'vi' ? 'HIỆN TẠI' : 'CURRENT'}
                    </span>
                  )}
                </div>
                <div className="text-[11px]" style={{ color: labelColor }}>{formatDate(s.createdAt)}</div>
              </div>
              {!s.current && (
                <button
                  onClick={() => handleRevoke(s.id)}
                  className="px-2.5 py-1 rounded text-[11px] font-semibold transition-all hover:opacity-80"
                  style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
                >
                  {lang === 'vi' ? 'Đăng xuất' : 'Revoke'}
                </button>
              )}
            </div>
          ))}
        </div>
        {sessions.some(s => !s.current) && (
          <div className="flex justify-end mt-3">
            <button
              onClick={handleRevokeOthers}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:opacity-80"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
            >
              {lang === 'vi' ? 'Đăng xuất các phiên khác' : 'Sign out other sessions'}
            </button>
          </div>
        )}
      </Card>

      <Card title={lang === 'vi' ? 'Bảo mật' : 'Security'} icon={<ShieldCheckIcon className="w-4 h-4" />} theme={theme}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs" style={{ color: labelColor }}>
            {lang === 'vi' ? 'Đăng xuất khỏi tài khoản trên thiết bị này.' : 'Sign out of your account on this device.'}
          </p>
          <button
            onClick={onLogout}
            className="px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:opacity-80"
            style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
          >
            {lang === 'vi' ? 'Đăng xuất' : 'Log out'}
          </button>
        </div>
      </Card>
    </div>
  )
}

export default AccountPage
