import { useState, type ReactNode } from 'react';
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
import { TachNenModal } from '~/components/TachNenModal';
import { StatusPill, UnitPill, type UnitLite } from '~/components/sign-ui';

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

const SEAL_TYPE_LABEL: Record<SealType, string> = {
  round: 'Mộc tròn',
  hanging: 'Mộc treo',
  overlap: 'Mộc giáp lai',
};

// Nền caro nhẹ → nhận biết PNG nền trong suốt (mộc đã tách nền).
const CHECKER = 'bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#fff_0%_50%)] bg-[length:16px_16px]';

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

function MocPage() {
  const me = useAuth((s) => s.user);
  const [selected, setSelected] = useState<SealRow | null>(null);
  const [creating, setCreating] = useState(false);

  const unitsQuery = useUnits();
  const units = unitsQuery.data?.items ?? [];

  // Hiện cả mộc đã ngừng dùng (làm mờ) như ui-demo — UnitPill phân biệt đơn vị.
  const sealsQuery = useQuery({
    queryKey: ['seals', true],
    enabled: me?.role === 'manager',
    queryFn: async () => {
      const { data, error } = await api.GET('/api/seals', {
        params: { query: { include_inactive: true } },
      });
      if (error || !data) throw new Error(errMsg(error, 'Không tải được danh sách mộc'));
      return data as { items: SealRow[] };
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

  const seals = sealsQuery.data?.items ?? [];

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">Mộc &amp; Chữ ký</p>
          <h2 className="text-2xl font-semibold text-slate-800">Quản lý mộc</h2>
          <p className="mt-1 text-sm text-slate-500">
            Mỗi mộc gắn 1 đơn vị — chống nhầm khi phát hành công văn.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 rounded-md bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-500"
        >
          <Plus size={16} />
          Tải mộc mới
        </button>
      </div>

      <MocChuKyTabs />

      {sealsQuery.isLoading ? (
        <p className="py-10 text-center text-slate-400">Đang tải…</p>
      ) : seals.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white py-12 text-center text-slate-400">
          Chưa có mộc nào. Bấm “Tải mộc mới” để tải lên.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
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

      {creating && <TachNenModal kind="seal" units={units} onClose={() => setCreating(false)} />}
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

function SealCard({
  seal,
  unit,
  onClick,
}: {
  seal: SealRow;
  unit: UnitLite | undefined;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-amber-300 hover:shadow-sm ${
        seal.is_active ? '' : 'opacity-60'
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <UnitPill unit={unit} />
        <StatusPill active={seal.is_active} />
      </div>
      <div className={`mb-3 flex h-24 items-center justify-center rounded-md border border-slate-100 p-2 ${CHECKER}`}>
        <img
          src={`/api/seals/${seal.id}/image`}
          alt={seal.name}
          className="max-h-full max-w-full object-contain"
        />
      </div>
      <p className="truncate font-semibold text-slate-800" title={seal.name}>
        {seal.name}
      </p>
      <p className="mt-0.5 text-xs text-slate-500">
        {SEAL_TYPE_LABEL[seal.seal_type]} · Tải lên {fmtDate(seal.created_at)}
      </p>
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
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">Mộc · Chỉnh sửa</p>
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
  unit: UnitLite | undefined;
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
      <div className={`mb-5 flex h-36 items-center justify-center rounded-md border border-slate-200 p-3 ${CHECKER}`}>
        <img src={`/api/seals/${seal.id}/image`} alt={seal.name} className="max-h-full max-w-full object-contain" />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="e_name">Tên</label>
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

        <div className="space-y-2 rounded-md border border-slate-200 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Đơn vị</span>
            <UnitPill unit={unit} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Trạng thái</span>
            <StatusPill active={seal.is_active} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Ngày tải lên</span>
            <span className="text-slate-700">{fmtDate(seal.created_at)}</span>
          </div>
        </div>

        <p className="text-xs text-slate-400">
          Không đổi đơn vị sau khi tạo (chống nhầm mộc). Không xoá cứng — dùng “Ngừng dùng” để công văn cũ vẫn hiển thị đúng mộc.
        </p>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => toggleActive.mutate()}
            disabled={toggleActive.isPending}
            className={`mr-auto rounded-md border px-3 py-2 text-sm disabled:opacity-60 ${
              seal.is_active
                ? 'border-red-200 text-red-600 hover:bg-red-50'
                : 'border-green-200 text-green-700 hover:bg-green-50'
            }`}
          >
            {seal.is_active ? 'Ngừng dùng' : 'Kích hoạt'}
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
