import { useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  FileText,
  Hash,
  Layers,
  PenTool,
  ShieldAlert,
  Stamp,
  Upload,
  UploadCloud,
} from 'lucide-react';

import { api, type ApiErrorEnvelope } from '~/lib/api';
import { useAuth } from '~/stores/auth';
import { type UnitLite } from '~/components/sign-ui';

export const Route = createFileRoute('/cong-van-di/soan')({
  component: SoanCongVanPage,
});

interface DocType {
  id: number;
  direction: string;
  unit_id: number | null;
  name: string;
  code: string;
  next_number: number;
}
interface Profile {
  id: number;
  unit_id: number;
  signature_id: number;
  seal_id: number;
  display_title: string;
  name: string;
  is_active: boolean;
}
interface OrgRow {
  id: number;
  full_name: string;
  category: 'common' | 'gdnn' | 'dvdl';
}
type RangeKind = 'none' | 'all' | 'range';
interface RangeOpt {
  kind: RangeKind;
  page_from?: number;
  page_to?: number;
}

const STEPS = [
  { id: 1, label: 'Tải file gốc', icon: UploadCloud },
  { id: 2, label: 'Thông tin công văn', icon: FileText },
  { id: 3, label: 'Đơn vị & Hồ sơ ký', icon: PenTool },
  { id: 4, label: 'Vị trí mộc / chữ ký', icon: Stamp },
  { id: 5, label: 'Giáp lai & Ký nháy', icon: Layers },
  { id: 6, label: 'Xác nhận & Cấp số', icon: ShieldAlert },
  { id: 7, label: 'Tải PDF ký số', icon: Download },
] as const;

