import { useState, useEffect, useCallback } from 'react'
import {
  UserIcon, LockClosedIcon, EyeIcon, EyeSlashIcon,
  ServerIcon, CheckCircleIcon, XCircleIcon, ArrowPathIcon,
} from '@heroicons/react/24/outline'
import { useApp } from '../i18n/AppContext'
import { t } from '../i18n/translations'

function getPasswordStrength(pw) {
  let score = 0
  if (pw.length >= 6) score++
  if (pw.length >= 10) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  return score
}

const strengthColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a78bfa']
const strengthKeys = ['strength.veryWeak', 'strength.weak', 'strength.fair', 'strength.strong', 'strength.veryStrong']

function StepDots({ step, lang }) {
  const labels = [
    t(lang, 'setup.step.account'),
    t(lang, 'setup.step.node'),
    t(lang, 'setup.step.done'),
  ]
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {labels.map((label, i) => (
        <div key={i} className="flex items-center gap-2">
          {i > 0 && <div className="w-6 h-px" style={{ background: 'rgba(255,255,255,0.15)' }} />}
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all"
            style={{
              background: i <= step ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${i <= step ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.1)'}`,
              color: i <= step ? '#c4b5fd' : 'rgba(255,255,255,0.4)',
            }}
          >
            <span className="w-4 h-4 rounded-full text-[9px] flex items-center justify-center" style={{ background: i < step ? '#22c55e' : i === step ? '#8b5cf6' : 'rgba(255,255,255,0.1)' }}>
              {i < step ? '✓' : i + 1}
            </span>
            {label}
          </div>
        </div>
      ))}
    </div>
  )
}

