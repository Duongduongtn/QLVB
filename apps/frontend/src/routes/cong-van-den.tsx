import { useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, ChevronLeft, ChevronRight, Download, EyeOff, Inbox, Plus, Search, ShieldCheck } from 'lucide-react';

import { api, type ApiErrorEnvelope } from '~/lib/api';
import { useAuth } from '~/stores/auth';
import { fmtDate, fmtDateTime } from '~/lib/format';
import { EmptyState, FilterMenu, InfoRow, PageHeader, Pill } from '~/components/ui';
import { Drawer } from '~/components/Drawer';
import { CONFIDENTIALITY_LABEL, URGENCY_LABEL } from '~/lib/incoming';

export const Route = createFileRoute('/cong-van-den')({
  component: CongVanDenPage,
});

type IncStatus = 'draft' | 'registered' | 'cancelled';

interface IncRow {
  id: number;
  number: string | null;
  reference_number: string | null;
  document_date: string | null;
  sender_org_id: number | null;
  subject: string | null;
  urgency: string;
  confidentiality: string;
  manager_only: boolean;
  signature_status: string;
  status: IncStatus;
  created_at: string;
}

const PAGE_SIZE = 20;

const STATUS_PILL: Record<IncStatus, { label: string; cls: string; dot: boolean }> = {
  draft: { label: 'Nháp', cls: 'pill-draft', dot: false },
  registered: { label: 'Đã vào sổ', cls: 'pill-published', dot: true },
  cancelled: { label: 'Huỷ', cls: 'pill-cancelled', dot: false },
};

interface OrgLite {
  id: number;
  full_name: string;
  short_name: string | null;
}

function errMsg(error: unknown, fallback: string): string {
  return (error as ApiErrorEnvelope | undefined)?.error?.message ?? fallback;
}

const YEARS = (() => {
  const y = new Date().getFullYear();
  return [y, y - 1, y - 2];
})();

