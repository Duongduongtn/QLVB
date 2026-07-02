import { useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, ChevronLeft, ChevronRight, Download, Eye, EyeOff, FileArchive, History, Inbox, MoreHorizontal, Paperclip, Pencil, RefreshCw, Search, ShieldCheck, Trash2, UploadCloud, UserPlus } from 'lucide-react';

import { api, type ApiErrorEnvelope } from '~/lib/api';
import { useAuth } from '~/stores/auth';
import { fmtDate, fmtDateTime, fmtInt, fmtNum } from '~/lib/format';
import { EmptyState, FilterMenu, InfoRow, PageHeader, Pill } from '~/components/ui';
import { Drawer } from '~/components/Drawer';
import { Modal } from '~/components/Modal';
import { PdfViewerModal } from '~/components/PdfViewerModal';
import { SenderCombobox } from '~/components/SenderCombobox';
import { TagEditor } from '~/components/TagEditor';
import { CONFIDENTIALITY_LABEL, URGENCY_LABEL } from '~/lib/incoming';

/** Form sửa 4 trường quan trọng trong drawer (Sửa tại chỗ). */
interface EditForm {
  subject: string;
  reference_number: string;
  document_date: string;
  sender_org_id: number | null;
  sender_org_name: string | null;
}
const EMPTY_FORM: EditForm = { subject: '', reference_number: '', document_date: '', sender_org_id: null, sender_org_name: null };

/** Chi tiết đầy đủ (bổ sung sender_org_name free-text mà dòng list thiếu). */
interface IncDetail {
  id: number;
  subject: string | null;
  reference_number: string | null;
  document_date: string | null;
  sender_org_id: number | null;
  sender_org_name: string | null;
}

/** 1 dòng lịch sử tác động (khớp IncomingHistoryItem của backend). */
interface HistoryItem {
  id: number;
  created_at: string;
  username: string | null;
  action: string;
  detail: { fields?: string[] } | null;
}

// Nhãn tiếng Việt cho lịch sử tác động.
const HIST_FIELD_LABEL: Record<string, string> = {
  subject: 'Tiêu đề', reference_number: 'Số công văn', document_date: 'Ngày phát hành',
  sender_org_id: 'Cơ quan phát hành', sender_org_name: 'Cơ quan phát hành',
  urgency: 'Mức khẩn', confidentiality: 'Mức mật', deadline: 'Hạn xử lý', manager_only: 'Chế độ xem',
};
const HIST_ACTION_LABEL: Record<string, string> = {
  incoming_create: 'tải công văn lên', incoming_update: 'sửa thông tin', incoming_register: 'vào sổ',
  incoming_cancel: 'huỷ vào sổ', incoming_set_manager_only: 'đổi chế độ xem',
  incoming_download: 'tải file', incoming_download_raw: 'tải bản gốc (không watermark)',
};

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
  task_total?: number;
  task_status?: string | null;
}

// E2 — badge tóm tắt phân công xử lý trên sổ CV đến.
const TASK_PILL: Record<string, { label: string; variant: 'info' | 'warning' | 'success' }> = {
  assigned: { label: 'Đã giao', variant: 'info' },
  processing: { label: 'Đang xử lý', variant: 'warning' },
  done: { label: 'Hoàn thành', variant: 'success' },
};

