import { useState, type ReactNode } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound, Lock, Search, Trash2, Unlock, UserPlus, X } from 'lucide-react';

import { api, type ApiErrorEnvelope } from '~/lib/api';
import { useAuth } from '~/stores/auth';
import { fmtDateTime } from '~/lib/format';

export const Route = createFileRoute('/nguoi-dung')({
  component: NguoiDungPage,
});

type Role = 'manager' | 'staff';

interface UserRow {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  role: Role;
  is_active: boolean;
  last_login_at: string | null;
  active_sessions?: number;
  created_at?: string;
}

interface Stats {
  total: number;
  managers: number;
  staff: number;
  locked: number;
}

const PAGE_SIZE = 20;

function errMsg(error: unknown, fallback: string): string {
  return (error as ApiErrorEnvelope | undefined)?.error?.message ?? fallback;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? '';
  const first = parts.length > 1 ? (parts[0] ?? '') : '';
  return ((first[0] ?? '') + (last[0] ?? '')).toUpperCase() || '?';
}

function NguoiDungPage() {
  const me = useAuth((s) => s.user);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [creating, setCreating] = useState(false);

  const usersQuery = useQuery({
    queryKey: ['users', q, page],
    enabled: me?.role === 'manager', // staff/chưa-hydrate không gọi API thừa
    queryFn: async () => {
      const { data, error } = await api.GET('/api/users', {
        params: { query: { q: q || undefined, page, size: PAGE_SIZE } },
      });
      if (error || !data) throw new Error(errMsg(error, 'Không tải được danh sách'));
      return data as { items: UserRow[]; total: number; stats: Stats };
    },
  });

  // Chỉ Quản lý mới vào được trang này.
  if (me && me.role !== 'manager') {
    return (
      <div className="mx-auto max-w-7xl px-6 py-10">
        <p className="text-slate-600">Trang này chỉ dành cho Quản lý.</p>
      </div>
    );
  }
  if (!me) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-10">
        <p className="text-slate-500">Đang tải…</p>
      </div>
    );
  }

  const items = usersQuery.data?.items ?? [];
  const total = usersQuery.data?.total ?? 0;
  const stats = usersQuery.data?.stats;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-1 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">
            Người dùng
          </p>
          <h2 className="text-2xl font-semibold text-slate-800">Quản lý người dùng</h2>
          {stats && (
            <p className="mt-1 text-sm text-slate-500">
              {stats.total} tài khoản: {stats.managers} Quản lý, {stats.staff} Nhân viên
              {stats.locked > 0 && ` — ${stats.locked} đang khoá`}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 rounded-md bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-500"
        >
          <UserPlus size={16} />
          Thêm user
        </button>
      </div>

      <div className="relative my-4 max-w-sm">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Tìm theo tên, tên đăng nhập, email…"
          className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Họ tên</th>
              <th className="px-4 py-3 font-medium">Tên đăng nhập</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Vai trò</th>
              <th className="px-4 py-3 font-medium">Trạng thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {usersQuery.isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Đang tải…
                </td>
              </tr>
            )}
            {!usersQuery.isLoading && items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Không có người dùng nào.
                </td>
              </tr>
            )}
            {items.map((u) => (
              <tr
                key={u.id}
                tabIndex={0}
                onClick={() => setSelected(u)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelected(u);
                  }
                }}
                className="cursor-pointer hover:bg-amber-50/50 focus:bg-amber-50 focus:outline-none"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                      {initials(u.full_name)}
                    </span>
                    <span className="font-medium text-slate-800">{u.full_name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-slate-600">{u.username}</td>
                <td className="px-4 py-3 text-slate-600">{u.email ?? '—'}</td>
                <td className="px-4 py-3">
                  <RoleBadge role={u.role} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge active={u.is_active} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40"
          >
            Trước
          </button>
          <span className="text-slate-500">
            Trang {page}/{totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40"
          >
            Sau
          </button>
        </div>
      )}

      {creating && <CreateDrawer onClose={() => setCreating(false)} />}
      {selected && (
        <EditDrawer
          user={selected}
          currentUserId={me?.id ?? -1}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: Role }) {
  return role === 'manager' ? (
    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
      Quản lý
    </span>
  ) : (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
      Nhân viên
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700">
      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
      Hoạt động
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
      Đã khoá
    </span>
  );
}

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/30"
      />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">
              Người dùng
            </p>
            <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

const fieldClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100';
const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500';

const createSchema = z.object({
  full_name: z.string().min(1, 'Nhập họ tên'),
  username: z.string().min(3, 'Tối thiểu 3 ký tự').regex(/^[a-zA-Z0-9._-]+$/, 'Chỉ chữ, số và . _ -'),
  email: z.string().email('Email không hợp lệ').or(z.literal('')),
  role: z.enum(['manager', 'staff']),
  password: z
    .string()
    .min(8, 'Tối thiểu 8 ký tự')
    .regex(/[A-Za-z]/, 'Phải có chữ')
    .regex(/\d/, 'Phải có số'),
});
type CreateValues = z.infer<typeof createSchema>;

function CreateDrawer({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { full_name: '', username: '', email: '', role: 'staff', password: '' },
  });

  async function onSubmit(values: CreateValues) {
    setServerError(null);
    const { error } = await api.POST('/api/users', {
      body: { ...values, email: values.email || null },
    });
    if (error) {
      setServerError(errMsg(error, 'Tạo người dùng thất bại'));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['users'] });
    onClose();
  }

  return (
    <Drawer title="Thêm user mới" onClose={onClose}>
      {serverError && (
        <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {serverError}
        </div>
      )}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="c_full">Họ tên</label>
          <input id="c_full" className={fieldClass} {...register('full_name')} />
          {errors.full_name && <p className="mt-1 text-xs text-red-600">{errors.full_name.message}</p>}
        </div>
        <div>
          <label className={labelClass} htmlFor="c_user">Tên đăng nhập</label>
          <input id="c_user" className={fieldClass} autoComplete="off" {...register('username')} />
          {errors.username && <p className="mt-1 text-xs text-red-600">{errors.username.message}</p>}
        </div>
        <div>
          <label className={labelClass} htmlFor="c_email">Email</label>
          <input id="c_email" className={fieldClass} placeholder="email@thanhdat.vn" {...register('email')} />
          {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
        </div>
        <div>
          <label className={labelClass} htmlFor="c_role">Vai trò</label>
          <select id="c_role" className={fieldClass} {...register('role')}>
            <option value="staff">Nhân viên</option>
            <option value="manager">Quản lý</option>
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="c_pw">Mật khẩu tạm</label>
          <input id="c_pw" className={fieldClass} autoComplete="new-password" {...register('password')} />
          {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm">
            Huỷ
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-500 disabled:opacity-60"
          >
            Tạo user
          </button>
        </div>
      </form>
    </Drawer>
  );
}

const editSchema = z.object({
  full_name: z.string().min(1, 'Nhập họ tên'),
  email: z.string().email('Email không hợp lệ').or(z.literal('')),
  role: z.enum(['manager', 'staff']),
});
type EditValues = z.infer<typeof editSchema>;

function EditDrawer({
  user,
  currentUserId,
  onClose,
}: {
  user: UserRow;
  currentUserId: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState<string | null>(null);
  const isSelf = user.id === currentUserId;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { full_name: user.full_name, email: user.email ?? '', role: user.role },
  });

  function put(body: Record<string, unknown>) {
    return api.PUT('/api/users/{user_id}', {
      params: { path: { user_id: user.id } },
      body,
    });
  }

  async function onSubmit(values: EditValues) {
    setServerError(null);
    const { error } = await put({ ...values, email: values.email || null });
    if (error) {
      setServerError(errMsg(error, 'Lưu thất bại'));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['users'] });
    onClose();
  }

  const toggleLock = useMutation({
    mutationFn: async () => {
      const { error } = await put({ is_active: !user.is_active });
      if (error) throw new Error(errMsg(error, 'Đổi trạng thái thất bại'));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (e: Error) => setServerError(e.message),
  });

  const resetPassword = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/api/users/{user_id}/reset-password', {
        params: { path: { user_id: user.id } },
      });
      if (error || !data) throw new Error(errMsg(error, 'Reset mật khẩu thất bại'));
      return (data as { password: string }).password;
    },
    onSuccess: (pw) => {
      setResetPw(pw);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: Error) => setServerError(e.message),
  });

  const removeUser = useMutation({
    mutationFn: async () => {
      const { error } = await api.DELETE('/api/users/{user_id}', {
        params: { path: { user_id: user.id } },
      });
      if (error) throw new Error(errMsg(error, 'Xoá người dùng thất bại'));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (e: Error) => setServerError(e.message),
  });

  function confirmDelete() {
    if (window.confirm(`Xoá tài khoản "${user.full_name}"? Tài khoản sẽ bị vô hiệu và ẩn khỏi danh sách.`)) {
      removeUser.mutate();
    }
  }

  if (resetPw) {
    return (
      <Drawer title="Mật khẩu mới" onClose={onClose}>
        <p className="mb-3 text-sm text-slate-600">
          Mật khẩu mới của <strong>{user.full_name}</strong> (chỉ hiện 1 lần — hãy lưu lại và gửi cho người dùng):
        </p>
        <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
          <code className="text-base font-semibold text-slate-800">{resetPw}</code>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(resetPw)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium hover:bg-slate-50"
          >
            Sao chép
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Mật khẩu cũ đã vô hiệu và mọi phiên đăng nhập của người dùng này đã bị đẩy ra.
        </p>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-500"
          >
            Đã lưu, đóng
          </button>
        </div>
      </Drawer>
    );
  }

  return (
    <Drawer title={user.full_name} onClose={onClose}>
      {serverError && (
        <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {serverError}
        </div>
      )}
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
          {initials(user.full_name)}
        </span>
        <div>
          <p className="font-semibold text-slate-800">{user.full_name}</p>
          <p className="font-mono text-sm text-slate-500">{user.username}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="e_full">Họ tên</label>
          <input id="e_full" className={fieldClass} {...register('full_name')} />
          {errors.full_name && <p className="mt-1 text-xs text-red-600">{errors.full_name.message}</p>}
        </div>
        <div>
          <label className={labelClass} htmlFor="e_email">Email</label>
          <input id="e_email" className={fieldClass} {...register('email')} />
          {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
        </div>
        <div>
          <label className={labelClass} htmlFor="e_role">Vai trò</label>
          <select id="e_role" className={fieldClass} {...register('role')}>
            <option value="staff">Nhân viên</option>
            <option value="manager">Quản lý</option>
          </select>
        </div>

        <div className="rounded-md bg-slate-50 px-4 py-3 text-sm">
          <div className="flex justify-between py-1">
            <span className="text-slate-500">Trạng thái</span>
            <StatusBadge active={user.is_active} />
          </div>
          <div className="flex justify-between py-1">
            <span className="text-slate-500">Đăng nhập cuối</span>
            <span className="text-slate-700">{fmtDateTime(user.last_login_at) || '—'}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-slate-500">Phiên đang mở</span>
            <span className="text-slate-700">{user.active_sessions ?? 0} thiết bị</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={confirmDelete}
            disabled={isSelf || removeUser.isPending}
            title={isSelf ? 'Không thể tự xoá tài khoản của mình' : undefined}
            className="mr-auto flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40"
          >
            <Trash2 size={15} />
            Xoá
          </button>
          <button
            type="button"
            onClick={() => resetPassword.mutate()}
            disabled={resetPassword.isPending}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
          >
            <KeyRound size={15} />
            Reset mật khẩu
          </button>
          <button
            type="button"
            onClick={() => toggleLock.mutate()}
            disabled={toggleLock.isPending || (isSelf && user.is_active)}
            title={isSelf && user.is_active ? 'Không thể tự khoá tài khoản của mình' : undefined}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {user.is_active ? <Lock size={15} /> : <Unlock size={15} />}
            {user.is_active ? 'Khoá tài khoản' : 'Mở khoá'}
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-500 disabled:opacity-60"
          >
            Lưu
          </button>
        </div>
      </form>
    </Drawer>
  );
}