function CongVanDenPage() {
  const me = useAuth((s) => s.user);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [urgency, setUrgency] = useState('all');
  const [confid, setConfid] = useState('all');
  const [sender, setSender] = useState('all');
  const [year, setYear] = useState('all');
  const [status, setStatus] = useState<IncStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<IncRow | null>(null);
  const [actErr, setActErr] = useState<string | null>(null);

  const orgsQuery = useQuery({
    queryKey: ['organizations', 'sender-map'],
    queryFn: async () => {
      const res = await api.GET('/api/organizations', { params: { query: { role: 'sender', size: 100 } } });
      return (res.data ?? { items: [] }) as { items: OrgLite[] };
    },
  });
  const orgs = useMemo(() => orgsQuery.data?.items ?? [], [orgsQuery.data]);
  const orgName = (id: number | null) =>
    id == null ? '—' : (orgs.find((o) => o.id === id)?.short_name ?? orgs.find((o) => o.id === id)?.full_name ?? '—');

  const listQuery = useQuery({
    queryKey: ['incoming', urgency, confid, sender, year, status, q, page],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/incoming', {
        params: {
          query: {
            urgency: urgency === 'all' ? undefined : urgency,
            confidentiality: confid === 'all' ? undefined : confid,
            sender_org_id: sender === 'all' ? undefined : Number(sender),
            date_from: year === 'all' ? undefined : `${year}-01-01`,
            date_to: year === 'all' ? undefined : `${year}-12-31`,
            status: status === 'all' ? undefined : status,
            q: q || undefined,
            page,
            size: PAGE_SIZE,
          },
        },
      });
      if (error || !data) throw new Error(errMsg(error, 'Không tải được sổ công văn đến'));
      return data as { items: IncRow[]; total: number };
    },
  });

  const repliesQuery = useQuery({
    queryKey: ['incoming-replies', selected?.id],
    enabled: !!selected,
    queryFn: async () => {
      const res = await api.GET('/api/incoming/{doc_id}/replies', { params: { path: { doc_id: selected!.id } } });
      return (res.data ?? []) as { id: number; number: string | null; subject: string }[];
    },
  });
  const replies = repliesQuery.data ?? [];

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['incoming'] });
    setSelected(null);
  };

  const toggleManagerOnly = useMutation({
    mutationFn: async (row: IncRow) => {
      const { error } = await api.POST('/api/incoming/{doc_id}/manager-only', {
        params: { path: { doc_id: row.id } },
        body: { manager_only: !row.manager_only },
      });
      if (error) throw new Error(errMsg(error, 'Đổi cờ thất bại'));
    },
    onSuccess: refresh,
    onError: (e: Error) => setActErr(e.message),
  });

  async function cancelDoc(row: IncRow) {
    const reason = window.prompt('Lý do huỷ vào sổ? (giữ số đến, không tái dùng)');
    if (reason === null) return;
    if (!reason.trim()) {
      setActErr('Phải nhập lý do huỷ');
      return;
    }
    setActErr(null);
    const { error } = await api.POST('/api/incoming/{doc_id}/cancel', {
      params: { path: { doc_id: row.id } },
      body: { reason: reason.trim() },
    });
    if (error) setActErr(errMsg(error, 'Huỷ thất bại'));
    else await refresh();
  }

  if (!me) return <div style={{ padding: '40px 0' }}><p className="cell-meta">Đang tải…</p></div>;

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Công văn đến' }]}
        title="Sổ công văn đến"
        subhead={`Sổ chung 2 đơn vị · ${total} công văn`}
        actions={
          <button className="btn-primary" type="button" onClick={() => navigate({ to: '/cong-van-den/vao-so' })}>
            <Plus size={14} /> Vào sổ mới
          </button>
        }
        filters={
          <>
            <FilterMenu
              label="Trạng thái:"
              value={status}
              options={[
                { value: 'all', label: 'Tất cả' },
                { value: 'draft', label: 'Nháp' },
                { value: 'registered', label: 'Đã vào sổ' },
                { value: 'cancelled', label: 'Huỷ' },
              ]}
              onChange={(v) => {
                setStatus(v as IncStatus | 'all');
                setPage(1);
              }}
            />
            <FilterMenu
              label="Mức độ khẩn:"
              value={urgency}
              options={[{ value: 'all', label: 'Tất cả' }, ...Object.entries(URGENCY_LABEL).map(([value, label]) => ({ value, label }))]}
              onChange={(v) => {
                setUrgency(v);
                setPage(1);
              }}
            />
            <FilterMenu
              label="Mức độ mật:"
              value={confid}
              options={[{ value: 'all', label: 'Tất cả' }, ...Object.entries(CONFIDENTIALITY_LABEL).map(([value, label]) => ({ value, label }))]}
              onChange={(v) => {
                setConfid(v);
                setPage(1);
              }}
            />
            <FilterMenu
              label="Cơ quan gửi:"
              value={sender}
              options={[{ value: 'all', label: 'Tất cả' }, ...orgs.map((o) => ({ value: String(o.id), label: o.short_name ?? o.full_name }))]}
              onChange={(v) => {
                setSender(v);
                setPage(1);
              }}
            />
            <FilterMenu
              label="Thời gian:"
              value={year}
              options={[{ value: 'all', label: 'Tất cả' }, ...YEARS.map((y) => ({ value: String(y), label: `Năm ${y}` }))]}
              onChange={(v) => {
                setYear(v);
                setPage(1);
              }}
            />
            <div className="relative">
              <Search size={15} className="absolute" style={{ left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-faint)' }} />
              <input
                className="search-input"
                placeholder="Tìm số đến / ký hiệu / trích yếu…"
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
                <th style={{ width: 150 }}>Số ký hiệu</th>
                <th>Trích yếu</th>
                <th style={{ width: 150 }}>Cơ quan gửi</th>
                <th style={{ width: 110 }}>Khẩn</th>
                <th style={{ width: 110 }}>Ngày đến</th>
                <th style={{ width: 130, paddingRight: 24 }}>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {listQuery.isLoading && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--ink-faint)' }}>Đang tải…</td></tr>
              )}
              {items.map((it) => (
                <tr key={it.id} onClick={() => setSelected(it)} style={{ cursor: 'pointer' }}>
                  <td style={{ paddingLeft: 24 }}>
                    <span className="cell-mono num">{it.number ?? '—'}</span>
                  </td>
                  <td><span className="cell-mono">{it.reference_number ?? '—'}</span></td>
                  <td>
                    <div className="flex items-center" style={{ gap: 6 }}>
                      {it.manager_only && <EyeOff size={14} style={{ color: 'var(--warning)', flexShrink: 0 }} aria-label="Chỉ Quản lý xem" />}
                      <span className="subject">{it.subject ?? <span className="cell-meta">(chưa có trích yếu)</span>}</span>
                      {it.signature_status === 'valid' && <ShieldCheck size={14} style={{ color: 'var(--success)', flexShrink: 0 }} aria-label="Đã ký số hợp lệ" />}
                    </div>
                  </td>
                  <td><span className="cell-meta">{orgName(it.sender_org_id)}</span></td>
                  <td>
                    {it.urgency === 'normal' ? (
                      <span className="cell-meta">Thường</span>
                    ) : (
                      <Pill variant="warning" dot>{URGENCY_LABEL[it.urgency] ?? it.urgency}</Pill>
                    )}
                  </td>
                  <td><span className="cell-meta">{fmtDate(it.created_at)}</span></td>
                  <td style={{ paddingRight: 24 }}>
                    <span className={`pill ${STATUS_PILL[it.status].cls}`}>
                      {STATUS_PILL[it.status].dot && <span className="dot" />}
                      {STATUS_PILL[it.status].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!listQuery.isLoading && items.length === 0 && (
            <EmptyState icon={Inbox} title="Sổ công văn đến trống" desc="Bấm “Vào sổ mới” để tải PDF công văn đến." />
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between" style={{ padding: '12px 24px', borderTop: '1px solid var(--rule)' }}>
            <span className="cell-meta">{total} công văn · trang {page}/{totalPages}</span>
            <div className="flex items-center" style={{ gap: 4 }}>
              <button className="action-btn" type="button" aria-label="Trang trước" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={15} /></button>
              <button className="action-btn" type="button" aria-label="Trang sau" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight size={15} /></button>
            </div>
          </div>
        )}
      </div>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        eyebrow="Công văn đến"
        title={selected?.number ?? 'Bản nháp'}
        width={480}
        actions={
          selected && (
            <>
              <button className="btn-secondary" style={{ height: 32 }} type="button" onClick={() => window.open(`/api/incoming/${selected.id}/file`, '_blank')}>
                <Download size={13} /> Tải PDF
              </button>
              {me.role === 'manager' && (
                <button className="btn-secondary" style={{ height: 32 }} type="button" disabled={toggleManagerOnly.isPending} onClick={() => toggleManagerOnly.mutate(selected)}>
                  {selected.manager_only ? 'Bỏ ẩn' : 'Chỉ Quản lý xem'}
                </button>
              )}
              {selected.status !== 'cancelled' && (
                <button className="btn-ghost" style={{ height: 32, color: 'var(--danger)' }} type="button" onClick={() => cancelDoc(selected)}>
                  <Ban size={13} /> Huỷ vào sổ
                </button>
              )}
            </>
          )
        }
      >
        {selected && (
          <>
            <div className="subject" style={{ fontWeight: 500, marginBottom: 12 }}>{selected.subject ?? '(chưa có trích yếu)'}</div>
            <div className="card" style={{ padding: 16, marginBottom: 16 }}>
              <InfoRow label="Số đến"><span className="cell-mono num">{selected.number ?? '—'}</span></InfoRow>
              <InfoRow label="Số ký hiệu"><span className="cell-mono">{selected.reference_number ?? '—'}</span></InfoRow>
              <InfoRow label="Ngày văn bản">{selected.document_date ? fmtDate(selected.document_date) : '—'}</InfoRow>
              <InfoRow label="Cơ quan gửi">{orgName(selected.sender_org_id)}</InfoRow>
              <InfoRow label="Mức độ khẩn">{URGENCY_LABEL[selected.urgency] ?? selected.urgency}</InfoRow>
              <InfoRow label="Mức độ mật">{CONFIDENTIALITY_LABEL[selected.confidentiality] ?? selected.confidentiality}</InfoRow>
              <InfoRow label="Chữ ký số">
                {selected.signature_status === 'valid' ? (
                  <Pill variant="success" dot><ShieldCheck size={12} /> Hợp lệ</Pill>
                ) : selected.signature_status === 'invalid' ? (
                  <Pill variant="warning">Không hợp lệ</Pill>
                ) : (
                  <span className="cell-meta">Chưa kiểm</span>
                )}
              </InfoRow>
              <InfoRow label="Vào sổ lúc">{fmtDateTime(selected.created_at)}</InfoRow>
            </div>
            {replies.length > 0 && (
              <div className="card" style={{ padding: 16 }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Công văn đi phản hồi ({replies.length})</div>
                <div className="flex flex-col" style={{ gap: 6 }}>
                  {replies.map((r) => (
                    <div key={r.id} className="flex items-center" style={{ gap: 8 }}>
                      <span className="cell-mono num">{r.number ?? `#${r.id}`}</span>
                      <span className="cell-meta" style={{ flex: 1, minWidth: 0 }}>{r.subject}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}
