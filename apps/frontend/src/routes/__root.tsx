import { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, createRootRoute, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, LogOut } from 'lucide-react';

import { api } from '~/lib/api';
import { useBranding } from '~/lib/branding';
import { useAuth, type Role } from '~/stores/auth';
import { useUnitView, type UnitView } from '~/stores/unitView';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const clear = useAuth((s) => s.clear);
  const { data: branding } = useBranding();

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
  }, [me, setUser]);

  async function handleLogout() {
    // Xoá phiên ở server trước; dù lỗi mạng vẫn dọn client + về trang login.
    try {
      await api.POST('/api/auth/logout', {});
    } finally {
      clear();
      queryClient.setQueryData(['me'], null);
      navigate({ to: '/login' });
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-3">
          {branding?.logo_file_id ? (
            <img
              src={`/api/settings/logo?v=${branding.logo_file_id}`}
              alt="Logo"
              className="h-7 w-7 rounded object-contain"
            />
          ) : (
            <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
          )}
          <h1 className="text-lg font-semibold">{branding?.app_name ?? 'QLCV Thành Đạt'}</h1>
          <div className="ml-auto flex items-center gap-4 text-sm text-slate-600">
            {user ? (
              <>
                <UnitViewSwitcher role={user.role} />
                {user.role === 'manager' && (
                  <>
                    <Link
                      to="/cau-hinh"
                      className="font-medium text-slate-700 hover:text-amber-600 [&.active]:text-amber-600"
                    >
                      Cấu hình
                    </Link>
                    <Link
                      to="/moc"
                      className="font-medium text-slate-700 hover:text-amber-600 [&.active]:text-amber-600"
                    >
                      Mộc
                    </Link>
                    <Link
                      to="/nguoi-dung"
                      className="font-medium text-slate-700 hover:text-amber-600 [&.active]:text-amber-600"
                    >
                      Người dùng
                    </Link>
                  </>
                )}
                <span>
                  {user.full_name} · {user.role === 'manager' ? 'Quản lý' : 'Nhân viên'}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 font-medium text-slate-700 hover:bg-slate-100"
                >
                  <LogOut size={15} />
                  Đăng xuất
                </button>
              </>
            ) : (
              <Link to="/login" className="font-medium text-amber-600 hover:underline">
                Đăng nhập
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
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

/** Dropdown chuyển view Tất cả / GDNN / DVDL (B3a). "Tất cả" chỉ Quản lý thấy. */
function UnitViewSwitcher({ role }: { role: Role }) {
  const view = useUnitView((s) => s.view);
  const setView = useUnitView((s) => s.setView);
  const [open, setOpen] = useState(false);

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

  const current = view === 'all' ? null : units.find((u) => u.id === view);
  const label = view === 'all' ? 'Tất cả đơn vị' : (current?.short_name ?? current?.code ?? 'Đơn vị');

  function choose(v: UnitView) {
    setView(v);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        className="flex items-center gap-2 rounded-md border border-slate-300 px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
      >
        {current && (
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: current.color }} />
        )}
        {label}
        <ChevronDown size={14} className="text-slate-400" />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Đóng"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div role="menu" className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg">
            {role === 'manager' && (
              <ViewOption active={view === 'all'} onClick={() => choose('all')}>
                Tất cả đơn vị
              </ViewOption>
            )}
            {units.map((u) => (
              <ViewOption key={u.id} active={view === u.id} onClick={() => choose(u.id)}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: u.color }} />
                {u.short_name ?? u.code}
              </ViewOption>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ViewOption({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 ${
        active ? 'font-semibold text-amber-600' : 'text-slate-700'
      }`}
    >
      {children}
      {active && <Check size={14} className="ml-auto" />}
    </button>
  );
}
