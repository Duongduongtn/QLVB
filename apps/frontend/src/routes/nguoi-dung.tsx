import { useState, type ReactNode } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Lock,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  Unlock,
  Users,
} from 'lucide-react';

import { api, type ApiErrorEnvelope } from '~/lib/api';
import { useAuth } from '~/stores/auth';
import { fmtDateTime } from '~/lib/format';
import {
  Avatar,
  EmptyState,
  InfoRow,
  PageHeader,
  Pill,
  RowActions,
  type Crumb,
} from '~/components/ui';
import { Drawer } from '~/components/Drawer';

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

const BREADCRUMB: Crumb[] = [{ label: 'QLCV' }, { label: 'Người dùng' }];

function errMsg(error: unknown, fallback: string): string {
  return (error as ApiErrorEnvelope | undefined)?.error?.message ?? fallback;
}

/* Hộp thông báo lỗi từ máy chủ — tái dùng style pill cảnh báo. */
function Alert({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="pill pill-cancelled"
      style={{
        display: 'block',
        height: 'auto',
        padding: '8px 12px',
        marginBottom: 16,
        textDecoration: 'none',
        letterSpacing: 0,
        textTransform: 'none',
        fontFamily: 'inherit',
        fontSize: '0.85rem',
      }}
    >
      {children}
    </div>
  );
}

const fieldErrStyle = { marginTop: 4, fontSize: '0.75rem', color: 'var(--danger)' } as const;

