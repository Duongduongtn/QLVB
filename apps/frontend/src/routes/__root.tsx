import { useEffect, useMemo, useState } from 'react';
import {
  Link,
  Outlet,
  createRootRoute,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  Contact,
  Home,
  Inbox,
  KeyRound,
  LogOut,
  Menu,
  MonitorSmartphone,
  BarChart3,
  ScrollText,
  Search,
  Send,
  Settings,
  Stamp,
  Tag,
  Trash2,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';

import { api } from '~/lib/api';
import { useBranding } from '~/lib/branding';
import { useAuth, type Role } from '~/stores/auth';
import { useUnitView, type UnitView } from '~/stores/unitView';
import { NotificationBell } from '~/components/NotificationBell';

export const Route = createRootRoute({
  component: RootLayout,
});

/* ------------------------------------------------------------------ */
/* Cấu hình điều hướng — bám IA ui-demo (nav.tsx): nhóm Công việc /     */
/* Danh mục / Hệ thống. Chỉ trỏ tới route đã có; gate theo vai trò.     */
/* ------------------------------------------------------------------ */
interface NavSub {
  label: string;
  to: string;
}
interface NavEntry {
  label: string;
  to: string;
  icon: LucideIcon;
  managerOnly?: boolean;
  subs?: NavSub[];
}
interface NavGroup {
  title: string;
  items: NavEntry[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Công việc',
    items: [
      { label: 'Việc của tôi', to: '/viec-cua-toi', icon: Home },
      { label: 'Công văn đi', to: '/cong-van-di', icon: Send },
      { label: 'Công văn đến', to: '/cong-van-den', icon: Inbox },
    ],
  },
  {
    title: 'Tra cứu',
    items: [
      { label: 'Tìm kiếm', to: '/tim-kiem', icon: Search },
      { label: 'Tag', to: '/tag', icon: Tag },
    ],
  },
  {
    title: 'Danh mục',
    items: [
      { label: 'Danh bạ', to: '/danh-ba', icon: Contact },
      {
        label: 'Mộc & Chữ ký',
        to: '/moc',
        icon: Stamp,
        managerOnly: true,
        subs: [
          { label: 'Mộc', to: '/moc' },
          { label: 'Chữ ký', to: '/chu-ky' },
          { label: 'Hồ sơ ký', to: '/ho-so-ky' },
        ],
      },
    ],
  },
  {
    title: 'Hệ thống',
    items: [
      { label: 'Báo cáo', to: '/bao-cao', icon: BarChart3, managerOnly: true },
      { label: 'Cấu hình', to: '/cau-hinh', icon: Settings, managerOnly: true },
      { label: 'Người dùng', to: '/nguoi-dung', icon: Users, managerOnly: true },
      { label: 'Audit log', to: '/audit-log', icon: ScrollText, managerOnly: true },
      { label: 'Thùng rác', to: '/thung-rac', icon: Trash2, managerOnly: true },
    ],
  },
];

function RootLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const clear = useAuth((s) => s.clear);

  // Hydrate user từ cookie session (HttpOnly) khi tải app — phiên sống qua refresh.
  // 401 (chưa đăng nhập) trả về null, không retry.
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const { data } = await api.GET('/api/auth/me', {});
      return data ?? null;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (me) setUser({ ...me, role: me.role as Role });
    // PWA L1: chưa/đã hết đăng nhập (me === null, không phải undefined-đang-tải) → dọn cache
    // API offline để thiết bị chung không phục vụ lại CV của phiên trước (gồm CV mật).
    else if (me === null && 'caches' in window) void caches.delete('qlcv-api');
  }, [me, setUser]);

  async function handleLogout() {
    // Xoá phiên ở server trước; dù lỗi mạng vẫn dọn client + về trang login.
    try {
      await api.POST('/api/auth/logout', {});
    } finally {
      clear();
      queryClient.setQueryData(['me'], null);
      // PWA L1: dọn cache API của service worker để user khác (thiết bị chung) không
      // xem được dữ liệu CV đã cache offline của phiên trước.
      if ('caches' in window) void caches.delete('qlcv-api');
      navigate({ to: '/login' });
    }
  }

  // Chưa đăng nhập → render trang trần (login full-screen, không khung app).
  if (!user) {
    return <Outlet />;
  }

  return <AppShell user={user} onLogout={handleLogout} />;
}

