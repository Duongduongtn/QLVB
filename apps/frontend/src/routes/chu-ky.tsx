import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PenTool, Plus, Save, UploadCloud } from 'lucide-react';

import { api, type ApiErrorEnvelope } from '~/lib/api';
import { useAuth } from '~/stores/auth';
import { fmtDate } from '~/lib/format';
import { PageHeader, Pill, EmptyState, InfoRow } from '~/components/ui';
import { Drawer } from '~/components/Drawer';
import { TachNenModal } from '~/components/TachNenModal';
import { UnitPill, type UnitLite } from '~/components/sign-ui';

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
      <>
        <PageHeader breadcrumb={BREADCRUMB} title="Quản lý chữ ký" />
        <div className="card" style={{ padding: 24, color: 'var(--ink-muted)', fontSize: '0.9rem' }}>
          Trang này chỉ dành cho Quản lý.
        </div>
      </>
    );
  }
  if (!me) {
    return (
      <>
        <PageHeader breadcrumb={BREADCRUMB} title="Quản lý chữ ký" />
        <div className="card" style={{ padding: 24, color: 'var(--ink-faint)', fontSize: '0.9rem' }}>
          Đang tải…
        </div>
      </>
    );
  }

  const sigs = sigsQuery.data?.items ?? [];

  return (
    <>
      <PageHeader
        breadcrumb={BREADCRUMB}
        title="Quản lý chữ ký"
        subhead="Chữ ký người ký công văn. Một người có thể có nhiều chữ ký (cũ/mới)."
        actions={
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            <Plus size={14} /> Tải chữ ký mới
          </button>
        }
      />

      {sigsQuery.isLoading ? (
        <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--ink-faint)' }}>
          Đang tải…
        </div>
      ) : sigs.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={PenTool}
            title="Chưa có chữ ký nào"
            desc="Bấm “Tải chữ ký mới” để tải lên và tách nền."
          />
        </div>
      ) : (
        <div
          className="grid"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}
        >
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

      {creating && <TachNenModal kind="signature" units={units} onClose={() => setCreating(false)} />}
      {selected && (
        <EditDrawer
          signature={selected}
          units={units}
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
      className="card"
      style={{
        padding: 18,
        textAlign: 'left',
        cursor: 'pointer',
        opacity: sig.is_active ? 1 : 0.6,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div className="flex items-start justify-between" style={{ gap: 8, marginBottom: 14 }}>
        <UnitPill unit={unit} />
        <Pill variant={sig.is_active ? 'success' : 'draft'} dot={sig.is_active}>
          {sig.is_active ? 'Đang dùng' : 'Ngừng dùng'}
        </Pill>
      </div>
      <div
        className="flex items-center justify-center"
        style={{
          height: 96,
          borderRadius: 6,
          border: '1px solid var(--rule)',
          background: 'var(--paper-raised)',
          marginBottom: 14,
          padding: 8,
        }}
      >
        <img
          src={`/api/signatures/${sig.id}/image`}
          alt={`Chữ ký ${sig.full_name}`}
          style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
        />
      </div>
      <div
        className="truncate"
        style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}
        title={sig.full_name}
      >
        {sig.full_name}
        {sig.title ? ` — ${sig.title}` : ''}
      </div>
      <div className="cell-meta">Tải lên {fmtDate(sig.created_at)}</div>
    </button>
  );
}

const createSchema = z.object({
  full_name: z.string().trim().min(1, 'Nhập họ tên').max(150),
  title: z.string().max(150).optional(),
  default_unit_id: z.string(),
});
type CreateValues = z.infer<typeof createSchema>;

// Form sửa giống hệt form tạo (trừ phần upload file) → tái dùng schema.
const editSchema = createSchema;
type EditValues = CreateValues;

function EditDrawer({
  signature,
  units,
  onReupload,
  onClose,
}: {
  signature: SignatureRow;
  units: UnitLite[];
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
    <Drawer
      open
      onClose={onClose}
      eyebrow="Chữ ký · Chỉnh sửa"
      title={signature.full_name}
      width={460}
      actions={
        <>
          <button
            type="button"
            className="btn-secondary"
            style={{
              marginRight: 'auto',
              color: signature.is_active ? 'var(--danger)' : 'var(--success)',
            }}
            onClick={() => toggleActive.mutate()}
            disabled={toggleActive.isPending}
          >
            {signature.is_active ? 'Ngừng dùng' : 'Kích hoạt'}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Huỷ
          </button>
          <button type="submit" form="signature-form" className="btn-primary" disabled={isSubmitting}>
            <Save size={14} /> Lưu
          </button>
        </>
      }
    >
      <form
        id="signature-form"
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
          height: 110,
          borderRadius: 6,
          border: '1px solid var(--rule)',
          background: 'var(--paper-raised)',
          padding: 12,
        }}
      >
        <img
          src={`/api/signatures/${signature.id}/image`}
          alt={signature.full_name}
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
        <label className="field-label" htmlFor="eg_name">
          Họ tên người ký
        </label>
        <input id="eg_name" className="text-input" {...register('full_name')} />
        {errors.full_name && (
          <p style={{ marginTop: 4, fontSize: '0.75rem', color: 'var(--danger)' }}>
            {errors.full_name.message}
          </p>
        )}
      </div>

      <div>
        <label className="field-label" htmlFor="eg_title">
          Chức danh
        </label>
        <input id="eg_title" className="text-input" {...register('title')} />
      </div>

      <div>
        <label className="field-label" htmlFor="eg_unit">
          Đơn vị mặc định
        </label>
        <select id="eg_unit" className="text-input" {...register('default_unit_id')}>
          <option value="">— Không gán —</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.short_name ?? u.full_name}
            </option>
          ))}
        </select>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <InfoRow label="Trạng thái">
          <Pill variant={signature.is_active ? 'success' : 'draft'} dot={signature.is_active}>
            {signature.is_active ? 'Đang dùng' : 'Ngừng dùng'}
          </Pill>
        </InfoRow>
        <InfoRow label="Ngày tải lên">{fmtDate(signature.created_at)}</InfoRow>
      </div>

      <p className="cell-meta">
        Đơn vị mặc định đổi được (1 người ký cho cả 2 đơn vị). Không xoá cứng — dùng “Ngừng dùng” để công
        văn cũ vẫn hiển thị đúng chữ ký.
      </p>
      </form>
    </Drawer>
  );
}
