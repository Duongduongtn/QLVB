import { useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ScrollText, Search } from 'lucide-react';

import { api, type ApiErrorEnvelope } from '~/lib/api';
import { useAuth } from '~/stores/auth';
import { fmtDateTime } from '~/lib/format';
import { EmptyState, FilterMenu, InfoRow, PageHeader, Pill } from '~/components/ui';
import { Drawer } from '~/components/Drawer';

export const Route = createFileRoute('/audit-log')({
  component: AuditLogPage,
});

interface LogRow {
  id: number;
  created_at: string;
  user_id: number | null;
  username: string | null;
  action: string;
  object_type: string | null;
  object_id: number | null;
  ip: string | null;
  user_agent: string | null;
  detail: Record<string, unknown> | null;
}

const PAGE_SIZE = 30;

// Nhãn tiếng Việt cho action phổ biến; chưa map thì hiển thị mã gốc.
const ACTION_LABEL: Record<string, string> = {
  LOGIN_SUCCESS: 'Đăng nhập',
  LOGIN_FAILURE: 'Đăng nhập thất bại',
  LOGOUT: 'Đăng xuất',
  user_create: 'Tạo người dùng',
  user_update: 'Sửa người dùng',
  user_reset_password: 'Reset mật khẩu',
  user_delete: 'Xoá người dùng',
  unit_update: 'Sửa đơn vị',
  unit_set_logo: 'Đổi logo đơn vị',
  seal_create: 'Tạo mộc',
  seal_update: 'Sửa mộc',
  signature_create: 'Tạo chữ ký',
  signature_update: 'Sửa chữ ký',
  profile_create: 'Tạo hồ sơ ký',
  profile_update: 'Sửa hồ sơ ký',
  org_create: 'Thêm cơ quan',
  org_update: 'Sửa cơ quan',
  org_delete: 'Xoá cơ quan',
  outgoing_create: 'Tạo CV đi (nháp)',
  outgoing_update: 'Sửa CV đi',
  outgoing_set_file: 'Tải file CV đi',
  outgoing_issue: 'Cấp số CV đi',
  outgoing_publish: 'Phát hành CV đi',
  outgoing_cancel: 'Huỷ CV đi',
  outgoing_delete: 'Xoá (thùng rác) CV đi',
  outgoing_restore: 'Khôi phục CV đi',
  outgoing_purge: 'Xoá vĩnh viễn CV đi',
  outgoing_download: 'Tải PDF CV đi',
};

const TIME_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  { value: '7', label: '7 ngày' },
  { value: '30', label: '30 ngày' },
];

