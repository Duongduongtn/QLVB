import { useRef, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, FileText, ImageUp, Loader2, Plus, X } from 'lucide-react';

import { api, type ApiErrorEnvelope } from '~/lib/api';
import { useAuth } from '~/stores/auth';
import { fmtInt } from '~/lib/format';

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

const fieldClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100';
const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500';

type Tab = 'don-vi' | 'so-cong-van';

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
      <div className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-slate-600">Trang này chỉ dành cho Quản lý.</p>
      </div>
    );
  }
  if (!me) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-slate-500">Đang tải…</p>
      </div>
    );
  }

  const units = unitsQuery.data?.items ?? [];

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">Cấu hình</p>
      <h2 className="text-2xl font-semibold text-slate-800">Cấu hình hệ thống</h2>
      <p className="mt-1 text-sm text-slate-500">
        Đơn vị, sổ công văn, format số công văn — áp dụng cho công văn đi của từng đơn vị.
      </p>

      <div className="mt-5 flex gap-1 border-b border-slate-200">
        <TabButton active={tab === 'don-vi'} onClick={() => setTab('don-vi')}>
          2 Đơn vị
        </TabButton>
        <TabButton active={tab === 'so-cong-van'} onClick={() => setTab('so-cong-van')}>
          Sổ công văn
        </TabButton>
      </div>

      {tab === 'don-vi' && <UnitsTab units={units} loading={unitsQuery.isLoading} />}
      {tab === 'so-cong-van' && <SoCongVanTab units={units} />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium ${
        active
          ? 'border-amber-400 text-amber-600'
          : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

/* ─────────────────────────── Tab Đơn vị (B1) ─────────────────────────── */
function UnitsTab({ units, loading }: { units: Unit[]; loading: boolean }) {
  return (
    <div className="mt-6 grid gap-6 md:grid-cols-2">
      {loading && <p className="text-slate-400">Đang tải…</p>}
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
  const fileInput = useRef<HTMLInputElement>(null);
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
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-3">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-md text-white"
          style={{ backgroundColor: unit.color }}
        >
          <Building2 size={18} />
        </span>
        <div>
          <p className="font-semibold text-slate-800">{unit.short_name || unit.full_name}</p>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-500">
            {unit.code}
          </span>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-4 rounded-md bg-slate-50 px-4 py-3">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded border border-slate-200 bg-white">
          {hasLogo ? (
            <img
              src={`/api/units/${unit.id}/logo?v=${logoVersion}`}
              alt={`Logo ${unit.code}`}
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-[10px] text-slate-400">Chưa có</span>
          )}
        </div>
        <div className="flex-1">
          <p className="text-xs text-slate-500">Logo hiển thị trên công văn (PNG/JPG, ≤ 2MB)</p>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-white disabled:opacity-60"
          >
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImageUp size={15} />}
            {hasLogo ? 'Đổi logo' : 'Tải logo'}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={onPickFile}
          />
        </div>
      </div>

      {serverError && (
        <div role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {serverError}
        </div>
      )}
      {okMsg && (
        <div role="status" className="mb-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          {okMsg}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3">
        <div>
          <label className={labelClass} htmlFor={`fn_${unit.id}`}>Tên đầy đủ</label>
          <input id={`fn_${unit.id}`} className={fieldClass} {...register('full_name')} />
          {errors.full_name && <p className="mt-1 text-xs text-red-600">{errors.full_name.message}</p>}
        </div>
        <div>
          <label className={labelClass} htmlFor={`sn_${unit.id}`}>Tên viết tắt</label>
          <input id={`sn_${unit.id}`} className={fieldClass} {...register('short_name')} />
        </div>
        <div>
          <label className={labelClass} htmlFor={`ad_${unit.id}`}>Địa chỉ</label>
          <input id={`ad_${unit.id}`} className={fieldClass} {...register('address')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor={`tc_${unit.id}`}>Mã số thuế</label>
            <input id={`tc_${unit.id}`} className={fieldClass} {...register('tax_code')} />
          </div>
          <div>
            <label className={labelClass} htmlFor={`ph_${unit.id}`}>Số điện thoại</label>
            <input id={`ph_${unit.id}`} className={fieldClass} {...register('phone')} />
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor={`em_${unit.id}`}>Email</label>
          <input id={`em_${unit.id}`} className={fieldClass} {...register('email')} />
          {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="h-4 w-4 rounded-full border border-slate-300" style={{ backgroundColor: unit.color }} />
            Mã màu cố định ({unit.color})
          </div>
          <button
            type="submit"
            disabled={isSubmitting || !isDirty}
            className="rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-500 disabled:opacity-50"
          >
            Lưu
          </button>
        </div>
      </form>
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
    <div className="mt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-1">
          {books.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => switchBook(b.key)}
              className={`rounded px-3 py-1.5 text-sm font-medium ${
                b.key === activeKey ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-500"
        >
          <Plus size={16} />
          Thêm loại
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Loại văn bản</th>
              <th className="px-4 py-3 font-medium">Mã</th>
              <th className="px-4 py-3 font-medium">Format số</th>
              <th className="px-4 py-3 font-medium">Số kế tiếp</th>
              <th className="px-4 py-3 font-medium">Reset</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {typesQuery.isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">Đang tải…</td>
              </tr>
            )}
            {!typesQuery.isLoading && items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Chưa có loại văn bản nào trong sổ này.
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
                className={`cursor-pointer hover:bg-amber-50/50 focus:bg-amber-50 focus:outline-none ${
                  t.is_active ? '' : 'opacity-50'
                }`}
              >
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2 font-medium text-slate-800">
                    <FileText size={15} className="text-slate-400" />
                    {t.name}
                    {!t.is_active && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                        Ngừng dùng
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
                    {t.code}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{t.number_format}</td>
                <td className="px-4 py-3 font-semibold text-slate-700">{fmtInt(t.next_number)}</td>
                <td className="px-4 py-3 text-slate-500">{RESET_LABEL[t.reset_policy]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && <DocTypeDrawer book={book} onClose={() => setCreating(false)} />}
      {editing && (
        <DocTypeDrawer book={book} existing={editing} onClose={() => setEditing(null)} />
      )}
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
    <div className="fixed inset-0 z-40">
      <button type="button" aria-label="Đóng" onClick={onClose} className="absolute inset-0 bg-slate-900/30" />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">
              {book.label}
            </p>
            <h3 className="text-lg font-semibold text-slate-800">
              {isEdit ? 'Sửa loại văn bản' : 'Thêm loại văn bản'}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {serverError && (
            <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {serverError}
            </div>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className={labelClass} htmlFor="d_name">Tên loại văn bản</label>
                <input id="d_name" className={fieldClass} placeholder="vd: Kế hoạch" {...register('name')} />
                {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
              </div>
              <div>
                <label className={labelClass} htmlFor="d_code">Mã viết tắt</label>
                <input id="d_code" className={fieldClass} placeholder="KH" {...register('code')} />
                {errors.code && <p className="mt-1 text-xs text-red-600">{errors.code.message}</p>}
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="d_fmt">Format số</label>
              <input id="d_fmt" className={`${fieldClass} font-mono`} {...register('number_format')} />
              <p className="mt-1 text-xs text-slate-500">
                Biến: <code>{'{STT}'}</code> <code>{'{NĂM}'}</code> <code>{'{THÁNG}'}</code>{' '}
                <code>{'{ĐƠN VỊ}'}</code> <code>{'{LOẠI}'}</code> — bắt buộc có <code>{'{STT}'}</code>.
              </p>
              {errors.number_format && (
                <p className="mt-1 text-xs text-red-600">{errors.number_format.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="d_reset">Chính sách reset</label>
                <select id="d_reset" className={fieldClass} {...register('reset_policy')}>
                  <option value="year">Theo năm</option>
                  <option value="month">Theo tháng</option>
                  <option value="none">Không reset</option>
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="d_pad">Độ rộng STT (zero-pad)</label>
                <input id="d_pad" type="number" min={0} max={10} className={fieldClass} {...register('zero_pad')} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {!isEdit && (
                <div>
                  <label className={labelClass} htmlFor="d_start">STT bắt đầu</label>
                  <input id="d_start" type="number" min={1} className={fieldClass} {...register('start_stt')} />
                </div>
              )}
              <div>
                <label className={labelClass} htmlFor="d_cur">
                  {isEdit ? 'STT đã cấp gần nhất' : 'STT hiện tại'}
                </label>
                <input id="d_cur" type="number" min={0} className={fieldClass} {...register('current_stt')} />
              </div>
            </div>

            {isEdit && (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" {...register('is_active')} className="h-4 w-4 rounded border-slate-300" />
                Đang dùng (bỏ chọn = ngừng dùng, CV cũ vẫn giữ)
              </label>
            )}

            <div className="rounded-md bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Xem trước số kế tiếp
              </p>
              <p className={`mt-1 font-mono text-sm ${previewQuery.isError ? 'text-red-600' : 'text-slate-800'}`}>
                {previewQuery.isError
                  ? (previewQuery.error as Error).message
                  : (previewQuery.data ?? '…')}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm">
                Huỷ
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-500 disabled:opacity-60"
              >
                {isEdit ? 'Lưu' : 'Tạo loại'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
