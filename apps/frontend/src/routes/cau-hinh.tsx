import { useRef, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, ImageUp, Loader2 } from 'lucide-react';

import { api, type ApiErrorEnvelope } from '~/lib/api';
import { useAuth } from '~/stores/auth';

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

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

function errMsg(error: unknown, fallback: string): string {
  return (error as ApiErrorEnvelope | undefined)?.error?.message ?? fallback;
}

function CauHinhPage() {
  const me = useAuth((s) => s.user);

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
      <h2 className="text-2xl font-semibold text-slate-800">Thông tin 2 đơn vị</h2>
      <p className="mt-1 text-sm text-slate-500">
        Tên, địa chỉ, mã số thuế, logo… áp dụng cho công văn đi của từng đơn vị. Mã màu cố định để
        giữ nhất quán giữa các công văn.
      </p>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {unitsQuery.isLoading && <p className="text-slate-400">Đang tải…</p>}
        {units.map((u) => (
          <UnitCard key={u.id} unit={u} />
        ))}
      </div>
    </div>
  );
}

const fieldClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100';
const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500';

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
  // Cache-bust ảnh logo sau khi upload (browser cache theo URL).
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
    reset(values); // chốt lại giá trị đã lưu → isDirty về false
    await queryClient.invalidateQueries({ queryKey: ['units'] });
  }

  const uploadLogo = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > MAX_LOGO_BYTES) throw new Error('Logo vượt quá 2MB');
      if (!['image/png', 'image/jpeg'].includes(file.type))
        throw new Error('Logo phải là ảnh PNG hoặc JPG');
      const form = new FormData();
      form.append('file', file);
      // Upload đa phần dùng fetch trực tiếp (cookie session gửi kèm same-origin).
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
    e.target.value = ''; // cho phép chọn lại cùng file
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

      {/* Logo */}
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
