import { useRef, useState, type ReactNode } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FileText, ImageUp, Loader2, Plus, Save } from 'lucide-react';

import { api, type ApiErrorEnvelope } from '~/lib/api';
import { useAuth } from '~/stores/auth';
import { useBranding } from '~/lib/branding';
import { fmtInt } from '~/lib/format';
import { PageHeader, Pill } from '~/components/ui';
import { Drawer } from '~/components/Drawer';

export const Route = createFileRoute('/cau-hinh')({
  component: CauHinhPage,
});

interface Unit {
  id: number;
  code: string;
  full_name: string;
  short_name: string | null;
  address: string | null;
  tax_code: string | null;
  phone: string | null;
  email: string | null;
  color: string;
  logo_file_id: number | null;
}

interface DocType {
  id: number;
  direction: 'out' | 'in';
  unit_id: number | null;
  name: string;
  code: string;
  number_format: string;
  reset_policy: 'year' | 'month' | 'none';
  zero_pad: number;
  is_active: boolean;
  next_number: number;
}

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

function errMsg(error: unknown, fallback: string): string {
  return (error as ApiErrorEnvelope | undefined)?.error?.message ?? fallback;
}

/** Suy ra biến thể pill từ mã đơn vị (GDNN / DVDL → màu riêng). */
function unitVariant(code: string): string {
  const c = code.toUpperCase();
  if (c.includes('GDNN')) return 'gdnn';
  if (c.includes('DVDL')) return 'dvdl';
  return 'info';
}

/* ---------- Alert nhỏ dùng chung (thành công / lỗi) ---------- */
function Alert({ kind, children }: { kind: 'error' | 'ok'; children: ReactNode }) {
  const isErr = kind === 'error';
  return (
    <div
      role={isErr ? 'alert' : 'status'}
      style={{
        background: isErr ? 'var(--danger-soft)' : 'var(--success-soft)',
        color: isErr ? 'var(--danger)' : 'var(--success)',
        border: `1px solid ${isErr ? 'var(--danger)' : 'var(--success)'}`,
        borderRadius: 4,
        padding: '8px 12px',
        fontSize: '0.85rem',
      }}
    >
      {children}
    </div>
  );
}

function FieldError({ children }: { children: ReactNode }) {
  return <p style={{ marginTop: 4, fontSize: '0.75rem', color: 'var(--danger)' }}>{children}</p>;
}

type Tab = 'don-vi' | 'so-cong-van' | 'branding';

function CauHinhPage() {
  const me = useAuth((s) => s.user);
  const [tab, setTab] = useState<Tab>('don-vi');

  const unitsQuery = useQuery({
    queryKey: ['units'],
    enabled: me?.role === 'manager',
    queryFn: async () => {
      const { data, error } = await api.GET('/api/units', {});
      if (error || !data) throw new Error(errMsg(error, 'Không tải được danh sách đơn vị'));
      return data as { items: Unit[] };
    },
  });

  if (me && me.role !== 'manager') {
    return (
      <>
        <PageHeader breadcrumb={[{ label: 'Cấu hình' }]} title="Cấu hình hệ thống" />
        <div className="card" style={{ padding: 24 }}>
          <p className="text-ink-muted">Trang này chỉ dành cho Quản lý.</p>
        </div>
      </>
    );
  }
  if (!me) {
    return (
      <div style={{ padding: '40px 0' }}>
        <p className="text-ink-faint">Đang tải…</p>
      </div>
    );
  }

  const units = unitsQuery.data?.items ?? [];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Cấu hình' }]}
        title="Cấu hình hệ thống"
        subhead="Đơn vị, sổ công văn, format số công văn — áp dụng cho công văn đi của từng đơn vị."
      />

      <div className="seg" style={{ marginBottom: 24 }}>
        <button data-active={tab === 'don-vi' ? 'true' : undefined} onClick={() => setTab('don-vi')}>
          2 Đơn vị
        </button>
        <button
          data-active={tab === 'so-cong-van' ? 'true' : undefined}
          onClick={() => setTab('so-cong-van')}
        >
          Sổ công văn
        </button>
        <button data-active={tab === 'branding' ? 'true' : undefined} onClick={() => setTab('branding')}>
          Branding
        </button>
      </div>

      {tab === 'don-vi' && <UnitsTab units={units} loading={unitsQuery.isLoading} />}
      {tab === 'so-cong-van' && <SoCongVanTab units={units} />}
      {tab === 'branding' && <BrandingTab />}
    </>
  );
}