function actionLabel(a: string): string {
  return ACTION_LABEL[a] ?? a;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function errMsg(error: unknown, fallback: string): string {
  return (error as ApiErrorEnvelope | undefined)?.error?.message ?? fallback;
}

interface UserLite {
  id: number;
  username: string;
  full_name: string;
}

function AuditLogPage() {
  const me = useAuth((s) => s.user);
  const [action, setAction] = useState('all');
  const [time, setTime] = useState('all');
  const [userId, setUserId] = useState('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<LogRow | null>(null);

  const actionsQuery = useQuery({
    queryKey: ['audit-actions'],
    enabled: me?.role === 'manager',
    queryFn: async () => {
      const res = await api.GET('/api/audit-logs/actions', {});
      return (res.data ?? { actions: [] }) as { actions: string[] };
    },
  });

  const usersQuery = useQuery({
    queryKey: ['users', 'audit-filter'],
    enabled: me?.role === 'manager',
    queryFn: async () => {
      const res = await api.GET('/api/users', { params: { query: { size: 100 } } });
      return (res.data ?? { items: [] }) as { items: UserLite[] };
    },
  });

  const logsQuery = useQuery({
    queryKey: ['audit-logs', action, time, userId, q, page],
    enabled: me?.role === 'manager',
    queryFn: async () => {
      const { data, error } = await api.GET('/api/audit-logs', {
        params: {
          query: {
            action: action === 'all' ? undefined : action,
            user_id: userId === 'all' ? undefined : Number(userId),
            date_from: time === 'all' ? undefined : isoDaysAgo(Number(time)),
            q: q || undefined,
            page,
            size: PAGE_SIZE,
          },
        },
      });
      if (error || !data) throw new Error(errMsg(error, 'Không tải được nhật ký'));
      return data as { items: LogRow[]; total: number };
    },
  });

  const actionOptions = useMemo(
    () => [
      { value: 'all', label: 'Tất cả' },
      ...(actionsQuery.data?.actions ?? []).map((a) => ({ value: a, label: actionLabel(a) })),
    ],
    [actionsQuery.data],
  );

  const userOptions = useMemo(
    () => [
      { value: 'all', label: 'Tất cả' },
      ...(usersQuery.data?.items ?? []).map((u) => ({ value: String(u.id), label: u.username })),
    ],
    [usersQuery.data],
  );

  if (me && me.role !== 'manager') {
    return (
      <>
        <PageHeader breadcrumb={[{ label: 'Audit log' }]} title="Nhật ký hệ thống" />
        <div className="card" style={{ padding: 24, color: 'var(--ink-muted)', fontSize: '0.9rem' }}>
          Trang này chỉ dành cho Quản lý.
        </div>
      </>
    );
  }

  const items = logsQuery.data?.items ?? [];
  const total = logsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Audit log' }]}
        title="Nhật ký hệ thống (Audit log)"
        subhead="Mọi thao tác: đăng nhập, tạo, sửa, xoá, tải, phát hành công văn"
        filters={
          <>
            <FilterMenu
              label="Người dùng:"
              value={userId}
              options={userOptions}
              onChange={(v) => {
                setUserId(v);
                setPage(1);
              }}
            />
            <FilterMenu
              label="Hành động:"
              value={action}
              options={actionOptions}
              onChange={(v) => {
                setAction(v);
                setPage(1);
              }}
            />
            <FilterMenu
              label="Thời gian:"
              value={time}
              options={TIME_OPTIONS}
              onChange={(v) => {
                setTime(v);
                setPage(1);
              }}
            />
            <div className="relative">
              <Search
                size={15}
                className="absolute"
                style={{ left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-faint)' }}
              />
              <input
                className="search-input"
                placeholder="Tìm hành động / đối tượng…"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </>
        }
      />

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-scroll">
          <table className="qlcv-table">
            <thead>
              <tr>
                <th style={{ width: 170, paddingLeft: 24 }}>Thời gian</th>
                <th style={{ width: 150 }}>Người dùng</th>
                <th style={{ width: 220 }}>Hành động</th>
                <th>Đối tượng</th>
                <th style={{ width: 140, paddingRight: 24 }}>IP</th>
              </tr>
            </thead>
            <tbody>
              {logsQuery.isLoading && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--ink-faint)' }}>
                    Đang tải…
                  </td>
                </tr>
              )}
              {!logsQuery.isLoading &&
                items.map((l) => (
                  <tr key={l.id} onClick={() => setSelected(l)} style={{ cursor: 'pointer' }}>
                    <td style={{ paddingLeft: 24 }}>
                      <span className="cell-meta">{fmtDateTime(l.created_at)}</span>
                    </td>
                    <td>
                      <span className="cell-mono">{l.username ?? '—'}</span>
                    </td>
                    <td>{actionLabel(l.action)}</td>
                    <td>
                      <span className="cell-mono">
                        {l.object_type ? `${l.object_type}#${l.object_id ?? ''}` : '—'}
                      </span>
                    </td>
                    <td style={{ paddingRight: 24 }}>
                      <span className="cell-meta">{l.ip ?? '—'}</span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!logsQuery.isLoading && items.length === 0 && (
            <EmptyState icon={ScrollText} title="Không có bản ghi" desc="Thử nới bộ lọc thời gian / hành động." />
          )}
        </div>

        {totalPages > 1 && (
          <div
            className="flex items-center justify-between"
            style={{ padding: '12px 24px', borderTop: '1px solid var(--rule)' }}
          >
            <span className="cell-meta">
              {total} bản ghi · trang {page}/{totalPages}
            </span>
            <div className="flex items-center" style={{ gap: 4 }}>
              <button
                className="action-btn"
                type="button"
                aria-label="Trang trước"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={15} />
              </button>
              <button
                className="action-btn"
                type="button"
                aria-label="Trang sau"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        eyebrow="Audit log"
        title={selected ? actionLabel(selected.action) : ''}
        width={460}
      >
        {selected && (
          <div className="card" style={{ padding: 16 }}>
            <InfoRow label="Thời gian">{fmtDateTime(selected.created_at)}</InfoRow>
            <InfoRow label="Người dùng">
              <span className="cell-mono">{selected.username ?? `#${selected.user_id ?? '—'}`}</span>
            </InfoRow>
            <InfoRow label="Hành động">
              <span className="cell-mono">{selected.action}</span>
            </InfoRow>
            <InfoRow label="Đối tượng">
              <span className="cell-mono">
                {selected.object_type ? `${selected.object_type}#${selected.object_id ?? ''}` : '—'}
              </span>
            </InfoRow>
            <InfoRow label="Địa chỉ IP">
              <span className="cell-mono">{selected.ip ?? '—'}</span>
            </InfoRow>
            <InfoRow label="User-Agent">
              <span className="cell-meta">{selected.user_agent ?? '—'}</span>
            </InfoRow>
            {selected.detail && (
              <InfoRow label="Chi tiết">
                <span className="cell-meta" style={{ wordBreak: 'break-word' }}>
                  {JSON.stringify(selected.detail)}
                </span>
              </InfoRow>
            )}
            <div style={{ marginTop: 10 }}>
              <Pill variant="success" dot>
                Đã ghi nhận
              </Pill>
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}
