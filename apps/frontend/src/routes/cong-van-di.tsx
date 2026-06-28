import { useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, ChevronLeft, ChevronRight, Download, FileCheck2, FileSearch, Search, Tag as TagIcon, Trash2, Upload } from 'lucide-react';

import { api, type ApiErrorEnvelope } from '~/lib/api';
import { useAuth } from '~/stores/auth';
import { fmtDate, fmtDateTime } from '~/lib/format';
import { UnitPill, type UnitLite } from '~/components/sign-ui';
import {
  EmptyState,
  FilterMenu,
  FilterSelect,
  InfoRow,
  PageHeader,
  SectionCard,
  TypeTag,
} from '~/components/ui';
import { Drawer } from '~/components/Drawer';
import { TagEditor } from '~/components/TagEditor';

export const Route = createFileRoute('/cong-van-di')({
  component: CongVanDiPage,
  // F1 — cho phép deep-link từ tìm kiếm toàn cục: /cong-van-di?q=...
  validateSearch: (s: Record<string, unknown>): { q?: string } => ({
    q: typeof s.q === 'string' ? s.q : undefined,
  }),
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
  in_reply_to_incoming_id: number | null;
  original_file_id: number | null;
  signed_file_id: number | null;
  cancel_reason: string | null;
  sealing_option: { giap_lai?: { kind: string }; ky_nhay?: { kind: string } } | null;
  created_by: number | null;
  updated_at: string;
  recipients: { id: number; full_name: string; short_name: string | null }[];
}

const PAGE_SIZE = 20;
const STATUS_PILL: Record<OutStatus, { label: string; cls: string; dot: boolean }> = {
  draft: { label: 'Nháp', cls: 'pill-draft', dot: false },
  numbered: { label: 'Đã cấp số · chờ ký', cls: 'pill-warning', dot: false },
  published: { label: 'Đã phát hành', cls: 'pill-published', dot: true },
  cancelled: { label: 'Huỷ', cls: 'pill-cancelled', dot: false },
};

function errMsg(error: unknown, fallback: string): string {
  return (error as ApiErrorEnvelope | undefined)?.error?.message ?? fallback;
}

function StatusBadge({ status }: { status: OutStatus }) {
  const s = STATUS_PILL[status];
  return (
    <span className={`pill ${s.cls}`}>
      {s.dot && <span className="dot" />}
      {s.label}
    </span>
  );
}

function NumberCell({ number }: { number: string | null }) {
  if (!number) return <span className="cell-meta dash">—</span>;
  const [first, ...rest] = number.split('/');
  return (
    <div className="cell-mono">
      <span className="num">{first}</span>
      {rest.length > 0 ? `/${rest.join('/')}` : ''}
    </div>
  );
}

function CongVanDiPage() {
  const me = useAuth((s) => s.user);
  const navigate = useNavigate();
  const { q: urlQ } = Route.useSearch();
  const [q, setQ] = useState(urlQ ?? '');
  const [debouncedQ, setDebouncedQ] = useState(urlQ ?? '');
  // Đồng bộ ô tìm khi deep-link đổi ?q= mà KHÔNG remount.
  useEffect(() => {
    if (urlQ !== undefined) setQ(urlQ);
  }, [urlQ]);
  const [unitFilter, setUnitFilter] = useState<number | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<OutStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());

  function resetFilters() {
    setQ('');
    setUnitFilter('all');
    setStatusFilter('all');
    setPage(1);
  }

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

  const docTypesQuery = useQuery({
    queryKey: ['document-types'],
    queryFn: async () => {
      const res = await api.GET('/api/document-types', {});
      return (res.data ?? { items: [] }) as { items: { id: number; code: string }[] };
    },
  });
  const docTypeCode = (id: number) =>
    docTypesQuery.data?.items.find((d) => d.id === id)?.code ?? '—';

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
      <div style={{ padding: '40px 0' }}>
        <p className="cell-meta">Đang tải…</p>
      </div>
    );
  }

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const unitOf = (id: number) => units.find((u) => u.id === id);
  const allChecked = items.length > 0 && items.every((r) => checked.has(r.id));
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(items.map((r) => r.id)));
  const toggleOne = (id: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Công văn đi' }]}
        title="Danh sách công văn đi"
        subhead={`Tổng ${total} công văn của 2 đơn vị`}
        actions={
          <>
            <button className="btn-secondary" type="button">
              <Download size={14} />
              Xuất Excel
            </button>
            <button
              className="btn-primary"
              type="button"
              onClick={() => navigate({ to: '/cong-van-di/soan' })}
            >
              <Upload size={14} />
              Nạp công văn mới
            </button>
          </>
        }
        filters={
          <>
            <div className="relative">
              <Search
                size={15}
                className="absolute"
                style={{ left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-faint)' }}
              />
              <input
                className="search-input"
                style={{ width: 240, height: 36 }}
                placeholder="Tìm số CV / trích yếu…"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <FilterMenu
              label="Đơn vị:"
              value={unitFilter === 'all' ? 'all' : String(unitFilter)}
              onChange={(v) => {
                setUnitFilter(v === 'all' ? 'all' : Number(v));
                setPage(1);
              }}
              options={[
                { value: 'all', label: 'Tất cả' },
                ...units.map((u) => ({ value: String(u.id), label: u.short_name ?? u.code })),
              ]}
            />
            <FilterSelect label="Thời gian:" value="Năm 2026" />
            <FilterSelect label="Loại VB:" value="Tất cả" />
            <FilterMenu
              label="Trạng thái:"
              value={statusFilter}
              onChange={(v) => {
                setStatusFilter(v as OutStatus | 'all');
                setPage(1);
              }}
              options={[
                { value: 'all', label: 'Tất cả' },
                { value: 'draft', label: 'Nháp' },
                { value: 'numbered', label: 'Đã cấp số' },
                { value: 'published', label: 'Đã phát hành' },
                { value: 'cancelled', label: 'Huỷ' },
              ]}
            />
            <FilterSelect label="Người ký:" value="Tất cả" />
            <FilterSelect label="Nơi nhận:" value="Tất cả" />
            <div className="flex-1" />
            <button className="btn-ghost" type="button" onClick={resetFilters}>
              Đặt lại bộ lọc
            </button>
          </>
        }
      />

      {checked.size > 0 && (
        <div
          className="card flex items-center flex-wrap"
          style={{
            padding: '10px 16px',
            gap: 12,
            marginBottom: 12,
            background: 'var(--kinpaku-pale)',
            borderColor: 'var(--rule-strong)',
          }}
        >
          <span style={{ fontWeight: 600, color: 'var(--ink)', fontSize: '0.85rem' }}>
            Đã chọn {checked.size}
          </span>
          <div className="flex-1" />
          <button className="btn-secondary" type="button" style={{ height: 32 }}>
            <Download size={13} /> Xuất Excel
          </button>
          <button className="btn-secondary" type="button" style={{ height: 32 }}>
            <TagIcon size={13} /> Gắn tag
          </button>
          <button className="btn-ghost" type="button" onClick={() => setChecked(new Set())}>
            Bỏ chọn
          </button>
        </div>
      )}

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-scroll">
          <table className="qlcv-table">
            <thead>
              <tr>
                <th style={{ width: 48, paddingLeft: 24 }}>
                  <input
                    type="checkbox"
                    className="qlcv-check"
                    aria-label="Chọn tất cả"
                    checked={allChecked}
                    onChange={toggleAll}
                  />
                </th>
                <th style={{ width: 200 }}>Số CV</th>
                <th>Trích yếu</th>
                <th className="center" style={{ width: 100 }}>
                  Đơn vị
                </th>
                <th style={{ width: 80 }}>Loại</th>
                <th style={{ width: 130 }}>Phát hành</th>
                <th style={{ width: 130 }}>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {listQuery.isLoading && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-faint)', padding: '32px 16px' }}>
                    Đang tải…
                  </td>
                </tr>
              )}
              {!listQuery.isLoading &&
                items.map((r) => (
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
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ paddingLeft: 24 }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="qlcv-check"
                        aria-label="Chọn dòng"
                        checked={checked.has(r.id)}
                        onChange={() => toggleOne(r.id)}
                      />
                    </td>
                    <td>
                      <NumberCell number={r.number} />
                    </td>
                    <td>
                      <div className="subject">{r.subject}</div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <UnitPill unit={unitOf(r.unit_id)} />
                    </td>
                    <td>
                      <TypeTag>{docTypeCode(r.doc_type_id)}</TypeTag>
                    </td>
                    <td>
                      <span className={r.status === 'draft' ? 'cell-meta dash' : 'cell-meta'}>
                        {r.status === 'draft' ? '—' : fmtDate(r.issue_date)}
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>

          {!listQuery.isLoading && items.length === 0 && (
            <EmptyState
              icon={FileSearch}
              title="Chưa có công văn nào"
              desc="Bấm “Soạn công văn mới” để bắt đầu."
            />
          )}
        </div>

        {totalPages > 1 && (
          <div
            className="flex items-center justify-end"
            style={{ gap: 8, padding: '12px 16px', borderTop: '1px solid var(--rule)' }}
          >
            <button
              type="button"
              className="pg-btn"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              style={page <= 1 ? { opacity: 0.4, cursor: 'default' } : undefined}
              aria-label="Trang trước"
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
              style={page >= totalPages ? { opacity: 0.4, cursor: 'default' } : undefined}
              aria-label="Trang sau"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {selectedId !== null && (
        <DetailDrawer id={selectedId} units={units} onClose={() => setSelectedId(null)} />
      )}
    </>
  );
}

function DetailDrawer({ id, units, onClose }: { id: number; units: UnitLite[]; onClose: () => void }) {
  const me = useAuth((s) => s.user);
  const navigate = useNavigate();
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

  async function deleteDoc() {
    if (!window.confirm('Xoá công văn này vào Thùng rác? (giữ 30 ngày, Quản lý có thể khôi phục)')) return;
    setActionErr(null);
    setBusy(true);
    try {
      const { error } = await api.DELETE('/api/outgoing/{doc_id}', { params: { path: { doc_id: id } } });
      if (error) throw new Error(errMsg(error, 'Xoá thất bại'));
      await refresh();
      onClose();
    } catch (e) {
      setActionErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Thu hồi CV đã phát hành: chỉ Quản lý (PRD máy trạng thái).
  const showCancel = !!d && d.status !== 'cancelled' && !(d.status === 'published' && me?.role !== 'manager');
  // Xoá (thùng rác): CV đã cấp số chỉ Quản lý xoá (PRD edge).
  const showDelete = !!d && (me?.role === 'manager' || d.number === null);

  const actions = d ? (
    <>
      {d.original_file_id !== null && (
        <button className="btn-secondary" style={{ height: 32 }} type="button" onClick={() => download(false)}>
          <Download size={13} /> Tải bản {d.status === 'draft' ? 'gốc' : 'chưa ký'}
        </button>
      )}
      {d.signed_file_id !== null && (
        <button className="btn-secondary" style={{ height: 32 }} type="button" onClick={() => download(true)}>
          <FileCheck2 size={13} /> Tải bản đã ký số
        </button>
      )}
      {d.status === 'numbered' && d.original_file_id !== null && (
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
            className="btn-primary"
            style={{ height: 32 }}
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={13} /> {busy ? 'Đang tải…' : 'Tải lên bản đã ký số'}
          </button>
        </>
      )}
      {showCancel && (
        <button
          className="btn-secondary"
          style={{ height: 32, color: 'var(--danger)' }}
          type="button"
          disabled={busy}
          onClick={cancelDoc}
        >
          <Ban size={13} /> {d.status === 'published' ? 'Thu hồi' : 'Huỷ'}
        </button>
      )}
      {showDelete && (
        <button
          className="btn-ghost"
          style={{ height: 32, color: 'var(--danger)' }}
          type="button"
          disabled={busy}
          onClick={deleteDoc}
        >
          <Trash2 size={13} /> Xoá
        </button>
      )}
    </>
  ) : undefined;

  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow="Công văn đi"
      title={<span className="cell-mono num">{d?.number ?? 'Bản nháp'}</span>}
      actions={actions}
    >
      {!d ? (
        <p className="cell-meta">Đang tải…</p>
      ) : (
        <>
          <div className="flex items-center flex-wrap" style={{ gap: 8 }}>
            <UnitPill unit={unit} />
            <StatusBadge status={d.status} />
          </div>

          {actionErr && (
            <div
              role="alert"
              style={{
                borderRadius: 6,
                border: '1px solid var(--danger)',
                background: 'var(--danger-soft)',
                padding: '8px 12px',
                fontSize: '0.82rem',
                color: 'var(--danger)',
              }}
            >
              {actionErr}
            </div>
          )}

          {d.status === 'cancelled' && d.cancel_reason && (
            <div
              style={{
                borderRadius: 6,
                border: '1px solid var(--danger)',
                background: 'var(--danger-soft)',
                padding: '10px 12px',
                fontSize: '0.82rem',
                color: 'var(--danger)',
              }}
            >
              <strong>Đã huỷ.</strong> Lý do: {d.cancel_reason}
            </div>
          )}

          {d.status === 'numbered' && (
            <div
              className="flex items-start"
              style={{
                gap: 8,
                borderRadius: 6,
                border: '1px solid var(--warning)',
                background: 'var(--warning-soft)',
                padding: '8px 12px',
                fontSize: '0.78rem',
                color: 'var(--warning)',
              }}
            >
              <FileCheck2 size={14} style={{ marginTop: 2, flexShrink: 0 }} />
              Đã cấp số, chưa ký số. Mở vSign + USB Token Viettel-CA để ký, rồi tải bản đã ký lên đây.
            </div>
          )}

          <SectionCard title="Thông tin công văn">
            <div>
              <InfoRow label="Số CV">
                <span className="cell-mono num">{d.number ?? '— (chưa cấp số)'}</span>
              </InfoRow>
              <InfoRow label="Trích yếu">{d.subject}</InfoRow>
              <InfoRow label="Đơn vị">{unit?.full_name ?? '—'}</InfoRow>
              <InfoRow label="Ngày phát hành">{fmtDate(d.issue_date)}</InfoRow>
              <InfoRow label="Giáp lai">{rangeLabel(d.sealing_option?.giap_lai?.kind)}</InfoRow>
              <InfoRow label="Ký nháy">{rangeLabel(d.sealing_option?.ky_nhay?.kind)}</InfoRow>
              {d.in_reply_to_incoming_id != null && (
                <InfoRow label="Phản hồi CV đến">
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => navigate({ to: '/cong-van-den' })}
                    style={{ background: 'none', border: 'none', padding: 0, color: 'var(--kinpaku-deep)', cursor: 'pointer', font: 'inherit' }}
                  >
                    CV đến #{d.in_reply_to_incoming_id}
                  </button>
                </InfoRow>
              )}
              <InfoRow label="Tạo lúc">{fmtDateTime(d.created_at)}</InfoRow>
            </div>
          </SectionCard>

          <SectionCard title={`Nơi nhận (${d.recipients.length})`}>
            {d.recipients.length === 0 ? (
              <p className="cell-meta">Chưa chọn nơi nhận.</p>
            ) : (
              <div className="flex flex-col" style={{ gap: 8 }}>
                {d.recipients.map((o) => (
                  <div
                    key={o.id}
                    className="flex items-center"
                    style={{ gap: 8, fontSize: '0.85rem', color: 'var(--ink)' }}
                  >
                    <span
                      style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--kinpaku-rich)', flexShrink: 0 }}
                    />
                    {o.full_name}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <TagEditor objectType="outgoing" objectId={id} />
        </>
      )}
    </Drawer>
  );
}

function rangeLabel(kind: string | undefined): string {
  if (kind === 'all') return 'Toàn bộ';
  if (kind === 'range') return 'Theo khoảng trang';
  return 'Không';
}