function RoleBadge({ role }: { role: Role }) {
  return role === 'manager' ? (
    <Pill variant="gdnn" dot>
      Quản lý
    </Pill>
  ) : (
    <Pill variant="draft">Nhân viên</Pill>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <Pill variant="success" dot>
      Hoạt động
    </Pill>
  ) : (
    <Pill variant="cancelled">Đã khoá</Pill>
  );
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
      <>
        <PageHeader breadcrumb={BREADCRUMB} title="Quản lý người dùng" />
        <div className="card">
          <EmptyState
            icon={ShieldAlert}
            title="Chỉ dành cho Quản lý"
            desc="Trang này chỉ dành cho tài khoản có vai trò Quản lý."
          />
        </div>
      </>
    );
  }
  if (!me) {
    return (
      <>
        <PageHeader breadcrumb={BREADCRUMB} title="Quản lý người dùng" />
        <div className="card">
          <EmptyState icon={Users} title="Đang tải…" />
        </div>
      </>
    );
  }

  const items = usersQuery.data?.items ?? [];
  const total = usersQuery.data?.total ?? 0;
  const stats = usersQuery.data?.stats;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        breadcrumb={BREADCRUMB}
        title="Quản lý người dùng"
        subhead={
          stats
            ? `${stats.total} tài khoản: ${stats.managers} Quản lý, ${stats.staff} Nhân viên${
                stats.locked > 0 ? ` — ${stats.locked} đang khoá` : ''
              }`
            : undefined
        }
        actions={
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            <Plus size={14} /> Thêm user mới
          </button>
        }
        filters={
          <div className="relative" style={{ width: '100%', maxWidth: 340 }}>
            <Search
              size={16}
              className="absolute"
              style={{
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--ink-faint)',
                pointerEvents: 'none',
              }}
            />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Tìm theo tên, tên đăng nhập, email…"
              className="text-input"
              style={{ paddingLeft: 38 }}
            />
          </div>
        }
      />

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-scroll">
          <table className="qlcv-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 24 }}>Họ tên</th>
                <th style={{ width: 140 }}>Tên đăng nhập</th>
                <th style={{ width: 220 }}>Email</th>
                <th style={{ width: 120 }}>Vai trò</th>
                <th style={{ width: 120 }}>Trạng thái</th>
                <th style={{ width: 100, paddingRight: 24 }} className="center">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody>
              {usersQuery.isLoading && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState icon={Users} title="Đang tải…" />
                  </td>
                </tr>
              )}
              {!usersQuery.isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={Users}
                      title="Không có người dùng nào"
                      desc="Thử đổi từ khoá tìm kiếm hoặc thêm user mới."
                    />
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
                  style={{ cursor: 'pointer' }}
                >
                  <td style={{ paddingLeft: 24 }}>
                    <div className="flex items-center" style={{ gap: 10 }}>
                      <Avatar name={u.full_name} />
                      <span style={{ fontWeight: 500 }}>{u.full_name}</span>
                    </div>
                  </td>
                  <td>
                    <span className="cell-mono">{u.username}</span>
                  </td>
                  <td>
                    {u.email ? (
                      <span className="cell-meta">{u.email}</span>
                    ) : (
                      <span className="cell-meta dash">—</span>
                    )}
                  </td>
                  <td>
                    <RoleBadge role={u.role} />
                  </td>
                  <td>
                    <StatusBadge active={u.is_active} />
                  </td>
                  <td style={{ paddingRight: 24 }}>
                    <div className="flex items-center justify-center" style={{ gap: 4 }}>
                      <button
                        type="button"
                        className="action-btn"
                        aria-label="Reset mật khẩu"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(u);
                        }}
                      >
                        <KeyRound size={15} />
                      </button>
                      <RowActions
                        items={[
                          { label: 'Sửa thông tin', onClick: () => setSelected(u) },
                          { label: 'Reset mật khẩu', onClick: () => setSelected(u) },
                          {
                            label: u.is_active ? 'Khoá tài khoản' : 'Mở khoá',
                            danger: u.is_active,
                            onClick: () => setSelected(u),
                          },
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div
          className="flex items-center justify-end"
          style={{ gap: 8, marginTop: 16 }}
        >
          <button
            type="button"
            className="pg-btn"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            aria-label="Trang trước"
            style={{ opacity: page <= 1 ? 0.4 : 1 }}
          >
            <ChevronLeft size={16} />
          </button>
          <span className="cell-meta">
            Trang {page}/{totalPages}
          </span>
          <button
            type="button"
            className="pg-btn"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            aria-label="Trang sau"
            style={{ opacity: page >= totalPages ? 0.4 : 1 }}
          >
            <ChevronRight size={16} />
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
    </>
  );
}

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
    <Drawer
      open
      onClose={onClose}
      eyebrow="Người dùng"
      title="Thêm user mới"
      width={480}
      actions={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Huỷ
          </button>
          <button
            type="submit"
            form="create-user-form"
            className="btn-primary"
            disabled={isSubmitting}
          >
            Tạo user
          </button>
        </>
      }
    >
      {serverError && <Alert>{serverError}</Alert>}
      <form
        id="create-user-form"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="flex flex-col"
        style={{ gap: 16 }}
      >
        <div>
          <label className="field-label" htmlFor="c_full">
            Họ tên
          </label>
          <input id="c_full" className="text-input" placeholder="Nguyễn Văn A" {...register('full_name')} />
          {errors.full_name && <p style={fieldErrStyle}>{errors.full_name.message}</p>}
        </div>
        <div>
          <label className="field-label" htmlFor="c_user">
            Tên đăng nhập
          </label>
          <input
            id="c_user"
            className="text-input"
            placeholder="vanthu3"
            autoComplete="off"
            {...register('username')}
          />
          {errors.username && <p style={fieldErrStyle}>{errors.username.message}</p>}
        </div>
        <div>
          <label className="field-label" htmlFor="c_email">
            Email
          </label>
          <input
            id="c_email"
            className="text-input"
            placeholder="email@thanhdat.vn"
            {...register('email')}
          />
          {errors.email && <p style={fieldErrStyle}>{errors.email.message}</p>}
        </div>
        <div>
          <label className="field-label" htmlFor="c_role">
            Vai trò
          </label>
          <select id="c_role" className="text-input" {...register('role')}>
            <option value="staff">Nhân viên</option>
            <option value="manager">Quản lý</option>
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="c_pw">
            Mật khẩu tạm
          </label>
          <input
            id="c_pw"
            className="text-input"
            autoComplete="new-password"
            {...register('password')}
          />
          {errors.password && <p style={fieldErrStyle}>{errors.password.message}</p>}
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
      <Drawer
        open
        onClose={onClose}
        eyebrow="Người dùng"
        title="Mật khẩu mới"
        width={480}
        actions={
          <button type="button" className="btn-primary" onClick={onClose}>
            Đã lưu, đóng
          </button>
        }
      >
        <p style={{ fontSize: '0.875rem', color: 'var(--ink-body)', marginBottom: 12 }}>
          Mật khẩu mới của <strong>{user.full_name}</strong> (chỉ hiện 1 lần — hãy lưu lại và gửi
          cho người dùng):
        </p>
        <div
          className="flex items-center justify-between"
          style={{
            gap: 12,
            padding: '12px 16px',
            borderRadius: 6,
            background: 'var(--kinpaku-pale)',
            border: '1px solid var(--rule)',
          }}
        >
          <code style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ink)' }}>{resetPw}</code>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigator.clipboard?.writeText(resetPw)}
          >
            Sao chép
          </button>
        </div>
        <p className="cell-meta" style={{ marginTop: 12 }}>
          Mật khẩu cũ đã vô hiệu và mọi phiên đăng nhập của người dùng này đã bị đẩy ra.
        </p>
      </Drawer>
    );
  }

  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow="Người dùng"
      title={user.full_name}
      width={480}
      actions={
        <>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={isSelf || removeUser.isPending}
            title={isSelf ? 'Không thể tự xoá tài khoản của mình' : undefined}
            className="btn-ghost"
            style={{ color: 'var(--danger)', marginRight: 'auto' }}
          >
            <Trash2 size={14} /> Xoá
          </button>
          <button
            type="button"
            onClick={() => resetPassword.mutate()}
            disabled={resetPassword.isPending}
            className="btn-secondary"
          >
            <KeyRound size={14} /> Reset mật khẩu
          </button>
          <button
            type="button"
            onClick={() => toggleLock.mutate()}
            disabled={toggleLock.isPending || (isSelf && user.is_active)}
            title={isSelf && user.is_active ? 'Không thể tự khoá tài khoản của mình' : undefined}
            className="btn-secondary"
            style={{ color: user.is_active ? 'var(--danger)' : 'var(--success)' }}
          >
            {user.is_active ? <Lock size={14} /> : <Unlock size={14} />}
            {user.is_active ? 'Khoá tài khoản' : 'Mở khoá'}
          </button>
          <button type="submit" form="edit-user-form" className="btn-primary" disabled={isSubmitting}>
            Lưu
          </button>
        </>
      }
    >
      {serverError && <Alert>{serverError}</Alert>}

      <div className="flex items-center" style={{ gap: 12 }}>
        <Avatar name={user.full_name} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{user.full_name}</div>
          <div className="cell-mono">{user.username}</div>
        </div>
      </div>

      <form
        id="edit-user-form"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="flex flex-col"
        style={{ gap: 16, marginTop: 18 }}
      >
        <div>
          <label className="field-label" htmlFor="e_full">
            Họ tên
          </label>
          <input id="e_full" className="text-input" {...register('full_name')} />
          {errors.full_name && <p style={fieldErrStyle}>{errors.full_name.message}</p>}
        </div>
        <div>
          <label className="field-label" htmlFor="e_email">
            Email
          </label>
          <input id="e_email" className="text-input" {...register('email')} />
          {errors.email && <p style={fieldErrStyle}>{errors.email.message}</p>}
        </div>
        <div>
          <label className="field-label" htmlFor="e_role">
            Vai trò
          </label>
          <select id="e_role" className="text-input" {...register('role')}>
            <option value="staff">Nhân viên</option>
            <option value="manager">Quản lý</option>
          </select>
        </div>
      </form>

      <div className="card" style={{ padding: 16, marginTop: 18 }}>
        <InfoRow label="Trạng thái">
          <StatusBadge active={user.is_active} />
        </InfoRow>
        <InfoRow label="Đăng nhập cuối">{fmtDateTime(user.last_login_at) || '—'}</InfoRow>
        <InfoRow label="Phiên đang mở">{user.active_sessions ?? 0} thiết bị</InfoRow>
      </div>
    </Drawer>
  );
}
