import { useApp } from '../i18n/AppContext'
import { t } from '../i18n/translations'

export default function SettingsPage({ theme, lang }) {
  const { setLang, setTheme } = useApp()

  const bg = theme === 'light' ? '#f5f5f5' : '#0a0a0a'
  const textColor = theme === 'light' ? '#111' : '#fff'
  const labelColor = theme === 'light' ? '#555' : 'rgba(255,255,255,0.7)'
  const inputBorder = theme === 'light' ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)'
  const sectionBg = theme === 'light' ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)'

  return (
    <div className="h-full w-full overflow-auto">
      <div className="p-6 min-h-full" style={{ background: bg }}>
        <div className="max-w-2xl mx-auto space-y-6">
          <h1 className="text-2xl font-bold" style={{ color: textColor }}>
            {t(lang, 'settings.title')}
          </h1>

          {/* ── Language ── */}
          <div className="rounded-xl p-5" style={{ background: sectionBg, border: `1px solid ${inputBorder}` }}>
            <label className="block text-sm font-medium mb-3" style={{ color: labelColor }}>
              {t(lang, 'settings.language')}
            </label>
            <div className="flex gap-3">
              <button onClick={() => setLang('vi')} className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${lang === 'vi' ? 'bg-purple-500/20 border-2 border-purple-500/50 text-purple-400' : 'border hover:border-white/20'}`} style={{ borderColor: lang !== 'vi' ? inputBorder : undefined, color: lang !== 'vi' ? labelColor : undefined }}>
                Tiếng Việt
              </button>
              <button onClick={() => setLang('en')} className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${lang === 'en' ? 'bg-purple-500/20 border-2 border-purple-500/50 text-purple-400' : 'border hover:border-white/20'}`} style={{ borderColor: lang !== 'en' ? inputBorder : undefined, color: lang !== 'en' ? labelColor : undefined }}>
                English
              </button>
            </div>
          </div>

          {/* ── Theme ── */}
          <div className="rounded-xl p-5" style={{ background: sectionBg, border: `1px solid ${inputBorder}` }}>
            <label className="block text-sm font-medium mb-3" style={{ color: labelColor }}>
              {t(lang, 'settings.theme')}
            </label>
            <div className="flex gap-3">
              <button onClick={() => setTheme('dark')} className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${theme === 'dark' ? 'bg-purple-500/20 border-2 border-purple-500/50 text-purple-400' : 'border hover:border-white/20'}`} style={{ borderColor: theme !== 'dark' ? inputBorder : undefined, color: theme !== 'dark' ? labelColor : undefined }}>
                {t(lang, 'settings.theme.dark')}
              </button>
              <button onClick={() => setTheme('light')} className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${theme === 'light' ? 'bg-purple-500/20 border-2 border-purple-500/50 text-purple-400' : 'border hover:border-white/20'}`} style={{ borderColor: theme !== 'light' ? inputBorder : undefined, color: theme !== 'light' ? labelColor : undefined }}>
                {t(lang, 'settings.theme.light')}
              </button>
            </div>
          </div>

          <div className="pb-8" />
        </div>
      </div>
    </div>
  )
}
