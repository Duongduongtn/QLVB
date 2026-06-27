import { useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardList, Clock, PlayCircle } from 'lucide-react';

import { api, type ApiErrorEnvelope } from '~/lib/api';
import { useAuth } from '~/stores/auth';
import { fmtDate } from '~/lib/format';
import { EmptyState, FilterMenu, InfoRow, PageHeader, Pill } from '~/components/ui';
import { Drawer } from '~/components/Drawer';
import { URGENCY_LABEL } from '~/lib/incoming';

export const Route = createFileRoute('/viec-cua-toi')({
  component: ViecCuaToiPage,
});

type TaskStatus = 'new' | 'in_progress' | 'done';

interface MyTask {
  id: number;
  incoming_id: number;
  unit_id: number;
  status: TaskStatus;
  deadline: string | null;
  overdue: boolean;
  number: string | null;
  subject: string | null;
  sender_org_id: number | null;
  urgency: string;
}

interface UnitLite {
  id: number;
  short_name: string | null;
  code: string;
}

const STATUS_PILL: Record<TaskStatus, { label: string; variant: string; dot: boolean }> = {
  new: { label: 'Mới', variant: 'info', dot: true },
  in_progress: { label: 'Đang xử lý', variant: 'warning', dot: true },
  done: { label: 'Hoàn thành', variant: 'success', dot: true },
};

function errMsg(error: unknown, fallback: string): string {
  return (error as ApiErrorEnvelope | undefined)?.error?.message ?? fallback;
}

