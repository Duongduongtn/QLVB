import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, X } from 'lucide-react';

import { api, type ApiErrorEnvelope } from '~/lib/api';
import { useAuth } from '~/stores/auth';
import { fmtDateTime } from '~/lib/format';

export const Route = createFileRoute('/moc')({
  component: MocPage,
});

type SealType = 'round' | 'hanging' | 'overlap';

interface SealRow {
  id: number;
  unit_id: number;
  name: string;
  seal_type: SealType;
  file_id: number;
  uploaded_by: number | null;
  is_active: boolean;
  created_at: string;
}

interface UnitItem {
  id: number;
  code: string;
  short_name: string | null;
  full_name: string;
  color: string;
}

const SEAL_TYPE_LABEL: Record<SealType, string> = {
  round: 'Mộc tròn',
  hanging: 'Mộc treo',
  overlap: 'Mộc giáp lai',
};

const MAX_SEAL_BYTES = 5 * 1024 * 1024;

function errMsg(error: unknown, fallback: string): string {
  return (error as ApiErrorEnvelope | undefined)?.error?.message ?? fallback;
}

function useUnits() {
  return useQuery({
    queryKey: ['units'],
    queryFn: async () => {
      const res = await api.GET('/api/units', {});
      return (res.data ?? { items: [] }) as { items: UnitItem[] };
    },
  });
}