/* ------------------------------------------------------------------ */
/* AppShell — sidebar 248px + header 52px, port từ ui-demo AppShell.tsx */
/* ------------------------------------------------------------------ */
function AppShell({
  user,
  onLogout,
}: {
  user: NonNullable<ReturnType<typeof useAuth.getState>['user']>;
  onLogout: () => void;
}) {
  const { data: branding } = useBranding();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Đóng sidebar mobile + menu tài khoản khi đổi route
  useEffect(() => {
    setMobileOpen(false);
    setUserOpen(false);
  }, [pathname]);

  // Phím tắt Ctrl/Cmd + K cho ô tìm kiếm
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.getElementById('global-search')?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const initials = useMemo(() => {
    const parts = user.full_name.trim().split(/\s+/);
    const last = parts.at(-1) ?? '';
    const first = parts.at(-2) ?? parts.at(0) ?? '';
    return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase() || 'U';
  }, [user.full_name]);

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
            {branding?.logo_file_id ? (
              <img
                src={`/api/settings/logo?v=${branding.logo_file_id}`}
                alt="Logo"
                className="object-contain"
                style={{ width: 32, height: 32, borderRadius: 4, flexShrink: 0 }}
              />
            ) : (
              <div className="brand-mark" aria-hidden="true" />
            )}
            <span className="wordmark hidden sm:inline">{branding?.app_name ?? 'QLCV'}</span>
          </div>

          <div className="flex-1" />

          {/* Switch view đơn vị (B3a) */}
          <UnitViewSeg role={user.role} />

          {/* Search toàn cục (Ctrl+K) — F1 full-text CV đi/đến */}
          <GlobalSearch />

          {/* Notification bell */}
          <NotificationBell />

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
              <span className="avatar">{initials}</span>
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
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: 44,
                    width: 220,
                    padding: 6,
                    zIndex: 36,
                    boxShadow: '0 10px 30px oklch(18% 0.02 95 / 0.16)',
                  }}
                >
                  <div style={{ padding: '8px 10px 10px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: '0.85rem' }}>
                      {user.full_name}
                    </div>
                    <div className="cell-meta">
                      {user.role === 'manager' ? 'Quản lý' : 'Nhân viên'} · {user.username}
                    </div>
                  </div>
                  <div style={{ height: 1, background: 'var(--rule)', margin: '0 -6px 6px' }} />
                  <button
                    type="button"
                    className="nav-item w-full"
                    style={{ borderLeft: 'none', opacity: 0.5, cursor: 'not-allowed' }}
                    disabled
                    title="Sắp có"
                    role="menuitem"
                  >
                    <KeyRound className="nav-icon" size={16} /> Đổi mật khẩu
                  </button>
                  <button
                    type="button"
                    className="nav-item w-full"
                    style={{ borderLeft: 'none', opacity: 0.5, cursor: 'not-allowed' }}
                    disabled
                    title="Sắp có"
                    role="menuitem"
                  >
                    <MonitorSmartphone className="nav-icon" size={16} /> Phiên đăng nhập
                  </button>
                  <div style={{ height: 1, background: 'var(--rule)', margin: '6px -6px' }} />
                  <button
                    type="button"
                    onClick={onLogout}
                    className="nav-item w-full"
                    style={{ borderLeft: 'none', color: 'var(--danger)' }}
                    role="menuitem"
                  >
                    <LogOut className="nav-icon" size={16} style={{ color: 'var(--danger)' }} /> Đăng xuất
                  </button>
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
          <Sidebar role={user.role} pathname={pathname} />
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
                  <span className="wordmark">{branding?.app_name ?? 'QLCV'}</span>
                </div>
                <button className="icon-btn" aria-label="Đóng menu" onClick={() => setMobileOpen(false)}>
                  <X size={20} />
                </button>
              </div>
              <Sidebar role={user.role} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
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
  );
}

