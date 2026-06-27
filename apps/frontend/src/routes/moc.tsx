import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Save, Stamp, UploadCloud } from 'lucide-react';

import { api, type ApiErrorEnvelope } from '~/lib/api';
import { useAuth } from '~/stores/auth';
import { fmtDate } from '~/lib/format';
import { PageHeader, Pill, EmptyState, InfoRow } from '~/components/ui';
import { Drawer } from '~/components/Drawer';
import { TachNenModal } from '~/components/TachNenModal';
import { UnitPill, type UnitLite } from '~/components/sign-ui';

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

// Nền caro nhẹ → nhận biết PNG nền trong suốt (mộc đã tách nền). Dùng token giấy.
const checkerBg =
  'repeating-conic-gradient(var(--light-graphite) 0% 25%, var(--paper-raised) 0% 50%) 50% / 16px 16px';

const BREADCRUMB = [{ label: 'Mộc & Chữ ký' }];

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
      <>
        <PageHeader breadcrumb={BREADCRUMB} title="Quản lý mộc" />
        <div className="card" style={{ padding: 24, color: 'var(--ink-muted)', fontSize: '0.9rem' }}>
          Trang này chỉ dành cho Quản lý.
        </div>
      </>
    );
  }
  if (!me) {
    return (
      <>
        <PageHeader breadcrumb={BREADCRUMB} title="Quản lý mộc" />
        <div className="card" style={{ padding: 24, color: 'var(--ink-faint)', fontSize: '0.9rem' }}>
          Đang tải…
        </div>
      </>
    );
  }

  const seals = sealsQuery.data?.items ?? [];

  return (
    <>
      <PageHeader
        breadcrumb={BREADCRUMB}
        title="Quản lý mộc"
        subhead="Mỗi mộc gắn 1 đơn vị — chống nhầm khi phát hành công văn."
        actions={
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            <Plus size={14} /> Tải mộc mới
          </button>
        }
      />

      {sealsQuery.isLoading ? (
        <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--ink-faint)' }}>
          Đang tải…
        </div>
      ) : seals.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Stamp}
            title="Chưa có mộc nào"
            desc="Bấm “Tải mộc mới” để tải lên và tách nền."
          />
        </div>
      ) : (
        <div
          className="grid"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}
        >
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
          onReupload={() => {
            setSelected(null);
            setCreating(true);
          }}
          onClose={() => setSelected(null)}
        />
      )}
    </>
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
      className="card"
      style={{
        padding: 18,
        textAlign: 'left',
        cursor: 'pointer',
        opacity: seal.is_active ? 1 : 0.6,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div className="flex items-start justify-between" style={{ gap: 8, marginBottom: 14 }}>
        <UnitPill unit={unit} />
        <Pill variant={seal.is_active ? 'success' : 'draft'} dot={seal.is_active}>
          {seal.is_active ? 'Đang dùng' : 'Ngừng dùng'}
        </Pill>
      </div>
      <div
        className="flex items-center justify-center"
        style={{
          height: 96,
          borderRadius: 6,
          border: '1px solid var(--rule)',
          background: checkerBg,
          marginBottom: 14,
          padding: 8,
        }}
      >
        <img
          src={`/api/seals/${seal.id}/image`}
          alt={seal.name}
          style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
        />
      </div>
      <div className="truncate" style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }} title={seal.name}>
        {seal.name}
      </div>
      <div className="cell-meta">
        {SEAL_TYPE_LABEL[seal.seal_type]} · Tải lên {fmtDate(seal.created_at)}
      </div>
    </button>
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
  onReupload,
  onClose,
}: {
  seal: SealRow;
  unit: UnitLite | undefined;
  onReupload: () => void;
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
    <Drawer
      open
      onClose={onClose}
      eyebrow="Mộc · Chỉnh sửa"
      title={seal.name}
      width={460}
      actions={
        <>
          <button
            type="button"
            className="btn-secondary"
            style={{ marginRight: 'auto', color: seal.is_active ? 'var(--danger)' : 'var(--success)' }}
            onClick={() => toggleActive.mutate()}
            disabled={toggleActive.isPending}
          >
            {seal.is_active ? 'Ngừng dùng' : 'Kích hoạt'}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Huỷ
          </button>
          <button type="submit" form="seal-form" className="btn-primary" disabled={isSubmitting}>
            <Save size={14} /> Lưu
          </button>
        </>
      }
    >
      <form
        id="seal-form"
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col"
        style={{ gap: 18 }}
      >
      {serverError && (
        <div
          role="alert"
          style={{
            background: 'var(--danger-soft)',
            color: 'var(--danger)',
            border: '1px solid var(--rule)',
            borderRadius: 6,
            padding: '8px 12px',
            fontSize: '0.85rem',
          }}
        >
          {serverError}
        </div>
      )}

      <div
        className="flex items-center justify-center"
        style={{
          height: 150,
          borderRadius: 6,
          border: '1px solid var(--rule)',
          background: checkerBg,
          padding: 12,
        }}
      >
        <img
          src={`/api/seals/${seal.id}/image`}
          alt={seal.name}
          style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
        />
      </div>

      <button
        type="button"
        className="btn-secondary"
        style={{ width: '100%', justifyContent: 'center' }}
        onClick={onReupload}
      >
        <UploadCloud size={14} /> Tải ảnh khác &amp; tách nền lại
      </button>

      <div>
        <label className="field-label" htmlFor="e_name">
          Tên
        </label>
        <input id="e_name" className="text-input" {...register('name')} />
        {errors.name && (
          <p style={{ marginTop: 4, fontSize: '0.75rem', color: 'var(--danger)' }}>{errors.name.message}</p>
        )}
      </div>

      <div>
        <label className="field-label" htmlFor="e_type">
          Loại mộc
        </label>
        <select id="e_type" className="text-input" {...register('seal_type')}>
          <option value="round">Mộc tròn</option>
          <option value="hanging">Mộc treo</option>
          <option value="overlap">Mộc giáp lai</option>
        </select>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <InfoRow label="Đơn vị">
          <UnitPill unit={unit} />
        </InfoRow>
        <InfoRow label="Trạng thái">
          <Pill variant={seal.is_active ? 'success' : 'draft'} dot={seal.is_active}>
            {seal.is_active ? 'Đang dùng' : 'Ngừng dùng'}
          </Pill>
        </InfoRow>
        <InfoRow label="Ngày tải lên">{fmtDate(seal.created_at)}</InfoRow>
      </div>

      <p className="cell-meta">
        Không đổi đơn vị sau khi tạo (chống nhầm mộc). Không xoá cứng — dùng “Ngừng dùng” để công văn cũ
        vẫn hiển thị đúng mộc.
      </p>
      </form>
    </Drawer>
  );
}
