import { useState, useEffect, useCallback } from 'react'
import { UserPlus, ShieldCheck, Shield, Trash, ArrowsClockwise } from '@phosphor-icons/react'

function AdminUsersPage({ theme, lang, currentUser }) {
  const textColor = theme === 'light' ? '#111' : '#fff'
  const labelColor = theme === 'light' ? '#555' : 'rgba(255,255,255,0.6)'
  const bg = theme === 'light' ? '#f5f5f5' : '#0a0a0a'
  const cardBg = theme === 'light' ? '#fff' : '#1a1a1a'
  const cardBorder = theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'
  const inputBg = theme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'
  const inputBorder = theme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ username: '', password: '' })

  const isVi = lang === 'vi'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await window.electronAPI.listUsers()
      if (res?.ok) setUsers(res.users || [])
      else setError(res?.error || (isVi ? 'Không tải được danh sách' : 'Failed to load users'))
    } catch {
      setError(isVi ? 'Không tải được danh sách' : 'Failed to load users')
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
    if (!form.username || !form.password) return
    setBusy(true)
    try {
      const res = await window.electronAPI.createUser(form.username, form.password)
      if (res?.error) flash(res.error, true)
      else {
        flash(isVi ? `Đã tạo tài khoản "${form.username}"` : `Created account "${form.username}"`)
        setForm({ username: '', password: '' })
        await load()
      }
    } catch {
      flash(isVi ? 'Tạo tài khoản thất bại' : 'Failed to create account', true)
    } finally {
      setBusy(false)
    }
  }

  const handleToggleAdmin = async (u) => {
    setBusy(true)
    try {
      const res = await window.electronAPI.setUserAdmin(u.id, !u.admin)
      if (res?.error) flash(res.error, true)
      else {
        flash(!u.admin
          ? (isVi ? `Đã cấp quản trị cho "${u.username}"` : `Made "${u.username}" an admin`)
          : (isVi ? `Đã thu hồi quản trị của "${u.username}"` : `Removed admin from "${u.username}"`))
        await load()
      }
    } catch {
      flash(isVi ? 'Cập nhật thất bại' : 'Update failed', true)
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (u) => {
    if (!window.confirm(isVi
      ? `Xóa tài khoản "${u.username}"? Các server của họ sẽ do quản trị viên quản lý.`
      : `Delete account "${u.username}"? Their servers will be managed by admins.`)) return
    setBusy(true)
    try {
      const res = await window.electronAPI.deleteUser(u.id)
      if (res?.error) flash(res.error, true)
      else {
        flash(isVi ? `Đã xóa "${u.username}"` : `Deleted "${u.username}"`)
        await load()
      }
    } catch {
      flash(isVi ? 'Xóa thất bại' : 'Delete failed', true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-full overflow-auto p-6" style={{ background: bg }}>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: textColor }}>{isVi ? 'Người dùng' : 'Users'}</h2>
          <p className="text-sm mt-1" style={{ color: labelColor }}>
            {isVi ? 'Quản lý tài khoản truy cập panel. Quản trị viên có toàn quyền; người dùng chỉ thấy server của mình.'
                  : 'Manage panel accounts. Admins have full access; users only see their own servers.'}
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

        <form onSubmit={handleCreate} className="rounded-2xl p-5 space-y-4" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
          <p className="text-sm font-semibold" style={{ color: textColor }}>{isVi ? 'Tạo tài khoản mới' : 'Create account'}</p>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3">
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder={isVi ? 'Tên đăng nhập (3-16 ký tự)' : 'Username (3-16 chars)'}
              minLength={3}
              maxLength={16}
              required
              className="px-4 py-2.5 rounded-lg text-sm outline-none"
              style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
            />
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={isVi ? 'Mật khẩu (tối thiểu 6)' : 'Password (min 6)'}
              minLength={6}
              required
              className="px-4 py-2.5 rounded-lg text-sm outline-none"
              style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
            />
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
              style={{ background: '#a78bfa', color: '#fff' }}
            >
              <UserPlus size={16} weight="duotone" />
              {isVi ? 'Tạo' : 'Create'}
            </button>
          </div>
        </form>

        <div className="rounded-2xl overflow-hidden" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
          <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${cardBorder}` }}>
            <p className="text-sm font-semibold" style={{ color: textColor }}>{isVi ? `Danh sách (${users.length})` : `All users (${users.length})`}</p>
            <button
              onClick={load}
              className="flex items-center gap-1.5 text-xs transition-colors"
              style={{ color: labelColor }}
            >
              <ArrowsClockwise size={14} weight="duotone" />
              {isVi ? 'Tải lại' : 'Refresh'}
            </button>
          </div>

          {loading ? (
            <p className="px-5 py-8 text-sm text-center" style={{ color: labelColor }}>{isVi ? 'Đang tải…' : 'Loading…'}</p>
          ) : users.length === 0 ? (
            <p className="px-5 py-8 text-sm text-center" style={{ color: labelColor }}>{isVi ? 'Chưa có người dùng' : 'No users yet'}</p>
          ) : (
            users.map((u, i) => (
              <div
                key={u.id}
                className="flex items-center gap-3 px-5 py-3"
                style={{ borderTop: i === 0 ? 'none' : `1px solid ${cardBorder}` }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ background: u.admin ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.06)', color: u.admin ? '#a78bfa' : labelColor }}
                >
                  {u.username.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate flex items-center gap-2" style={{ color: textColor }}>
                    {u.username}
                    {u.id === currentUser?.id && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.08)', color: labelColor }}>
                        {isVi ? 'bạn' : 'you'}
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] truncate" style={{ color: labelColor }}>
                    {u.createdAt ? new Date(u.createdAt).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US') : ''}
                  </p>
                </div>

                <span
                  className="text-[11px] font-semibold px-2 py-1 rounded-full flex items-center gap-1 shrink-0"
                  style={u.admin
                    ? { background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }
                    : { background: 'rgba(255,255,255,0.06)', color: labelColor }}
                >
                  {u.admin ? <ShieldCheck size={12} weight="duotone" /> : <Shield size={12} weight="duotone" />}
                  {u.admin ? (isVi ? 'Quản trị' : 'Admin') : (isVi ? 'Người dùng' : 'User')}
                </span>

                <button
                  onClick={() => handleToggleAdmin(u)}
                  disabled={busy}
                  className="text-[11px] font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 shrink-0"
                  style={{ background: u.admin ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', color: u.admin ? '#f87171' : '#22c55e' }}
                >
                  {u.admin ? (isVi ? 'Thu hồi QT' : 'Revoke admin') : (isVi ? 'Cấp QT' : 'Make admin')}
                </button>

                <button
                  onClick={() => handleDelete(u)}
                  disabled={busy || u.id === currentUser?.id}
                  title={u.id === currentUser?.id ? (isVi ? 'Không thể xóa chính mình' : 'Cannot delete yourself') : undefined}
                  className="p-1.5 rounded-lg transition-colors disabled:opacity-30 shrink-0"
                  style={{ color: '#f87171' }}
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

export default AdminUsersPage
