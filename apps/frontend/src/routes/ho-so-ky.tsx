import { useMemo, useState, type ReactNode } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Check, IdCard, PenTool, Plus, Save, Stamp, X } from 'lucide-react';

import { api, type ApiErrorEnvelope } from '~/lib/api';
import { useAuth } from '~/stores/auth';
import { MocChuKyTabs } from '~/components/MocChuKyTabs';
import { StatusPill, UnitPill, type UnitLite } from '~/components/sign-ui';

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

  const sigById = new Map((sigsQuery.data?.items ?? []).map((s) => [s.id, s]));
  const sealById = new Map((sealsQuery.data?.items ?? []).map((s) => [s.id, s]));
  const profiles = profilesQuery.data?.items ?? [];
  // Chỉ tính cảnh báo asset-inactive khi đã tải xong chữ ký + mộc (tránh lóe sai lúc loading).
  const assetsReady = sigsQuery.isSuccess && sealsQuery.isSuccess;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">Mộc &amp; Chữ ký</p>
          <h2 className="text-2xl font-semibold text-slate-800">Hồ sơ ký</h2>
          <p className="mt-1 text-sm text-slate-500">
            Mỗi hồ sơ = người ký + chữ ký + chức danh + mộc cùng đơn vị → chọn 1 lần là áp đủ, chống nhầm mộc.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 rounded-md bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-500"
        >
          <Plus size={16} />
          Tạo hồ sơ ký
        </button>
      </div>

      <MocChuKyTabs />

      {profilesQuery.isLoading ? (
        <p className="py-10 text-center text-slate-400">Đang tải…</p>
      ) : profiles.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white py-12 text-center text-slate-400">
          Chưa có hồ sơ ký nào. Bấm “Tạo hồ sơ ký” để bắt đầu.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
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
          onClose={() => setSelected(null)}
        />
      )}
    </div>
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
      className={`flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-amber-300 hover:shadow-sm ${
        profile.is_active ? '' : 'opacity-60'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <UnitPill unit={unit} />
        <StatusPill active={profile.is_active} />
      </div>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
          <IdCard size={20} />
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-800" title={profile.name}>
            {profile.name}
          </p>
          <p className="truncate text-xs text-slate-500">
            {signature?.full_name ?? '—'} + {seal?.name ?? '—'}
          </p>
        </div>
      </div>
      {warning && (
        <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-700">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          {warning}
        </p>
      )}
    </button>
  );
}

/* ─────────────────────────── Tạo hồ sơ ký (form 2 cột + live preview) ─────────────────────────── */

const fieldClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100';
const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500';

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
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <button type="button" aria-label="Đóng" onClick={onClose} className="fixed inset-0 bg-slate-900/40" />
      <div className="relative z-10 w-full max-w-4xl rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">Hồ sơ ký</p>
            <h3 className="text-lg font-semibold text-slate-800">Tạo hồ sơ ký</h3>
          </div>
          <button type="button" onClick={onClose} className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100">
            <ArrowLeft size={15} /> Quay lại
          </button>
        </div>

        <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Form */}
          <div className="min-w-0 space-y-5">
            {serverError && (
              <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {serverError}
              </div>
            )}

            <div>
              <label className={labelClass}>1. Đơn vị</label>
              <div className="grid grid-cols-2 gap-2">
                {units.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => chooseUnit(u.id)}
                    className={`rounded-md border px-3 py-2.5 text-sm font-medium ${
                      unitId === u.id
                        ? 'border-amber-400 bg-amber-50 text-amber-700'
                        : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {u.short_name ?? u.full_name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={labelClass}>2. Chữ ký (lọc theo đơn vị)</label>
              {!unitId ? (
                <p className="text-sm text-slate-400">Chọn đơn vị trước.</p>
              ) : sigOptions.length === 0 ? (
                <p className="text-sm text-amber-600">Đơn vị này chưa có chữ ký đang dùng. Thêm ở tab Chữ ký.</p>
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
              <label className={labelClass}>
                3. Mộc đi kèm {unit ? `(chỉ mộc ${unit.short_name ?? unit.code} — chống nhầm)` : ''}
              </label>
              {!unitId ? (
                <p className="text-sm text-slate-400">Chọn đơn vị trước.</p>
              ) : sealOptions.length === 0 ? (
                <p className="text-sm text-amber-600">Đơn vị này chưa có mộc đang dùng. Thêm ở tab Mộc.</p>
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
                <label className={labelClass}>4. Chức danh hiển thị trên CV</label>
                <input
                  className={fieldClass}
                  placeholder="VD: GIÁM ĐỐC"
                  value={displayTitle}
                  onChange={(e) => setDisplayTitle(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>5. Tên hồ sơ (ngắn gọn)</label>
                <input
                  className={fieldClass}
                  placeholder="VD: GĐ TT GDNN"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={submit}
              disabled={create.isPending}
              className="flex items-center gap-2 rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-500 disabled:opacity-60"
            >
              <Save size={15} /> Lưu hồ sơ ký
            </button>
          </div>

          {/* Live preview block ký */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Xem trước block ký</p>
            <div className="mb-4 flex items-center justify-between">
              <UnitPill unit={unit} />
              {unit && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  Cùng đơn vị
                </span>
              )}
            </div>

            <div className="rounded-md border border-slate-200 bg-white px-4 py-5 text-center">
              <div className="text-sm font-bold uppercase tracking-wide text-slate-800">
                {displayTitle || 'CHỨC DANH'}
              </div>
              <div className="relative mx-auto mt-2 flex h-28 items-center justify-center">
                {seal ? (
                  <img
                    src={`/api/seals/${seal.id}/image`}
                    alt={seal.name}
                    className="absolute top-0 h-20 w-20 object-contain opacity-70"
                  />
                ) : (
                  <span className="absolute top-0 flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-slate-300 text-[10px] text-slate-400">
                    Mộc
                  </span>
                )}
                {sig ? (
                  <img
                    src={`/api/signatures/${sig.id}/image`}
                    alt={sig.full_name}
                    className="absolute bottom-1 h-14 max-w-[140px] object-contain"
                  />
                ) : (
                  <span className="absolute bottom-3 text-xs text-slate-400">Chữ ký</span>
                )}
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-800">{sig?.full_name ?? 'Người ký'}</div>
            </div>

            <p className="mt-3 text-xs text-slate-400">
              Khi soạn CV, chọn hồ sơ này sẽ tự áp chữ ký + mộc + chức danh ở trên. Mộc luôn cùng đơn vị với chữ ký.
            </p>
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
      className={`flex items-center gap-3 rounded-md border px-3 py-2.5 text-left ${
        active ? 'border-amber-400 bg-amber-50' : 'border-slate-300 hover:bg-slate-50'
      }`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-800">{title}</span>
        {sub && <span className="block truncate text-xs text-slate-500">{sub}</span>}
      </span>
      {active && <Check size={15} className="shrink-0 text-green-600" />}
    </button>
  );
}

/* ─────────────────────────── Sửa hồ sơ ─────────────────────────── */

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40">
      <button type="button" aria-label="Đóng" onClick={onClose} className="absolute inset-0 bg-slate-900/30" />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">Hồ sơ ký · Chỉnh sửa</p>
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

function EditDrawer({
  profile,
  unit,
  signature,
  seal,
  onClose,
}: {
  profile: ProfileRow;
  unit: UnitLite | undefined;
  signature: SignatureRow | undefined;
  seal: SealRow | undefined;
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
    <Drawer title={profile.name} onClose={onClose}>
      {serverError && (
        <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {serverError}
        </div>
      )}
      {warning && (
        <p className="mb-4 flex items-start gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {warning} — tạo hồ sơ mới với chữ ký/mộc đang dùng để thay thế.
        </p>
      )}

      <div className="mb-5 space-y-2 rounded-md border border-slate-200 p-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Đơn vị</span>
          <UnitPill unit={unit} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Người ký</span>
          <span className="text-slate-700">{signature?.full_name ?? '—'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Mộc</span>
          <span className="text-slate-700">{seal?.name ?? '—'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Trạng thái</span>
          <StatusPill active={profile.is_active} />
        </div>
        <p className="pt-1 text-xs text-slate-400">
          Người ký và mộc không đổi được (chống nhầm). Cần đổi → tạo hồ sơ mới, ngừng dùng hồ sơ này.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="ep_title">Chức danh hiển thị</label>
          <input id="ep_title" className={fieldClass} value={displayTitle} onChange={(e) => setDisplayTitle(e.target.value)} />
        </div>
        <div>
          <label className={labelClass} htmlFor="ep_name">Tên hồ sơ</label>
          <input id="ep_name" className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => toggleActive.mutate()}
            disabled={toggleActive.isPending}
            className={`mr-auto rounded-md border px-3 py-2 text-sm disabled:opacity-60 ${
              profile.is_active
                ? 'border-red-200 text-red-600 hover:bg-red-50'
                : 'border-green-200 text-green-700 hover:bg-green-50'
            }`}
          >
            {profile.is_active ? 'Ngừng dùng' : 'Kích hoạt'}
          </button>
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm">
            Huỷ
          </button>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-500 disabled:opacity-60"
          >
            Lưu
          </button>
        </div>
      </div>
    </Drawer>
  );
}