/* ---------- Logo upload box dùng chung (đơn vị + branding) ---------- */
function LogoBox({
  src,
  caption,
  hasLogo,
  uploading,
  onPick,
  alt,
}: {
  src: string;
  caption: string;
  hasLogo: boolean;
  uploading: boolean;
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  alt: string;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <div
      className="flex items-center"
      style={{
        gap: 16,
        padding: 14,
        borderRadius: 6,
        background: 'var(--paper-deep)',
      }}
    >
      <div
        className="flex items-center justify-center"
        style={{
          width: 64,
          height: 64,
          borderRadius: 4,
          border: '1px solid var(--rule)',
          background: 'var(--paper-raised)',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        {hasLogo ? (
          <img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <span style={{ fontSize: '0.7rem', color: 'var(--ink-faint)' }}>Chưa có</span>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>{caption}</p>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="btn-secondary"
          style={{ marginTop: 8 }}
        >
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImageUp size={15} />}
          {hasLogo ? 'Đổi logo' : 'Tải logo'}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={onPick}
        />
      </div>
    </div>
  );
}

/* ─────────────────────────── Tab Đơn vị (B1) ─────────────────────────── */
function UnitsTab({ units, loading }: { units: Unit[]; loading: boolean }) {
  return (
    <div
      className="grid"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}
    >
      {loading && <p className="text-ink-faint">Đang tải…</p>}
      {units.map((u) => (
        <UnitCard key={u.id} unit={u} />
      ))}
    </div>
  );
}

const unitSchema = z.object({
  full_name: z.string().min(1, 'Nhập tên đầy đủ'),
  short_name: z.string(),
  address: z.string(),
  tax_code: z.string(),
  phone: z.string(),
  email: z.string().email('Email không hợp lệ').or(z.literal('')),
});
type UnitValues = z.infer<typeof unitSchema>;

function UnitCard({ unit }: { unit: Unit }) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [logoVersion, setLogoVersion] = useState(0);
  const [uploading, setUploading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<UnitValues>({
    resolver: zodResolver(unitSchema),
    defaultValues: {
      full_name: unit.full_name,
      short_name: unit.short_name ?? '',
      address: unit.address ?? '',
      tax_code: unit.tax_code ?? '',
      phone: unit.phone ?? '',
      email: unit.email ?? '',
    },
  });

  async function onSubmit(values: UnitValues) {
    setServerError(null);
    setOkMsg(null);
    const { error } = await api.PUT('/api/units/{unit_id}', {
      params: { path: { unit_id: unit.id } },
      body: {
        full_name: values.full_name,
        short_name: values.short_name || null,
        address: values.address || null,
        tax_code: values.tax_code || null,
        phone: values.phone || null,
        email: values.email || null,
      },
    });
    if (error) {
      setServerError(errMsg(error, 'Lưu thất bại'));
      return;
    }
    setOkMsg('Đã lưu thay đổi');
    reset(values);
    await queryClient.invalidateQueries({ queryKey: ['units'] });
  }

  const uploadLogo = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > MAX_LOGO_BYTES) throw new Error('Logo vượt quá 2MB');
      if (!['image/png', 'image/jpeg'].includes(file.type))
        throw new Error('Logo phải là ảnh PNG hoặc JPG');
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/units/${unit.id}/logo`, {
        method: 'POST',
        body: form,
        credentials: 'include',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as ApiErrorEnvelope | null;
        throw new Error(errMsg(body, 'Tải logo thất bại'));
      }
    },
    onSuccess: async () => {
      setServerError(null);
      setOkMsg('Đã cập nhật logo');
      setLogoVersion((v) => v + 1);
      await queryClient.invalidateQueries({ queryKey: ['units'] });
    },
    onError: (e: Error) => {
      setOkMsg(null);
      setServerError(e.message);
    },
  });

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    uploadLogo.mutate(file, { onSettled: () => setUploading(false) });
  }

  const hasLogo = unit.logo_file_id !== null;

  return (
    <div className="card" style={{ padding: 24 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 18 }}>
        <div className="flex items-center" style={{ gap: 8, minWidth: 0 }}>
          <Pill variant={unitVariant(unit.code)} dot>
            {unit.short_name || unit.code}
          </Pill>
          <span className="type-tag">{unit.code}</span>
        </div>
        <span
          className="flex items-center"
          style={{ gap: 6, fontSize: '0.75rem', color: 'var(--ink-muted)' }}
        >
          Mã màu
          <span
            title={unit.color}
            style={{ width: 16, height: 16, borderRadius: 4, background: unit.color, display: 'inline-block' }}
          />
        </span>
      </div>

      <div className="flex flex-col" style={{ gap: 14 }}>
        <LogoBox
          src={`/api/units/${unit.id}/logo?v=${logoVersion}`}
          alt={`Logo ${unit.code}`}
          caption="Logo hiển thị trên công văn (PNG/JPG, ≤ 2MB)"
          hasLogo={hasLogo}
          uploading={uploading}
          onPick={onPickFile}
        />

        {serverError && <Alert kind="error">{serverError}</Alert>}
        {okMsg && <Alert kind="ok">{okMsg}</Alert>}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col" style={{ gap: 14 }}>
          <div>
            <label className="field-label" htmlFor={`fn_${unit.id}`}>
              Tên đầy đủ
            </label>
            <input id={`fn_${unit.id}`} className="text-input" {...register('full_name')} />
            {errors.full_name && <FieldError>{errors.full_name.message}</FieldError>}
          </div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="field-label" htmlFor={`sn_${unit.id}`}>
                Tên viết tắt
              </label>
              <input id={`sn_${unit.id}`} className="text-input" {...register('short_name')} />
            </div>
            <div>
              <label className="field-label" htmlFor={`tc_${unit.id}`}>
                Mã số thuế
              </label>
              <input id={`tc_${unit.id}`} className="text-input" {...register('tax_code')} />
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor={`ad_${unit.id}`}>
              Địa chỉ
            </label>
            <input id={`ad_${unit.id}`} className="text-input" {...register('address')} />
          </div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="field-label" htmlFor={`ph_${unit.id}`}>
                Số điện thoại
              </label>
              <input id={`ph_${unit.id}`} className="text-input" {...register('phone')} />
            </div>
            <div>
              <label className="field-label" htmlFor={`em_${unit.id}`}>
                Email
              </label>
              <input id={`em_${unit.id}`} className="text-input" {...register('email')} />
              {errors.email && <FieldError>{errors.email.message}</FieldError>}
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !isDirty}
            className="btn-primary"
            style={{ marginTop: 4, alignSelf: 'flex-start', opacity: isSubmitting || !isDirty ? 0.5 : 1 }}
          >
            <Save size={14} /> Lưu thay đổi
          </button>
        </form>
      </div>
    </div>
  );
}

/* ─────────────────────────── Tab Branding (B3b) ─────────────────────────── */
const brandingSchema = z.object({ app_name: z.string().min(1, 'Nhập tên ứng dụng').max(150) });
type BrandingValues = z.infer<typeof brandingSchema>;

function BrandingTab() {
  const queryClient = useQueryClient();
  const { data: branding } = useBranding();
  const [serverError, setServerError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<BrandingValues>({
    resolver: zodResolver(brandingSchema),
    values: { app_name: branding?.app_name ?? '' }, // sync khi branding tải xong
  });

  async function onSubmit(values: BrandingValues) {
    setServerError(null);
    setOkMsg(null);
    const { error } = await api.PUT('/api/settings', { body: { app_name: values.app_name } });
    if (error) {
      setServerError(errMsg(error, 'Lưu thất bại'));
      return;
    }
    setOkMsg('Đã lưu thương hiệu');
    reset(values);
    await queryClient.invalidateQueries({ queryKey: ['settings'] });
  }

  const uploadLogo = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > MAX_LOGO_BYTES) throw new Error('Logo vượt quá 2MB');
      if (!['image/png', 'image/jpeg'].includes(file.type))
        throw new Error('Logo phải là ảnh PNG hoặc JPG');
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/settings/logo', {
        method: 'POST',
        body: form,
        credentials: 'include',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as ApiErrorEnvelope | null;
        throw new Error(errMsg(body, 'Tải logo thất bại'));
      }
    },
    onSuccess: async () => {
      setServerError(null);
      setOkMsg('Đã cập nhật logo');
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (e: Error) => {
      setOkMsg(null);
      setServerError(e.message);
    },
  });

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    uploadLogo.mutate(file, { onSettled: () => setUploading(false) });
  }

  const hasLogo = !!branding?.logo_file_id;

  return (
    <div className="card" style={{ padding: 24, maxWidth: 560 }}>
      <div className="flex flex-col" style={{ gap: 16 }}>
        <p style={{ fontSize: '0.875rem', color: 'var(--ink-muted)' }}>
          Tên ứng dụng và logo hiển thị trên header mọi trang (cả màn hình đăng nhập).
        </p>

        <LogoBox
          src={`/api/settings/logo?v=${branding?.logo_file_id}`}
          alt="Logo ứng dụng"
          caption="Logo header (PNG/JPG, ≤ 2MB)"
          hasLogo={hasLogo}
          uploading={uploading}
          onPick={onPickFile}
        />

        {serverError && <Alert kind="error">{serverError}</Alert>}
        {okMsg && <Alert kind="ok">{okMsg}</Alert>}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col" style={{ gap: 16 }}>
          <div>
            <label className="field-label" htmlFor="b_name">
              Tên ứng dụng (header)
            </label>
            <input id="b_name" className="text-input" {...register('app_name')} />
            {errors.app_name && <FieldError>{errors.app_name.message}</FieldError>}
          </div>
          <button
            type="submit"
            disabled={isSubmitting || !isDirty}
            className="btn-primary"
            style={{ alignSelf: 'flex-start', opacity: isSubmitting || !isDirty ? 0.5 : 1 }}
          >
            <Save size={14} /> Lưu branding
          </button>
        </form>
      </div>
    </div>
  );
}

/* ─────────────────────────── Tab Sổ công văn (B2) ─────────────────────────── */
interface Book {
  key: string;
  label: string;
  direction: 'out' | 'in';
  unitId: number | null;
}

const RESET_LABEL: Record<DocType['reset_policy'], string> = {
  year: 'Theo năm',
  month: 'Theo tháng',
  none: 'Không reset',
};

function SoCongVanTab({ units }: { units: Unit[] }) {
  const gdnn = units.find((u) => u.code === 'GDNN');
  const dvdl = units.find((u) => u.code === 'DVDL');
  const books: Book[] = [
    { key: 'out-gdnn', label: 'Sổ đi GDNN', direction: 'out', unitId: gdnn?.id ?? null },
    { key: 'out-dvdl', label: 'Sổ đi DVDL', direction: 'out', unitId: dvdl?.id ?? null },
    { key: 'in', label: 'Sổ đến (chung)', direction: 'in', unitId: null },
  ];
  const [activeKey, setActiveKey] = useState('out-gdnn');
  const book = books.find((b) => b.key === activeKey) ?? books[0]!;

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<DocType | null>(null);

  function switchBook(key: string) {
    setActiveKey(key);
    setCreating(false); // đóng drawer để không giữ context sổ cũ
    setEditing(null);
  }

  const typesQuery = useQuery({
    queryKey: ['doc-types', book.direction, book.unitId],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/document-types', {
        params: {
          query: {
            direction: book.direction,
            unit_id: book.unitId ?? undefined,
          },
        },
      });
      if (error || !data) throw new Error(errMsg(error, 'Không tải được danh sách loại'));
      return data as { items: DocType[] };
    },
  });

  const items = typesQuery.data?.items ?? [];

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div
        className="flex items-center flex-wrap"
        style={{ padding: 16, gap: 12, borderBottom: '1px solid var(--rule)' }}
      >
        <div className="seg">
          {books.map((b) => (
            <button
              key={b.key}
              data-active={b.key === activeKey ? 'true' : undefined}
              onClick={() => switchBook(b.key)}
            >
              {b.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
          <Plus size={14} /> Thêm loại
        </button>
      </div>

      <table className="qlcv-table">
        <thead>
          <tr>
            <th style={{ paddingLeft: 24 }}>Loại văn bản</th>
            <th style={{ width: 100 }}>Mã</th>
            <th>Format số</th>
            <th style={{ width: 120 }}>Reset</th>
            <th className="center" style={{ width: 90 }}>
              Zero-pad
            </th>
            <th className="center" style={{ width: 110 }}>
              STT hiện tại
            </th>
          </tr>
        </thead>
        <tbody>
          {typesQuery.isLoading && (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center', padding: '32px 16px' }}>
                <span className="cell-meta">Đang tải…</span>
              </td>
            </tr>
          )}
          {!typesQuery.isLoading && items.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center', padding: '32px 16px' }}>
                <span className="cell-meta">Chưa có loại văn bản nào trong sổ này.</span>
              </td>
            </tr>
          )}
          {items.map((t) => (
            <tr
              key={t.id}
              tabIndex={0}
              onClick={() => setEditing(t)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setEditing(t);
                }
              }}
              style={{ cursor: 'pointer', opacity: t.is_active ? 1 : 0.5 }}
            >
              <td style={{ paddingLeft: 24 }}>
                <span
                  className="flex items-center"
                  style={{ gap: 8, fontWeight: 500, color: 'var(--ink)' }}
                >
                  <FileText size={15} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />
                  {t.name}
                  {!t.is_active && (
                    <span className="type-tag" style={{ textTransform: 'none' }}>
                      Ngừng dùng
                    </span>
                  )}
                </span>
              </td>
              <td>
                <span className="type-tag">{t.code}</span>
              </td>
              <td>
                <span className="cell-mono">{t.number_format}</span>
              </td>
              <td>
                <span className="cell-meta">{RESET_LABEL[t.reset_policy]}</span>
              </td>
              <td style={{ textAlign: 'center' }}>
                <span className="cell-mono">{t.zero_pad}</span>
              </td>
              <td style={{ textAlign: 'center' }}>
                <span className="cell-mono num">{fmtInt(Math.max(t.next_number - 1, 0))}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {creating && <DocTypeDrawer book={book} onClose={() => setCreating(false)} />}
      {editing && <DocTypeDrawer book={book} existing={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

const docTypeSchema = z.object({
  name: z.string().min(1, 'Nhập tên loại'),
  code: z.string().min(1, 'Nhập mã').max(20),
  number_format: z
    .string()
    .min(1, 'Nhập format số')
    .refine((v) => v.includes('{STT}'), 'Format phải chứa {STT}'),
  reset_policy: z.enum(['year', 'month', 'none']),
  zero_pad: z.coerce.number().int().min(0).max(10),
  start_stt: z.coerce.number().int().min(1).max(1_000_000),
  current_stt: z.coerce.number().int().min(0).max(1_000_000),
  is_active: z.boolean(),
});
type DocTypeValues = z.infer<typeof docTypeSchema>;

function DocTypeDrawer({
  book,
  existing,
  onClose,
}: {
  book: Book;
  existing?: DocType;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = !!existing;
  const [serverError, setServerError] = useState<string | null>(null);
  const formId = existing ? `doctype-form-${existing.id}` : 'doctype-form-new';

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<DocTypeValues>({
    resolver: zodResolver(docTypeSchema),
    defaultValues: {
      name: existing?.name ?? '',
      code: existing?.code ?? '',
      number_format: existing?.number_format ?? '{STT}/{NĂM}/{LOẠI}-{ĐƠN VỊ}',
      reset_policy: existing?.reset_policy ?? 'year',
      zero_pad: existing?.zero_pad ?? 3,
      start_stt: 1,
      current_stt: existing ? Math.max(existing.next_number - 1, 0) : 0,
      is_active: existing?.is_active ?? true,
    },
  });

  const fmt = watch('number_format');
  const code = watch('code');
  const zeroPad = watch('zero_pad');
  const startStt = watch('start_stt');
  const currentStt = watch('current_stt');
  const sampleStt = Number(currentStt) > 0 ? Number(currentStt) + 1 : Number(startStt) || 1;

  const previewQuery = useQuery({
    queryKey: ['preview', fmt, code, zeroPad, book.unitId, sampleStt],
    enabled: !!fmt && !!code,
    retry: false,
    queryFn: async () => {
      const { data, error } = await api.POST('/api/document-types/preview', {
        body: {
          number_format: fmt,
          code: code || 'CV',
          zero_pad: Number(zeroPad) || 0,
          unit_id: book.unitId ?? undefined,
          sample_stt: sampleStt,
        },
      });
      if (error || !data) throw new Error(errMsg(error, 'Format không hợp lệ'));
      return (data as { sample: string }).sample;
    },
  });

  async function onSubmit(values: DocTypeValues) {
    setServerError(null);
    if (isEdit) {
      const { error } = await api.PUT('/api/document-types/{dt_id}', {
        params: { path: { dt_id: existing!.id } },
        body: {
          name: values.name,
          code: values.code,
          number_format: values.number_format,
          reset_policy: values.reset_policy,
          zero_pad: values.zero_pad,
          is_active: values.is_active,
          current_stt: values.current_stt,
        },
      });
      if (error) {
        setServerError(errMsg(error, 'Lưu thất bại'));
        return;
      }
    } else {
      const { error } = await api.POST('/api/document-types', {
        body: {
          direction: book.direction,
          unit_id: book.unitId ?? undefined,
          name: values.name,
          code: values.code,
          number_format: values.number_format,
          reset_policy: values.reset_policy,
          zero_pad: values.zero_pad,
          start_stt: values.start_stt,
          current_stt: values.current_stt,
        },
      });
      if (error) {
        setServerError(errMsg(error, 'Tạo loại thất bại'));
        return;
      }
    }
    await queryClient.invalidateQueries({ queryKey: ['doc-types'] });
    onClose();
  }

  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow={book.label}
      title={isEdit ? 'Sửa loại văn bản' : 'Thêm loại văn bản'}
      width={480}
      actions={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Huỷ
          </button>
          <button
            type="submit"
            form={formId}
            disabled={isSubmitting}
            className="btn-primary"
            style={{ opacity: isSubmitting ? 0.6 : 1 }}
          >
            <Save size={14} /> {isEdit ? 'Lưu' : 'Tạo loại'}
          </button>
        </>
      }
    >
      {serverError && <Alert kind="error">{serverError}</Alert>}

      <form
        id={formId}
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="flex flex-col"
        style={{ gap: 16 }}
      >
        <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <div>
            <label className="field-label" htmlFor="d_name">
              Tên loại văn bản
            </label>
            <input id="d_name" className="text-input" placeholder="vd: Kế hoạch" {...register('name')} />
            {errors.name && <FieldError>{errors.name.message}</FieldError>}
          </div>
          <div>
            <label className="field-label" htmlFor="d_code">
              Mã viết tắt
            </label>
            <input id="d_code" className="text-input" placeholder="KH" {...register('code')} />
            {errors.code && <FieldError>{errors.code.message}</FieldError>}
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="d_fmt">
            Format số
          </label>
          <input id="d_fmt" className="text-input font-mono" {...register('number_format')} />
          <p className="cell-meta" style={{ marginTop: 6 }}>
            Biến: {'{STT}'} {'{NĂM}'} {'{THÁNG}'} {'{ĐƠN VỊ}'} {'{LOẠI}'} — bắt buộc có {'{STT}'}.
          </p>
          {errors.number_format && <FieldError>{errors.number_format.message}</FieldError>}
        </div>

        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="field-label" htmlFor="d_reset">
              Chính sách reset
            </label>
            <select id="d_reset" className="text-input" {...register('reset_policy')}>
              <option value="year">Theo năm</option>
              <option value="month">Theo tháng</option>
              <option value="none">Không reset</option>
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="d_pad">
              Độ rộng STT (zero-pad)
            </label>
            <input id="d_pad" type="number" min={0} max={10} className="text-input" {...register('zero_pad')} />
          </div>
        </div>

        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {!isEdit && (
            <div>
              <label className="field-label" htmlFor="d_start">
                STT bắt đầu
              </label>
              <input id="d_start" type="number" min={1} className="text-input" {...register('start_stt')} />
            </div>
          )}
          <div>
            <label className="field-label" htmlFor="d_cur">
              {isEdit ? 'STT đã cấp gần nhất' : 'STT hiện tại'}
            </label>
            <input id="d_cur" type="number" min={0} className="text-input" {...register('current_stt')} />
          </div>
        </div>

        {isEdit && (
          <label className="flex items-center" style={{ gap: 8, fontSize: '0.85rem', color: 'var(--ink-body)' }}>
            <input type="checkbox" className="qlcv-check" {...register('is_active')} />
            Đang dùng (bỏ chọn = ngừng dùng, CV cũ vẫn giữ)
          </label>
        )}

        <div className="card" style={{ padding: 14, background: 'var(--paper-deep)' }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Xem trước số kế tiếp
          </div>
          <div
            className="cell-mono num"
            style={previewQuery.isError ? { color: 'var(--danger)' } : undefined}
          >
            {previewQuery.isError
              ? (previewQuery.error as Error).message
              : (previewQuery.data ?? '…')}
          </div>
        </div>
      </form>
    </Drawer>
  );
}