function StatusCard({ label, ok, detail, theme, action }) {
  const textColor = theme === 'light' ? '#111' : '#fff'
  const labelColor = theme === 'light' ? '#555' : 'rgba(255,255,255,0.6)'
  return (
    <div
      className="flex items-center justify-between gap-3 p-4 rounded-xl"
      style={{
        background: theme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${theme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        {ok
          ? <CheckCircleIcon className="w-5 h-5 shrink-0" style={{ color: '#22c55e' }} />
          : <XCircleIcon className="w-5 h-5 shrink-0" style={{ color: '#ef4444' }} />}
        <div className="min-w-0">
          <div className="text-sm font-semibold" style={{ color: textColor }}>{label}</div>
          {detail && <div className="text-[11px] truncate" style={{ color: labelColor }}>{detail}</div>}
        </div>
      </div>
      {action}
    </div>
  )
}

function SetupWizard({ onDone }) {
  const { lang, theme } = useApp()
  const [step, setStep] = useState(0)

  // step 0 — admin account
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // step 1 — node
  const [dockerOk, setDockerOk] = useState(null)
  const [dockerDetail, setDockerDetail] = useState('')
  const [wingsOk, setWingsOk] = useState(null)
  const [wingsDetail, setWingsDetail] = useState('')
  const [nodeBusy, setNodeBusy] = useState('')
  const [log, setLog] = useState('')
  const [result, setResult] = useState(null)
  const [panelVersion, setPanelVersion] = useState('')

  useEffect(() => {
    window.electronAPI?.getVersion?.().then((v) => setPanelVersion(typeof v === 'string' ? v : (v?.version || ''))).catch(() => {})
  }, [])

  const bg = theme === 'light' ? '#f5f5f5' : '#0a0a0a'
  const textColor = theme === 'light' ? '#111' : '#fff'
  const labelColor = theme === 'light' ? '#555' : 'rgba(255,255,255,0.6)'
  const inputStyle = {
    background: theme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
    border: `1px solid ${theme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
    color: textColor,
  }
  const pwScore = getPasswordStrength(password)

  const refreshNode = useCallback(async () => {
    try {
      const d = await window.electronAPI.checkDocker()
      setDockerOk(!!d?.installed)
      const dockerState = d?.running ? (lang === 'vi' ? 'đang chạy' : 'running') : (lang === 'vi' ? 'chưa chạy' : 'not running')
      setDockerDetail(d?.installed ? `${(d.version || '').replace('Docker version ', '')} (${dockerState})` : (lang === 'vi' ? 'chưa cài' : 'not installed'))
    } catch { setDockerOk(false); setDockerDetail('') }
    try {
      const w = await window.electronAPI.getWingsStatus()
      setWingsOk(!!w?.installed)
      const wingsState = w?.running ? (lang === 'vi' ? 'đang chạy' : 'running') : (lang === 'vi' ? 'chưa chạy' : 'not running')
      setWingsDetail(w?.installed ? `v${w.version || '?'} (${wingsState})` : (lang === 'vi' ? 'chưa cài' : 'not installed'))
    } catch { setWingsOk(false); setWingsDetail('') }
  }, [lang])

  useEffect(() => {
    if (step === 1) refreshNode()
  }, [step, refreshNode])

  const handleAccount = async (e) => {
    e.preventDefault()
    setError('')
    if (!username || !password) { setError(t(lang, 'login.error.empty')); return }
    if (password.length < 6) { setError(t(lang, 'login.error.shortPassword')); return }
    if (password !== confirmPassword) { setError(t(lang, 'login.password.mismatch')); return }
    setLoading(true)
    try {
      let r = await window.electronAPI.register(username, password)
      if (r?.error) { setError(r.error); return }
      r = await window.electronAPI.login(username, password, true)
      if (r?.error) { setError(r.error); return }
      if (r?.ok) {
        setResult({ user: r.user, session: r.session })
        setStep(1)
      }
    } catch {
      setError(t(lang, 'login.error.general'))
    } finally {
      setLoading(false)
    }
  }

  const appendLog = (line) => setLog(prev => (prev ? prev + '\n' : '') + line)

  const installDocker = async () => {
    setNodeBusy('docker')
    setLog('')
    appendLog('[INFO] ' + (lang === 'vi' ? 'Đang cài Docker...' : 'Installing Docker...'))
    try {
      const res = await window.electronAPI.installDocker()
      if (res?.ok) appendLog(`[OK] ${lang === 'vi' ? 'Cài Docker thành công' : 'Docker installed'} (${res.version || ''})`)
      else appendLog('[LỖI] ' + (res?.needAuth ? (lang === 'vi' ? 'Cần quyền root' : 'Needs root') : (res?.error || 'Unknown error')))
    } catch (err) { appendLog('[LỖI] ' + (err?.message || String(err))) }
    setNodeBusy('')
    refreshNode()
  }

  const installWings = async () => {
    setNodeBusy('wings')
    setLog('')
    appendLog('[INFO] ' + (lang === 'vi' ? 'Đang cài Wings...' : 'Installing Wings...'))
    try {
      const res = await window.electronAPI.installWings()
      if (res?.ok) appendLog(`[OK] ${lang === 'vi' ? 'Cài Wings thành công' : 'Wings installed'} (v${res.version || '?'})`)
      else { appendLog('[LỖI] ' + (res?.error || 'Unknown error')); setNodeBusy(''); return }
      appendLog('[INFO] ' + (lang === 'vi' ? 'Đang tạo cấu hình Wings...' : 'Generating Wings config...'))
      const cfg = await window.electronAPI.generateWingsConfig()
      if (cfg?.ok) appendLog('[OK] ' + (lang === 'vi' ? 'Đã tạo cấu hình Wings!' : 'Wings config created!'))
      else appendLog('[LỖI] ' + (cfg?.error || ''))
    } catch (err) { appendLog('[LỖI] ' + (err?.message || String(err))) }
    setNodeBusy('')
    refreshNode()
  }

  return (
    <div className="flex items-center justify-center w-full h-full overflow-auto" style={{ background: bg }}>
      <div className="relative z-10 w-full max-w-md p-8 my-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4" style={{ background: 'linear-gradient(135deg, #a78bfa, #818cf8)' }}>
            <ServerIcon className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: textColor }}>{t(lang, 'setup.title')}</h1>
          <p className="text-sm" style={{ color: labelColor }}>{t(lang, 'setup.subtitle')}</p>
        </div>

        <StepDots step={step} lang={lang} />

        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {step === 0 && (
          <form onSubmit={handleAccount} className="space-y-4">
            <div>
              <label className="block text-sm mb-2" style={{ color: labelColor }}>{t(lang, 'setup.adminAccount')}</label>
              <div className="relative">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-3 pl-10 rounded-lg text-sm outline-none"
                  style={inputStyle}
                  placeholder={t(lang, 'login.username.placeholder')}
                  minLength={3}
                  maxLength={16}
                  required
                />
                <UserIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: labelColor }} />
              </div>
            </div>

            <div>
              <label className="block text-sm mb-2" style={{ color: labelColor }}>{t(lang, 'login.password')}</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 pl-10 pr-12 rounded-lg text-sm outline-none"
                  style={inputStyle}
                  placeholder={t(lang, 'login.password.placeholder')}
                  minLength={6}
                  required
                />
                <LockClosedIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: labelColor }} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: labelColor }}>
                  {showPassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                </button>
              </div>
              {password.length > 0 && (
                <div className="flex gap-1.5 mt-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < pwScore ? strengthColors[Math.min(pwScore, 5)] : 'rgba(255,255,255,0.08)' }} />
                  ))}
                  {pwScore > 0 && (
                    <span className="text-[11px] ml-1" style={{ color: strengthColors[Math.min(pwScore, 5)] }}>
                      {t(lang, strengthKeys[Math.min(pwScore, 5) - 1])}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm mb-2" style={{ color: labelColor }}>{t(lang, 'login.confirmPassword')}</label>
              <div className="relative">
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 pl-10 rounded-lg text-sm outline-none"
                  style={inputStyle}
                  placeholder={t(lang, 'login.confirmPassword.placeholder')}
                  minLength={6}
                  required
                />
                <LockClosedIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: labelColor }} />
              </div>
              {confirmPassword.length > 0 && password !== confirmPassword && (
                <p className="text-[11px] mt-1.5" style={{ color: '#f87171' }}>{t(lang, 'login.password.mismatch')}</p>
              )}
            </div>

            <div className="p-3 bg-purple-500/15 border border-purple-500/30 rounded-lg text-[13px] text-purple-300">
              {t(lang, 'setup.adminHint')}
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-3 rounded-lg text-sm font-medium disabled:opacity-50">
              {loading ? t(lang, 'login.processing') : t(lang, 'setup.next')}
            </button>
          </form>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <StatusCard
              label="Docker"
              ok={dockerOk}
              detail={dockerDetail}
              theme={theme}
              action={
                <button
                  onClick={installDocker}
                  disabled={!!nodeBusy}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-50 transition-all hover:opacity-80"
                  style={{ background: 'linear-gradient(135deg, #a78bfa, #818cf8)', color: '#fff' }}
                >
                  {nodeBusy === 'docker' ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : t(lang, 'setup.install')}
                </button>
              }
            />
            <StatusCard
              label="Wings"
              ok={wingsOk}
              detail={wingsDetail}
              theme={theme}
              action={
                <button
                  onClick={installWings}
                  disabled={!!nodeBusy}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-50 transition-all hover:opacity-80"
                  style={{ background: 'linear-gradient(135deg, #a78bfa, #818cf8)', color: '#fff' }}
                >
                  {nodeBusy === 'wings' ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : t(lang, 'setup.install')}
                </button>
              }
            />
            <StatusCard label={t(lang, 'setup.panel')} ok={true} detail={panelVersion ? `v${panelVersion}` : ''} theme={theme} action={null} />

            {log && (
              <pre className="p-3 rounded-lg text-[11px] font-mono whitespace-pre-wrap max-h-40 overflow-auto" style={{ background: 'rgba(0,0,0,0.5)', color: '#86efac', border: '1px solid rgba(255,255,255,0.1)' }}>
                {log}
              </pre>
            )}

            <div className="flex gap-2">
              <button
                onClick={refreshNode}
                disabled={!!nodeBusy}
                className="flex-1 py-3 rounded-lg text-sm font-medium transition-all hover:opacity-80 disabled:opacity-50"
                style={{ background: 'rgba(255,255,255,0.06)', color: textColor, border: '1px solid rgba(255,255,255,0.1)' }}
              >
                {t(lang, 'setup.refresh')}
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={!!nodeBusy}
                className="flex-1 btn-primary py-3 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {dockerOk && wingsOk ? t(lang, 'setup.next') : t(lang, 'setup.skip')}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 text-center">
            <CheckCircleIcon className="w-16 h-16 mx-auto" style={{ color: '#22c55e' }} />
            <div>
              <h2 className="text-lg font-bold mb-1" style={{ color: textColor }}>{t(lang, 'setup.done.title')}</h2>
              <p className="text-sm" style={{ color: labelColor }}>
                {lang === 'vi'
                  ? `Chào mừng ${result?.user?.username || ''}! Bạn đã sẵn sàng vận hành panel.`
                  : `Welcome ${result?.user?.username || ''}! Your panel is ready.`}
              </p>
            </div>
            <button
              onClick={() => onDone(result)}
              className="btn-primary w-full py-3 rounded-lg text-sm font-medium"
            >
              {t(lang, 'setup.finish')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default SetupWizard
