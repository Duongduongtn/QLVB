import { useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, ChevronLeft, ChevronRight, Download, EyeOff, FileArchive, Inbox, Paperclip, Plus, Search, ShieldCheck, Trash2, UploadCloud, UserPlus } from 'lucide-react';

import { api, type ApiErrorEnvelope } from '~/lib/api';
import { useAuth } from '~/stores/auth';
import { fmtDate, fmtDateTime, fmtInt, fmtNum } from '~/lib/format';
import { EmptyState, FilterMenu, InfoRow, PageHeader, Pill } from '~/components/ui';
import { Drawer } from '~/components/Drawer';
import { Modal } from '~/components/Modal';
import { CONFIDENTIALITY_LABEL, URGENCY_LABEL } from '~/lib/incoming';

interface UnitLite2 {
  id: number;
  short_name: string | null;
  code: string;
}
interface UserLite {
  id: number;
  username: string;
  full_name: string;
}
interface TaskLite {
  id: number;
  unit_id: number;
  assignee_id: number | null;
  status: string;
}

export const Route = createFileRoute('/cong-van-den')({
  component: CongVanDenPage,
  // F1 — deep-link từ tìm kiếm toàn cục: /cong-van-den?q=...
  validateSearch: (s: Record<string, unknown>): { q?: string } => ({
    q: typeof s.q === 'string' ? s.q : undefined,
  }),
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

interface AttachmentRow {
  id: number;
  original_name: string | null;
  mime_type: string | null;
  size_bytes: number;
  created_at: string;
}

function fmtSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${fmtInt(Math.max(1, Math.round(bytes / 1024)))} KB` : `${fmtNum(bytes / 1048576)} MB`;
}

function fetchErr(res: Response, fallback: string): Promise<string> {
  return res.json().then((b: ApiErrorEnvelope | null) => b?.error?.message ?? fallback).catch(() => fallback);
}

/** E4 — phụ lục đính kèm CV đến: liệt kê + tải lẻ + tải ZIP gộp + thêm/xoá. */
function AttachmentsCard({ docId }: { docId: number }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const attQuery = useQuery({
    queryKey: ['incoming-attachments', docId],
    queryFn: async () => {
      const res = await api.GET('/api/incoming/{doc_id}/attachments', { params: { path: { doc_id: docId } } });
      return (res.data ?? []) as AttachmentRow[];
    },
  });
  const atts = attQuery.data ?? [];

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setErr(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', f);
      const res = await fetch(`/api/incoming/${docId}/attachments`, { method: 'POST', body: form, credentials: 'include' });
      if (!res.ok) throw new Error(await fetchErr(res, 'Tải phụ lục thất bại'));
      await queryClient.invalidateQueries({ queryKey: ['incoming-attachments', docId] });
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function del(id: number) {
    if (!window.confirm('Xoá phụ lục này khỏi công văn?')) return;
    setErr(null);
    const res = await fetch(`/api/incoming/${docId}/attachments/${id}`, { method: 'DELETE', credentials: 'include' });
    if (!res.ok) {
      setErr(await fetchErr(res, 'Xoá phụ lục thất bại'));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['incoming-attachments', docId] });
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <div className="eyebrow flex items-center" style={{ gap: 6 }}>
          <Paperclip size={13} /> Phụ lục đính kèm ({atts.length})
        </div>
        <div className="flex items-center" style={{ gap: 6 }}>
          {atts.length > 0 && (
            <button className="btn-ghost" style={{ height: 28 }} type="button" onClick={() => window.open(`/api/incoming/${docId}/attachments/zip`, '_blank')}>
              <FileArchive size={13} /> Tải ZIP gộp
            </button>
          )}
          <input ref={fileRef} type="file" className="hidden" onChange={onPick} />
          <button className="btn-secondary" style={{ height: 28 }} type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
            <UploadCloud size={13} /> {busy ? 'Đang tải…' : 'Thêm'}
          </button>
        </div>
      </div>

      {err && <div className="cell-meta" role="alert" style={{ color: 'var(--danger)', marginBottom: 8 }}>{err}</div>}

      {atts.length === 0 ? (
        <p className="cell-meta">Chưa có phụ lục. Hỗ trợ PDF, Word, Excel, ảnh — tối đa 50MB/file, tổng 500MB.</p>
      ) : (
        <div className="flex flex-col" style={{ gap: 6 }}>
          {atts.map((a) => (
            <div key={a.id} className="flex items-center" style={{ gap: 8, padding: '6px 8px', border: '1px solid var(--rule)', borderRadius: 6 }}>
              <Paperclip size={13} style={{ color: 'var(--ink-muted)', flexShrink: 0 }} />
              <span className="subject" style={{ flex: 1, minWidth: 0, fontSize: '0.85rem' }}>{a.original_name ?? `Phụ lục #${a.id}`}</span>
              <span className="cell-meta" style={{ flexShrink: 0 }}>{fmtSize(a.size_bytes)}</span>
              <button className="action-btn" type="button" aria-label="Tải phụ lục" onClick={() => window.open(`/api/incoming/${docId}/attachments/${a.id}/file`, '_blank')}>
                <Download size={14} />
              </button>
              <button className="action-btn" type="button" aria-label="Xoá phụ lục" style={{ color: 'var(--danger)' }} onClick={() => del(a.id)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CongVanDenPage() {
  const me = useAuth((s) => s.user);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { q: urlQ } = Route.useSearch();
  const [q, setQ] = useState(urlQ ?? '');
  // Đồng bộ ô tìm khi deep-link đổi ?q= mà KHÔNG remount (đang ở sổ rồi chọn kết quả khác).
  useEffect(() => {
    if (urlQ !== undefined) {
      setQ(urlQ);
      setPage(1);
    }
  }, [urlQ]);
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

  const tasksQuery = useQuery({
    queryKey: ['incoming-tasks', selected?.id],
    enabled: !!selected,
    queryFn: async () => {
      const res = await api.GET('/api/incoming/{doc_id}/tasks', { params: { path: { doc_id: selected!.id } } });
      return (res.data ?? []) as TaskLite[];
    },
  });
  const tasks = tasksQuery.data ?? [];

  const unitsQuery = useQuery({
    queryKey: ['units'],
    queryFn: async () => (await api.GET('/api/units', {})).data as { items: UnitLite2[] },
  });
  const allUnits = useMemo(() => unitsQuery.data?.items ?? [], [unitsQuery.data]);

  const usersQuery = useQuery({
    queryKey: ['users', 'assignee'],
    enabled: !!me,
    queryFn: async () => {
      const res = await api.GET('/api/users', { params: { query: { size: 100 } } });
      return (res.data ?? { items: [] }) as { items: UserLite[] };
    },
  });
  const users = useMemo(() => usersQuery.data?.items ?? [], [usersQuery.data]);

  // ── Phân công (E2) ──
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignUnits, setAssignUnits] = useState<'first' | 'second' | 'both'>('first');
  const [assignee1, setAssignee1] = useState<number | ''>('');
  const [assignee2, setAssignee2] = useState<number | ''>('');
  const [assignDeadline, setAssignDeadline] = useState('');
  const [assignNote, setAssignNote] = useState('');

  const assignMut = useMutation({
    mutationFn: async (docId: number) => {
      const u1 = allUnits[0];
      const u2 = allUnits[1];
      const list: { unit_id: number; assignee_id: number; deadline: string | null; note: string | null }[] = [];
      if ((assignUnits === 'first' || assignUnits === 'both') && u1 && assignee1) {
        list.push({ unit_id: u1.id, assignee_id: assignee1, deadline: assignDeadline || null, note: assignNote || null });
      }
      if ((assignUnits === 'second' || assignUnits === 'both') && u2 && assignee2) {
        list.push({ unit_id: u2.id, assignee_id: assignee2, deadline: assignDeadline || null, note: assignNote || null });
      }
      if (list.length === 0) throw new Error('Chọn đơn vị và người xử lý');
      const { error } = await api.POST('/api/incoming/{doc_id}/assign', {
        params: { path: { doc_id: docId } },
        body: { assignments: list },
      });
      if (error) throw new Error(errMsg(error, 'Phân công thất bại'));
    },
    onSuccess: async () => {
      setAssignOpen(false);
      setAssignee1('');
      setAssignee2('');
      setAssignDeadline('');
      setAssignNote('');
      await queryClient.invalidateQueries({ queryKey: ['incoming-tasks'] });
    },
    onError: (e: Error) => setActErr(e.message),
  });

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
              {selected.status === 'registered' && (
                <button className="btn-primary" style={{ height: 32 }} type="button" onClick={() => setAssignOpen(true)}>
                  <UserPlus size={13} /> Phân công
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
            <AttachmentsCard docId={selected.id} />
            {tasks.length > 0 && (
              <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Phân công xử lý</div>
                <div className="flex flex-col" style={{ gap: 6 }}>
                  {tasks.map((t) => {
                    const u = allUnits.find((x) => x.id === t.unit_id);
                    const who = users.find((x) => x.id === t.assignee_id);
                    const sv = t.status === 'done' ? 'success' : t.status === 'in_progress' ? 'warning' : 'info';
                    const sl = t.status === 'done' ? 'Hoàn thành' : t.status === 'in_progress' ? 'Đang xử lý' : 'Mới';
                    return (
                      <div key={t.id} className="flex items-center" style={{ gap: 8 }}>
                        <span style={{ fontWeight: 600, color: 'var(--ink)', minWidth: 56 }}>{u?.short_name ?? u?.code ?? '—'}</span>
                        <span className="cell-meta" style={{ flex: 1, minWidth: 0 }}>{who?.full_name ?? 'Chưa giao'}</span>
                        <Pill variant={sv} dot>{sl}</Pill>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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

      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Phân công xử lý"
        actions={
          <>
            <button className="btn-secondary" type="button" onClick={() => setAssignOpen(false)}>Huỷ</button>
            <button className="btn-primary" type="button" disabled={assignMut.isPending || !selected} onClick={() => selected && assignMut.mutate(selected.id)}>
              {assignMut.isPending ? 'Đang giao…' : 'Giao việc'}
            </button>
          </>
        }
      >
        <div>
          <label className="field-label">Đơn vị xử lý</label>
          <div className="seg">
            <button type="button" data-active={assignUnits === 'first' ? 'true' : undefined} onClick={() => setAssignUnits('first')}>{allUnits[0]?.short_name ?? 'Đơn vị 1'}</button>
            <button type="button" data-active={assignUnits === 'second' ? 'true' : undefined} onClick={() => setAssignUnits('second')}>{allUnits[1]?.short_name ?? 'Đơn vị 2'}</button>
            <button type="button" data-active={assignUnits === 'both' ? 'true' : undefined} onClick={() => setAssignUnits('both')}>Cả 2 đơn vị</button>
          </div>
        </div>
        {(assignUnits === 'first' || assignUnits === 'both') && (
          <div>
            <label className="field-label">Người xử lý — {allUnits[0]?.short_name ?? 'Đơn vị 1'}</label>
            <select className="text-input" value={assignee1} onChange={(e) => setAssignee1(e.target.value ? Number(e.target.value) : '')}>
              <option value="">— Chọn người —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
        )}
        {(assignUnits === 'second' || assignUnits === 'both') && (
          <div>
            <label className="field-label">Người xử lý — {allUnits[1]?.short_name ?? 'Đơn vị 2'}</label>
            <select className="text-input" value={assignee2} onChange={(e) => setAssignee2(e.target.value ? Number(e.target.value) : '')}>
              <option value="">— Chọn người —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="field-label">Hạn xử lý</label>
          <input className="text-input" type="date" value={assignDeadline} onChange={(e) => setAssignDeadline(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Ghi chú phân công</label>
          <textarea className="text-input" rows={3} value={assignNote} onChange={(e) => setAssignNote(e.target.value)} placeholder="Nội dung cần xử lý…" />
        </div>
        <p className="cell-meta">Chọn “Cả 2 đơn vị” sẽ tạo 2 việc xử lý độc lập.</p>
      </Modal>
    </>
  );
}