function TaskBadge({ status }: { status?: string | null }) {
  const tp = status ? TASK_PILL[status] : undefined;
  return tp ? <Pill variant={tp.variant}>{tp.label}</Pill> : null;
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

  // ── Xem nội dung / Sửa tại chỗ / Lịch sử / Đổi người (redesign drawer) ──
  const [viewerDoc, setViewerDoc] = useState<IncRow | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditForm>(EMPTY_FORM);
  const [reassignTask, setReassignTask] = useState<number | null>(null);

  // Chi tiết đầy đủ (có sender_org_name free-text) — seed form sửa + hiện cơ quan chính xác.
  const detailQuery = useQuery({
    queryKey: ['incoming-detail', selected?.id],
    enabled: !!selected,
    queryFn: async () => {
      const res = await api.GET('/api/incoming/{doc_id}', { params: { path: { doc_id: selected!.id } } });
      return (res.data ?? null) as IncDetail | null;
    },
  });
  const detail = detailQuery.data ?? null;

  const historyQuery = useQuery({
    queryKey: ['incoming-history', selected?.id],
    enabled: !!selected,
    queryFn: async () => {
      const res = await api.GET('/api/incoming/{doc_id}/history', { params: { path: { doc_id: selected!.id } } });
      return (res.data ?? []) as HistoryItem[];
    },
  });
  const history = historyQuery.data ?? [];

  // Đổi CV đang mở → thoát chế độ sửa + đóng menu ⋯.
  useEffect(() => {
    setEditing(false);
    setOverflowOpen(false);
    setReassignTask(null);
  }, [selected?.id]);

  function startEdit() {
    setForm({
      subject: detail?.subject ?? selected?.subject ?? '',
      reference_number: detail?.reference_number ?? selected?.reference_number ?? '',
      document_date: detail?.document_date ?? selected?.document_date ?? '',
      sender_org_id: detail?.sender_org_id ?? selected?.sender_org_id ?? null,
      sender_org_name: detail?.sender_org_name ?? null,
    });
    setActErr(null);
    setEditing(true);
  }

  async function saveEdit() {
    if (!selected) return;
    if (!form.subject.trim()) {
      setActErr('Nhập tiêu đề công văn');
      return;
    }
    setSaving(true);
    setActErr(null);
    try {
      const { error } = await api.PATCH('/api/incoming/{doc_id}', {
        params: { path: { doc_id: selected.id } },
        body: {
          subject: form.subject.trim(),
          reference_number: form.reference_number.trim() || null,
          document_date: form.document_date || null,
          sender_org_id: form.sender_org_id,
          sender_org_name: form.sender_org_name,
        },
      });
      if (error) throw new Error(errMsg(error, 'Lưu thất bại'));
      setEditing(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['incoming'] }),
        queryClient.invalidateQueries({ queryKey: ['incoming-detail', selected.id] }),
        queryClient.invalidateQueries({ queryKey: ['incoming-history', selected.id] }),
      ]);
    } catch (e) {
      setActErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function downloadFile(docId: number) {
    // Tải bản có watermark cá nhân — ép LƯU về (thẻ a[download] same-origin thắng inline).
    const a = document.createElement('a');
    a.href = `/api/incoming/${docId}/file`;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function reassign(taskId: number, assigneeId: number) {
    setActErr(null);
    const { error } = await api.POST('/api/tasks/{task_id}/reassign', {
      params: { path: { task_id: taskId } },
      body: { assignee_id: assigneeId },
    });
    if (error) {
      setActErr(errMsg(error, 'Đổi người thất bại'));
      return;
    }
    setReassignTask(null);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['incoming-tasks', selected?.id] }),
      queryClient.invalidateQueries({ queryKey: ['incoming'] }),
    ]);
  }

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
      // Refresh cả task chi tiết LẪN sổ (badge "Đã giao" cập nhật ngay sau khi giao).
      await queryClient.invalidateQueries({ queryKey: ['incoming-tasks'] });
      await queryClient.invalidateQueries({ queryKey: ['incoming'] });
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

  function downloadRaw(docId: number) {
    // H2 — Quản lý tải bản gốc KHÔNG watermark; BE ghi audit lý do.
    const reason = window.prompt('Lý do tải bản gốc không watermark (in chính thức, lưu trữ…):');
    if (!reason || !reason.trim()) return;
    window.open(`/api/incoming/${docId}/file?raw=1&reason=${encodeURIComponent(reason.trim())}`, '_blank');
  }

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

  function exportExcel() {
    const qs = new URLSearchParams();
    if (urgency !== 'all') qs.set('urgency', urgency);
    if (confid !== 'all') qs.set('confidentiality', confid);
    if (sender !== 'all') qs.set('sender_org_id', sender);
    if (year !== 'all') {
      qs.set('date_from', `${year}-01-01`);
      qs.set('date_to', `${year}-12-31`);
    }
    if (status !== 'all') qs.set('status', status);
    if (q) qs.set('q', q);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    window.open(`/api/incoming/export.xlsx${suffix}`, '_blank');
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Công văn đến' }]}
        title="Sổ công văn đến"
        subhead={`Sổ chung 2 đơn vị · ${total} công văn`}
        actions={
          <>
            <button className="btn-secondary" type="button" onClick={exportExcel}>
              <Download size={14} /> Xuất Excel
            </button>
          </>
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
                <th style={{ width: 130 }}>Trạng thái</th>
                <th style={{ width: 56, paddingRight: 24 }} aria-label="Xem nội dung"></th>
              </tr>
            </thead>
            <tbody>
              {listQuery.isLoading && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--ink-faint)' }}>Đang tải…</td></tr>
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
                      <TaskBadge status={it.task_status} />
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
                  <td>
                    <span className={`pill ${STATUS_PILL[it.status].cls}`}>
                      {STATUS_PILL[it.status].dot && <span className="dot" />}
                      {STATUS_PILL[it.status].label}
                    </span>
                  </td>
                  <td style={{ paddingRight: 24 }}>
                    <button
                      className="action-btn"
                      type="button"
                      aria-label="Xem nội dung công văn"
                      title="Xem nội dung"
                      onClick={(e) => { e.stopPropagation(); setViewerDoc(it); }}
                    >
                      <Eye size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!listQuery.isLoading && items.length === 0 && (
            <EmptyState icon={Inbox} title="Sổ công văn đến trống" desc="Bấm “＋ Công văn đến” trên thanh trên cùng để tải công văn lên." />
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
        title={selected ? `Số đến ${selected.number ?? '—'}` : 'Bản nháp'}
        width={480}
      >
        {selected && (
          <>
            {/* Thanh nút chính — dính trên đầu, luôn thấy khi cuộn */}
            <div
              className="flex items-center"
              style={{ gap: 8, flexWrap: 'wrap', position: 'sticky', top: 0, zIndex: 5, background: 'var(--paper-raised)', margin: '-20px -20px 16px', padding: '12px 20px', borderBottom: '1px solid var(--rule)' }}
            >
              <button className="btn-primary" style={{ height: 32 }} type="button" onClick={() => setViewerDoc(selected)}>
                <Eye size={14} /> Xem nội dung
              </button>
              {selected.status === 'registered' && (
                <button className="btn-secondary" style={{ height: 32 }} type="button" onClick={() => setAssignOpen(true)}>
                  <UserPlus size={14} /> Phân công
                </button>
              )}
              <div className="relative" style={{ marginLeft: 'auto' }}>
                <button
                  className="icon-btn"
                  type="button"
                  aria-label="Thêm thao tác"
                  aria-haspopup="menu"
                  aria-expanded={overflowOpen}
                  onClick={() => setOverflowOpen((v) => !v)}
                >
                  <MoreHorizontal size={18} />
                </button>
                {overflowOpen && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 35 }} aria-hidden="true" onClick={() => setOverflowOpen(false)} />
                    <div role="menu" className="card" style={{ position: 'absolute', right: 0, top: 40, width: 236, padding: 6, zIndex: 36, boxShadow: '0 10px 30px oklch(18% 0.02 95 / 0.16)' }}>
                      <button type="button" role="menuitem" className="nav-item w-full" style={{ borderLeft: 'none' }} onClick={() => { setOverflowOpen(false); downloadFile(selected.id); }}>
                        <Download className="nav-icon" size={16} /> Tải PDF
                      </button>
                      {me.role === 'manager' && (
                        <button type="button" role="menuitem" className="nav-item w-full" style={{ borderLeft: 'none' }} onClick={() => { setOverflowOpen(false); downloadRaw(selected.id); }}>
                          <Download className="nav-icon" size={16} /> Bản gốc (không watermark)
                        </button>
                      )}
                      {me.role === 'manager' && (
                        <button type="button" role="menuitem" className="nav-item w-full" style={{ borderLeft: 'none' }} disabled={toggleManagerOnly.isPending} onClick={() => { setOverflowOpen(false); toggleManagerOnly.mutate(selected); }}>
                          <EyeOff className="nav-icon" size={16} /> {selected.manager_only ? 'Bỏ ẩn (cho Nhân viên xem)' : 'Chỉ Quản lý xem'}
                        </button>
                      )}
                      {selected.status !== 'cancelled' && (
                        <button type="button" role="menuitem" className="nav-item w-full" style={{ borderLeft: 'none', color: 'var(--danger)' }} onClick={() => { setOverflowOpen(false); cancelDoc(selected); }}>
                          <Ban className="nav-icon" size={16} style={{ color: 'var(--danger)' }} /> Huỷ vào sổ
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Thẻ thông tin — 4 trường quan trọng + Sửa tại chỗ */}
            <div className="card" style={{ padding: 16, marginBottom: 16 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: editing ? 14 : 6 }}>
                <div className="eyebrow">Thông tin công văn</div>
                {!editing && selected.status !== 'cancelled' && (
                  <button className="btn-ghost" style={{ height: 28 }} type="button" onClick={startEdit}>
                    <Pencil size={13} /> Sửa
                  </button>
                )}
              </div>
              {!editing ? (
                <>
                  <InfoRow label="Đơn vị phát hành">
                    <span className="flex items-center" style={{ gap: 6 }}>
                      {selected.sender_org_id ? orgName(selected.sender_org_id) : (detail?.sender_org_name ?? '—')}
                      {selected.signature_status === 'valid' && <ShieldCheck size={14} style={{ color: 'var(--success)', flexShrink: 0 }} aria-label="Đã ký số hợp lệ" />}
                    </span>
                  </InfoRow>
                  <InfoRow label="Ngày phát hành">{selected.document_date ? fmtDate(selected.document_date) : '—'}</InfoRow>
                  <InfoRow label="Tiêu đề công văn">{selected.subject ?? '—'}</InfoRow>
                  <InfoRow label="Số công văn"><span className="cell-mono">{selected.reference_number ?? '—'}</span></InfoRow>
                </>
              ) : (
                <div className="flex flex-col" style={{ gap: 12 }}>
                  <div>
                    <label className="field-label">Đơn vị phát hành</label>
                    <SenderCombobox
                      orgId={form.sender_org_id}
                      orgName={form.sender_org_name}
                      orgs={orgs}
                      onChange={(id, name) => setForm((f) => ({ ...f, sender_org_id: id, sender_org_name: name }))}
                    />
                  </div>
                  <div>
                    <label className="field-label">Ngày phát hành</label>
                    <input className="text-input" type="date" value={form.document_date} onChange={(e) => setForm((f) => ({ ...f, document_date: e.target.value }))} />
                  </div>
                  <div>
                    <label className="field-label">Tiêu đề công văn</label>
                    <textarea className="text-input" rows={2} value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
                  </div>
                  <div>
                    <label className="field-label">Số công văn</label>
                    <input className="text-input" value={form.reference_number} onChange={(e) => setForm((f) => ({ ...f, reference_number: e.target.value }))} />
                  </div>
                  <div className="flex items-center justify-end" style={{ gap: 8 }}>
                    <button className="btn-secondary" style={{ height: 32 }} type="button" disabled={saving} onClick={() => setEditing(false)}>Huỷ</button>
                    <button className="btn-primary" style={{ height: 32 }} type="button" disabled={saving} onClick={saveEdit}>{saving ? 'Đang lưu…' : 'Lưu'}</button>
                  </div>
                </div>
              )}
            </div>

            {/* Phân công + Đổi người */}
            {tasks.length > 0 && (
              <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Phân công xử lý</div>
                <div className="flex flex-col" style={{ gap: 10 }}>
                  {tasks.map((t) => {
                    const who = users.find((x) => x.id === t.assignee_id);
                    const sv = t.status === 'done' ? 'success' : t.status === 'in_progress' ? 'warning' : 'info';
                    const sl = t.status === 'done' ? 'Hoàn thành' : t.status === 'in_progress' ? 'Đang xử lý' : 'Mới';
                    return (
                      <div key={t.id} className="flex flex-col" style={{ gap: 6 }}>
                        <div className="flex items-center" style={{ gap: 8 }}>
                          <span className="cell-meta" style={{ flex: 1, minWidth: 0, color: 'var(--ink)' }}>{who?.full_name ?? 'Chưa giao'}</span>
                          <Pill variant={sv} dot>{sl}</Pill>
                          <button className="btn-ghost" style={{ height: 26 }} type="button" onClick={() => setReassignTask(reassignTask === t.id ? null : t.id)}>
                            <RefreshCw size={12} /> Đổi người
                          </button>
                        </div>
                        {reassignTask === t.id && (
                          <select className="text-input" defaultValue="" onChange={(e) => { if (e.target.value) void reassign(t.id, Number(e.target.value)); }}>
                            <option value="">— Chọn người xử lý mới —</option>
                            {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Lịch sử tác động */}
            <div className="card" style={{ padding: 16, marginBottom: 16 }}>
              <div className="eyebrow flex items-center" style={{ gap: 6, marginBottom: 10 }}>
                <History size={13} /> Lịch sử tác động
              </div>
              {historyQuery.isLoading ? (
                <p className="cell-meta">Đang tải…</p>
              ) : history.length === 0 ? (
                <p className="cell-meta">Chưa có tác động nào được ghi.</p>
              ) : (
                <div className="flex flex-col" style={{ gap: 10 }}>
                  {history.map((h) => {
                    const fields = h.action === 'incoming_update' ? (h.detail?.fields ?? []) : [];
                    const labels = Array.from(new Set(fields.map((f) => HIST_FIELD_LABEL[f] ?? f)));
                    return (
                      <div key={h.id} className="flex items-start" style={{ gap: 8 }}>
                        <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--ink-faint)', marginTop: 6, flexShrink: 0 }} aria-hidden="true" />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '0.82rem', color: 'var(--ink)' }}>
                            <strong style={{ fontWeight: 600 }}>{h.username ?? 'Hệ thống'}</strong> {HIST_ACTION_LABEL[h.action] ?? h.action}
                            {labels.length > 0 && <span className="cell-meta"> ({labels.join(', ')})</span>}
                          </div>
                          <div className="cell-meta">{fmtDateTime(h.created_at)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <AttachmentsCard docId={selected.id} />
            <TagEditor objectType="incoming" objectId={selected.id} />
            {replies.length > 0 && (
              <div className="card" style={{ padding: 16, marginTop: 16 }}>
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

      <PdfViewerModal
        open={!!viewerDoc}
        onClose={() => setViewerDoc(null)}
        title={viewerDoc ? `Công văn số đến ${viewerDoc.number ?? viewerDoc.reference_number ?? ''}` : ''}
        src={viewerDoc ? `/api/incoming/${viewerDoc.id}/file` : ''}
        onDownload={viewerDoc ? () => downloadFile(viewerDoc.id) : undefined}
      />

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