function ViecCuaToiPage() {
  const me = useAuth((s) => s.user);
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<TaskStatus | 'all'>('all');
  const [selected, setSelected] = useState<MyTask | null>(null);
  const [actErr, setActErr] = useState<string | null>(null);

  const unitsQuery = useQuery({
    queryKey: ['units'],
    queryFn: async () => (await api.GET('/api/units', {})).data as { items: UnitLite[] },
  });
  const units = useMemo(() => unitsQuery.data?.items ?? [], [unitsQuery.data]);
  const unitName = (id: number) => units.find((u) => u.id === id)?.short_name ?? units.find((u) => u.id === id)?.code ?? '—';

  const tasksQuery = useQuery({
    queryKey: ['my-tasks', status],
    enabled: !!me,
    refetchInterval: 15000, // polling — việc mới hiện gần realtime (TDD §12)
    queryFn: async () => {
      const { data, error } = await api.GET('/api/tasks/mine', {
        params: { query: { status: status === 'all' ? undefined : status, size: 100 } },
      });
      if (error || !data) throw new Error(errMsg(error, 'Không tải được việc của tôi'));
      return data as { items: MyTask[]; total: number };
    },
  });

  const setStatusMut = useMutation({
    mutationFn: async (p: { id: number; status: TaskStatus }) => {
      const { error } = await api.PATCH('/api/tasks/{task_id}', {
        params: { path: { task_id: p.id } },
        body: { status: p.status },
      });
      if (error) throw new Error(errMsg(error, 'Cập nhật thất bại'));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      await queryClient.invalidateQueries({ queryKey: ['notif'] });
    },
    onError: (e: Error) => setActErr(e.message),
  });

  if (!me) return <div style={{ padding: '40px 0' }}><p className="cell-meta">Đang tải…</p></div>;

  const items = tasksQuery.data?.items ?? [];
  const counts = {
    all: items.length,
    overdue: items.filter((t) => t.overdue).length,
  };

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Việc của tôi' }]}
        title="Việc của tôi"
        subhead={`${counts.all} việc được giao${counts.overdue > 0 ? ` · ${counts.overdue} quá hạn` : ''}`}
        filters={
          <FilterMenu
            label="Trạng thái:"
            value={status}
            options={[
              { value: 'all', label: 'Tất cả' },
              { value: 'new', label: 'Mới' },
              { value: 'in_progress', label: 'Đang xử lý' },
              { value: 'done', label: 'Hoàn thành' },
            ]}
            onChange={(v) => setStatus(v as TaskStatus | 'all')}
          />
        }
      />

      {actErr && (
        <div className="card" role="alert" style={{ padding: '10px 16px', marginBottom: 16, color: 'var(--danger)', borderColor: 'var(--danger)' }}>
          {actErr}
        </div>
      )}

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-scroll">
          <table className="qlcv-table">
            <thead>
              <tr>
                <th style={{ width: 110, paddingLeft: 24 }}>Số đến</th>
                <th>Trích yếu</th>
                <th style={{ width: 90 }}>Đơn vị</th>
                <th style={{ width: 120 }}>Hạn xử lý</th>
                <th style={{ width: 140 }}>Trạng thái</th>
                <th style={{ width: 200, paddingRight: 24 }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id} onClick={() => setSelected(t)} style={{ cursor: 'pointer' }}>
                  <td style={{ paddingLeft: 24 }}><span className="cell-mono num">{t.number ?? '—'}</span></td>
                  <td>
                    <span className="subject">{t.subject ?? '(chưa có trích yếu)'}</span>
                    {t.urgency !== 'normal' && <Pill variant="warning">{URGENCY_LABEL[t.urgency] ?? t.urgency}</Pill>}
                  </td>
                  <td><span className="cell-meta">{unitName(t.unit_id)}</span></td>
                  <td>
                    {t.deadline ? (
                      <span style={{ color: t.overdue ? 'var(--danger)' : 'var(--ink-body)', fontWeight: t.overdue ? 600 : 400 }}>
                        {fmtDate(t.deadline)}{t.overdue && ' · quá hạn'}
                      </span>
                    ) : <span className="cell-meta">—</span>}
                  </td>
                  <td><Pill variant={STATUS_PILL[t.status].variant} dot={STATUS_PILL[t.status].dot}>{STATUS_PILL[t.status].label}</Pill></td>
                  <td style={{ paddingRight: 24 }} onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center" style={{ gap: 6 }}>
                      {t.status === 'new' && (
                        <button className="btn-secondary" type="button" style={{ height: 30 }} disabled={setStatusMut.isPending} onClick={() => setStatusMut.mutate({ id: t.id, status: 'in_progress' })}>
                          <PlayCircle size={13} /> Bắt đầu
                        </button>
                      )}
                      {t.status !== 'done' && (
                        <button className="btn-primary" type="button" style={{ height: 30 }} disabled={setStatusMut.isPending} onClick={() => setStatusMut.mutate({ id: t.id, status: 'done' })}>
                          <CheckCircle2 size={13} /> Hoàn thành
                        </button>
                      )}
                      {t.status === 'done' && (
                        <button className="btn-ghost" type="button" style={{ height: 30 }} disabled={setStatusMut.isPending} onClick={() => setStatusMut.mutate({ id: t.id, status: 'in_progress' })}>
                          Mở lại
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!tasksQuery.isLoading && items.length === 0 && (
            <EmptyState icon={ClipboardList} title="Chưa có việc nào" desc="Việc xử lý công văn đến được giao cho bạn sẽ hiển thị ở đây." />
          )}
        </div>
      </div>

      <Drawer open={!!selected} onClose={() => setSelected(null)} eyebrow="Việc xử lý" title={selected?.number ?? 'Công văn đến'} width={460}>
        {selected && (
          <>
            <div className="subject" style={{ fontWeight: 500, marginBottom: 12 }}>{selected.subject ?? '(chưa có trích yếu)'}</div>
            <div className="card" style={{ padding: 16 }}>
              <InfoRow label="Số đến"><span className="cell-mono num">{selected.number ?? '—'}</span></InfoRow>
              <InfoRow label="Đơn vị xử lý">{unitName(selected.unit_id)}</InfoRow>
              <InfoRow label="Mức độ khẩn">{URGENCY_LABEL[selected.urgency] ?? selected.urgency}</InfoRow>
              <InfoRow label="Hạn xử lý">
                {selected.deadline ? (
                  <span style={{ color: selected.overdue ? 'var(--danger)' : 'var(--ink)' }}>
                    {fmtDate(selected.deadline)}{selected.overdue && ' · quá hạn'}
                  </span>
                ) : '—'}
              </InfoRow>
              <InfoRow label="Trạng thái"><Pill variant={STATUS_PILL[selected.status].variant} dot>{STATUS_PILL[selected.status].label}</Pill></InfoRow>
            </div>
            <button className="btn-secondary" type="button" style={{ marginTop: 16 }} onClick={() => window.open(`/api/incoming/${selected.incoming_id}/file`, '_blank')}>
              <Clock size={14} /> Mở file công văn
            </button>
          </>
        )}
      </Drawer>
    </>
  );
}
