import { useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Trash2 } from 'lucide-react';

import { api, type ApiErrorEnvelope } from '~/lib/api';
import { useAuth } from '~/stores/auth';
import { fmtDate } from '~/lib/format';
import { EmptyState, InfoRow, PageHeader, Pill, RowActions } from '~/components/ui';
import { Drawer } from '~/components/Drawer';
import { UnitPill, type UnitLite } from '~/components/sign-ui';

export const Route = createFileRoute('/thung-rac')({
  component: ThungRacPage,
});

interface TrashRow {
  id: number;
  unit_id: number;
  number: string | null;
  subject: string;
  status: string;
  deleted_at: string | null;
  days_remaining: number;
}

function errMsg(error: unknown, fallback: string): string {
  return (error as ApiErrorEnvelope | undefined)?.error?.message ?? fallback;
}

function ThungRacPage() {
  const me = useAuth((s) => s.user);
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<TrashRow | null>(null);
  const [actErr, setActErr] = useState<string | null>(null);

  const unitsQuery = useQuery({
    queryKey: ['units'],
    queryFn: async () => (await api.GET('/api/units', {})).data as { items: UnitLite[] },
  });
  const units = useMemo(() => unitsQuery.data?.items ?? [], [unitsQuery.data]);

  const trashQuery = useQuery({
    queryKey: ['trash'],
    enabled: me?.role === 'manager',
    queryFn: async () => {
      const { data, error } = await api.GET('/api/trash', {});
      if (error || !data) throw new Error(errMsg(error, 'Không tải được thùng rác'));
      return data as { items: TrashRow[]; total: number };
    },
  });

  const restore = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.POST('/api/trash/{doc_id}/restore', { params: { path: { doc_id: id } } });
      if (error) throw new Error(errMsg(error, 'Khôi phục thất bại'));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['trash'] });
      await queryClient.invalidateQueries({ queryKey: ['outgoing'] });
      setSelected(null);
    },
    onError: (e: Error) => setActErr(e.message),
  });

  const purge = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.DELETE('/api/trash/{doc_id}', { params: { path: { doc_id: id } } });
      if (error) throw new Error(errMsg(error, 'Xoá vĩnh viễn thất bại'));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['trash'] });
      setSelected(null);
    },
    onError: (e: Error) => setActErr(e.message),
  });

  function confirmPurge(row: TrashRow) {
    if (window.confirm(`Xoá VĨNH VIỄN "${row.number ?? row.subject}"? Không thể khôi phục.`)) {
      purge.mutate(row.id);
    }
  }

  if (me && me.role !== 'manager') {
    return (
      <>
        <PageHeader breadcrumb={[{ label: 'Thùng rác' }]} title="Thùng rác" />
        <div className="card" style={{ padding: 24, color: 'var(--ink-muted)', fontSize: '0.9rem' }}>
          Trang này chỉ dành cho Quản lý.
        </div>
      </>
    );
  }

  const items = trashQuery.data?.items ?? [];
  const unitOf = (id: number) => units.find((u) => u.id === id);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Thùng rác' }]}
        title="Thùng rác"
        subhead="Công văn đã xoá được giữ 30 ngày trước khi xoá vĩnh viễn"
      />

      {actErr && (
        <div
          className="card"
          role="alert"
          style={{ padding: '10px 16px', marginBottom: 16, color: 'var(--danger)', borderColor: 'var(--danger)' }}
        >
          {actErr}
        </div>
      )}

      {items.length > 0 && (
        <div
          className="card flex items-center"
          style={{ padding: '12px 18px', gap: 10, marginBottom: 16, background: 'var(--warning-soft)' }}
        >
          <Trash2 size={16} style={{ color: 'var(--warning)' }} />
          <span style={{ fontSize: '0.85rem', color: 'var(--ink)' }}>
            {items.length} mục trong thùng rác. Có thể khôi phục trước khi hết hạn lưu trữ.
          </span>
        </div>
      )}

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-scroll">
          <table className="qlcv-table">
            <thead>
              <tr>
                <th style={{ width: 200, paddingLeft: 24 }}>Số CV</th>
                <th>Trích yếu</th>
                <th className="center" style={{ width: 90 }}>
                  Đơn vị
                </th>
                <th style={{ width: 120 }}>Ngày xoá</th>
                <th style={{ width: 120 }}>Còn lại</th>
                <th className="center" style={{ width: 110, paddingRight: 24 }}>
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody>
              {trashQuery.isLoading && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--ink-faint)' }}>
                    Đang tải…
                  </td>
                </tr>
              )}
              {items.map((it) => (
                <tr key={it.id} onClick={() => setSelected(it)} style={{ cursor: 'pointer' }}>
                  <td style={{ paddingLeft: 24 }}>
                    <span className="cell-mono num">{it.number ?? '— (nháp)'}</span>
                  </td>
                  <td>
                    <span className="subject">{it.subject}</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <UnitPill unit={unitOf(it.unit_id)} />
                  </td>
                  <td>
                    <span className="cell-meta">{it.deleted_at ? fmtDate(it.deleted_at) : '—'}</span>
                  </td>
                  <td>
                    <Pill variant={it.days_remaining < 20 ? 'warning' : 'draft'} dot={it.days_remaining < 20}>
                      {it.days_remaining} ngày
                    </Pill>
                  </td>
                  <td style={{ paddingRight: 24 }} onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center" style={{ gap: 4 }}>
                      <button
                        className="action-btn"
                        type="button"
                        aria-label="Khôi phục"
                        disabled={restore.isPending}
                        onClick={() => restore.mutate(it.id)}
                      >
                        <RotateCcw size={15} />
                      </button>
                      <RowActions
                        items={[
                          { label: 'Xem chi tiết', onClick: () => setSelected(it) },
                          { label: 'Khôi phục', onClick: () => restore.mutate(it.id) },
                          { label: 'Xoá vĩnh viễn', danger: true, onClick: () => confirmPurge(it) },
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!trashQuery.isLoading && items.length === 0 && (
            <EmptyState icon={Trash2} title="Thùng rác trống" desc="Công văn đã xoá sẽ hiển thị ở đây." />
          )}
        </div>
      </div>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        eyebrow="Thùng rác"
        title={selected?.number ?? 'Bản nháp'}
        width={460}
        actions={
          selected && (
            <>
              <button
                className="btn-secondary"
                type="button"
                style={{ color: 'var(--danger)' }}
                disabled={purge.isPending}
                onClick={() => confirmPurge(selected)}
              >
                <Trash2 size={14} /> Xoá vĩnh viễn
              </button>
              <button
                className="btn-primary"
                type="button"
                disabled={restore.isPending}
                onClick={() => restore.mutate(selected.id)}
              >
                <RotateCcw size={14} /> Khôi phục
              </button>
            </>
          )
        }
      >
        {selected && (
          <>
            <div className="subject" style={{ fontWeight: 500, marginBottom: 12 }}>
              {selected.subject}
            </div>
            <div className="card" style={{ padding: 16 }}>
              <InfoRow label="Số CV">
                <span className="cell-mono num">{selected.number ?? '— (chưa cấp số)'}</span>
              </InfoRow>
              <InfoRow label="Đơn vị">
                <UnitPill unit={unitOf(selected.unit_id)} />
              </InfoRow>
              <InfoRow label="Ngày xoá">{selected.deleted_at ? fmtDate(selected.deleted_at) : '—'}</InfoRow>
              <InfoRow label="Tự xoá sau">
                <Pill variant={selected.days_remaining < 20 ? 'warning' : 'draft'} dot={selected.days_remaining < 20}>
                  {selected.days_remaining} ngày
                </Pill>
              </InfoRow>
            </div>
          </>
        )}
      </Drawer>
    </>
  );
}
