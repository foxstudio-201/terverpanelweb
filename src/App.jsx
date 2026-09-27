import { useState, useEffect, useCallback, useRef } from 'react'
import { AppProvider, useApp } from './i18n/AppContext'
import { t } from './i18n/translations'
import { House, Gear, Heart, Cube, List, Terminal, Files, Database, Clock, Users, Archive, Network, Play, GearSix, ArrowLeft, ChartLineUp, ShieldCheck, Key, UserCircle, ChartBar, HardDrives, MapPin, Egg, ClockCounterClockwise, TerminalWindow, LockKey, Fingerprint } from '@phosphor-icons/react'
import TitleBar from './components/TitleBar'
import CloseModal from './components/CloseModal'
import TooltipProvider from './components/ui/TooltipProvider'
import ToastHost from './components/ui/ToastHost'
import NodePage from './components/NodePage'
import LoginPage from './components/LoginPage'
import SetupWizard from './components/SetupWizard'
import HomePage from './components/HomePage'
import DonatePage from './components/DonatePage'
import SettingsPage from './components/SettingsPage'
import AccountPage from './components/AccountPage'
import AdminUsersPage from './components/AdminUsersPage'
import AdminHomePage from './components/AdminHomePage'
import AdminServersPage from './components/AdminServersPage'
import ApiKeysPage from './components/ApiKeysPage'
import LocationsPage from './components/LocationsPage'
import NestsPage from './components/NestsPage'
import DbHostsPage from './components/DbHostsPage'
import ActivityPage from './components/ActivityPage'
import SnippetsPage from './components/SnippetsPage'
import SshKeysPage from './components/SshKeysPage'
import SecurityKeysPage from './components/SecurityKeysPage'
import ServerPanel from './components/server/ServerPanel'

function Spinner({ theme, lang, text }) {
  const textColor = theme === 'light' ? '#111' : '#fff'
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4" style={{ background: theme === 'light' ? '#f5f5f5' : '#0a0a0a' }}>
      <svg className="w-10 h-10 animate-spin" viewBox="0 0 50 50">
        <circle cx="25" cy="25" r="20" fill="none" stroke={theme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'} strokeWidth="4" />
        <path d="M25 5 A20 20 0 0 1 45 25" fill="none" stroke={textColor} strokeWidth="4" strokeLinecap="round" />
      </svg>
      <p className="text-sm" style={{ color: textColor }}>{text}</p>
    </div>
  )
}

const SERVER_PANEL_PAGES = [
  { key: 'server-overview', icon: ChartLineUp, label: 'Overview', labelVi: 'Tổng quan' },
  { key: 'server-console', icon: Terminal, label: 'Console', labelVi: 'Bảng điều khiển' },
  { key: 'server-files', icon: Files, label: 'Files', labelVi: 'Tệp tin' },
  { key: 'server-databases', icon: Database, label: 'Databases', labelVi: 'Cơ sở dữ liệu' },
  { key: 'server-schedules', icon: Clock, label: 'Schedules', labelVi: 'Lịch trình' },
  { key: 'server-users', icon: Users, label: 'Users', labelVi: 'Người dùng' },
  { key: 'server-backups', icon: Archive, label: 'Backups', labelVi: 'Sao lưu' },
  { key: 'server-network', icon: Network, label: 'Network', labelVi: 'Mạng' },
  { key: 'server-startup', icon: Play, label: 'Startup', labelVi: 'Khởi động' },
  { key: 'server-settings', icon: GearSix, label: 'Settings', labelVi: 'Cài đặt' },
]

// pages only admins may open — api is intentionally NOT here (users manage their own keys)
const ADMIN_PAGES = ['admin-home', 'docker', 'servers-admin', 'users', 'locations', 'nests', 'dbhosts']

