import { useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronDown, ChevronLeft, ChevronRight, Plus, Search, Trash2 } from 'lucide-react';

import { api, type ApiErrorEnvelope } from '~/lib/api';
import { useAuth } from '~/stores/auth';
import { fmtDate, fmtInt } from '~/lib/format';
import { URGENCY_LABEL } from '~/lib/incoming';
import { FilterMenu, InfoRow, PageHeader, Pill, RowActions } from '~/components/ui';
import { Drawer } from '~/components/Drawer';

export const Route = createFileRoute('/danh-ba')({
  component: DanhBaPage,
});

type Role = 'recipient' | 'sender';
type Category = 'common' | 'gdnn' | 'dvdl';

interface OrgRow {
  id: number;
  full_name: string;
  short_name: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  contact_person: string | null;
  note: string | null;
  is_recipient: boolean;
  is_sender: boolean;
  category: Category;
  created_at: string;
  doc_count: number;
  last_activity: string | null;
  avg_urgency: string | null;
}

interface SimilarOrg {
  id: number;
  full_name: string;
  short_name: string | null;
  similarity: number;
  doc_count: number;
}

const PAGE_SIZE = 20;
const CATEGORY_LABEL: Record<Category, string> = {
  common: 'Chung',
  gdnn: 'Riêng GDNN',
  dvdl: 'Riêng DVDL',
};

function errMsg(error: unknown, fallback: string): string {
  return (error as ApiErrorEnvelope | undefined)?.error?.message ?? fallback;
}

function CategoryPill({ category }: { category: Category }) {
  const variant = category === 'gdnn' ? 'gdnn' : category === 'dvdl' ? 'dvdl' : 'draft';
  return <Pill variant={variant}>{CATEGORY_LABEL[category]}</Pill>;
}