function Sidebar({
  role,
  pathname,
  onNavigate,
}: {
  role: Role;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Điều hướng chính">
      {NAV_GROUPS.map((group) => {
        const items = group.items.filter((it) => !it.managerOnly || role === 'manager');
        if (items.length === 0) return null;
        return (
          <div key={group.title}>
            <div className="eyebrow" style={{ margin: '24px 0 12px' }}>
              {group.title}
            </div>
            <div className="flex flex-col" style={{ gap: 2 }}>
              {items.map((item) => {
                const Icon = item.icon;
                const subActive = item.subs?.some((s) => pathname === s.to);
                const active = pathname === item.to || subActive;
                return (
                  <div key={item.to}>
                    <Link
                      to={item.to}
                      onClick={onNavigate}
                      className="nav-item"
                      data-active={active ? 'true' : undefined}
                    >
                      <Icon className="nav-icon" size={18} strokeWidth={1.5} />
                      <span>{item.label}</span>
                    </Link>
                    {item.subs && (
                      <div>
                        {item.subs.map((sub) => (
                          <Link
                            key={sub.to}
                            to={sub.to}
                            onClick={onNavigate}
                            className="nav-sub"
                            data-active={pathname === sub.to ? 'true' : undefined}
                          >
                            {sub.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* GlobalSearch — F1 full-text CV đi/đến, dropdown kết quả + deep-link  */
/* ------------------------------------------------------------------ */
interface SearchItem {
  id: number;
  source: 'in' | 'out';
  number: string | null;
  subject: string | null;
  status: string;
  doc_date: string | null;
  created_at: string;
}

/** Bỏ dấu tiếng Việt để so khớp highlight không phân biệt dấu (gõ "viet nam" tô "Việt Nam"). */
function deaccent(s: string): string {
  return s
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/** Tô đậm phần khớp (so khớp không dấu phía client — chỉ để gợi mắt, không phải bảo mật). */
function highlight(text: string, term: string): React.ReactNode {
  const t = term.trim();
  if (!t) return text;
  // indexOf trên chuỗi đã bỏ dấu (giữ NGUYÊN độ dài ký tự để slice trên text gốc đúng vị trí).
  const idx = deaccent(text).toLowerCase().indexOf(deaccent(t).toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'var(--warning-soft)', color: 'inherit', borderRadius: 2, padding: '0 1px' }}>
        {text.slice(idx, idx + t.length)}
      </mark>
      {text.slice(idx + t.length)}
    </>
  );
}

function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(id);
  }, [q]);

  const { data, isFetching } = useQuery({
    queryKey: ['global-search', debounced],
    enabled: debounced.trim().length >= 2,
    queryFn: async () => {
      const res = await api.GET('/api/search', { params: { query: { q: debounced, size: 8 } } });
      return (res.data ?? { items: [], total: 0 }) as { items: SearchItem[]; total: number };
    },
    staleTime: 10_000,
  });
  const items = useMemo(() => data?.items ?? [], [data]);
  const showPanel = open && debounced.trim().length >= 2;

  function go(it: SearchItem) {
    setOpen(false);
    setQ('');
    const term = it.number ?? it.subject ?? '';
    navigate({ to: it.source === 'out' ? '/cong-van-di' : '/cong-van-den', search: { q: term } });
  }

  return (
    <div className="relative hidden sm:block">
      <Search
        className="absolute"
        size={16}
        style={{ left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-faint)' }}
      />
      <input
        id="global-search"
        className="search-input"
        type="search"
        placeholder="Tìm công văn… (Ctrl+K)"
        value={q}
        autoComplete="off"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls="global-search-results"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <span className="kbd absolute" style={{ right: 8, top: '50%', transform: 'translateY(-50%)' }}>
        ⌘K
      </span>
      {showPanel && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 35 }} aria-hidden="true" onClick={() => setOpen(false)} />
          <div
            id="global-search-results"
            role="listbox"
            className="card"
            style={{ position: 'absolute', top: 42, right: 0, width: 440, maxHeight: 440, overflowY: 'auto', zIndex: 36, padding: 6, boxShadow: '0 10px 30px oklch(18% 0.02 95 / 0.16)' }}
          >
            {isFetching && items.length === 0 ? (
              <div className="cell-meta" style={{ padding: '10px 12px' }}>Đang tìm…</div>
            ) : items.length === 0 ? (
              <div className="cell-meta" style={{ padding: '10px 12px' }}>Không có kết quả cho “{debounced}”.</div>
            ) : (
              items.map((it) => (
                <button
                  key={`${it.source}-${it.id}`}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="nav-item w-full"
                  style={{ borderLeft: 'none', alignItems: 'flex-start', gap: 10 }}
                  onClick={() => go(it)}
                >
                  <span className={`pill ${it.source === 'out' ? 'pill-published' : 'pill-draft'}`} style={{ flexShrink: 0 }}>
                    {it.source === 'out' ? 'Đi' : 'Đến'}
                  </span>
                  <span style={{ minWidth: 0, textAlign: 'left' }}>
                    <span className="cell-mono num" style={{ fontSize: '0.78rem' }}>{it.number ?? '(chưa số)'}</span>
                    <span style={{ display: 'block', fontSize: '0.82rem', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {highlight(it.subject ?? '(chưa có trích yếu)', debounced)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

interface UnitItem {
  id: number;
  code: string;
  short_name: string | null;
  full_name: string;
  color: string;
}

/** Segmented control chuyển view Tất cả / đơn vị (B3a). "Tất cả" chỉ Quản lý. */
function UnitViewSeg({ role }: { role: Role }) {
  const view = useUnitView((s) => s.view);
  const setView = useUnitView((s) => s.setView);

  const { data } = useQuery({
    queryKey: ['units'],
    queryFn: async () => {
      const res = await api.GET('/api/units', {});
      return (res.data ?? { items: [] }) as { items: UnitItem[] };
    },
  });
  const units = useMemo(() => data?.items ?? [], [data]);

  // Nhân viên KHÔNG được view "Tất cả" → ép về đơn vị đầu tiên nếu đang ở 'all'.
  useEffect(() => {
    if (role !== 'manager' && view === 'all' && units.length > 0) {
      setView(units[0]!.id);
    }
  }, [role, view, units, setView]);

  function unitTone(code: string): string | undefined {
    const c = code.toLowerCase();
    if (c.includes('gdnn')) return 'gdnn';
    if (c.includes('dvdl')) return 'dvdl';
    return undefined;
  }

  return (
    <div className="seg hidden md:inline-flex" role="tablist" aria-label="Chọn đơn vị">
      {role === 'manager' && (
        <button
          data-active={view === 'all' ? 'true' : undefined}
          onClick={() => setView('all' as UnitView)}
        >
          Tất cả
        </button>
      )}
      {units.map((u) => (
        <button
          key={u.id}
          data-active={view === u.id ? 'true' : undefined}
          data-unit={unitTone(u.code)}
          onClick={() => setView(u.id)}
        >
          {u.short_name ?? u.code}
        </button>
      ))}
    </div>
  );
}
