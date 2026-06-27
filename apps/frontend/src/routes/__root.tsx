import { useEffect } from 'react';
import { Link, Outlet, createRootRoute, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';

import { api } from '~/lib/api';
import { useAuth, type Role } from '~/stores/auth';

export const Route = createRootRoute({
  component: RootLayout,
});

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
          <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
          <h1 className="text-lg font-semibold">QLCV Thành Đạt</h1>
          <div className="ml-auto flex items-center gap-4 text-sm text-slate-600">
            {user ? (
              <>
                {user.role === 'manager' && (
                  <>
                    <Link
                      to="/cau-hinh"
                      className="font-medium text-slate-700 hover:text-amber-600 [&.active]:text-amber-600"
                    >
                      Cấu hình
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