function MocPage() {
  const me = useAuth((s) => s.user);
  const [unitFilter, setUnitFilter] = useState<number | 'all'>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [selected, setSelected] = useState<SealRow | null>(null);
  const [creating, setCreating] = useState(false);

  const unitsQuery = useUnits();
  const units = useMemo(() => unitsQuery.data?.items ?? [], [unitsQuery.data]);

  const sealsQuery = useQuery({
    queryKey: ['seals', showInactive],
    enabled: me?.role === 'manager',
    queryFn: async () => {
      const { data, error } = await api.GET('/api/seals', {
        params: { query: { include_inactive: showInactive } },
      });
      if (error || !data) throw new Error(errMsg(error, 'Không tải được danh sách mộc'));
      return data as { items: SealRow[] };
    },
  });

  // Chỉ Quản lý quản lý mộc (Nhân viên chỉ chọn dùng khi soạn CV).
  if (me && me.role !== 'manager') {
    return (
      <div className="mx-auto max-w-7xl px-6 py-10">
        <p className="text-slate-600">Trang này chỉ dành cho Quản lý.</p>
      </div>
    );
  }
  if (!me) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-10">
        <p className="text-slate-500">Đang tải…</p>
      </div>
    );
  }

  const allSeals = sealsQuery.data?.items ?? [];
  const seals =
    unitFilter === 'all' ? allSeals : allSeals.filter((s) => s.unit_id === unitFilter);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">Mộc</p>
          <h2 className="text-2xl font-semibold text-slate-800">Quản lý mộc</h2>
          <p className="mt-1 text-sm text-slate-500">
            Mỗi mộc gắn cứng 1 đơn vị để chống nhầm khi phát hành công văn.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 rounded-md bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-500"
        >
          <Plus size={16} />
          Thêm mộc
        </button>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <FilterChip active={unitFilter === 'all'} onClick={() => setUnitFilter('all')}>
          Tất cả đơn vị
        </FilterChip>
        {units.map((u) => (
          <FilterChip key={u.id} active={unitFilter === u.id} onClick={() => setUnitFilter(u.id)}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: u.color }} />
            {u.short_name ?? u.code}
          </FilterChip>
        ))}
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-slate-300"
          />
          Hiện mộc đã ngừng dùng
        </label>
      </div>

      {sealsQuery.isLoading ? (
        <p className="py-10 text-center text-slate-400">Đang tải…</p>
      ) : seals.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white py-12 text-center text-slate-400">
          Chưa có mộc nào. Bấm “Thêm mộc” để tải lên.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {seals.map((s) => (
            <SealCard
              key={s.id}
              seal={s}
              unit={units.find((u) => u.id === s.unit_id)}
              onClick={() => setSelected(s)}
            />
          ))}
        </div>
      )}

      {creating && <CreateDrawer units={units} onClose={() => setCreating(false)} />}
      {selected && (
        <EditDrawer
          seal={selected}
          unit={units.find((u) => u.id === selected.unit_id)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium ${
        active
          ? 'border-amber-400 bg-amber-50 text-amber-700'
          : 'border-slate-300 text-slate-600 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  );
}

function SealCard({
  seal,
  unit,
  onClick,
}: {
  seal: SealRow;
  unit: UnitItem | undefined;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex flex-col overflow-hidden rounded-lg border bg-white text-left transition hover:border-amber-300 hover:shadow-sm ${
        seal.is_active ? 'border-slate-200' : 'border-slate-200 opacity-60'
      }`}
    >
      <div className="flex h-32 items-center justify-center bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] p-3">
        <img
          src={`/api/seals/${seal.id}/image`}
          alt={seal.name}
          className="max-h-full max-w-full object-contain"
        />
      </div>
      <div className="border-t px-3 py-2.5">
        <p className="truncate font-medium text-slate-800" title={seal.name}>
          {seal.name}
        </p>
        <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1.5 text-slate-500">
            {unit && (
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: unit.color }} />
            )}
            {unit?.short_name ?? unit?.code ?? '—'}
          </span>
          <span className="text-slate-400">{SEAL_TYPE_LABEL[seal.seal_type]}</span>
        </div>
        {!seal.is_active && (
          <span className="mt-2 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
            Đã ngừng dùng
          </span>
        )}
      </div>
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
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">Mộc</p>
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
  unit_id: z.coerce.number().int().positive('Chọn đơn vị'),
  name: z.string().trim().min(1, 'Nhập tên mộc').max(150),
  seal_type: z.enum(['round', 'hanging', 'overlap']),
});
type CreateValues = z.infer<typeof createSchema>;

function CreateDrawer({ units, onClose }: { units: UnitItem[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [fileObj, setFileObj] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // Thu hồi blob URL khi đổi ảnh / đóng drawer → tránh rò rỉ bộ nhớ.
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
    defaultValues: { unit_id: units[0]?.id, name: '', seal_type: 'round' },
  });

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setServerError(null);
    if (f) {
      if (f.size > MAX_SEAL_BYTES) {
        setServerError('Ảnh mộc vượt quá 5MB');
        return;
      }
      if (!['image/png', 'image/jpeg'].includes(f.type)) {
        setServerError('Ảnh mộc phải là PNG hoặc JPG');
        return;
      }
    }
    setFileObj(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function onSubmit(values: CreateValues) {
    setServerError(null);
    if (!fileObj) {
      setServerError('Chọn ảnh mộc để tải lên');
      return;
    }
    const form = new FormData();
    form.append('unit_id', String(values.unit_id));
    form.append('name', values.name);
    form.append('seal_type', values.seal_type);
    form.append('file', fileObj);
    const res = await fetch('/api/seals', { method: 'POST', body: form, credentials: 'include' });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as ApiErrorEnvelope | null;
      setServerError(body?.error?.message ?? 'Tạo mộc thất bại');
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['seals'] });
    onClose();
  }

  return (
    <Drawer title="Thêm mộc mới" onClose={onClose}>
      {serverError && (
        <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {serverError}
        </div>
      )}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="s_unit">Đơn vị</label>
          <select id="s_unit" className={fieldClass} {...register('unit_id')}>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.short_name ?? u.full_name}
              </option>
            ))}
          </select>
          {errors.unit_id && <p className="mt-1 text-xs text-red-600">{errors.unit_id.message}</p>}
        </div>
        <div>
          <label className={labelClass} htmlFor="s_name">Tên mộc</label>
          <input id="s_name" className={fieldClass} placeholder="VD: Mộc tròn GDNN" {...register('name')} />
          {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
        </div>
        <div>
          <label className={labelClass} htmlFor="s_type">Loại mộc</label>
          <select id="s_type" className={fieldClass} {...register('seal_type')}>
            <option value="round">Mộc tròn</option>
            <option value="hanging">Mộc treo</option>
            <option value="overlap">Mộc giáp lai</option>
          </select>
          <p className="mt-1 text-xs text-slate-400">
            Mộc tròn là dạng phổ biến (mộc dấu pháp nhân). Chọn đúng loại để hiển thị gợi ý khi soạn CV.
          </p>
        </div>
        <div>
          <label className={labelClass} htmlFor="s_file">Ảnh mộc (PNG/JPG ≤ 5MB)</label>
          <input
            id="s_file"
            type="file"
            accept="image/png,image/jpeg"
            onChange={onPickFile}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-200"
          />
          {preview && (
            <div className="mt-3 flex h-32 items-center justify-center rounded-md border border-slate-200 bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] p-2">
              <img src={preview} alt="Xem trước mộc" className="max-h-full max-w-full object-contain" />
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
            Tạo mộc
          </button>
        </div>
      </form>
    </Drawer>
  );
}

const editSchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên mộc').max(150),
  seal_type: z.enum(['round', 'hanging', 'overlap']),
});
type EditValues = z.infer<typeof editSchema>;

function EditDrawer({
  seal,
  unit,
  onClose,
}: {
  seal: SealRow;
  unit: UnitItem | undefined;
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
    defaultValues: { name: seal.name, seal_type: seal.seal_type },
  });

  function patch(body: Record<string, unknown>) {
    return api.PATCH('/api/seals/{seal_id}', {
      params: { path: { seal_id: seal.id } },
      body,
    });
  }

  async function onSubmit(values: EditValues) {
    setServerError(null);
    const { error } = await patch(values);
    if (error) {
      setServerError(errMsg(error, 'Lưu thất bại'));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['seals'] });
    onClose();
  }

  const toggleActive = useMutation({
    mutationFn: async () => {
      const { error } = await patch({ is_active: !seal.is_active });
      if (error) throw new Error(errMsg(error, 'Đổi trạng thái thất bại'));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['seals'] });
      onClose();
    },
    onError: (e: Error) => setServerError(e.message),
  });

  return (
    <Drawer title={seal.name} onClose={onClose}>
      {serverError && (
        <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {serverError}
        </div>
      )}
      <div className="mb-5 flex h-36 items-center justify-center rounded-md border border-slate-200 bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] p-3">
        <img src={`/api/seals/${seal.id}/image`} alt={seal.name} className="max-h-full max-w-full object-contain" />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div>
          <label className={labelClass}>Đơn vị</label>
          <div className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {unit && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: unit.color }} />}
            {unit?.full_name ?? '—'}
            <span className="ml-auto text-xs text-slate-400">không đổi được (chống nhầm)</span>
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor="e_name">Tên mộc</label>
          <input id="e_name" className={fieldClass} {...register('name')} />
          {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
        </div>
        <div>
          <label className={labelClass} htmlFor="e_type">Loại mộc</label>
          <select id="e_type" className={fieldClass} {...register('seal_type')}>
            <option value="round">Mộc tròn</option>
            <option value="hanging">Mộc treo</option>
            <option value="overlap">Mộc giáp lai</option>
          </select>
        </div>

        <div className="rounded-md bg-slate-50 px-4 py-3 text-sm">
          <div className="flex justify-between py-1">
            <span className="text-slate-500">Trạng thái</span>
            <span className={seal.is_active ? 'font-medium text-green-700' : 'font-medium text-slate-500'}>
              {seal.is_active ? 'Đang dùng' : 'Đã ngừng dùng'}
            </span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-slate-500">Ngày tải lên</span>
            <span className="text-slate-700">{fmtDateTime(seal.created_at) || '—'}</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => toggleActive.mutate()}
            disabled={toggleActive.isPending}
            className="mr-auto rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
          >
            {seal.is_active ? 'Ngừng dùng' : 'Dùng lại'}
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
