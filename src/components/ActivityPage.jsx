import { useState, useEffect, useCallback } from 'react'
import { ClockCounterClockwise, ArrowsClockwise, ShieldCheck, User, Key, Fingerprint, Gear } from '@phosphor-icons/react'

const TYPE_META = {
  auth: { color: '#3b82f6', icon: User },
  account: { color: '#22c55e', icon: User },
  admin: { color: '#f97316', icon: Gear },
  apikey: { color: '#a78bfa', icon: Key },
  security: { color: '#f87171', icon: Fingerprint },
}

function ActivityPage({ theme, lang, currentUser }) {
  const textColor = theme === 'light' ? '#111' : '#fff'
  const labelColor = theme === 'light' ? '#555' : 'rgba(255,255,255,0.6)'
  const bg = theme === 'light' ? '#f5f5f5' : '#0a0a0a'
  const cardBg = theme === 'light' ? '#fff' : '#1a1a1a'
  const cardBorder = theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'

  const isVi = lang === 'vi'
  const isAdmin = !!currentUser?.admin
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [scope, setScope] = useState('own')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (s = scope) => {
    setLoading(true)
    try {
      const r = await window.electronAPI.listActivity(isAdmin && s === 'all' ? 'all' : 'own', 200)
      if (r?.ok) { setItems(r.items || []); setTotal(r.total || 0) }
      else setError(r?.error || (isVi ? 'Không tải được hoạt động' : 'Failed to load activity'))
    } catch {
      setError(isVi ? 'Không tải được hoạt động' : 'Failed to load activity')
    } finally {
      setLoading(false)
    }
  }, [isVi, isAdmin, scope])

  useEffect(() => { load(scope) }, [load, scope])

  const fmt = (iso) => {
    try {
      return new Date(iso).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US', { dateStyle: 'short', timeStyle: 'medium' })
    } catch { return iso }
  }

  return (
    <div className="h-full overflow-auto p-6" style={{ background: bg }}>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2" style={{ color: textColor }}>
              <ClockCounterClockwise size={22} weight="duotone" style={{ color: '#22c55e' }} />
              {isVi ? 'Nhật ký hoạt động' : 'Activity log'}
            </h2>
            <p className="text-sm mt-1" style={{ color: labelColor }}>
              {isVi
                ? 'Lịch sử đăng nhập, đổi mật khẩu, API key, server, cấu hình quản trị… (tối đa 1.000 mục).'
                : 'History of logins, password changes, API keys, servers, admin actions… (last 1,000 entries).'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${cardBorder}` }}>
                <button
                  onClick={() => setScope('own')}
                  className="px-3 py-1.5 text-xs font-semibold"
                  style={{ background: scope === 'own' ? '#22c55e' : cardBg, color: scope === 'own' ? '#111' : labelColor }}
                >
                  {isVi ? 'Của tôi' : 'Mine'}
                </button>
                <button
                  onClick={() => setScope('all')}
                  className="px-3 py-1.5 text-xs font-semibold"
                  style={{ background: scope === 'all' ? '#22c55e' : cardBg, color: scope === 'all' ? '#111' : labelColor, borderLeft: `1px solid ${cardBorder}` }}
                >
                  {isVi ? 'Tất cả' : 'Everyone'}
                </button>
              </div>
            )}
            <button onClick={() => load(scope)} className="flex items-center gap-1.5 text-xs" style={{ color: labelColor }}>
              <ArrowsClockwise size={14} weight="duotone" />
              {isVi ? 'Tải lại' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg text-sm" style={{
            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171',
          }}>{error}</div>
        )}

        <div className="rounded-2xl overflow-hidden" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
          <div className="px-5 py-3" style={{ borderBottom: `1px solid ${cardBorder}` }}>
            <p className="text-sm font-semibold" style={{ color: textColor }}>
              {isVi ? `Gần đây (${items.length}${total > items.length ? `/${total}` : ''})` : `Recent (${items.length}${total > items.length ? `/${total}` : ''})`}
            </p>
          </div>
          {loading ? (
            <p className="px-5 py-8 text-sm text-center" style={{ color: labelColor }}>{isVi ? 'Đang tải…' : 'Loading…'}</p>
          ) : items.length === 0 ? (
            <p className="px-5 py-8 text-sm text-center" style={{ color: labelColor }}>{isVi ? 'Chưa có hoạt động nào' : 'No activity yet'}</p>
          ) : (
            items.map((a, i) => {
              const meta = TYPE_META[a.type] || { color: labelColor, icon: ShieldCheck }
              const Icon = meta.icon
              return (
                <div key={a.id} className="flex items-start gap-3 px-5 py-3" style={{ borderTop: i === 0 ? 'none' : `1px solid ${cardBorder}` }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: `${meta.color}22` }}>
                    <Icon size={14} weight="duotone" style={{ color: meta.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm break-words" style={{ color: textColor }}>{a.message}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: labelColor }}>
                      {a.username ? `${a.username} · ` : ''}{fmt(a.createdAt)}
                      {' · '}<span style={{ color: meta.color }}>{a.type}</span>
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

export default ActivityPage
