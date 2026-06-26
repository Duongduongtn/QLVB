import { useEffect } from 'react';
import { Link, Outlet, createRootRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';

import { api } from '~/lib/api';
import { useAuth, type Role } from '~/stores/auth';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);

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

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-3">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
          <h1 className="text-lg font-semibold">QLCV Thành Đạt</h1>
          <div className="ml-auto text-sm text-slate-600">
            {user ? (
              <span>
                {user.full_name} · {user.role === 'manager' ? 'Quản lý' : 'Nhân viên'}
              </span>
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
