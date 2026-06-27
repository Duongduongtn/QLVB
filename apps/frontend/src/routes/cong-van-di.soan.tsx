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
import { PageHeader } from '~/components/ui';
import { UnitPill, type UnitLite } from '~/components/sign-ui';

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

// Hộp cảnh báo lỗi — dùng chung token "giấy + vàng kinpaku".
function ErrorBox({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        marginBottom: 16,
        padding: '10px 14px',
        borderRadius: 6,
        background: 'var(--danger-soft)',
        border: '1px solid var(--danger)',
        color: 'var(--danger)',
        fontSize: '0.85rem',
      }}
    >
      {message}
    </div>
  );
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
  const [replyToId, setReplyToId] = useState<number | null>(null);
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

  // CV đến đã vào sổ — để liên kết "phản hồi" (D5).
  const { data: incomingData } = useQuery({
    queryKey: ['incoming', 'reply-picker'],
    enabled: !!me,
    queryFn: async () => {
      const res = await api.GET('/api/incoming', { params: { query: { status: 'registered', size: 100 } } });
      return (res.data ?? { items: [] }) as { items: { id: number; number: string | null; subject: string | null }[] };
    },
  });
  const incomingDocs = useMemo(() => incomingData?.items ?? [], [incomingData]);
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

  async function pollConvert(id: number, taskId: string): Promise<void> {
    for (let i = 0; i < 30; i++) {
      // ~30s (convert Word ≤10s; nới biên cho worker cold-start)
      await new Promise((r) => setTimeout(r, 1000));
      const res = await fetch(`/api/outgoing/${id}/finalize-convert?task_id=${encodeURIComponent(taskId)}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) continue;
      const body = (await res.json()) as { status: string; message?: string };
      if (body.status === 'done') return;
      if (body.status === 'error') throw new Error(body.message ?? 'Chuyển Word sang PDF thất bại');
    }
    throw new Error('Chuyển Word sang PDF quá lâu (worker chưa chạy?) — thử tải file PDF');
  }

  async function ensureDraft(): Promise<number> {
    const body = {
      unit_id: unitId,
      doc_type_id: docTypeId,
      subject: subject.trim(),
      issue_date: issueDate,
      recipient_ids: recipientIds,
      signing_profile_id: profileId,
      in_reply_to_incoming_id: replyToId,
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
      const up = (await res.json()) as { status: string; task_id?: string };
      if (up.status === 'converting' && up.task_id) {
        await pollConvert(id, up.task_id); // Word → chờ worker convert sang PDF
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
    // Chấp nhận PDF hoặc Word (.docx/.doc — backend tự convert sang PDF bằng LibreOffice).
    if (f && !/\.(pdf|docx|doc)$/i.test(f.name)) {
      setErr('Hỗ trợ file PDF hoặc Word (.docx/.doc)');
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
      <div style={{ padding: '40px 0' }}>
        <p className="cell-meta">Đang tải…</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Công văn đi', to: '/cong-van-di' }, { label: 'Soạn mới' }]}
        title="Soạn công văn đi"
        subhead="Quy trình phát hành: tải file → chèn mộc/ký → cấp số → tải PDF sẵn sàng ký số"
        actions={
          <button type="button" className="btn-ghost" onClick={() => navigate({ to: '/cong-van-di' })}>
            <ArrowLeft size={14} /> Quay lại danh sách
          </button>
        }
      />

      <div className="flex flex-col lg:flex-row" style={{ gap: 24, alignItems: 'flex-start' }}>
        {/* Step rail */}
        <div className="card" style={{ padding: 16, width: '100%', maxWidth: 280, flexShrink: 0 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            Các bước
          </div>
          <div className="flex flex-col" style={{ gap: 2 }}>
            {STEPS.map((s) => {
              const done = s.id < step;
              const active = s.id === step;
              // Khoá lại bước 1 sau khi đã tạo nháp + upload file (đổi file giữa chừng dễ lệch).
              const clickable = s.id < step && !(s.id === 1 && draftId !== null);
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => clickable && setStep(s.id)}
                  disabled={s.id > step || (s.id === 1 && draftId !== null)}
                  className="flex items-center"
                  style={{
                    gap: 12,
                    padding: '10px 12px',
                    borderRadius: 4,
                    border: 'none',
                    cursor: clickable ? 'pointer' : 'default',
                    textAlign: 'left',
                    background: active ? 'var(--paper-deep)' : 'transparent',
                    color: active ? 'var(--ink)' : 'var(--ink-body)',
                    fontWeight: active ? 600 : 500,
                    fontSize: '0.85rem',
                    opacity: s.id > step ? 0.5 : 1,
                  }}
                >
                  <span
                    className="flex items-center justify-center"
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 999,
                      flexShrink: 0,
                      background: done ? 'var(--success)' : active ? 'var(--kinpaku)' : 'var(--light-graphite)',
                      color: done || active ? 'var(--ink)' : 'var(--ink-muted)',
                    }}
                  >
                    {done ? <Check size={14} /> : <Icon size={13} />}
                  </span>
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Step content */}
        <div className="card" style={{ padding: 28, flex: 1, minWidth: 0, width: '100%' }}>
          {err && <ErrorBox message={err} />}

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
              replyTo={replyToId}
              setReplyTo={setReplyToId}
              incomingDocs={incomingDocs}
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
            <div
              className="flex items-center justify-between"
              style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--rule)' }}
            >
              <button
                type="button"
                className="btn-secondary"
                disabled={step === 1 || busy}
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                style={step === 1 || busy ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
              >
                <ArrowLeft size={14} /> Quay lại
              </button>
              <span className="cell-meta">
                Bước {step} / {STEPS.length}
              </span>
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={next}
                style={busy ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
              >
                {busy ? 'Đang xử lý…' : step === 6 ? 'Xác nhận phát hành' : 'Tiếp tục'}
                {!busy && <ArrowRight size={14} />}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function StepUpload({ file, onPick }: { file: File | null; onPick: (f: File | null) => void }) {
  return (
    <div>
      <h2 className="section-title" style={{ marginBottom: 16 }}>
        Tải file công văn gốc
      </h2>
      <label
        htmlFor="cv_file"
        className="flex flex-col items-center justify-center"
        style={{
          border: '1.5px dashed var(--rule-strong)',
          borderRadius: 8,
          padding: '48px 24px',
          gap: 12,
          background: 'var(--paper-deep)',
          textAlign: 'center',
          cursor: 'pointer',
        }}
      >
        <UploadCloud size={40} strokeWidth={1.25} style={{ color: 'var(--kinpaku-deep)' }} />
        <div style={{ fontWeight: 500, color: 'var(--ink)' }}>Bấm để chọn file PDF hoặc Word</div>
        <div className="cell-meta">Hỗ trợ Word (.docx, .doc) hoặc PDF — tối đa 50MB</div>
        <span className="btn-secondary" style={{ marginTop: 8 }}>
          Chọn file
        </span>
        <input
          id="cv_file"
          type="file"
          accept=".pdf,.docx,.doc,application/pdf"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
      </label>
      {file && (
        <p className="flex items-center" style={{ gap: 8, marginTop: 12, fontSize: '0.875rem', color: 'var(--ink)' }}>
          <FileText size={15} style={{ color: 'var(--kinpaku-deep)' }} /> {file.name}
        </p>
      )}
      <p className="cell-meta" style={{ marginTop: 12 }}>
        File Word được tự động chuyển sang PDF bằng LibreOffice trước khi chèn mộc.
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
  replyTo: number | null;
  setReplyTo: (v: number | null) => void;
  incomingDocs: { id: number; number: string | null; subject: string | null }[];
}) {
  const { recipients, recipientIds, setRecipientIds } = props;
  function toggle(id: number) {
    setRecipientIds(
      recipientIds.includes(id) ? recipientIds.filter((x) => x !== id) : [...recipientIds, id],
    );
  }
  return (
    <div>
      <h2 className="section-title" style={{ marginBottom: 16 }}>
        Thông tin công văn
      </h2>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className="field-label" htmlFor="cv_subject">
            Trích yếu
          </label>
          <textarea
            id="cv_subject"
            rows={2}
            className="text-input"
            placeholder="V/v …"
            value={props.subject}
            onChange={(e) => props.setSubject(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="cv_type">
            Loại văn bản (sổ đi)
          </label>
          <select
            id="cv_type"
            className="text-input"
            value={props.docTypeId ?? ''}
            onChange={(e) => props.setDocTypeId(Number(e.target.value))}
          >
            <option value="" disabled>
              — Chọn loại —
            </option>
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
          <label className="field-label" htmlFor="cv_date">
            Ngày phát hành
          </label>
          <input
            id="cv_date"
            type="date"
            className="text-input"
            value={props.issueDate}
            onChange={(e) => props.setIssueDate(e.target.value)}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className="field-label">Nơi nhận (chọn từ danh bạ)</label>
          {recipients.length === 0 ? (
            <p className="cell-meta">Chưa có nơi nhận trong danh bạ — thêm ở mục Danh bạ.</p>
          ) : (
            <div
              className="flex flex-col"
              style={{
                maxHeight: 176,
                overflowY: 'auto',
                border: '1px solid var(--rule)',
                borderRadius: 6,
                padding: 8,
                gap: 2,
              }}
            >
              {recipients.map((o) => (
                <label
                  key={o.id}
                  className="flex items-center"
                  style={{ gap: 8, padding: '6px 8px', borderRadius: 4, cursor: 'pointer', fontSize: '0.875rem', color: 'var(--ink)' }}
                >
                  <input
                    type="checkbox"
                    className="qlcv-check"
                    checked={recipientIds.includes(o.id)}
                    onChange={() => toggle(o.id)}
                  />
                  {o.full_name}
                </label>
              ))}
            </div>
          )}
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className="field-label" htmlFor="cv_reply">
            Phản hồi công văn đến (tuỳ chọn)
          </label>
          <select
            id="cv_reply"
            className="text-input"
            value={props.replyTo ?? ''}
            onChange={(e) => props.setReplyTo(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">— Không liên kết —</option>
            {props.incomingDocs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.number ?? `#${d.id}`} — {d.subject ?? '(chưa có trích yếu)'}
              </option>
            ))}
          </select>
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
      <h2 className="section-title" style={{ marginBottom: 16 }}>
        Đơn vị phát hành &amp; hồ sơ ký
      </h2>
      <label className="field-label">Đơn vị phát hành</label>
      <div
        className="flex items-center"
        style={{
          gap: 10,
          padding: 14,
          border: '1px solid var(--rule)',
          borderRadius: 6,
          background: 'var(--paper-deep)',
          marginBottom: 20,
        }}
      >
        {unit && <UnitPill unit={unit} />}
        <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
          {unit?.full_name ?? '— (chọn loại VB ở bước trước)'}
        </span>
      </div>

      <label className="field-label">Hồ sơ ký (lọc theo đơn vị — chống nhầm mộc)</label>
      {profiles.length === 0 ? (
        <p style={{ fontSize: '0.85rem', color: 'var(--warning)' }}>
          Đơn vị này chưa có hồ sơ ký đang dùng. Tạo ở mục Hồ sơ ký.
        </p>
      ) : (
        <div className="flex flex-col" style={{ gap: 10 }}>
          {profiles.map((p) => {
            const selected = profileId === p.id;
            return (
              <label
                key={p.id}
                className="flex items-center"
                style={{
                  gap: 12,
                  padding: 14,
                  border: `1px solid ${selected ? 'var(--kinpaku)' : 'var(--rule)'}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: selected ? 'var(--paper-deep)' : 'var(--paper-raised)',
                }}
              >
                <input
                  type="radio"
                  name="profile"
                  className="qlcv-check"
                  style={{ borderRadius: 999 }}
                  checked={selected}
                  onChange={() => setProfileId(p.id)}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{p.name}</div>
                  <div className="cell-meta">Chức danh: {p.display_title}</div>
                </div>
                {unit && <UnitPill unit={unit} />}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StepPreview({ previewUrl, busy, onReload }: { previewUrl: string | null; busy: boolean; onReload: () => void }) {
  return (
    <div>
      <h2 className="section-title" style={{ marginBottom: 8 }}>
        Vị trí mộc &amp; chữ ký
      </h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', marginBottom: 16 }}>
        Hệ thống tự đặt mộc + chữ ký ở góc dưới phải trang cuối. Xem trước bên dưới (kéo-thả tinh chỉnh sẽ bổ sung sau).
      </p>
      <PreviewFrame previewUrl={previewUrl} busy={busy} onReload={onReload} />
    </div>
  );
}

function PreviewFrame({ previewUrl, busy, onReload }: { previewUrl: string | null; busy: boolean; onReload: () => void }) {
  return (
    <div>
      <div className="flex justify-end" style={{ marginBottom: 8 }}>
        <button
          type="button"
          className="btn-secondary"
          onClick={onReload}
          disabled={busy}
          style={busy ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
        >
          {busy ? 'Đang tạo…' : 'Tạo lại bản xem trước'}
        </button>
      </div>
      <div
        style={{
          height: 480,
          overflow: 'hidden',
          borderRadius: 6,
          border: '1px solid var(--rule)',
          background: 'var(--paper-deep)',
        }}
      >
        {busy && !previewUrl ? (
          <div className="flex items-center justify-center" style={{ height: '100%' }}>
            <span className="cell-meta">Đang tạo bản xem trước…</span>
          </div>
        ) : previewUrl ? (
          <iframe src={previewUrl} title="Xem trước công văn" style={{ height: '100%', width: '100%', border: 'none' }} />
        ) : (
          <div className="flex items-center justify-center" style={{ height: '100%' }}>
            <span className="cell-meta">Chưa có bản xem trước.</span>
          </div>
        )}
      </div>
    </div>
  );
}

function RangeSeg({ value, onChange }: { value: RangeOpt; onChange: (v: RangeOpt) => void }) {
  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      <div className="seg">
        {(['none', 'all', 'range'] as RangeKind[]).map((k) => (
          <button
            key={k}
            type="button"
            data-active={value.kind === k ? 'true' : undefined}
            onClick={() => onChange({ ...value, kind: k })}
          >
            {k === 'none' ? 'Không' : k === 'all' ? 'Toàn bộ' : 'Theo khoảng trang'}
          </button>
        ))}
      </div>
      {value.kind === 'range' && (
        <div className="flex items-center" style={{ gap: 8, fontSize: '0.85rem' }}>
          <span style={{ color: 'var(--ink-muted)' }}>Từ trang</span>
          <input
            type="number"
            min={1}
            value={value.page_from ?? ''}
            onChange={(e) => onChange({ ...value, page_from: Number(e.target.value) || undefined })}
            className="text-input"
            style={{ width: 80 }}
          />
          <span style={{ color: 'var(--ink-muted)' }}>đến</span>
          <input
            type="number"
            min={1}
            value={value.page_to ?? ''}
            onChange={(e) => onChange({ ...value, page_to: Number(e.target.value) || undefined })}
            className="text-input"
            style={{ width: 80 }}
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
      <h2 className="section-title" style={{ marginBottom: 16 }}>
        Đóng giáp lai &amp; ký nháy
      </h2>
      <div className="flex flex-col" style={{ gap: 20 }}>
        <div>
          <label className="field-label">Đóng giáp lai (dùng chính mộc của hồ sơ ký)</label>
          <RangeSeg value={giapLai} onChange={setGiapLai} />
        </div>
        <div>
          <label className="field-label">Ký nháy mỗi trang (trừ trang cuối)</label>
          <RangeSeg value={kyNhay} onChange={setKyNhay} />
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
          Giáp lai dùng chính mộc của hồ sơ ký đã chọn, cắt thành nhiều phần dọc theo số trang.
        </p>
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
      <h2 className="section-title" style={{ marginBottom: 16 }}>
        Xác nhận chống nhầm mộc
      </h2>
      <div
        className="flex"
        style={{
          gap: 12,
          padding: 18,
          borderRadius: 6,
          background: 'var(--warning-soft)',
          border: '1px solid var(--rule-strong)',
          marginBottom: 20,
        }}
      >
        <ShieldAlert size={20} style={{ color: 'var(--warning)', flexShrink: 0 }} />
        <div style={{ fontSize: '0.9rem', color: 'var(--ink)' }}>
          Phát hành công văn với mộc của{' '}
          <strong>{(unit?.full_name ?? 'đơn vị đã chọn').toUpperCase()}</strong>. Đúng chứ?
        </div>
      </div>

      <label className="field-label">Cấp số công văn</label>
      <div className="flex flex-col" style={{ gap: 10 }}>
        <label
          className="flex items-center"
          style={{
            gap: 12,
            padding: 14,
            border: `1px solid ${capSoMode === 'auto' ? 'var(--kinpaku)' : 'var(--rule)'}`,
            borderRadius: 6,
            cursor: 'pointer',
            background: capSoMode === 'auto' ? 'var(--paper-deep)' : 'var(--paper-raised)',
          }}
        >
          <input
            type="radio"
            name="capso"
            className="qlcv-check"
            style={{ borderRadius: 999 }}
            checked={capSoMode === 'auto'}
            onChange={() => setCapSoMode('auto')}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: 'var(--ink)' }}>Tự cấp số</div>
            <div className="cell-meta">
              Hệ thống sinh số kế tiếp theo sổ (atomic, không trùng).
              {nextNumber ? ` Số kế tiếp dự kiến: ~${nextNumber}.` : ''}
            </div>
          </div>
          <Hash size={16} style={{ color: 'var(--ink-muted)' }} />
        </label>
        <label
          className="flex items-center"
          style={{
            gap: 12,
            padding: 14,
            border: `1px solid ${capSoMode === 'manual' ? 'var(--kinpaku)' : 'var(--rule)'}`,
            borderRadius: 6,
            cursor: 'pointer',
            background: capSoMode === 'manual' ? 'var(--paper-deep)' : 'var(--paper-raised)',
          }}
        >
          <input
            type="radio"
            name="capso"
            className="qlcv-check"
            style={{ borderRadius: 999 }}
            checked={capSoMode === 'manual'}
            onChange={() => setCapSoMode('manual')}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: 'var(--ink)' }}>Dùng số có sẵn</div>
            <div className="cell-meta">Nhập số đã in trên file — hệ thống kiểm tra trùng + đồng bộ sổ.</div>
            {capSoMode === 'manual' && (
              <input
                type="number"
                min={1}
                value={manualNumber}
                onChange={(e) => setManualNumber(e.target.value)}
                placeholder="VD: 247"
                className="text-input"
                style={{ width: 128, marginTop: 8 }}
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
      <div className="flex items-center" style={{ gap: 12, marginBottom: 20 }}>
        <span
          className="flex items-center justify-center"
          style={{ width: 44, height: 44, borderRadius: 999, background: 'var(--success-soft)', flexShrink: 0 }}
        >
          <Check size={24} style={{ color: 'var(--success)' }} />
        </span>
        <div>
          <h2 className="section-title">{published ? 'Đã phát hành' : 'Đã cấp số — chờ ký số'}</h2>
          <div className="cell-mono">
            <span className="num">{number}</span>
          </div>
        </div>
      </div>

      {err && <ErrorBox message={err} />}

      <div className="flex flex-col" style={{ gap: 12 }}>
        {/* Bước 1 */}
        <div className="card" style={{ padding: 18 }}>
          <div className="flex items-start" style={{ gap: 12 }}>
            <span
              className="flex items-center justify-center"
              style={{ width: 24, height: 24, borderRadius: 999, background: 'var(--kinpaku)', color: 'var(--ink)', fontWeight: 600, fontSize: '0.8rem', flexShrink: 0 }}
            >
              1
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: 'var(--ink)' }}>Tải PDF chưa ký số &amp; ký bằng USB Token</div>
              <div className="cell-meta" style={{ marginBottom: 12 }}>
                Mở file bằng vSign + USB Token Viettel-CA để ký số (ngoài hệ thống), rồi quay lại tải lên.
              </div>
              <button
                type="button"
                className="btn-secondary"
                disabled={docId === null}
                onClick={() => docId !== null && window.open(`/api/outgoing/${docId}/download`, '_blank')}
                style={docId === null ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
              >
                <Download size={14} /> Tải PDF (_CHUA_KY_SO)
              </button>
            </div>
          </div>
        </div>

        {/* Bước 2 */}
        <div className="card" style={{ padding: 18 }}>
          <div className="flex items-start" style={{ gap: 12 }}>
            <span
              className="flex items-center justify-center"
              style={{ width: 24, height: 24, borderRadius: 999, background: 'var(--kinpaku)', color: 'var(--ink)', fontWeight: 600, fontSize: '0.8rem', flexShrink: 0 }}
            >
              2
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: 'var(--ink)' }}>Tải lên bản đã ký số → hoàn tất phát hành</div>
              <div className="cell-meta" style={{ marginBottom: 12 }}>
                Hệ thống kiểm tra số CV trong tên file (chống nhầm) rồi chuyển “Đã phát hành”.
              </div>
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
                <span className="flex items-center" style={{ gap: 6, fontSize: '0.85rem', fontWeight: 600, color: 'var(--success)' }}>
                  <Check size={15} /> Đã phát hành công văn.
                </span>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy || docId === null}
                  onClick={() => fileRef.current?.click()}
                  style={busy || docId === null ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
                >
                  <Upload size={14} /> {busy ? 'Đang tải…' : 'Tải lên bản đã ký số'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end" style={{ marginTop: 20 }}>
        <button type="button" className="btn-ghost" onClick={onDone}>
          {published ? 'Xong, về danh sách' : 'Để sau, về danh sách'}
        </button>
      </div>
    </div>
  );
}
