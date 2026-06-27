import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Download, FileCheck2, FileText, Plus, Search, Upload, X } from 'lucide-react';

import { api, type ApiErrorEnvelope } from '~/lib/api';
import { useAuth } from '~/stores/auth';
import { fmtDate, fmtDateTime } from '~/lib/format';
import { UnitPill, type UnitLite } from '~/components/sign-ui';

export const Route = createFileRoute('/cong-van-di')({
  component: CongVanDiPage,
});

type OutStatus = 'draft' | 'numbered' | 'published' | 'cancelled';

interface OutRow {
  id: number;
  unit_id: number;
  doc_type_id: number;
  number: string | null;
  subject: string;
  issue_date: string;
  status: OutStatus;
  created_at: string;
}

interface OutDetail extends OutRow {
  period_key: string | null;
  signing_profile_id: number | null;
  original_file_id: number | null;
  signed_file_id: number | null;
  cancel_reason: string | null;
  sealing_option: { giap_lai?: { kind: string }; ky_nhay?: { kind: string } } | null;
  created_by: number | null;
  updated_at: string;
  recipients: { id: number; full_name: string; short_name: string | null }[];
}

const PAGE_SIZE = 20;
const STATUS_BADGE: Record<OutStatus, { label: string; cls: string }> = {
  draft: { label: 'Nháp', cls: 'bg-slate-100 text-slate-600' },
  numbered: { label: 'Đã cấp số · chờ ký', cls: 'bg-amber-100 text-amber-700' },
  published: { label: 'Đã phát hành', cls: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Huỷ', cls: 'bg-red-100 text-red-600' },
};

function errMsg(error: unknown, fallback: string): string {
  return (error as ApiErrorEnvelope | undefined)?.error?.message ?? fallback;
}

function StatusBadge({ status }: { status: OutStatus }) {
  const s = STATUS_BADGE[status];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

function CongVanDiPage() {
  const me = useAuth((s) => s.user);
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [unitFilter, setUnitFilter] = useState<number | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<OutStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const unitsQuery = useQuery({
    queryKey: ['units'],
    queryFn: async () => {
      const res = await api.GET('/api/units', {});
      return (res.data ?? { items: [] }) as { items: UnitLite[] };
    },
  });
  const units = useMemo(() => unitsQuery.data?.items ?? [], [unitsQuery.data]);

  const listQuery = useQuery({
    queryKey: ['outgoing', unitFilter, statusFilter, debouncedQ, page],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/outgoing', {
        params: {
          query: {
            unit_id: unitFilter === 'all' ? undefined : unitFilter,
            status: statusFilter === 'all' ? undefined : statusFilter,
            q: debouncedQ || undefined,
            page,
            size: PAGE_SIZE,
          },
        },
      });
      if (error || !data) throw new Error(errMsg(error, 'Không tải được danh sách'));
      return data as { items: OutRow[]; total: number };
    },
  });

  if (!me) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-10">
        <p className="text-slate-500">Đang tải…</p>
      </div>
    );
  }

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const unitOf = (id: number) => units.find((u) => u.id === id);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-1 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">Công văn đi</p>
          <h2 className="text-2xl font-semibold text-slate-800">Danh sách công văn đi</h2>
          <p className="mt-1 text-sm text-slate-500">Tổng {total} công văn của 2 đơn vị.</p>
        </div>
        <button
          type="button"
          onClick={() => navigate({ to: '/cong-van-di/soan' })}
          className="flex items-center gap-2 rounded-md bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-500"
        >
          <Plus size={16} />
          Soạn công văn mới
        </button>
      </div>

      <div className="my-4 flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm số CV / trích yếu…"
            className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
          />
        </div>
        <select
          value={unitFilter}
          onChange={(e) => {
            setUnitFilter(e.target.value === 'all' ? 'all' : Number(e.target.value));
            setPage(1);
          }}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-400"
        >
          <option value="all">Tất cả đơn vị</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.short_name ?? u.code}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as OutStatus | 'all');
            setPage(1);
          }}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-400"
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="draft">Nháp</option>
          <option value="numbered">Đã cấp số</option>
          <option value="published">Đã phát hành</option>
          <option value="cancelled">Huỷ</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Số CV</th>
              <th className="px-4 py-3 font-medium">Trích yếu</th>
              <th className="px-4 py-3 font-medium">Đơn vị</th>
              <th className="px-4 py-3 font-medium">Ngày phát hành</th>
              <th className="px-4 py-3 font-medium">Trạng thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {listQuery.isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">Đang tải…</td>
              </tr>
            )}
            {!listQuery.isLoading && items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  Chưa có công văn nào. Bấm “Soạn công văn mới” để bắt đầu.
                </td>
              </tr>
            )}
            {items.map((r) => (
              <tr
                key={r.id}
                tabIndex={0}
                onClick={() => setSelectedId(r.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedId(r.id);
                  }
                }}
                className="cursor-pointer hover:bg-amber-50/50 focus:bg-amber-50 focus:outline-none"
              >
                <td className="px-4 py-3 font-mono text-slate-700">{r.number ?? '—'}</td>
                <td className="max-w-md px-4 py-3">
                  <span className="line-clamp-2 text-slate-800">{r.subject}</span>
                </td>
                <td className="px-4 py-3">
                  <UnitPill unit={unitOf(r.unit_id)} />
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {r.status === 'draft' ? '—' : fmtDate(r.issue_date)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40">
            Trước
          </button>
          <span className="text-slate-500">Trang {page}/{totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40">
            Sau
          </button>
        </div>
      )}

      {selectedId !== null && (
        <DetailDrawer id={selectedId} units={units} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

function DetailDrawer({ id, units, onClose }: { id: number; units: UnitLite[]; onClose: () => void }) {
  const me = useAuth((s) => s.user);
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ['outgoing', id],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/outgoing/{doc_id}', {
        params: { path: { doc_id: id } },
      });
      if (error || !data) throw new Error(errMsg(error, 'Không tải được công văn'));
      return data as OutDetail;
    },
  });
  const d = detailQuery.data;
  const unit = d ? units.find((u) => u.id === d.unit_id) : undefined;

  function download(signed: boolean) {
    // Tải qua link trực tiếp (cookie tự gửi) — endpoint trả attachment.
    window.open(`/api/outgoing/${id}/download${signed ? '?signed=true' : ''}`, '_blank');
  }

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['outgoing'] });
  }

  async function uploadSigned(file: File) {
    setActionErr(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/outgoing/${id}/signed-file`, { method: 'POST', body: form, credentials: 'include' });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as ApiErrorEnvelope | null;
        throw new Error(b?.error?.message ?? 'Tải bản ký số thất bại');
      }
      await refresh();
    } catch (e) {
      setActionErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function cancelDoc() {
    const reason = window.prompt('Lý do huỷ công văn này? (bắt buộc — số đã cấp sẽ không tái dùng)');
    if (reason === null) return;
    if (!reason.trim()) {
      setActionErr('Phải nhập lý do huỷ');
      return;
    }
    setActionErr(null);
    setBusy(true);
    try {
      const { error } = await api.POST('/api/outgoing/{doc_id}/cancel', {
        params: { path: { doc_id: id } },
        body: { reason: reason.trim() },
      });
      if (error) throw new Error(errMsg(error, 'Huỷ thất bại'));
      await refresh();
    } catch (e) {
      setActionErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40">
      <button type="button" aria-label="Đóng" onClick={onClose} className="absolute inset-0 bg-slate-900/30" />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-lg flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">Công văn đi</p>
            <h3 className="font-mono text-lg font-semibold text-slate-800">{d?.number ?? 'Bản nháp'}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {!d ? (
            <p className="text-slate-400">Đang tải…</p>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <UnitPill unit={unit} />
                <StatusBadge status={d.status} />
              </div>

              <Section title="Thông tin công văn">
                <Info label="Số CV">{d.number ?? '— (chưa cấp số)'}</Info>
                <Info label="Trích yếu">{d.subject}</Info>
                <Info label="Đơn vị">{unit?.full_name ?? '—'}</Info>
                <Info label="Ngày phát hành">{fmtDate(d.issue_date)}</Info>
                <Info label="Giáp lai">{rangeLabel(d.sealing_option?.giap_lai?.kind)}</Info>
                <Info label="Ký nháy">{rangeLabel(d.sealing_option?.ky_nhay?.kind)}</Info>
                <Info label="Tạo lúc">{fmtDateTime(d.created_at)}</Info>
              </Section>

              <Section title={`Nơi nhận (${d.recipients.length})`}>
                {d.recipients.length === 0 ? (
                  <p className="text-sm text-slate-400">Chưa chọn nơi nhận.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm text-slate-700">
                    {d.recipients.map((o) => (
                      <li key={o.id} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                        {o.full_name}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {d.status === 'cancelled' && d.cancel_reason && (
                <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <span className="font-medium">Đã huỷ.</span> Lý do: {d.cancel_reason}
                </div>
              )}

              {d.status === 'numbered' && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  <FileCheck2 size={14} className="mt-0.5 shrink-0" />
                  Đã cấp số, chưa ký số. Mở vSign + USB Token Viettel-CA để ký, rồi tải bản đã ký lên đây.
                </div>
              )}

              {actionErr && (
                <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {actionErr}
                </div>
              )}

              {d.original_file_id !== null && (
                <div className="space-y-2 rounded-md border border-slate-200 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <FileText size={15} /> File PDF
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => download(false)}
                      className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
                    >
                      <Download size={15} /> Tải bản {d.status === 'draft' ? 'gốc' : 'chưa ký (_CHUA_KY_SO)'}
                    </button>
                    {d.signed_file_id !== null && (
                      <button
                        type="button"
                        onClick={() => download(true)}
                        className="flex items-center gap-2 rounded-md border border-green-300 px-3 py-2 text-sm text-green-700 hover:bg-green-50"
                      >
                        <FileCheck2 size={15} /> Tải bản đã ký số
                      </button>
                    )}
                  </div>

                  {d.status === 'numbered' && (
                    <>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void uploadSigned(f);
                          e.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => fileRef.current?.click()}
                        className="flex items-center gap-2 rounded-md bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-500 disabled:opacity-60"
                      >
                        <Upload size={15} /> {busy ? 'Đang tải…' : 'Tải lên bản đã ký số'}
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Thu hồi CV đã phát hành: chỉ Quản lý (PRD máy trạng thái). */}
              {d.status !== 'cancelled' && !(d.status === 'published' && me?.role !== 'manager') && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={cancelDoc}
                  className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <Ban size={15} /> {d.status === 'published' ? 'Thu hồi công văn' : 'Huỷ công văn'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function rangeLabel(kind: string | undefined): string {
  if (kind === 'all') return 'Toàn bộ';
  if (kind === 'range') return 'Theo khoảng trang';
  return 'Không';
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-slate-200 p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      {children}
    </div>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-slate-100 py-1.5 last:border-0">
      <span className="w-28 shrink-0 text-sm text-slate-500">{label}</span>
      <span className="min-w-0 flex-1 text-sm text-slate-800">{children}</span>
    </div>
  );
}