function AppContent() {
  const { lang, theme } = useApp()
  const [session, setSession] = useState(null)
  const [activePage, setActivePage] = useState('servers')
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [version, setVersion] = useState('')
  const [dockerToast, setDockerToast] = useState(null)
  const [appMode, setAppMode] = useState('')

  const [phase, setPhase] = useState('startup-spinner')
  const [needsSetup, setNeedsSetup] = useState(false)
  const [displaySession, setDisplaySession] = useState(null)
  const [displayPage, setDisplayPage] = useState('servers')
  const [viewMode, setViewMode] = useState('user')
  const [savedCredentials, setSavedCredentials] = useState({ savedUsername: '', savedPassword: '', rememberMe: false })
  const [sidebarServers, setSidebarServers] = useState([])
  const [showServerDropdown, setShowServerDropdown] = useState(false)
  const [selectedSidebarServer, setSelectedSidebarServer] = useState(null)

  const startupDone = useRef(false)

  const isElectron = typeof window !== 'undefined' && window.electronAPI
  const isBasic = false // web edition: always full Wings + Docker mode
  const isWeb = typeof window !== 'undefined' && window.__TERVER_WEB__
  const isAdmin = !!displaySession?.user?.admin

  useEffect(() => {
    // Web edition: force advanced mode
    setAppMode('advanced')
  }, [])

  useEffect(() => {
    const checkSession = async () => {
      if (!isElectron) {
        startupDone.current = true
        setPhase('idle')
        return
      }
      // First run: no users yet → full-screen setup wizard (Calagopus-style OOBE)
      if (isWeb) {
        try {
          const oobe = await window.electronAPI.getOOBE()
          if (oobe?.needsSetup) {
            setNeedsSetup(true)
            startupDone.current = true
            setPhase('idle')
            return
          }
        } catch {}
      }
      window.electronAPI.getVersion().then(setVersion).catch(() => {})
      const settings = await window.electronAPI.getSettings()
      if (settings) {
        setSavedCredentials({
          savedUsername: settings.savedUsername || '',
          savedPassword: settings.savedPassword || '',
          rememberMe: settings.rememberMe || false,
        })
      }
      const result = await window.electronAPI.getSession()
      if (result?.ok) {
        setSession(result)
        setDisplaySession(result)
        const admin = !!result?.user?.admin
        setViewMode(admin ? 'admin' : 'user')
        setActivePage(admin ? 'admin-home' : 'servers')
        setDisplayPage(admin ? 'admin-home' : 'servers')
        setPhase('startup-spinner')
        setTimeout(() => {
          setPhase('fading-in')
          startupDone.current = true
          setTimeout(() => setPhase('idle'), 200)
        }, 800)
      } else {
        startupDone.current = true
        setPhase('idle')
      }
      window.electronAPI.getServerConfigs().then((res) => {
        if (res?.ok) setSidebarServers(res.servers || [])
      }).catch(() => {})
    }
    checkSession()
  }, [])

  useEffect(() => {
    if (!isElectron || !startupDone.current || isBasic) return
    const checkDocker = async () => {
      try {
        if (!displaySession?.user?.admin) return
        const res = await window.electronAPI.checkDocker()
        if (res && !res.installed) {
          setDockerToast({
            message: t(lang, 'docker.toast.notInstalled'),
            action: () => { setDockerToast(null); navigateTo('docker') },
            actionLabel: t(lang, 'docker.toast.setup'),
          })
        }
      } catch {}
    }
    const timer = setTimeout(checkDocker, 1500)
    return () => clearTimeout(timer)
  }, [isElectron, displaySession, isBasic])

  const refreshSidebarServers = () => {
    if (!isElectron) return
    window.electronAPI.getServerConfigs().then((res) => {
      if (res?.ok) setSidebarServers(res.servers || [])
    }).catch(() => {})
  }

  const handleCloseRequest = useCallback(async () => {
    if (!isElectron) return
    const s = await window.electronAPI.getSettings()
    if (s?.closeBehavior === 'quit') { window.electronAPI.quitApp(); return }
    if (s?.closeBehavior === 'tray') { window.electronAPI.closeWindow(); return }
    setShowCloseModal(true)
  }, [isElectron])

  const navigateTo = (page) => {
    let target = page
    if (ADMIN_PAGES.includes(target) && !isAdmin) target = 'servers'
    setPhase('fading-out')
    setTimeout(() => {
      setDisplayPage(target)
      setActivePage(target)
      setPhase('fading-in')
      setTimeout(() => setPhase('idle'), 200)
    }, 200)
  }

  const switchViewMode = (mode) => {
    if (mode === 'admin' && !isAdmin) return
    setSelectedSidebarServer(null)
    setShowServerDropdown(false)
    setViewMode(mode)
    if (mode === 'admin') {
      navigateTo(ADMIN_PAGES.includes(activePage) ? activePage : 'admin-home')
    } else {
      navigateTo('servers')
    }
  }

  const handleSelectServer = (srv) => {
    setSelectedSidebarServer(srv)
    setShowServerDropdown(false)
    navigateTo('server-overview')
  }

  const handleBackFromServer = () => {
    setSelectedSidebarServer(null)
    navigateTo('servers')
  }

  const handleLogin = (data) => {
    setNeedsSetup(false)
    setPhase('fading-out')
    setTimeout(() => {
      setSession(data)
      setDisplaySession(data)
      const admin = !!data?.user?.admin
      setViewMode(admin ? 'admin' : 'user')
      setActivePage(admin ? 'admin-home' : 'servers')
      setDisplayPage(admin ? 'admin-home' : 'servers')
      setPhase('login-spinner')
      setTimeout(() => {
        setPhase('fading-in')
        setTimeout(() => setPhase('idle'), 200)
      }, 800)
    }, 200)
  }

  const handleLogout = () => {
    setPhase('fading-out')
    setTimeout(() => {
      if (isElectron) {
        window.electronAPI.logout()
        window.electronAPI.saveSettings({ savedUsername: '', savedPassword: '', rememberMe: false })
      }
      setSession(null)
      setDisplaySession(null)
      setSelectedSidebarServer(null)
      setViewMode('user')
      setActivePage('servers')
      setDisplayPage('servers')
      setSavedCredentials({ savedUsername: '', savedPassword: '', rememberMe: false })
      setPhase('logout-spinner')
      setTimeout(() => {
        setPhase('fading-in')
        setTimeout(() => setPhase('idle'), 200)
      }, 800)
    }, 200)
  }

  const bg = theme === 'light' ? '#f5f5f5' : '#0a0a0a'
  const textColor = theme === 'light' ? '#111' : '#fff'
  const labelColor = theme === 'light' ? '#555' : 'rgba(255,255,255,0.6)'
  const borderColor = theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'

  const isFadingOut = phase === 'fading-out'
  const isFadingIn = phase === 'fading-in'
  const opacityClass = isFadingOut ? 'opacity-0' : isFadingIn ? 'opacity-100' : 'opacity-100'
  const transitionClass = `transition-opacity duration-200 ${opacityClass}`

  const renderContent = () => {
    if (phase === 'startup-spinner') {
      return <Spinner theme={theme} lang={lang} text={t(lang, 'transition.loggingIn')} />
    }
    if (phase === 'login-spinner') {
      return <Spinner theme={theme} lang={lang} text={t(lang, 'transition.loggingIn')} />
    }
    if (phase === 'logout-spinner') {
      return <Spinner theme={theme} lang={lang} text={t(lang, 'transition.loggingOut')} />
    }
    if (!displaySession) {
      if (needsSetup) {
        return (
          <div className="flex-1 flex items-center justify-center overflow-hidden">
            <SetupWizard onDone={handleLogin} />
          </div>
        )
      }
      return (
        <div className="flex-1 flex items-center justify-center overflow-hidden">
          <div className={transitionClass}>
            <LoginPage
              onLogin={handleLogin}
              initialUsername={savedCredentials.savedUsername}
              initialPassword={savedCredentials.savedPassword}
              initialRememberMe={savedCredentials.rememberMe}
            />
          </div>
        </div>
      )
    }

    const safePage = !isAdmin && ADMIN_PAGES.includes(displayPage) ? 'servers' : displayPage
    const isInServerPanel = safePage.startsWith('server-')

    return (
      <div className="flex flex-1 overflow-hidden relative pt-11">
        <nav className="absolute left-0 top-11 bottom-0 z-50 w-[180px] flex flex-col py-3" style={{ background: theme === 'light' ? '#fafafa' : '#0d0d0d', borderRight: `1px solid ${borderColor}` }}>
          <div className="flex flex-col gap-1 px-2 py-1 flex-1">
            {/* Server dropdown (user view only) */}
            {viewMode === 'user' && sidebarServers.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowServerDropdown(!showServerDropdown)}
                  className="w-full h-10 shrink-0 rounded-xl flex items-center gap-2.5 px-3 transition-all text-left overflow-hidden"
                  style={{
                    background: showServerDropdown ? 'rgba(167,139,250,0.12)' : 'transparent',
                    color: showServerDropdown ? '#a78bfa' : textColor,
                  }}
                >
                  {selectedSidebarServer ? (
                    <>
                      <img
                        src={selectedSidebarServer.game === 'minecraft' ? './minecraft_icon.png' : './terraria_icon.png'}
                        alt=""
                        className="w-5 h-5 rounded object-contain shrink-0"
                      />
                      <span className="text-xs font-semibold truncate flex-1">{selectedSidebarServer.name}</span>
                    </>
                  ) : (
                    <>
                      <List size={18} weight="duotone" style={{ color: labelColor }} />
                      <span className="text-xs font-medium" style={{ color: labelColor }}>{lang === 'vi' ? 'Chọn server' : 'Select server'}</span>
                    </>
                  )}
                  <svg className={`w-3 h-3 ml-auto shrink-0 transition-transform ${showServerDropdown ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: labelColor }}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </button>
                {showServerDropdown && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowServerDropdown(false)} />
                    <div
                      className="absolute left-full top-0 z-50 w-72 rounded-xl overflow-hidden shadow-2xl ml-2"
                      style={{ background: theme === 'light' ? '#fff' : '#1a1a1a', border: `1px solid ${borderColor}` }}
                    >
                      <div className="px-3 py-2.5" style={{ borderBottom: `1px solid ${borderColor}` }}>
                        <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: labelColor }}>
                          {lang === 'vi' ? 'Chọn server' : 'Select server'}
                        </p>
                      </div>
                      <div className="max-h-72 overflow-auto py-1">
                        {sidebarServers.length === 0 ? (
                          <p className="text-[11px] px-3 py-5 text-center" style={{ color: labelColor }}>
                            {lang === 'vi' ? 'Chưa có server nào' : 'No servers yet'}
                          </p>
                        ) : (
                          sidebarServers.map((srv, i) => {
                            const statusColor = srv.status === 'running' ? '#22c55e' : srv.status === 'installing' ? '#eab308' : '#ef4444'
                            const isSelected = selectedSidebarServer?.id === srv.id
                            return (
                              <button
                                key={srv.id || i}
                                onClick={() => handleSelectServer(srv)}
                                className="w-full px-3 py-2.5 flex items-center gap-2.5 transition-colors"
                                style={{ background: isSelected ? 'rgba(167,139,250,0.1)' : undefined }}
                              >
                                <img
                                  src={srv.game === 'minecraft' ? './minecraft_icon.png' : './terraria_icon.png'}
                                  alt=""
                                  className="w-8 h-8 rounded-lg object-contain shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold truncate" style={{ color: textColor }}>{srv.name}</p>
                                  <p className="text-[10px] truncate" style={{ color: labelColor }}>{srv.egg}</p>
                                </div>
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: statusColor }} />
                              </button>
                            )
                          })
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Server panel nav OR normal nav */}
            {selectedSidebarServer ? (
              <>
                <button
                  onClick={handleBackFromServer}
                  className="w-full h-10 shrink-0 rounded-xl flex items-center gap-2.5 px-3 transition-all text-left"
                  style={{ color: labelColor }}
                >
                  <ArrowLeft size={18} weight="duotone" />
                  <span className="text-xs font-medium">{t(lang, 'sidebar.home')}</span>
                </button>

                <div className="w-full h-px my-1" style={{ background: borderColor }} />

                {SERVER_PANEL_PAGES.map(p => {
                  const Icon = p.icon
                  const isActive = displayPage === p.key
                  return (
                    <button
                      key={p.key}
                      onClick={() => navigateTo(p.key)}
                      className="w-full h-9 shrink-0 rounded-xl flex items-center gap-2.5 px-3 transition-all text-left"
                      style={{
                        background: isActive ? 'rgba(167,139,250,0.12)' : 'transparent',
                        color: isActive ? '#a78bfa' : labelColor,
                      }}
                    >
                      <Icon size={16} weight="duotone" />
                      <span className="text-[11px] font-medium">{lang === 'vi' ? p.labelVi : p.label}</span>
                    </button>
                  )
                })}
              </>
            ) : viewMode === 'admin' ? (
              <>
                <button
                  onClick={() => switchViewMode('user')}
                  className="w-full h-10 shrink-0 rounded-xl flex items-center gap-2.5 px-3 transition-all text-left"
                  style={{ color: labelColor }}
                >
                  <ArrowLeft size={18} weight="duotone" />
                  <span className="text-xs font-medium">{t(lang, 'sidebar.userView')}</span>
                </button>

                <div className="w-full h-px my-1" style={{ background: borderColor }} />

                <button
                  onClick={() => navigateTo('admin-home')}
                  className="w-full h-10 shrink-0 rounded-xl flex items-center gap-2.5 px-3 transition-all text-left"
                  style={{
                    background: activePage === 'admin-home' ? 'rgba(167,139,250,0.12)' : 'transparent',
                    color: activePage === 'admin-home' ? '#a78bfa' : labelColor,
                  }}
                >
                  <ChartBar size={18} weight="duotone" />
                  <span className="text-xs font-medium">{lang === 'vi' ? 'Tổng quan' : 'Home'}</span>
                </button>

                <p className="text-[9px] font-bold uppercase tracking-wider px-3 pt-3 pb-1" style={{ color: labelColor }}>
                  {lang === 'vi' ? 'Hạ tầng' : 'Infrastructure'}
                </p>
                <button
                  onClick={() => navigateTo('docker')}
                  className="w-full h-9 shrink-0 rounded-xl flex items-center gap-2.5 px-3 transition-all text-left"
                  style={{
                    background: activePage === 'docker' ? 'rgba(167,139,250,0.12)' : 'transparent',
                    color: activePage === 'docker' ? '#a78bfa' : labelColor,
                  }}
                >
                  <Cube size={16} weight="duotone" />
                  <span className="text-[11px] font-medium">{lang === 'vi' ? 'Quản lý Node' : 'Node'}</span>
                </button>
                <button
                  onClick={() => navigateTo('servers-admin')}
                  className="w-full h-9 shrink-0 rounded-xl flex items-center gap-2.5 px-3 transition-all text-left"
                  style={{
                    background: activePage === 'servers-admin' ? 'rgba(167,139,250,0.12)' : 'transparent',
                    color: activePage === 'servers-admin' ? '#a78bfa' : labelColor,
                  }}
                >
                  <HardDrives size={16} weight="duotone" />
                  <span className="text-[11px] font-medium">{lang === 'vi' ? 'Tất cả server' : 'Servers'}</span>
                </button>
                <button
                  onClick={() => navigateTo('locations')}
                  className="w-full h-9 shrink-0 rounded-xl flex items-center gap-2.5 px-3 transition-all text-left"
                  style={{
                    background: activePage === 'locations' ? 'rgba(167,139,250,0.12)' : 'transparent',
                    color: activePage === 'locations' ? '#a78bfa' : labelColor,
                  }}
                >
                  <MapPin size={16} weight="duotone" />
                  <span className="text-[11px] font-medium">Locations</span>
                </button>
                <button
                  onClick={() => navigateTo('nests')}
                  className="w-full h-9 shrink-0 rounded-xl flex items-center gap-2.5 px-3 transition-all text-left"
                  style={{
                    background: activePage === 'nests' ? 'rgba(167,139,250,0.12)' : 'transparent',
                    color: activePage === 'nests' ? '#a78bfa' : labelColor,
                  }}
                >
                  <Egg size={16} weight="duotone" />
                  <span className="text-[11px] font-medium">{lang === 'vi' ? 'Nests & Eggs' : 'Nests & Eggs'}</span>
                </button>
                <button
                  onClick={() => navigateTo('dbhosts')}
                  className="w-full h-9 shrink-0 rounded-xl flex items-center gap-2.5 px-3 transition-all text-left"
                  style={{
                    background: activePage === 'dbhosts' ? 'rgba(167,139,250,0.12)' : 'transparent',
                    color: activePage === 'dbhosts' ? '#a78bfa' : labelColor,
                  }}
                >
                  <Database size={16} weight="duotone" />
                  <span className="text-[11px] font-medium">{lang === 'vi' ? 'Database hosts' : 'Database hosts'}</span>
                </button>

                <p className="text-[9px] font-bold uppercase tracking-wider px-3 pt-3 pb-1" style={{ color: labelColor }}>
                  {lang === 'vi' ? 'Người dùng & Quyền' : 'Users & Access'}
                </p>
                <button
                  onClick={() => navigateTo('users')}
                  className="w-full h-9 shrink-0 rounded-xl flex items-center gap-2.5 px-3 transition-all text-left"
                  style={{
                    background: activePage === 'users' ? 'rgba(167,139,250,0.12)' : 'transparent',
                    color: activePage === 'users' ? '#a78bfa' : labelColor,
                  }}
                >
                  <Users size={16} weight="duotone" />
                  <span className="text-[11px] font-medium">{t(lang, 'sidebar.users')}</span>
                </button>
                <button
                  onClick={() => navigateTo('api')}
                  className="w-full h-9 shrink-0 rounded-xl flex items-center gap-2.5 px-3 transition-all text-left"
                  style={{
                    background: activePage === 'api' ? 'rgba(167,139,250,0.12)' : 'transparent',
                    color: activePage === 'api' ? '#a78bfa' : labelColor,
                  }}
                >
                  <Key size={16} weight="duotone" />
                  <span className="text-[11px] font-medium">API Keys</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => navigateTo('servers')}
                  className="w-full h-10 shrink-0 rounded-xl flex items-center gap-2.5 px-3 transition-all text-left"
                  style={{
                    background: activePage === 'servers' ? 'rgba(167,139,250,0.12)' : 'transparent',
                    color: activePage === 'servers' ? '#a78bfa' : labelColor,
                  }}
                >
                  <House size={18} weight="duotone" />
                  <span className="text-xs font-medium">{t(lang, 'sidebar.home')}</span>
                </button>

                <button
                  onClick={() => navigateTo('donate')}
                  className="w-full h-10 shrink-0 rounded-xl flex items-center gap-2.5 px-3 transition-all text-left"
                  style={{
                    background: activePage === 'donate' ? 'rgba(167,139,250,0.12)' : 'transparent',
                    color: activePage === 'donate' ? '#a78bfa' : labelColor,
                  }}
                >
                  <Heart size={18} weight="duotone" />
                  <span className="text-xs font-medium">{t(lang, 'home.donate')}</span>
                </button>

                <button
                  onClick={() => navigateTo('api')}
                  className="w-full h-10 shrink-0 rounded-xl flex items-center gap-2.5 px-3 transition-all text-left"
                  style={{
                    background: activePage === 'api' ? 'rgba(167,139,250,0.12)' : 'transparent',
                    color: activePage === 'api' ? '#a78bfa' : labelColor,
                  }}
                >
                  <Key size={18} weight="duotone" />
                  <span className="text-xs font-medium">API Keys</span>
                </button>

                <p className="text-[9px] font-bold uppercase tracking-wider px-3 pt-3 pb-1" style={{ color: labelColor }}>
                  {lang === 'vi' ? 'Công cụ' : 'Tools'}
                </p>
                <button
                  onClick={() => navigateTo('snippets')}
                  className="w-full h-9 shrink-0 rounded-xl flex items-center gap-2.5 px-3 transition-all text-left"
                  style={{
                    background: activePage === 'snippets' ? 'rgba(167,139,250,0.12)' : 'transparent',
                    color: activePage === 'snippets' ? '#a78bfa' : labelColor,
                  }}
                >
                  <TerminalWindow size={16} weight="duotone" />
                  <span className="text-[11px] font-medium">{lang === 'vi' ? 'Command snippets' : 'Command snippets'}</span>
                </button>
                <button
                  onClick={() => navigateTo('activity')}
                  className="w-full h-9 shrink-0 rounded-xl flex items-center gap-2.5 px-3 transition-all text-left"
                  style={{
                    background: activePage === 'activity' ? 'rgba(167,139,250,0.12)' : 'transparent',
                    color: activePage === 'activity' ? '#a78bfa' : labelColor,
                  }}
                >
                  <ClockCounterClockwise size={16} weight="duotone" />
                  <span className="text-[11px] font-medium">{lang === 'vi' ? 'Nhật ký hoạt động' : 'Activity log'}</span>
                </button>
                <button
                  onClick={() => navigateTo('sshkeys')}
                  className="w-full h-9 shrink-0 rounded-xl flex items-center gap-2.5 px-3 transition-all text-left"
                  style={{
                    background: activePage === 'sshkeys' ? 'rgba(167,139,250,0.12)' : 'transparent',
                    color: activePage === 'sshkeys' ? '#a78bfa' : labelColor,
                  }}
                >
                  <LockKey size={16} weight="duotone" />
                  <span className="text-[11px] font-medium">SSH Keys</span>
                </button>
                <button
                  onClick={() => navigateTo('securitykeys')}
                  className="w-full h-9 shrink-0 rounded-xl flex items-center gap-2.5 px-3 transition-all text-left"
                  style={{
                    background: activePage === 'securitykeys' ? 'rgba(167,139,250,0.12)' : 'transparent',
                    color: activePage === 'securitykeys' ? '#a78bfa' : labelColor,
                  }}
                >
                  <Fingerprint size={16} weight="duotone" />
                  <span className="text-[11px] font-medium">{lang === 'vi' ? 'Security keys' : 'Security keys'}</span>
                </button>

                {isAdmin && (
                  <button
                    onClick={() => switchViewMode('admin')}
                    className="w-full h-10 shrink-0 rounded-xl flex items-center gap-2.5 px-3 transition-all text-left"
                    style={{
                      background: 'rgba(167,139,250,0.06)',
                      color: '#a78bfa',
                    }}
                  >
                    <ShieldCheck size={18} weight="duotone" />
                    <span className="text-xs font-medium">{t(lang, 'sidebar.adminPanel')}</span>
                  </button>
                )}
              </>
            )}
          </div>

          <div className="shrink-0 w-full flex flex-col items-center gap-2 pb-1 px-2">
            <button
              onClick={() => navigateTo('account')}
              className="w-full h-10 shrink-0 rounded-xl flex items-center gap-2.5 px-3 transition-all text-left"
              style={{
                background: activePage === 'account' ? 'rgba(167,139,250,0.12)' : 'transparent',
                color: activePage === 'account' ? '#a78bfa' : labelColor,
              }}
            >
              <UserCircle size={18} weight="duotone" />
              <span className="text-xs font-medium">{lang === 'vi' ? 'Tài khoản' : 'Account'}</span>
            </button>

            <button
              onClick={() => navigateTo('settings')}
              className="w-full h-10 shrink-0 rounded-xl flex items-center gap-2.5 px-3 transition-all text-left"
              style={{
                background: activePage === 'settings' ? 'rgba(167,139,250,0.12)' : 'transparent',
                color: activePage === 'settings' ? '#a78bfa' : labelColor,
              }}
            >
              <Gear size={18} weight="duotone" />
              <span className="text-xs font-medium">{t(lang, 'sidebar.settings')}</span>
            </button>

            <div className="w-full h-px" style={{ background: borderColor }} />

            <span className="text-[9px] font-mono leading-none whitespace-nowrap select-none" style={{ color: labelColor }}>
              {version ? `v${version}` : ''}
            </span>
          </div>
        </nav>

        <div className="absolute left-[180px] top-3 bottom-3 w-px" style={{ background: borderColor }} />

        <div className="flex-1 ml-[180px] overflow-hidden">
          <div className={`h-full ${transitionClass}`}>
            {safePage === 'servers' && <HomePage theme={theme} lang={lang} user={displaySession?.user} onServerCreated={refreshSidebarServers} onSelectServer={handleSelectServer} />}
            {safePage === 'donate' && <DonatePage theme={theme} lang={lang} />}
            {safePage === 'account' && <AccountPage theme={theme} lang={lang} user={displaySession?.user} onLogout={handleLogout} />}
            {safePage === 'admin-home' && isAdmin && <AdminHomePage theme={theme} lang={lang} onNavigate={navigateTo} />}
            {safePage === 'docker' && !isBasic && isAdmin && <NodePage theme={theme} lang={lang} />}
            {safePage === 'servers-admin' && isAdmin && <AdminServersPage theme={theme} lang={lang} onSelectServer={handleSelectServer} />}
            {safePage === 'users' && isAdmin && <AdminUsersPage theme={theme} lang={lang} currentUser={displaySession?.user} />}
            {safePage === 'api' && <ApiKeysPage theme={theme} lang={lang} currentUser={displaySession?.user} />}
            {safePage === 'locations' && isAdmin && <LocationsPage theme={theme} lang={lang} />}
            {safePage === 'nests' && isAdmin && <NestsPage theme={theme} lang={lang} />}
            {safePage === 'dbhosts' && isAdmin && <DbHostsPage theme={theme} lang={lang} />}
            {safePage === 'activity' && <ActivityPage theme={theme} lang={lang} currentUser={displaySession?.user} />}
            {safePage === 'snippets' && <SnippetsPage theme={theme} lang={lang} />}
            {safePage === 'sshkeys' && <SshKeysPage theme={theme} lang={lang} currentUser={displaySession?.user} />}
            {safePage === 'securitykeys' && <SecurityKeysPage theme={theme} lang={lang} currentUser={displaySession?.user} />}
            {safePage === 'settings' && <SettingsPage theme={theme} lang={lang} onAppModeChange={setAppMode} appMode={appMode} />}
            {isInServerPanel && selectedSidebarServer && (
              <ServerPanel key={selectedSidebarServer.id} server={selectedSidebarServer} theme={theme} lang={lang} displayPage={displayPage} onBack={handleBackFromServer} onServerDeleted={refreshSidebarServers} onServerUpdate={(srv) => setSelectedSidebarServer(srv)} />
            )}
          </div>
        </div>

        <ToastHost theme={theme} />
        {dockerToast && (
          <div className="fixed bottom-5 right-5 z-[70]">
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg transition-all duration-300"
              style={{
                background: theme === 'light' ? '#fff' : '#1a1a1a',
                border: '1px solid #2496ed30',
                minWidth: '320px',
                maxWidth: '420px',
              }}
            >
              <svg className="w-5 h-5 shrink-0" style={{ color: '#2496ed' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs flex-1" style={{ color: textColor }}>{dockerToast.message}</span>
              <button
                onClick={dockerToast.action}
                className="px-3 py-1 rounded-lg text-[11px] font-semibold shrink-0 transition-colors"
                style={{ background: '#2496ed20', color: '#2496ed' }}
              >
                {dockerToast.actionLabel}
              </button>
              <button
                onClick={() => setDockerToast(null)}
                className="w-5 h-5 flex items-center justify-center shrink-0"
                style={{ color: labelColor }}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="w-screen h-screen flex flex-col overflow-hidden relative z-10" style={{ background: 'transparent' }}>
      <TitleBar onCloseRequest={handleCloseRequest} user={displaySession?.user} onLogout={handleLogout} lang={lang} theme={theme} server={selectedSidebarServer} appMode={appMode} />
      {renderContent()}
      {showCloseModal && (
        <CloseModal onClose={() => setShowCloseModal(false)} />
      )}
      <TooltipProvider />
    </div>
  )
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}

export default App