function DanhBaPage() {
  const me = useAuth((s) => s.user);
  const queryClient = useQueryClient();
  const [role, setRole] = useState<Role>('recipient');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<OrgRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [mergeSource, setMergeSource] = useState<OrgRow | null>(null);

  // Debounce ô tìm → không bắn request mỗi ký tự gõ.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const orgsQuery = useQuery({
    queryKey: ['organizations', role, debouncedQ, category, page],
    enabled: !!me,
    staleTime: 30_000, // danh bạ ít đổi → đỡ refetch thừa khi focus/remount
    queryFn: async () => {
      const { data, error } = await api.GET('/api/organizations', {
        params: {
          query: {
            role,
            q: debouncedQ || undefined,
            category: role === 'recipient' && category !== 'all' ? category : undefined,
            page,
            size: PAGE_SIZE,
          },
        },
      });
      if (error || !data) throw new Error(errMsg(error, 'Không tải được danh bạ'));
      return data as { items: OrgRow[]; total: number };
    },
  });

  const deleteOrg = useMutation({
    mutationFn: async (org: OrgRow) => {
      const { error } = await api.DELETE('/api/organizations/{org_id}', {
        params: { path: { org_id: org.id } },
      });
      if (error) throw new Error(errMsg(error, 'Xoá thất bại'));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizations'] }),
  });

  if (!me) {
    return (
      <div style={{ padding: '24px 0' }}>
        <p style={{ color: 'var(--ink-muted)' }}>Đang tải…</p>
      </div>
    );
  }

  const items = orgsQuery.data?.items ?? [];
  const total = orgsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const cols = 7;
  const rangeFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeTo = Math.min(page * PAGE_SIZE, total);

  function switchRole(r: Role) {
    setRole(r);
    setPage(1);
    setCategory('all');
  }

  function confirmDelete(org: OrgRow) {
    if (window.confirm(`Xoá cơ quan "${org.full_name}"? Cơ quan sẽ bị ẩn nhưng CV cũ vẫn giữ liên kết.`)) {
      deleteOrg.mutate(org);
    }
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Danh bạ' }]}
        title="Danh bạ cơ quan"
        subhead="Quản lý nơi nhận công văn đi và cơ quan gửi công văn đến"
        actions={
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            <Plus size={14} /> Thêm cơ quan
          </button>
        }
        filters={
          <>
            <div className="seg">
              <button
                type="button"
                data-active={role === 'recipient' ? 'true' : undefined}
                onClick={() => switchRole('recipient')}
              >
                Nơi nhận (CV đi)
              </button>
              <button
                type="button"
                data-active={role === 'sender' ? 'true' : undefined}
                onClick={() => switchRole('sender')}
              >
                Cơ quan gửi (CV đến)
              </button>
            </div>
            <div className="relative">
              <Search
                size={16}
                className="absolute"
                style={{ left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-faint)' }}
              />
              <input
                className="search-input"
                style={{ width: 280 }}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="Tìm cơ quan…"
              />
            </div>
            {role === 'recipient' && (
              <FilterMenu
                label="Phân loại:"
                value={category}
                onChange={(v) => {
                  setCategory(v as Category | 'all');
                  setPage(1);
                }}
                options={[
                  { value: 'all', label: 'Tất cả' },
                  { value: 'common', label: 'Chung' },
                  { value: 'gdnn', label: 'Riêng GDNN' },
                  { value: 'dvdl', label: 'Riêng DVDL' },
                ]}
              />
            )}
          </>
        }
      />

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-scroll">
          <table className="qlcv-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 24 }}>Tên cơ quan</th>
                <th style={{ width: 120 }}>Viết tắt</th>
                <th style={{ width: 160 }}>Địa chỉ</th>
                <th style={{ width: 130 }}>{role === 'sender' ? 'Mức khẩn TB' : 'Phân loại'}</th>
                <th className="center" style={{ width: 110 }}>
                  Số CV
                </th>
                <th style={{ width: 120 }}>Lần cuối</th>
                <th style={{ width: 44, paddingRight: 24 }} />
              </tr>
            </thead>
            <tbody>
              {orgsQuery.isLoading && (
                <tr>
                  <td colSpan={cols} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--ink-faint)' }}>
                    Đang tải…
                  </td>
                </tr>
              )}
              {!orgsQuery.isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={cols} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink-faint)' }}>
                    Chưa có cơ quan nào trong danh bạ.
                  </td>
                </tr>
              )}
              {items.map((o) => (
                <tr
                  key={o.id}
                  tabIndex={0}
                  onClick={() => setSelected(o)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelected(o);
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={{ paddingLeft: 24 }}>
                    <span className="subject" style={{ fontWeight: 500 }}>
                      {o.full_name}
                    </span>
                  </td>
                  <td>
                    <span className="cell-mono">{o.short_name ?? '—'}</span>
                  </td>
                  <td>
                    <span className="cell-meta">{o.address ?? '—'}</span>
                  </td>
                  <td>
                    {role === 'sender' ? (
                      o.avg_urgency ? (
                        <span className="cell-meta">{URGENCY_LABEL[o.avg_urgency] ?? o.avg_urgency}</span>
                      ) : (
                        <span className="cell-meta dash">—</span>
                      )
                    ) : (
                      <CategoryPill category={o.category} />
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {o.doc_count > 0 ? (
                      <span className="cell-mono num">{fmtInt(o.doc_count)}</span>
                    ) : (
                      <span className="cell-meta dash">—</span>
                    )}
                  </td>
                  <td>
                    {o.last_activity ? (
                      <span className="cell-meta">{fmtDate(o.last_activity)}</span>
                    ) : (
                      <span className="cell-meta dash">—</span>
                    )}
                  </td>
                  <td style={{ paddingRight: 24 }}>
                    <RowActions
                      items={[
                        { label: 'Sửa', onClick: () => setSelected(o) },
                        { label: 'Gộp vào cơ quan khác', onClick: () => setMergeSource(o) },
                        { label: 'Xoá', danger: true, onClick: () => confirmDelete(o) },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div
          className="flex items-center justify-between flex-wrap"
          style={{ padding: '16px 24px', borderTop: '1px solid var(--rule)', gap: 12 }}
        >
          <div className="flex items-center" style={{ gap: 16 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--ink-muted)' }}>
              Hiện {rangeFrom}-{rangeTo} / {total} cơ quan
            </span>
            <div className="filter-select" style={{ height: 32 }}>
              <span className="label">Mỗi trang:</span>
              <span className="value">{PAGE_SIZE}</span>
              <ChevronDown size={14} style={{ color: 'var(--ink-muted)' }} />
            </div>
          </div>
          <div className="flex items-center" style={{ gap: 4 }}>
            <button
              type="button"
              className="pg-btn"
              aria-label="Trang trước"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              style={page <= 1 ? { opacity: 0.4, cursor: 'default' } : undefined}
            >
              <ChevronLeft size={14} />
            </button>
            <button type="button" className="pg-btn" data-active="true">
              {page}
            </button>
            <button
              type="button"
              className="pg-btn"
              aria-label="Trang sau"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              style={page >= totalPages ? { opacity: 0.4, cursor: 'default' } : undefined}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {creating && (
        <OrgDrawer
          role={role}
          onClose={() => setCreating(false)}
          onPickExisting={(o) => {
            // Gợi ý trùng → lọc danh sách về cơ quan đó để xem/dùng thay vì tạo mới.
            setCreating(false);
            setQ(o.full_name);
            setDebouncedQ(o.full_name);
            setPage(1);
          }}
        />
      )}
      {selected && <OrgDrawer role={role} org={selected} onClose={() => setSelected(null)} />}
      {mergeSource && (
        <MergeModal
          source={mergeSource}
          role={role}
          onClose={() => setMergeSource(null)}
          onDone={() => {
            setMergeSource(null);
            void queryClient.invalidateQueries({ queryKey: ['organizations'] });
          }}
        />
      )}
    </>
  );
}

/** M2 — gộp 2 cơ quan trùng: chọn cơ quan ĐÍCH (giữ lại) → chuyển hết CV của nguồn sang
 *  rồi xoá nguồn. Tìm đích bằng fuzzy (/similar) + tìm thường (q). */
function MergeModal({
  source,
  role,
  onClose,
  onDone,
}: {
  source: OrgRow;
  role: Role;
  onClose: () => void;
  onDone: () => void;
}) {
  const [q, setQ] = useState(source.full_name);
  const [debounced, setDebounced] = useState(source.full_name);
  const [target, setTarget] = useState<SimilarOrg | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Ưu tiên gợi ý fuzzy tên gần giống; cho gõ tự do để tìm đích bất kỳ.
  const results = useQuery({
    queryKey: ['org-similar', role, debounced, source.id],
    enabled: debounced.length > 0,
    queryFn: async () => {
      const { data } = await api.GET('/api/organizations/similar', {
        params: { query: { role, name: debounced, exclude_id: source.id, limit: 10 } },
      });
      return (data ?? []) as SimilarOrg[];
    },
  });

  const merge = useMutation({
    mutationFn: async () => {
      if (!target) return;
      const { error } = await api.POST('/api/organizations/merge', {
        body: { source_id: source.id, target_id: target.id },
      });
      if (error) throw new Error(errMsg(error, 'Gộp cơ quan thất bại'));
    },
    onSuccess: onDone,
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow="Gộp cơ quan trùng"
      title={`Gộp “${source.full_name}”`}
      width={480}
      actions={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Huỷ
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!target || merge.isPending}
            onClick={() => {
              if (
                target &&
                window.confirm(
                  `Chuyển toàn bộ công văn của “${source.full_name}” sang “${target.full_name}” rồi xoá “${source.full_name}”? Không thể hoàn tác.`,
                )
              ) {
                merge.mutate();
              }
            }}
          >
            {merge.isPending ? 'Đang gộp…' : 'Gộp & xoá nguồn'}
          </button>
        </>
      }
    >
      {err && (
        <div role="alert" style={{ padding: '8px 12px', borderRadius: 6, background: 'var(--danger-soft)', color: 'var(--danger)', fontSize: '0.85rem', marginBottom: 12 }}>
          {err}
        </div>
      )}
      <p className="cell-meta" style={{ marginBottom: 12 }}>
        Chọn cơ quan <strong>giữ lại</strong> (đích). Mọi công văn đang trỏ tới “{source.full_name}” sẽ chuyển sang cơ quan đích, sau đó nguồn bị ẩn.
      </p>
      <div className="relative" style={{ marginBottom: 12 }}>
        <Search size={16} className="absolute" style={{ left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-faint)' }} />
        <input
          className="search-input"
          style={{ width: '100%' }}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setTarget(null);
          }}
          placeholder="Tìm cơ quan đích…"
        />
      </div>
      <div className="flex flex-col" style={{ gap: 6, maxHeight: 320, overflowY: 'auto' }}>
        {results.isFetching && <span className="cell-meta">Đang tìm…</span>}
        {!results.isFetching && (results.data ?? []).length === 0 && (
          <span className="cell-meta">Không tìm thấy cơ quan đích phù hợp.</span>
        )}
        {(results.data ?? []).map((o) => {
          const active = target?.id === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => setTarget(o)}
              className="flex items-center justify-between"
              style={{
                gap: 8,
                padding: '10px 12px',
                borderRadius: 6,
                textAlign: 'left',
                border: `1px solid ${active ? 'var(--kinpaku)' : 'var(--rule)'}`,
                background: active ? 'var(--paper-deep)' : 'var(--paper-raised)',
                cursor: 'pointer',
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', color: 'var(--ink)', fontSize: '0.85rem', fontWeight: 500 }}>{o.full_name}</span>
                <span className="cell-meta">{o.short_name ? `${o.short_name} · ` : ''}{fmtInt(o.doc_count)} CV · giống {Math.round(o.similarity * 100)}%</span>
              </span>
              {active && <span className="pill pill-success">Đích</span>}
            </button>
          );
        })}
      </div>
    </Drawer>
  );
}

const orgSchema = z.object({
  full_name: z.string().trim().min(1, 'Nhập tên cơ quan').max(300),
  short_name: z.string().max(150).optional(),
  category: z.enum(['common', 'gdnn', 'dvdl']),
  address: z.string().max(500).optional(),
  email: z.string().email('Email không hợp lệ').or(z.literal('')),
  phone: z.string().max(30).optional(),
  contact_person: z.string().max(150).optional(),
  note: z.string().max(2000).optional(),
});
type OrgValues = z.infer<typeof orgSchema>;

const errorTextStyle = { marginTop: 4, fontSize: '0.75rem', color: 'var(--danger)' } as const;

function OrgDrawer({
  role,
  org,
  onClose,
  onPickExisting,
}: {
  role: Role;
  org?: OrgRow;
  onClose: () => void;
  onPickExisting?: (o: SimilarOrg) => void;
}) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const isEdit = !!org;

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<OrgValues>({
    resolver: zodResolver(orgSchema),
    defaultValues: {
      full_name: org?.full_name ?? '',
      short_name: org?.short_name ?? '',
      category: org?.category ?? 'common',
      address: org?.address ?? '',
      email: org?.email ?? '',
      phone: org?.phone ?? '',
      contact_person: org?.contact_person ?? '',
      note: org?.note ?? '',
    },
  });

  // M2 — gợi ý cơ quan tên gần giống khi ĐANG TẠO MỚI (tránh trùng). Bỏ qua khi sửa.
  const nameVal = watch('full_name');
  const [dq, setDq] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDq((nameVal ?? '').trim()), 350);
    return () => clearTimeout(t);
  }, [nameVal]);
  const similar = useQuery({
    queryKey: ['org-similar', role, dq],
    enabled: !isEdit && dq.length >= 2,
    queryFn: async () => {
      const { data } = await api.GET('/api/organizations/similar', {
        params: { query: { role, name: dq, limit: 4 } },
      });
      return (data ?? []) as SimilarOrg[];
    },
  });
  const suggestions = !isEdit ? (similar.data ?? []) : [];

  async function onSubmit(values: OrgValues) {
    setServerError(null);
    const body = {
      full_name: values.full_name,
      short_name: values.short_name || null,
      category: values.category,
      address: values.address || null,
      email: values.email || null,
      phone: values.phone || null,
      contact_person: values.contact_person || null,
      note: values.note || null,
    };
    if (isEdit) {
      const { error } = await api.PUT('/api/organizations/{org_id}', {
        params: { path: { org_id: org!.id } },
        body,
      });
      if (error) {
        setServerError(errMsg(error, 'Lưu thất bại'));
        return;
      }
    } else {
      const { error } = await api.POST('/api/organizations', { body: { ...body, role } });
      if (error) {
        setServerError(errMsg(error, 'Tạo cơ quan thất bại'));
        return;
      }
    }
    await queryClient.invalidateQueries({ queryKey: ['organizations'] });
    onClose();
  }

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await api.DELETE('/api/organizations/{org_id}', {
        params: { path: { org_id: org!.id } },
      });
      if (error) throw new Error(errMsg(error, 'Xoá thất bại'));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['organizations'] });
      onClose();
    },
    onError: (e: Error) => setServerError(e.message),
  });

  function confirmDelete() {
    if (window.confirm(`Xoá cơ quan "${org!.full_name}"? Cơ quan sẽ bị ẩn nhưng CV cũ vẫn giữ liên kết.`)) {
      remove.mutate();
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow="Danh bạ cơ quan"
      title={isEdit ? org!.full_name : 'Thêm cơ quan'}
      width={480}
      actions={
        <>
          {isEdit && (
            <button
              type="button"
              className="btn-secondary"
              style={{ color: 'var(--danger)', marginRight: 'auto' }}
              onClick={confirmDelete}
              disabled={remove.isPending}
            >
              <Trash2 size={15} /> Xoá
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={onClose}>
            Huỷ
          </button>
          <button type="submit" form="org-form" className="btn-primary" disabled={isSubmitting}>
            {isEdit ? 'Lưu' : 'Tạo cơ quan'}
          </button>
        </>
      }
    >
      {serverError && (
        <div
          role="alert"
          className="pill pill-cancelled"
          style={{
            display: 'block',
            height: 'auto',
            padding: '8px 12px',
            textDecoration: 'none',
            letterSpacing: 0,
            textTransform: 'none',
            fontFamily: 'inherit',
            fontSize: '0.85rem',
          }}
        >
          {serverError}
        </div>
      )}
      {isEdit && (
        <div className="card" style={{ padding: 16 }}>
          <InfoRow label="Phân loại">
            <CategoryPill category={org!.category} />
          </InfoRow>
          <InfoRow label="Số CV liên quan">
            {org!.doc_count > 0 ? (
              <span className="cell-mono num">{fmtInt(org!.doc_count)}</span>
            ) : (
              <span className="cell-meta dash">—</span>
            )}
          </InfoRow>
          <InfoRow label="Lần cuối">
            {org!.last_activity ? (
              <span className="cell-meta">{fmtDate(org!.last_activity)}</span>
            ) : (
              <span className="cell-meta dash">—</span>
            )}
          </InfoRow>
          {role === 'sender' && org!.avg_urgency && (
            <InfoRow label="Mức khẩn TB">
              <span className="cell-meta">{URGENCY_LABEL[org!.avg_urgency] ?? org!.avg_urgency}</span>
            </InfoRow>
          )}
        </div>
      )}
      <form id="org-form" onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col" style={{ gap: 16 }}>
        <div>
          <label className="field-label" htmlFor="o_name">
            Tên đầy đủ
          </label>
          <input id="o_name" className="text-input" placeholder="Tên cơ quan…" {...register('full_name')} />
          {errors.full_name && <p style={errorTextStyle}>{errors.full_name.message}</p>}
          {suggestions.length > 0 && (
            <div
              style={{ marginTop: 8, padding: '8px 12px', borderRadius: 6, background: 'var(--warning-soft)', border: '1px solid var(--warning)' }}
            >
              <div style={{ fontSize: '0.8rem', color: 'var(--ink)', marginBottom: 4 }}>
                Có thể đã tồn tại cơ quan tương tự — kiểm tra tránh tạo trùng:
              </div>
              <div className="flex flex-col" style={{ gap: 4 }}>
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="flex items-center justify-between"
                    style={{ gap: 8, padding: '4px 6px', borderRadius: 4, textAlign: 'left', background: 'transparent', cursor: 'pointer' }}
                    onClick={() => onPickExisting?.(s)}
                  >
                    <span style={{ color: 'var(--ink)', fontSize: '0.82rem', minWidth: 0 }}>
                      {s.full_name}
                      <span className="cell-meta"> · {fmtInt(s.doc_count)} CV · giống {Math.round(s.similarity * 100)}%</span>
                    </span>
                    <span className="cell-meta" style={{ flexShrink: 0, color: 'var(--kinpaku-deep)' }}>Dùng cơ quan này →</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div
          className={role === 'recipient' ? 'grid' : undefined}
          style={role === 'recipient' ? { gridTemplateColumns: '1fr 1fr', gap: 12 } : undefined}
        >
          <div>
            <label className="field-label" htmlFor="o_short">
              Viết tắt
            </label>
            <input id="o_short" className="text-input" {...register('short_name')} />
          </div>
          {/* Phân loại chỉ áp dụng cho nơi nhận (M1) — cơ quan gửi không phân loại đơn vị. */}
          {role === 'recipient' && (
            <div>
              <label className="field-label" htmlFor="o_cat">
                Phân loại
              </label>
              <select id="o_cat" className="text-input" {...register('category')}>
                <option value="common">Chung</option>
                <option value="gdnn">Riêng GDNN</option>
                <option value="dvdl">Riêng DVDL</option>
              </select>
            </div>
          )}
        </div>

        <div>
          <label className="field-label" htmlFor="o_addr">
            Địa chỉ
          </label>
          <input id="o_addr" className="text-input" {...register('address')} />
        </div>

        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="field-label" htmlFor="o_email">
              Email
            </label>
            <input id="o_email" className="text-input" placeholder="email@coquan.gov.vn" {...register('email')} />
            {errors.email && <p style={errorTextStyle}>{errors.email.message}</p>}
          </div>
          <div>
            <label className="field-label" htmlFor="o_phone">
              Điện thoại
            </label>
            <input id="o_phone" className="text-input" placeholder="0123 456 789" {...register('phone')} />
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="o_contact">
            Người liên hệ
          </label>
          <input id="o_contact" className="text-input" {...register('contact_person')} />
        </div>

        <div>
          <label className="field-label" htmlFor="o_note">
            Ghi chú
          </label>
          <textarea id="o_note" rows={2} className="text-input" {...register('note')} />
        </div>
      </form>
    </Drawer>
  );
}
