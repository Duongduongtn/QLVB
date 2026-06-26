import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom'
import { Bell, ChevronDown, Search, Menu, X, KeyRound, MonitorSmartphone, LogOut } from 'lucide-react'
import { navGroups } from '../nav'

type ViewUnit = 'all' | 'gdnn' | 'dvdl'

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation()
  return (
    <nav aria-label="Điều hướng chính">
      {navGroups.map((group) => (
        <div key={group.title}>
          <div className="eyebrow" style={{ margin: '24px 0 12px' }}>
            {group.title}
          </div>
          <div className="flex flex-col" style={{ gap: 2 }}>
            {group.items.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={onNavigate}
                    className="nav-item"
                    data-active={
                      pathname === item.to || (item.subs && pathname.startsWith('/moc-chu-ky'))
                        ? 'true'
                        : undefined
                    }
                  >
                    <Icon className="nav-icon" size={18} strokeWidth={1.5} />
                    <span>{item.label}</span>
                    {item.badge != null && <span className="nav-badge">{item.badge}</span>}
                  </NavLink>
                  {item.subs && (
                    <div>
                      {item.subs.map((sub) => (
                        <NavLink
                          key={sub.to}
                          to={sub.to}
                          onClick={onNavigate}
                          className="nav-sub"
                          data-active={pathname === sub.to ? 'true' : undefined}
                        >
                          {sub.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

export function AppShell() {
  const [view, setView] = useState<ViewUnit>('all')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const { pathname } = useLocation()

  // Đóng sidebar mobile + menu tài khoản khi đổi route
  useEffect(() => {
    setMobileOpen(false)
    setUserOpen(false)
  }, [pathname])

  // Phím tắt Ctrl/Cmd + K cho ô tìm kiếm
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        document.getElementById('global-search')?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div>
      {/* HEADER */}
      <header
        className="sticky top-0 z-30 bg-paper-raised border-b"
        style={{ borderColor: 'var(--rule)', height: 'var(--header-h)' }}
      >
        <div className="h-full flex items-center" style={{ padding: '0 16px', gap: 16 }}>
          <button
            className="icon-btn lg:hidden"
            aria-label="Mở menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={20} />
          </button>

          {/* Brand lockup */}
          <div className="flex items-center" style={{ gap: 10 }}>
            <div className="brand-mark" aria-hidden="true" />
            <span className="wordmark hidden sm:inline">QLCV</span>
          </div>

          <div className="flex-1" />

          {/* Switch view đơn vị */}
          <div className="seg hidden md:inline-flex" role="tablist" aria-label="Chọn đơn vị">
            <button data-active={view === 'all' ? 'true' : undefined} data-unit="all" onClick={() => setView('all')}>
              Tất cả
            </button>
            <button data-active={view === 'gdnn' ? 'true' : undefined} data-unit="gdnn" onClick={() => setView('gdnn')}>
              GDNN
            </button>
            <button data-active={view === 'dvdl' ? 'true' : undefined} data-unit="dvdl" onClick={() => setView('dvdl')}>
              DVDL
            </button>
          </div>

          {/* Search */}
          <div className="relative hidden sm:block">
            <Search
              className="absolute"
              size={16}
              style={{ left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-faint)' }}
            />
            <input id="global-search" className="search-input" type="search" placeholder="Tìm công văn… (Ctrl+K)" />
            <span className="kbd absolute" style={{ right: 8, top: '50%', transform: 'translateY(-50%)' }}>
              ⌘K
            </span>
          </div>

          {/* Notification bell */}
          <button className="icon-btn" aria-label="Thông báo">
            <Bell size={20} />
            <span className="noti-dot" />
          </button>

          {/* User menu */}
          <div className="relative">
            <button
              className="flex items-center"
              style={{ gap: 8, background: 'transparent', border: 'none', cursor: 'pointer' }}
              aria-label="Tài khoản"
              aria-haspopup="menu"
              aria-expanded={userOpen}
              onClick={() => setUserOpen((v) => !v)}
            >
              <span className="avatar">TB</span>
              <ChevronDown size={12} style={{ color: 'var(--ink-muted)' }} />
            </button>
            {userOpen && (
              <>
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 35 }}
                  aria-hidden="true"
                  onClick={() => setUserOpen(false)}
                />
                <div
                  role="menu"
                  className="card"
                  style={{ position: 'absolute', right: 0, top: 44, width: 220, padding: 6, zIndex: 36, boxShadow: '0 10px 30px oklch(18% 0.02 95 / 0.16)' }}
                >
                  <div style={{ padding: '8px 10px 10px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: '0.85rem' }}>Trần Văn B</div>
                    <div className="cell-meta">Quản lý · gd.gdnn</div>
                  </div>
                  <div style={{ height: 1, background: 'var(--rule)', margin: '0 -6px 6px' }} />
                  <Link to="/doi-mat-khau" className="nav-item" style={{ borderLeft: 'none' }} role="menuitem">
                    <KeyRound className="nav-icon" size={16} /> Đổi mật khẩu
                  </Link>
                  <Link to="/phien-dang-nhap" className="nav-item" style={{ borderLeft: 'none' }} role="menuitem">
                    <MonitorSmartphone className="nav-icon" size={16} /> Phiên đăng nhập
                  </Link>
                  <div style={{ height: 1, background: 'var(--rule)', margin: '6px -6px' }} />
                  <Link to="/login" className="nav-item" style={{ borderLeft: 'none', color: 'var(--danger)' }} role="menuitem">
                    <LogOut className="nav-icon" size={16} style={{ color: 'var(--danger)' }} /> Đăng xuất
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex" style={{ minHeight: 'calc(100vh - var(--header-h))' }}>
        {/* SIDEBAR — desktop */}
        <aside
          className="bg-paper-deep border-r flex-shrink-0 hidden lg:block"
          style={{
            width: 248,
            borderColor: 'var(--rule)',
            padding: '0 16px 24px',
            height: 'calc(100vh - var(--header-h))',
            position: 'sticky',
            top: 'var(--header-h)',
            overflowY: 'auto',
          }}
        >
          <Sidebar />
        </aside>

        {/* SIDEBAR — mobile drawer */}
        {mobileOpen && (
          <>
            <div className="backdrop lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />
            <aside
              className="bg-paper-deep border-r lg:hidden"
              style={{
                width: 280,
                borderColor: 'var(--rule)',
                padding: '0 16px 24px',
                position: 'fixed',
                top: 0,
                left: 0,
                bottom: 0,
                zIndex: 50,
                overflowY: 'auto',
              }}
            >
              <div className="flex items-center justify-between" style={{ height: 64 }}>
                <div className="flex items-center" style={{ gap: 12 }}>
                  <div className="brand-mark" aria-hidden="true" />
                  <span className="wordmark">QLCV</span>
                </div>
                <button className="icon-btn" aria-label="Đóng menu" onClick={() => setMobileOpen(false)}>
                  <X size={20} />
                </button>
              </div>
              <Sidebar onNavigate={() => setMobileOpen(false)} />
            </aside>
          </>
        )}

        {/* CONTENT */}
        <main className="flex-1" style={{ padding: '0 var(--main-pad-x) 40px', minWidth: 0 }}>
          <div style={{ maxWidth: 1600, margin: '0 auto' }}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
