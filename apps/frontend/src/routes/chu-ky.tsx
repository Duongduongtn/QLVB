import { useEffect, useState, type ReactNode } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, X } from 'lucide-react';

import { api, type ApiErrorEnvelope } from '~/lib/api';
import { useAuth } from '~/stores/auth';
import { fmtDate } from '~/lib/format';
import { MocChuKyTabs } from '~/components/MocChuKyTabs';
import { StatusPill, UnitPill, type UnitLite } from '~/components/sign-ui';

export const Route = createFileRoute('/chu-ky')({
  component: ChuKyPage,
});

interface SignatureRow {
  id: number;
  full_name: string;
  title: string | null;
  default_unit_id: number | null;
  file_id: number;
  uploaded_by: number | null;
  is_active: boolean;
  created_at: string;
}

const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

function errMsg(error: unknown, fallback: string): string {
  return (error as ApiErrorEnvelope | undefined)?.error?.message ?? fallback;
}

function useUnits() {
  return useQuery({
    queryKey: ['units'],
    queryFn: async () => {
      const res = await api.GET('/api/units', {});
      return (res.data ?? { items: [] }) as { items: UnitLite[] };
    },
  });
}

function ChuKyPage() {
  const me = useAuth((s) => s.user);
  const [selected, setSelected] = useState<SignatureRow | null>(null);
  const [creating, setCreating] = useState(false);

  const unitsQuery = useUnits();
  const units = unitsQuery.data?.items ?? [];

  const sigsQuery = useQuery({
    queryKey: ['signatures', true],
    enabled: me?.role === 'manager',
    queryFn: async () => {
      const { data, error } = await api.GET('/api/signatures', {
        params: { query: { include_inactive: true } },
      });
      if (error || !data) throw new Error(errMsg(error, 'Không tải được danh sách chữ ký'));
      return data as { items: SignatureRow[] };
    },
  });

  if (me && me.role !== 'manager') {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-slate-600">Trang này chỉ dành cho Quản lý.</p>
      </div>
    );
  }
  if (!me) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-slate-500">Đang tải…</p>
      </div>
    );
  }

  const sigs = sigsQuery.data?.items ?? [];

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">Mộc &amp; Chữ ký</p>
          <h2 className="text-2xl font-semibold text-slate-800">Quản lý chữ ký</h2>
          <p className="mt-1 text-sm text-slate-500">
            Chữ ký người ký công văn. Một người có thể có nhiều chữ ký (cũ/mới).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 rounded-md bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-500"
        >
          <Plus size={16} />
          Tải chữ ký mới
        </button>
      </div>

      <MocChuKyTabs />

      {sigsQuery.isLoading ? (
        <p className="py-10 text-center text-slate-400">Đang tải…</p>
      ) : sigs.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white py-12 text-center text-slate-400">
          Chưa có chữ ký nào. Bấm “Tải chữ ký mới” để tải lên.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sigs.map((s) => (
            <SignatureCard
              key={s.id}
              sig={s}
              unit={units.find((u) => u.id === s.default_unit_id)}
              onClick={() => setSelected(s)}
            />
          ))}
        </div>
      )}

      {creating && <CreateDrawer units={units} onClose={() => setCreating(false)} />}
      {selected && (
        <EditDrawer signature={selected} units={units} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function SignatureCard({
  sig,
  unit,
  onClick,
}: {
  sig: SignatureRow;
  unit: UnitLite | undefined;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-amber-300 hover:shadow-sm ${
        sig.is_active ? '' : 'opacity-60'
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <UnitPill unit={unit} />
        <StatusPill active={sig.is_active} />
      </div>
      <div className="mb-3 flex h-24 items-center justify-center rounded-md border border-slate-100 bg-white p-2">
        <img
          src={`/api/signatures/${sig.id}/image`}
          alt={`Chữ ký ${sig.full_name}`}
          className="max-h-full max-w-full object-contain"
        />
      </div>
      <p className="truncate font-semibold text-slate-800" title={sig.full_name}>
        {sig.full_name}
        {sig.title ? ` — ${sig.title}` : ''}
      </p>
      <p className="mt-0.5 text-xs text-slate-500">Tải lên {fmtDate(sig.created_at)}</p>
    </button>
  );
}

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40">
      <button type="button" aria-label="Đóng" onClick={onClose} className="absolute inset-0 bg-slate-900/30" />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">Chữ ký · Chỉnh sửa</p>
            <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

const fieldClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100';
const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500';

const createSchema = z.object({
  full_name: z.string().trim().min(1, 'Nhập họ tên').max(150),
  title: z.string().max(150).optional(),
  default_unit_id: z.string(),
});
type CreateValues = z.infer<typeof createSchema>;

function CreateDrawer({ units, onClose }: { units: UnitLite[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [fileObj, setFileObj] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { full_name: '', title: '', default_unit_id: String(units[0]?.id ?? '') },
  });

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setServerError(null);
    if (f) {
      if (f.size > MAX_SIGNATURE_BYTES) {
        setServerError('Ảnh chữ ký vượt quá 2MB');
        return;
      }
      if (!['image/png', 'image/jpeg'].includes(f.type)) {
        setServerError('Ảnh chữ ký phải là PNG hoặc JPG');
        return;
      }
    }
    setFileObj(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function onSubmit(values: CreateValues) {
    setServerError(null);
    if (!fileObj) {
      setServerError('Chọn ảnh chữ ký để tải lên');
      return;
    }
    const form = new FormData();
    form.append('full_name', values.full_name);
    if (values.title?.trim()) form.append('title', values.title.trim());
    if (values.default_unit_id) form.append('default_unit_id', values.default_unit_id);
    form.append('file', fileObj);
    const res = await fetch('/api/signatures', { method: 'POST', body: form, credentials: 'include' });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as ApiErrorEnvelope | null;
      setServerError(body?.error?.message ?? 'Tạo chữ ký thất bại');
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['signatures'] });
    onClose();
  }

  return (
    <Drawer title="Tải chữ ký mới" onClose={onClose}>
      {serverError && (
        <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {serverError}
        </div>
      )}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="g_name">Họ tên người ký</label>
          <input id="g_name" className={fieldClass} placeholder="VD: Nguyễn Văn A" {...register('full_name')} />
          {errors.full_name && <p className="mt-1 text-xs text-red-600">{errors.full_name.message}</p>}
        </div>
        <div>
          <label className={labelClass} htmlFor="g_title">Chức danh</label>
          <input id="g_title" className={fieldClass} placeholder="VD: Giám đốc" {...register('title')} />
        </div>
        <div>
          <label className={labelClass} htmlFor="g_unit">Đơn vị mặc định</label>
          <select id="g_unit" className={fieldClass} {...register('default_unit_id')}>
            <option value="">— Không gán —</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.short_name ?? u.full_name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-400">Có thể đổi sau. 1 người ký được cho cả 2 đơn vị.</p>
        </div>
        <div>
          <label className={labelClass} htmlFor="g_file">Ảnh chữ ký (PNG/JPG ≤ 2MB)</label>
          <input
            id="g_file"
            type="file"
            accept="image/png,image/jpeg"
            onChange={onPickFile}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-200"
          />
          {preview && (
            <div className="mt-3 flex h-24 items-center justify-center rounded-md border border-slate-200 bg-white p-2">
              <img src={preview} alt="Xem trước chữ ký" className="max-h-full max-w-full object-contain" />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm">
            Huỷ
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-500 disabled:opacity-60"
          >
            Tạo chữ ký
          </button>
        </div>
      </form>
    </Drawer>
  );
}

// Form sửa giống hệt form tạo (trừ phần upload file) → tái dùng schema.
const editSchema = createSchema;
type EditValues = CreateValues;

function EditDrawer({
  signature,
  units,
  onClose,
}: {
  signature: SignatureRow;
  units: UnitLite[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      full_name: signature.full_name,
      title: signature.title ?? '',
      default_unit_id: signature.default_unit_id ? String(signature.default_unit_id) : '',
    },
  });

  function patch(body: Record<string, unknown>) {
    return api.PATCH('/api/signatures/{signature_id}', {
      params: { path: { signature_id: signature.id } },
      body,
    });
  }

  async function onSubmit(values: EditValues) {
    setServerError(null);
    const { error } = await patch({
      full_name: values.full_name,
      title: values.title?.trim() || null,
      default_unit_id: values.default_unit_id ? Number(values.default_unit_id) : null,
    });
    if (error) {
      setServerError(errMsg(error, 'Lưu thất bại'));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['signatures'] });
    onClose();
  }

  const toggleActive = useMutation({
    mutationFn: async () => {
      const { error } = await patch({ is_active: !signature.is_active });
      if (error) throw new Error(errMsg(error, 'Đổi trạng thái thất bại'));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['signatures'] });
      onClose();
    },
    onError: (e: Error) => setServerError(e.message),
  });

  return (
    <Drawer title={signature.full_name} onClose={onClose}>
      {serverError && (
        <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {serverError}
        </div>
      )}
      <div className="mb-5 flex h-24 items-center justify-center rounded-md border border-slate-200 bg-white p-3">
        <img
          src={`/api/signatures/${signature.id}/image`}
          alt={signature.full_name}
          className="max-h-full max-w-full object-contain"
        />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="eg_name">Họ tên người ký</label>
          <input id="eg_name" className={fieldClass} {...register('full_name')} />
          {errors.full_name && <p className="mt-1 text-xs text-red-600">{errors.full_name.message}</p>}
        </div>
        <div>
          <label className={labelClass} htmlFor="eg_title">Chức danh</label>
          <input id="eg_title" className={fieldClass} {...register('title')} />
        </div>
        <div>
          <label className={labelClass} htmlFor="eg_unit">Đơn vị mặc định</label>
          <select id="eg_unit" className={fieldClass} {...register('default_unit_id')}>
            <option value="">— Không gán —</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.short_name ?? u.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2 rounded-md border border-slate-200 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Trạng thái</span>
            <StatusPill active={signature.is_active} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Ngày tải lên</span>
            <span className="text-slate-700">{fmtDate(signature.created_at)}</span>
          </div>
        </div>

        <p className="text-xs text-slate-400">
          Đơn vị mặc định đổi được (1 người ký cho cả 2 đơn vị). Không xoá cứng — dùng “Ngừng dùng” để công văn cũ vẫn hiển thị đúng chữ ký.
        </p>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => toggleActive.mutate()}
            disabled={toggleActive.isPending}
            className={`mr-auto rounded-md border px-3 py-2 text-sm disabled:opacity-60 ${
              signature.is_active
                ? 'border-red-200 text-red-600 hover:bg-red-50'
                : 'border-green-200 text-green-700 hover:bg-green-50'
            }`}
          >
            {signature.is_active ? 'Ngừng dùng' : 'Kích hoạt'}
          </button>
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm">
            Huỷ
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-500 disabled:opacity-60"
          >
            Lưu
          </button>
        </div>
      </form>
    </Drawer>
  );
}
