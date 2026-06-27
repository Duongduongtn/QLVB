import { useMemo, useState, type ReactNode } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Check, IdCard, PenTool, Plus, Save, Stamp } from 'lucide-react';

import { api, type ApiErrorEnvelope } from '~/lib/api';
import { useAuth } from '~/stores/auth';
import { PageHeader, Pill, EmptyState, InfoRow } from '~/components/ui';
import { Drawer } from '~/components/Drawer';
import { UnitPill, type UnitLite } from '~/components/sign-ui';

export const Route = createFileRoute('/ho-so-ky')({
  component: HoSoKyPage,
});

interface ProfileRow {
  id: number;
  unit_id: number;
  signature_id: number;
  seal_id: number;
  display_title: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

interface SignatureRow {
  id: number;
  full_name: string;
  title: string | null;
  default_unit_id: number | null;
  is_active: boolean;
}

interface SealRow {
  id: number;
  unit_id: number;
  name: string;
  is_active: boolean;
}

const BREADCRUMB = [{ label: 'Mộc & Chữ ký' }];

function errMsg(error: unknown, fallback: string): string {
  return (error as ApiErrorEnvelope | undefined)?.error?.message ?? fallback;
}

/** Cảnh báo khi hồ sơ tham chiếu chữ ký/mộc đã ngừng dùng (PRD C4 edge). */
function refWarning(signature?: SignatureRow, seal?: SealRow): string | null {
  const dead: string[] = [];
  if (!signature || !signature.is_active) dead.push('chữ ký');
  if (!seal || !seal.is_active) dead.push('mộc');
  return dead.length ? `Hồ sơ đang tham chiếu ${dead.join(' và ')} đã ngừng dùng` : null;
}

function HoSoKyPage() {
  const me = useAuth((s) => s.user);
  const [selected, setSelected] = useState<ProfileRow | null>(null);
  const [creating, setCreating] = useState(false);

  const unitsQuery = useQuery({
    queryKey: ['units'],
    queryFn: async () => {
      const res = await api.GET('/api/units', {});
      return (res.data ?? { items: [] }) as { items: UnitLite[] };
    },
  });
  const units = useMemo(() => unitsQuery.data?.items ?? [], [unitsQuery.data]);

  // Tải kèm inactive để resolve tên + cảnh báo khi hồ sơ tham chiếu asset đã ngừng.
  const sigsQuery = useQuery({
    queryKey: ['signatures', true],
    enabled: me?.role === 'manager',
    queryFn: async () => {
      const res = await api.GET('/api/signatures', { params: { query: { include_inactive: true } } });
      return (res.data ?? { items: [] }) as { items: SignatureRow[] };
    },
  });
  const sealsQuery = useQuery({
    queryKey: ['seals', true],
    enabled: me?.role === 'manager',
    queryFn: async () => {
      const res = await api.GET('/api/seals', { params: { query: { include_inactive: true } } });
      return (res.data ?? { items: [] }) as { items: SealRow[] };
    },
  });

  const profilesQuery = useQuery({
    queryKey: ['signing-profiles', true],
    enabled: me?.role === 'manager',
    queryFn: async () => {
      const { data, error } = await api.GET('/api/signing-profiles', {
        params: { query: { include_inactive: true } },
      });
      if (error || !data) throw new Error(errMsg(error, 'Không tải được danh sách hồ sơ ký'));
      return data as { items: ProfileRow[] };
    },
  });

  if (me && me.role !== 'manager') {
    return (
      <>
        <PageHeader breadcrumb={BREADCRUMB} title="Hồ sơ ký" />
        <div className="card" style={{ padding: 24, color: 'var(--ink-muted)', fontSize: '0.9rem' }}>
          Trang này chỉ dành cho Quản lý.
        </div>
      </>
    );
  }
  if (!me) {
    return (
      <>
        <PageHeader breadcrumb={BREADCRUMB} title="Hồ sơ ký" />
        <div className="card" style={{ padding: 24, color: 'var(--ink-faint)', fontSize: '0.9rem' }}>
          Đang tải…
        </div>
      </>
    );
  }

  const sigById = new Map((sigsQuery.data?.items ?? []).map((s) => [s.id, s]));
  const sealById = new Map((sealsQuery.data?.items ?? []).map((s) => [s.id, s]));
  const profiles = profilesQuery.data?.items ?? [];
  // Chỉ tính cảnh báo asset-inactive khi đã tải xong chữ ký + mộc (tránh lóe sai lúc loading).
  const assetsReady = sigsQuery.isSuccess && sealsQuery.isSuccess;

  return (
    <>
      <PageHeader
        breadcrumb={BREADCRUMB}
        title="Hồ sơ ký"
        subhead="Mỗi hồ sơ = người ký + chữ ký + chức danh + mộc cùng đơn vị → chọn 1 lần là áp đủ, chống nhầm mộc."
        actions={
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            <Plus size={14} /> Tạo hồ sơ ký
          </button>
        }
      />

      {profilesQuery.isLoading ? (
        <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--ink-faint)' }}>
          Đang tải…
        </div>
      ) : profiles.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={IdCard}
            title="Chưa có hồ sơ ký nào"
            desc="Bấm “Tạo hồ sơ ký” để bắt đầu."
          />
        </div>
      ) : (
        <div
          className="grid"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}
        >
          {profiles.map((p) => (
            <ProfileCard
              key={p.id}
              profile={p}
              unit={units.find((u) => u.id === p.unit_id)}
              signature={sigById.get(p.signature_id)}
              seal={sealById.get(p.seal_id)}
              ready={assetsReady}
              onClick={() => setSelected(p)}
            />
          ))}
        </div>
      )}

      {creating && (
        <CreateModal
          units={units}
          signatures={sigsQuery.data?.items ?? []}
          seals={sealsQuery.data?.items ?? []}
          onClose={() => setCreating(false)}
        />
      )}
      {selected && (
        <EditDrawer
          profile={selected}
          unit={units.find((u) => u.id === selected.unit_id)}
          signature={sigById.get(selected.signature_id)}
          seal={sealById.get(selected.seal_id)}
          onRecreate={() => {
            setSelected(null);
            setCreating(true);
          }}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

function ProfileCard({
  profile,
  unit,
  signature,
  seal,
  ready,
  onClick,
}: {
  profile: ProfileRow;
  unit: UnitLite | undefined;
  signature: SignatureRow | undefined;
  seal: SealRow | undefined;
  ready: boolean;
  onClick: () => void;
}) {
  const warning = ready ? refWarning(signature, seal) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="card"
      style={{
        padding: 16,
        textAlign: 'left',
        cursor: 'pointer',
        opacity: profile.is_active ? 1 : 0.6,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div className="flex items-start justify-between" style={{ gap: 8 }}>
        <UnitPill unit={unit} />
        <Pill variant={profile.is_active ? 'success' : 'draft'} dot={profile.is_active}>
          {profile.is_active ? 'Đang dùng' : 'Ngừng dùng'}
        </Pill>
      </div>
      <div className="flex items-center" style={{ gap: 12 }}>
        <span
          className="flex items-center justify-center"
          style={{
            width: 44,
            height: 44,
            borderRadius: 6,
            background: 'var(--paper-deep)',
            color: 'var(--ink-muted)',
            flexShrink: 0,
          }}
        >
          <IdCard size={20} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="truncate" style={{ fontWeight: 600, color: 'var(--ink)' }} title={profile.name}>
            {profile.name}
          </div>
          <div className="cell-meta truncate">
            {signature?.full_name ?? '—'} + {seal?.name ?? '—'}
          </div>
        </div>
      </div>
      {warning && (
        <p
          className="flex items-start"
          style={{
            gap: 6,
            borderRadius: 6,
            background: 'var(--warning-soft)',
            color: 'var(--warning)',
            padding: '6px 8px',
            fontSize: '0.78rem',
          }}
        >
          <AlertTriangle size={13} style={{ marginTop: 2, flexShrink: 0 }} />
          {warning}
        </p>
      )}
    </button>
  );
}

/* ─────────────────────────── Tạo hồ sơ ký (form 2 cột + live preview) ─────────────────────────── */

function CreateModal({
  units,
  signatures,
  seals,
  onClose,
}: {
  units: UnitLite[];
  signatures: SignatureRow[];
  seals: SealRow[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<number | null>(null);
  const [sigId, setSigId] = useState<number | null>(null);
  const [sealId, setSealId] = useState<number | null>(null);
  const [displayTitle, setDisplayTitle] = useState('');
  const [name, setName] = useState('');

  const unit = units.find((u) => u.id === unitId);
  // Chữ ký: đang dùng + đúng đơn vị (hoặc chưa gán → dùng được cho mọi đơn vị).
  const sigOptions = signatures.filter(
    (s) => s.is_active && (s.default_unit_id === unitId || s.default_unit_id === null),
  );
  // Mộc: đang dùng + ĐÚNG đơn vị (chống nhầm — backend cũng chặn).
  const sealOptions = seals.filter((s) => s.is_active && s.unit_id === unitId);
  const sig = signatures.find((s) => s.id === sigId);
  const seal = seals.find((s) => s.id === sealId);

  function chooseUnit(id: number) {
    setUnitId(id);
    setSigId(null);
    setSealId(null);
    setDisplayTitle('');
  }

  function chooseSig(s: SignatureRow) {
    setSigId(s.id);
    if (!displayTitle && s.title) setDisplayTitle(s.title);
  }

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/api/signing-profiles', {
        body: {
          unit_id: unitId,
          signature_id: sigId,
          seal_id: sealId,
          display_title: displayTitle.trim(),
          name: name.trim(),
        },
      });
      if (error) throw new Error(errMsg(error, 'Tạo hồ sơ thất bại'));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['signing-profiles'] });
      onClose();
    },
    onError: (e: Error) => setServerError(e.message),
  });

  function submit() {
    setServerError(null);
    if (!unitId) return setServerError('Chọn đơn vị');
    if (!sigId) return setServerError('Chọn chữ ký người ký');
    if (!sealId) return setServerError('Chọn mộc đi kèm');
    if (!displayTitle.trim()) return setServerError('Nhập chức danh hiển thị');
    if (!name.trim()) return setServerError('Đặt tên hồ sơ');
    create.mutate();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="card"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 920, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
      >
        <div
          className="flex items-center justify-between"
          style={{ gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}
        >
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">Hồ sơ ký</div>
            <div className="section-title">Tạo hồ sơ ký</div>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose} style={{ flexShrink: 0 }}>
            <ArrowLeft size={14} /> Quay lại
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: 20 }}>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" style={{ alignItems: 'start' }}>
            {/* Form */}
            <div className="flex flex-col" style={{ gap: 20, minWidth: 0 }}>
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

              <div>
                <label className="field-label">1. Đơn vị</label>
                <div className="grid grid-cols-2 gap-2">
                  {units.map((u) => {
                    const on = unitId === u.id;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => chooseUnit(u.id)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 6,
                          fontSize: '0.85rem',
                          fontWeight: 500,
                          cursor: 'pointer',
                          textAlign: 'left',
                          border: `1px solid ${on ? 'var(--rule-strong)' : 'var(--rule)'}`,
                          background: on ? 'var(--paper-deep)' : 'transparent',
                          color: on ? 'var(--ink)' : 'var(--ink-body)',
                        }}
                      >
                        {u.short_name ?? u.full_name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="field-label">2. Chữ ký (lọc theo đơn vị)</label>
                {!unitId ? (
                  <p style={{ fontSize: '0.85rem', color: 'var(--ink-faint)' }}>Chọn đơn vị trước.</p>
                ) : sigOptions.length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: 'var(--warning)' }}>
                    Đơn vị này chưa có chữ ký đang dùng. Thêm ở tab Chữ ký.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {sigOptions.map((s) => (
                      <SelectCard
                        key={s.id}
                        icon={<PenTool size={16} />}
                        active={sigId === s.id}
                        onClick={() => chooseSig(s)}
                        title={s.full_name}
                        sub={s.title ?? undefined}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="field-label">
                  3. Mộc đi kèm {unit ? `(chỉ mộc ${unit.short_name ?? unit.code} — chống nhầm)` : ''}
                </label>
                {!unitId ? (
                  <p style={{ fontSize: '0.85rem', color: 'var(--ink-faint)' }}>Chọn đơn vị trước.</p>
                ) : sealOptions.length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: 'var(--warning)' }}>
                    Đơn vị này chưa có mộc đang dùng. Thêm ở tab Mộc.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {sealOptions.map((s) => (
                      <SelectCard
                        key={s.id}
                        icon={<Stamp size={16} />}
                        active={sealId === s.id}
                        onClick={() => setSealId(s.id)}
                        title={s.name}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="field-label">4. Chức danh hiển thị trên CV</label>
                  <input
                    className="text-input"
                    placeholder="VD: GIÁM ĐỐC"
                    value={displayTitle}
                    onChange={(e) => setDisplayTitle(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">5. Tên hồ sơ (ngắn gọn)</label>
                  <input
                    className="text-input"
                    placeholder="VD: GĐ TT GDNN"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </div>

              <button type="button" className="btn-primary" onClick={submit} disabled={create.isPending}>
                <Save size={14} /> Lưu hồ sơ ký
              </button>
            </div>

            {/* Live preview block ký */}
            <div className="card" style={{ padding: 20, background: 'var(--paper-deep)' }}>
              <div className="eyebrow" style={{ marginBottom: 14 }}>
                Xem trước block ký
              </div>
              <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
                <UnitPill unit={unit} />
                {unit && (
                  <Pill variant="success" dot>
                    Cùng đơn vị
                  </Pill>
                )}
              </div>

              <div
                style={{
                  border: '1px solid var(--rule)',
                  borderRadius: 6,
                  padding: '20px 16px',
                  background: 'var(--paper-raised)',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: 'var(--ink)',
                    fontSize: '0.82rem',
                    letterSpacing: '0.04em',
                  }}
                >
                  {displayTitle || 'CHỨC DANH'}
                </div>
                {/* mộc đè 1/3 lên chữ ký */}
                <div
                  className="flex items-center justify-center"
                  style={{ position: 'relative', height: 112, marginTop: 8 }}
                >
                  {seal ? (
                    <img
                      src={`/api/seals/${seal.id}/image`}
                      alt={seal.name}
                      style={{
                        position: 'absolute',
                        top: 0,
                        height: 80,
                        width: 80,
                        objectFit: 'contain',
                        opacity: 0.7,
                      }}
                    />
                  ) : (
                    <span
                      className="flex items-center justify-center"
                      style={{
                        position: 'absolute',
                        top: 0,
                        width: 80,
                        height: 80,
                        borderRadius: 999,
                        border: '2px dashed var(--rule-strong)',
                        color: 'var(--ink-faint)',
                        fontSize: '0.6rem',
                      }}
                    >
                      Mộc
                    </span>
                  )}
                  {sig ? (
                    <img
                      src={`/api/signatures/${sig.id}/image`}
                      alt={sig.full_name}
                      style={{
                        position: 'absolute',
                        bottom: 4,
                        height: 56,
                        maxWidth: 140,
                        objectFit: 'contain',
                      }}
                    />
                  ) : (
                    <span style={{ position: 'absolute', bottom: 12, fontSize: '0.8rem', color: 'var(--ink-faint)' }}>
                      Chữ ký
                    </span>
                  )}
                </div>
                <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: '0.9rem', marginTop: 4 }}>
                  {sig?.full_name ?? 'Người ký'}
                </div>
              </div>

              <p className="cell-meta" style={{ marginTop: 14 }}>
                Khi soạn CV, chọn hồ sơ này sẽ tự áp chữ ký + mộc + chức danh ở trên. Mộc luôn cùng đơn vị
                với chữ ký.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SelectCard({
  icon,
  active,
  onClick,
  title,
  sub,
}: {
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
  title: string;
  sub?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center"
      style={{
        gap: 10,
        padding: 12,
        borderRadius: 6,
        textAlign: 'left',
        cursor: 'pointer',
        border: `1px solid ${active ? 'var(--rule-strong)' : 'var(--rule)'}`,
        background: active ? 'var(--paper-deep)' : 'transparent',
      }}
    >
      <span
        className="flex items-center justify-center"
        style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--paper-deep)', color: 'var(--ink-muted)', flexShrink: 0 }}
      >
        {icon}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span className="truncate" style={{ display: 'block', fontWeight: 600, color: 'var(--ink)', fontSize: '0.85rem' }}>
          {title}
        </span>
        {sub && <span className="cell-meta truncate" style={{ display: 'block' }}>{sub}</span>}
      </span>
      {active && <Check size={15} style={{ color: 'var(--success)', flexShrink: 0 }} />}
    </button>
  );
}

/* ─────────────────────────── Sửa hồ sơ ─────────────────────────── */

function EditDrawer({
  profile,
  unit,
  signature,
  seal,
  onRecreate,
  onClose,
}: {
  profile: ProfileRow;
  unit: UnitLite | undefined;
  signature: SignatureRow | undefined;
  seal: SealRow | undefined;
  onRecreate: () => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [displayTitle, setDisplayTitle] = useState(profile.display_title);
  const [name, setName] = useState(profile.name);
  const warning = refWarning(signature, seal);

  function patch(body: Record<string, unknown>) {
    return api.PATCH('/api/signing-profiles/{profile_id}', {
      params: { path: { profile_id: profile.id } },
      body,
    });
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!displayTitle.trim() || !name.trim()) throw new Error('Chức danh và tên hồ sơ không được để trống');
      const { error } = await patch({ display_title: displayTitle.trim(), name: name.trim() });
      if (error) throw new Error(errMsg(error, 'Lưu thất bại'));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['signing-profiles'] });
      onClose();
    },
    onError: (e: Error) => setServerError(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async () => {
      const { error } = await patch({ is_active: !profile.is_active });
      if (error) throw new Error(errMsg(error, 'Đổi trạng thái thất bại'));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['signing-profiles'] });
      onClose();
    },
    onError: (e: Error) => setServerError(e.message),
  });

  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow="Hồ sơ ký · Chỉnh sửa"
      title={profile.name}
      width={460}
      actions={
        <>
          <button
            type="button"
            className="btn-secondary"
            style={{ marginRight: 'auto', color: profile.is_active ? 'var(--danger)' : 'var(--success)' }}
            onClick={() => toggleActive.mutate()}
            disabled={toggleActive.isPending}
          >
            {profile.is_active ? 'Ngừng dùng' : 'Kích hoạt'}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Huỷ
          </button>
          <button type="button" className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
            <Save size={14} /> Lưu
          </button>
        </>
      }
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
      {warning && (
        <p
          className="flex items-start"
          style={{
            gap: 6,
            borderRadius: 6,
            background: 'var(--warning-soft)',
            color: 'var(--warning)',
            padding: '8px 12px',
            fontSize: '0.85rem',
          }}
        >
          <AlertTriangle size={15} style={{ marginTop: 2, flexShrink: 0 }} />
          {warning} — tạo hồ sơ mới với chữ ký/mộc đang dùng để thay thế.
        </p>
      )}

      <div
        className="flex items-center justify-center"
        style={{
          height: 150,
          borderRadius: 6,
          border: '1px solid var(--rule)',
          background: 'var(--paper-deep)',
          color: unit?.color ?? 'var(--ink-muted)',
        }}
      >
        <IdCard size={64} strokeWidth={1.1} />
      </div>

      <button
        type="button"
        className="btn-secondary"
        style={{ width: '100%', justifyContent: 'center' }}
        onClick={onRecreate}
      >
        <PenTool size={14} /> Sửa chữ ký / mộc / chức danh
      </button>

      <div className="card" style={{ padding: 16 }}>
        <InfoRow label="Đơn vị">
          <UnitPill unit={unit} />
        </InfoRow>
        <InfoRow label="Người ký">{signature?.full_name ?? '—'}</InfoRow>
        <InfoRow label="Mộc">{seal?.name ?? '—'}</InfoRow>
        <InfoRow label="Trạng thái">
          <Pill variant={profile.is_active ? 'success' : 'draft'} dot={profile.is_active}>
            {profile.is_active ? 'Đang dùng' : 'Ngừng dùng'}
          </Pill>
        </InfoRow>
        <p className="cell-meta" style={{ paddingTop: 8 }}>
          Người ký và mộc không đổi được (chống nhầm). Cần đổi → tạo hồ sơ mới, ngừng dùng hồ sơ này.
        </p>
      </div>

      <div>
        <label className="field-label" htmlFor="ep_title">
          Chức danh hiển thị
        </label>
        <input
          id="ep_title"
          className="text-input"
          value={displayTitle}
          onChange={(e) => setDisplayTitle(e.target.value)}
        />
      </div>
      <div>
        <label className="field-label" htmlFor="ep_name">
          Tên hồ sơ
        </label>
        <input id="ep_name" className="text-input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
    </Drawer>
  );
}