function errMsg(error: unknown, fallback: string): string {
  return (error as ApiErrorEnvelope | undefined)?.error?.message ?? fallback;
}
function todayISO(): string {
  // Ngày LOCAL (trình duyệt user VN = giờ Asia/Saigon) — KHÔNG dùng toISOString (UTC, lùi ngày).
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function unitCategory(u: UnitLite | undefined): 'gdnn' | 'dvdl' | null {
  if (!u) return null;
  return u.code.toUpperCase().includes('GDNN') ? 'gdnn' : 'dvdl';
}

function SoanCongVanPage() {
  const me = useAuth((s) => s.user);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false); // khoá ĐỒNG BỘ (state không kịp flush giữa 2 click)

  // Dữ liệu wizard
  const [file, setFile] = useState<File | null>(null);
  const [subject, setSubject] = useState('');
  const [docTypeId, setDocTypeId] = useState<number | null>(null);
  const [issueDate, setIssueDate] = useState(todayISO());
  const [recipientIds, setRecipientIds] = useState<number[]>([]);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [giapLai, setGiapLai] = useState<RangeOpt>({ kind: 'none' });
  const [kyNhay, setKyNhay] = useState<RangeOpt>({ kind: 'none' });
  const [capSoMode, setCapSoMode] = useState<'auto' | 'manual'>('auto');
  const [manualNumber, setManualNumber] = useState('');

  const [draftId, setDraftId] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [issuedNumber, setIssuedNumber] = useState<string | null>(null);

  const { data: unitsData } = useQuery({
    queryKey: ['units'],
    enabled: !!me,
    queryFn: async () => (await api.GET('/api/units', {})).data as { items: UnitLite[] },
  });
  const units = useMemo(() => unitsData?.items ?? [], [unitsData]);

  const { data: docTypesData } = useQuery({
    queryKey: ['document-types'],
    enabled: !!me,
    queryFn: async () => (await api.GET('/api/document-types', {})).data as { items: DocType[] },
  });
  const outTypes = useMemo(
    () => (docTypesData?.items ?? []).filter((t) => t.direction === 'out'),
    [docTypesData],
  );

  const { data: profilesData } = useQuery({
    queryKey: ['signing-profiles', false],
    enabled: !!me,
    queryFn: async () =>
      (await api.GET('/api/signing-profiles', { params: { query: { include_inactive: false } } }))
        .data as { items: Profile[] },
  });
  const profiles = useMemo(() => profilesData?.items ?? [], [profilesData]);

  const { data: orgsData } = useQuery({
    queryKey: ['organizations', 'recipient-all'],
    enabled: !!me,
    queryFn: async () =>
      (await api.GET('/api/organizations', { params: { query: { role: 'recipient', size: 100 } } }))
        .data as { items: OrgRow[] },
  });
  const recipients = useMemo(() => orgsData?.items ?? [], [orgsData]);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const docType = outTypes.find((t) => t.id === docTypeId);
  const unitId = docType?.unit_id ?? null;
  const unit = units.find((u) => u.id === unitId);
  const unitProfiles = profiles.filter((p) => p.unit_id === unitId && p.is_active);
  const cat = unitCategory(unit);
  const visibleRecipients = recipients.filter((o) => !cat || o.category === 'common' || o.category === cat);

  function sealingOption() {
    return { giap_lai: giapLai, ky_nhay: kyNhay };
  }

  async function ensureDraft(): Promise<number> {
    const body = {
      unit_id: unitId,
      doc_type_id: docTypeId,
      subject: subject.trim(),
      issue_date: issueDate,
      recipient_ids: recipientIds,
      signing_profile_id: profileId,
      sealing_option: sealingOption(),
    };
    if (draftId === null) {
      const { data, error } = await api.POST('/api/outgoing', { body });
      if (error || !data) throw new Error(errMsg(error, 'Tạo bản nháp thất bại'));
      const id = (data as { id: number }).id;
      // Upload file gốc (multipart) — qua fetch vì là binary.
      const form = new FormData();
      form.append('file', file as File);
      const res = await fetch(`/api/outgoing/${id}/file`, { method: 'POST', body: form, credentials: 'include' });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as ApiErrorEnvelope | null;
        throw new Error(b?.error?.message ?? 'Tải file lên thất bại');
      }
      setDraftId(id);
      return id;
    }
    const { error } = await api.PATCH('/api/outgoing/{doc_id}', {
      params: { path: { doc_id: draftId } },
      body,
    });
    if (error) throw new Error(errMsg(error, 'Cập nhật nháp thất bại'));
    return draftId;
  }

  async function doPreview() {
    if (busyRef.current) return;
    busyRef.current = true;
    setErr(null);
    setBusy(true);
    try {
      const id = await ensureDraft();
      const res = await fetch(`/api/outgoing/${id}/preview`, { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as ApiErrorEnvelope | null;
        throw new Error(b?.error?.message ?? 'Không tạo được bản xem trước');
      }
      const blob = await res.blob();
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }

  async function doIssue() {
    if (busyRef.current) return;
    busyRef.current = true;
    setErr(null);
    setBusy(true);
    try {
      const id = await ensureDraft();
      const body =
        capSoMode === 'manual'
          ? { manual_number: Number(manualNumber.trim()) }
          : { manual_number: null };
      const { data, error } = await api.POST('/api/outgoing/{doc_id}/number', {
        params: { path: { doc_id: id } },
        body,
      });
      if (error || !data) throw new Error(errMsg(error, 'Cấp số thất bại'));
      setIssuedNumber((data as { number: string }).number);
      await queryClient.invalidateQueries({ queryKey: ['outgoing'] }); // CV mới hiện ngay trong sổ
      setStep(7);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }

  function canNext(): string | null {
    if (step === 1 && !file) return 'Chọn file công văn (PDF) để tiếp tục';
    if (step === 2) {
      if (!subject.trim()) return 'Nhập trích yếu';
      if (!docTypeId) return 'Chọn loại văn bản';
      if (!issueDate) return 'Chọn ngày phát hành';
    }
    if (step === 3 && !profileId) return 'Chọn hồ sơ ký (chống nhầm mộc)';
    if (step === 5) {
      for (const r of [giapLai, kyNhay]) {
        if (r.kind === 'range') {
          if (!r.page_from || !r.page_to) return 'Nhập khoảng trang (từ … đến …)';
          if (r.page_from > r.page_to) return 'Trang bắt đầu phải ≤ trang kết thúc';
        }
      }
    }
    if (step === 6 && capSoMode === 'manual' && !manualNumber.trim())
      return 'Nhập số có sẵn (hoặc chọn “Tự cấp số”)';
    return null;
  }

  function pickFile(f: File | null) {
    setErr(null);
    if (f && f.size > 50 * 1024 * 1024) {
      setErr('File vượt quá 50MB');
      return;
    }
    if (f && f.type !== 'application/pdf') {
      setErr('Hiện chỉ hỗ trợ file PDF');
      return;
    }
    setFile(f);
  }

  async function next() {
    const blocker = canNext();
    if (blocker) {
      setErr(blocker);
      return;
    }
    setErr(null);
    if (step === 3) {
      setStep(4);
      void doPreview(); // sang bước vị trí → render preview
      return;
    }
    if (step === 6) {
      await doIssue();
      return;
    }
    setStep((s) => Math.min(7, s + 1));
  }

  if (!me) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-10">
        <p className="text-slate-500">Đang tải…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">Công văn đi</p>
          <h2 className="text-2xl font-semibold text-slate-800">Soạn công văn đi</h2>
          <p className="mt-1 text-sm text-slate-500">
            Tải file → chèn mộc/chữ ký → cấp số → tải PDF sẵn sàng ký số.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate({ to: '/cong-van-di' })}
          className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
        >
          <ArrowLeft size={15} /> Danh sách
        </button>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Step rail */}
        <div className="w-full shrink-0 rounded-lg border border-slate-200 bg-white p-3 lg:max-w-[260px]">
          <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Các bước</p>
          <div className="flex flex-col gap-0.5">
            {STEPS.map((s) => {
              const done = s.id < step;
              const active = s.id === step;
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  type="button"
                  // Khoá lại bước 1 sau khi đã tạo nháp + upload file (đổi file giữa chừng dễ lệch).
                  onClick={() => s.id < step && !(s.id === 1 && draftId !== null) && setStep(s.id)}
                  disabled={s.id > step || (s.id === 1 && draftId !== null)}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm ${
                    active ? 'bg-amber-50 font-semibold text-amber-700' : 'text-slate-600'
                  } ${s.id < step ? 'cursor-pointer hover:bg-slate-50' : ''} ${s.id > step ? 'opacity-50' : ''}`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                      done ? 'bg-green-500 text-white' : active ? 'bg-amber-400 text-slate-900' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {done ? <Check size={13} /> : <Icon size={13} />}
                  </span>
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Step content */}
        <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white p-6">
          {err && (
            <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {err}
            </div>
          )}

          {step === 1 && <StepUpload file={file} onPick={pickFile} />}

          {step === 2 && (
            <Step2
              subject={subject}
              setSubject={setSubject}
              docTypeId={docTypeId}
              setDocTypeId={setDocTypeId}
              outTypes={outTypes}
              units={units}
              issueDate={issueDate}
              setIssueDate={setIssueDate}
              recipients={visibleRecipients}
              recipientIds={recipientIds}
              setRecipientIds={setRecipientIds}
            />
          )}

          {step === 3 && (
            <Step3 unit={unit} profiles={unitProfiles} profileId={profileId} setProfileId={setProfileId} />
          )}

          {step === 4 && <StepPreview previewUrl={previewUrl} busy={busy} onReload={doPreview} />}

          {step === 5 && (
            <Step5 giapLai={giapLai} setGiapLai={setGiapLai} kyNhay={kyNhay} setKyNhay={setKyNhay} onPreview={doPreview} previewUrl={previewUrl} busy={busy} />
          )}

          {step === 6 && (
            <Step6
              unit={unit}
              nextNumber={docType?.next_number}
              capSoMode={capSoMode}
              setCapSoMode={setCapSoMode}
              manualNumber={manualNumber}
              setManualNumber={setManualNumber}
            />
          )}

          {step === 7 && <Step7 number={issuedNumber} docId={draftId} onDone={() => navigate({ to: '/cong-van-di' })} />}

          {step < 7 && (
            <div className="mt-7 flex items-center justify-between border-t pt-5">
              <button
                type="button"
                disabled={step === 1 || busy}
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                className="flex items-center gap-1.5 rounded-md border border-slate-300 px-4 py-2 text-sm disabled:opacity-40"
              >
                <ArrowLeft size={15} /> Quay lại
              </button>
              <span className="text-xs text-slate-400">Bước {step} / {STEPS.length}</span>
              <button
                type="button"
                disabled={busy}
                onClick={next}
                className="flex items-center gap-1.5 rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-500 disabled:opacity-60"
              >
                {busy ? 'Đang xử lý…' : step === 6 ? 'Xác nhận phát hành' : 'Tiếp tục'}
                {!busy && <ArrowRight size={15} />}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500';
const fieldClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100';

function StepUpload({ file, onPick }: { file: File | null; onPick: (f: File | null) => void }) {
  return (
    <div>
      <h3 className="mb-4 text-lg font-semibold text-slate-800">Tải file công văn gốc</h3>
      <label
        htmlFor="cv_file"
        className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center hover:border-amber-300"
      >
        <UploadCloud size={40} className="text-amber-500" strokeWidth={1.25} />
        <span className="font-medium text-slate-700">Bấm để chọn file PDF</span>
        <span className="text-xs text-slate-400">PDF — tối đa 50MB</span>
        <input
          id="cv_file"
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
      </label>
      {file && (
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <FileText size={15} className="text-amber-500" /> {file.name}
        </p>
      )}
      <p className="mt-3 text-xs text-slate-400">
        Hiện hỗ trợ PDF. Chuyển đổi Word→PDF (LibreOffice) sẽ bổ sung sau.
      </p>
    </div>
  );
}

function Step2(props: {
  subject: string;
  setSubject: (v: string) => void;
  docTypeId: number | null;
  setDocTypeId: (v: number) => void;
  outTypes: DocType[];
  units: UnitLite[];
  issueDate: string;
  setIssueDate: (v: string) => void;
  recipients: OrgRow[];
  recipientIds: number[];
  setRecipientIds: (v: number[]) => void;
}) {
  const { recipients, recipientIds, setRecipientIds } = props;
  function toggle(id: number) {
    setRecipientIds(
      recipientIds.includes(id) ? recipientIds.filter((x) => x !== id) : [...recipientIds, id],
    );
  }
  return (
    <div>
      <h3 className="mb-4 text-lg font-semibold text-slate-800">Thông tin công văn</h3>
      <div className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="cv_subject">Trích yếu</label>
          <textarea
            id="cv_subject"
            rows={2}
            className={fieldClass}
            placeholder="V/v …"
            value={props.subject}
            onChange={(e) => props.setSubject(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="cv_type">Loại văn bản (sổ đi)</label>
            <select
              id="cv_type"
              className={fieldClass}
              value={props.docTypeId ?? ''}
              onChange={(e) => props.setDocTypeId(Number(e.target.value))}
            >
              <option value="" disabled>— Chọn loại —</option>
              {props.outTypes.map((t) => {
                const u = props.units.find((x) => x.id === t.unit_id);
                return (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code}) — {u?.short_name ?? u?.code ?? '?'}
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="cv_date">Ngày phát hành</label>
            <input id="cv_date" type="date" className={fieldClass} value={props.issueDate} onChange={(e) => props.setIssueDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={labelClass}>Nơi nhận (chọn từ danh bạ)</label>
          {recipients.length === 0 ? (
            <p className="text-sm text-slate-400">Chưa có nơi nhận trong danh bạ — thêm ở mục Danh bạ.</p>
          ) : (
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
              {recipients.map((o) => (
                <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50">
                  <input type="checkbox" checked={recipientIds.includes(o.id)} onChange={() => toggle(o.id)} className="rounded border-slate-300" />
                  {o.full_name}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Step3({
  unit,
  profiles,
  profileId,
  setProfileId,
}: {
  unit: UnitLite | undefined;
  profiles: Profile[];
  profileId: number | null;
  setProfileId: (v: number) => void;
}) {
  return (
    <div>
      <h3 className="mb-4 text-lg font-semibold text-slate-800">Đơn vị phát hành &amp; hồ sơ ký</h3>
      <div className="mb-4 flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm">
        <span className="text-slate-500">Đơn vị phát hành:</span>
        <span className="font-medium text-slate-800">{unit?.full_name ?? '— (chọn loại VB ở bước trước)'}</span>
      </div>
      <label className={labelClass}>Hồ sơ ký (lọc theo đơn vị — chống nhầm mộc)</label>
      {profiles.length === 0 ? (
        <p className="text-sm text-amber-600">Đơn vị này chưa có hồ sơ ký đang dùng. Tạo ở mục Hồ sơ ký.</p>
      ) : (
        <div className="space-y-2">
          {profiles.map((p) => (
            <label
              key={p.id}
              className={`flex cursor-pointer items-center gap-3 rounded-md border p-3.5 ${
                profileId === p.id ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <input type="radio" name="profile" checked={profileId === p.id} onChange={() => setProfileId(p.id)} />
              <div>
                <div className="font-medium text-slate-800">{p.name}</div>
                <div className="text-xs text-slate-500">Chức danh: {p.display_title}</div>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function StepPreview({ previewUrl, busy, onReload }: { previewUrl: string | null; busy: boolean; onReload: () => void }) {
  return (
    <div>
      <h3 className="mb-2 text-lg font-semibold text-slate-800">Vị trí mộc &amp; chữ ký</h3>
      <p className="mb-4 text-sm text-slate-500">
        Hệ thống tự đặt mộc + chữ ký ở góc dưới phải trang cuối. Xem trước bên dưới (kéo-thả tinh chỉnh sẽ bổ sung sau).
      </p>
      <PreviewFrame previewUrl={previewUrl} busy={busy} onReload={onReload} />
    </div>
  );
}

function PreviewFrame({ previewUrl, busy, onReload }: { previewUrl: string | null; busy: boolean; onReload: () => void }) {
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button type="button" onClick={onReload} disabled={busy} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50">
          {busy ? 'Đang tạo…' : 'Tạo lại bản xem trước'}
        </button>
      </div>
      <div className="h-[480px] overflow-hidden rounded-md border border-slate-200 bg-slate-50">
        {busy && !previewUrl ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">Đang tạo bản xem trước…</div>
        ) : previewUrl ? (
          <iframe src={previewUrl} title="Xem trước công văn" className="h-full w-full" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">Chưa có bản xem trước.</div>
        )}
      </div>
    </div>
  );
}

function RangeSeg({ value, onChange }: { value: RangeOpt; onChange: (v: RangeOpt) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-1 rounded-md border border-slate-200 bg-slate-50 p-0.5">
        {(['none', 'all', 'range'] as RangeKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onChange({ ...value, kind: k })}
            className={`flex-1 rounded px-3 py-1.5 text-sm font-medium ${
              value.kind === k ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            {k === 'none' ? 'Không' : k === 'all' ? 'Toàn bộ' : 'Theo khoảng trang'}
          </button>
        ))}
      </div>
      {value.kind === 'range' && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Từ trang</span>
          <input
            type="number"
            min={1}
            value={value.page_from ?? ''}
            onChange={(e) => onChange({ ...value, page_from: Number(e.target.value) || undefined })}
            className="w-20 rounded-md border border-slate-300 px-2 py-1"
          />
          <span className="text-slate-500">đến</span>
          <input
            type="number"
            min={1}
            value={value.page_to ?? ''}
            onChange={(e) => onChange({ ...value, page_to: Number(e.target.value) || undefined })}
            className="w-20 rounded-md border border-slate-300 px-2 py-1"
          />
        </div>
      )}
    </div>
  );
}

function Step5({
  giapLai,
  setGiapLai,
  kyNhay,
  setKyNhay,
  onPreview,
  previewUrl,
  busy,
}: {
  giapLai: RangeOpt;
  setGiapLai: (v: RangeOpt) => void;
  kyNhay: RangeOpt;
  setKyNhay: (v: RangeOpt) => void;
  onPreview: () => void;
  previewUrl: string | null;
  busy: boolean;
}) {
  return (
    <div>
      <h3 className="mb-4 text-lg font-semibold text-slate-800">Đóng giáp lai &amp; ký nháy</h3>
      <div className="space-y-5">
        <div>
          <label className={labelClass}>Đóng giáp lai (dùng chính mộc của hồ sơ ký)</label>
          <RangeSeg value={giapLai} onChange={setGiapLai} />
        </div>
        <div>
          <label className={labelClass}>Ký nháy mỗi trang (trừ trang cuối)</label>
          <RangeSeg value={kyNhay} onChange={setKyNhay} />
        </div>
        <PreviewFrame previewUrl={previewUrl} busy={busy} onReload={onPreview} />
      </div>
    </div>
  );
}

function Step6({
  unit,
  nextNumber,
  capSoMode,
  setCapSoMode,
  manualNumber,
  setManualNumber,
}: {
  unit: UnitLite | undefined;
  nextNumber: number | undefined;
  capSoMode: 'auto' | 'manual';
  setCapSoMode: (v: 'auto' | 'manual') => void;
  manualNumber: string;
  setManualNumber: (v: string) => void;
}) {
  return (
    <div>
      <h3 className="mb-4 text-lg font-semibold text-slate-800">Xác nhận chống nhầm mộc</h3>
      <div className="mb-5 flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3">
        <ShieldAlert size={20} className="mt-0.5 shrink-0 text-amber-600" />
        <p className="text-sm text-slate-800">
          Phát hành công văn với mộc của{' '}
          <strong>{(unit?.full_name ?? 'đơn vị đã chọn').toUpperCase()}</strong>. Đúng chứ?
        </p>
      </div>

      <label className={labelClass}>Cấp số công văn</label>
      <div className="space-y-2">
        <label className={`flex cursor-pointer items-center gap-3 rounded-md border p-3.5 ${capSoMode === 'auto' ? 'border-amber-400 bg-amber-50' : 'border-slate-200'}`}>
          <input type="radio" name="capso" checked={capSoMode === 'auto'} onChange={() => setCapSoMode('auto')} />
          <div className="flex-1">
            <div className="font-medium text-slate-800">Tự cấp số</div>
            <div className="text-xs text-slate-500">
              Hệ thống sinh số kế tiếp theo sổ (atomic, không trùng).
              {nextNumber ? ` Số kế tiếp dự kiến: ~${nextNumber}.` : ''}
            </div>
          </div>
          <Hash size={16} className="text-slate-400" />
        </label>
        <label className={`flex cursor-pointer items-center gap-3 rounded-md border p-3.5 ${capSoMode === 'manual' ? 'border-amber-400 bg-amber-50' : 'border-slate-200'}`}>
          <input type="radio" name="capso" checked={capSoMode === 'manual'} onChange={() => setCapSoMode('manual')} />
          <div className="flex-1">
            <div className="font-medium text-slate-800">Dùng số có sẵn</div>
            <div className="text-xs text-slate-500">Nhập số đã in trên file — hệ thống kiểm tra trùng + đồng bộ sổ.</div>
            {capSoMode === 'manual' && (
              <input
                type="number"
                min={1}
                value={manualNumber}
                onChange={(e) => setManualNumber(e.target.value)}
                placeholder="VD: 247"
                className="mt-2 w-32 rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
            )}
          </div>
        </label>
      </div>
    </div>
  );
}

function Step7({ number, docId, onDone }: { number: string | null; docId: number | null; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function uploadSigned(f: File) {
    if (docId === null) return;
    setErr(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', f);
      const res = await fetch(`/api/outgoing/${docId}/signed-file`, { method: 'POST', body: form, credentials: 'include' });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as ApiErrorEnvelope | null;
        throw new Error(b?.error?.message ?? 'Tải bản ký số thất bại');
      }
      setPublished(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-green-100">
          <Check size={24} className="text-green-600" />
        </span>
        <div>
          <h3 className="text-lg font-semibold text-slate-800">
            {published ? 'Đã phát hành' : 'Đã cấp số — chờ ký số'}
          </h3>
          <div className="font-mono text-amber-700">{number}</div>
        </div>
      </div>

      {err && (
        <div role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      )}

      <div className="space-y-3">
        <div className="rounded-md border border-slate-200 p-4">
          <div className="font-medium text-slate-800">1. Tải PDF chưa ký số &amp; ký bằng USB Token</div>
          <p className="mb-3 mt-1 text-sm text-slate-500">
            Mở file bằng vSign + USB Token Viettel-CA để ký số (ngoài hệ thống), rồi quay lại tải lên.
          </p>
          <button
            type="button"
            disabled={docId === null}
            onClick={() => docId !== null && window.open(`/api/outgoing/${docId}/download`, '_blank')}
            className="flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
          >
            <Download size={15} /> Tải PDF (_CHUA_KY_SO)
          </button>
        </div>

        <div className="rounded-md border border-slate-200 p-4">
          <div className="font-medium text-slate-800">2. Tải lên bản đã ký số → hoàn tất phát hành</div>
          <p className="mb-3 mt-1 text-sm text-slate-500">
            Hệ thống kiểm tra số CV trong tên file (chống nhầm) rồi chuyển “Đã phát hành”.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadSigned(f);
              e.target.value = '';
            }}
          />
          {published ? (
            <span className="flex items-center gap-1.5 text-sm font-medium text-green-700">
              <Check size={15} /> Đã phát hành công văn.
            </span>
          ) : (
            <button
              type="button"
              disabled={busy || docId === null}
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-500 disabled:opacity-60"
            >
              <Upload size={15} /> {busy ? 'Đang tải…' : 'Tải lên bản đã ký số'}
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <button type="button" onClick={onDone} className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
          {published ? 'Xong, về danh sách' : 'Để sau, về danh sách'}
        </button>
      </div>
    </div>
  );
}
