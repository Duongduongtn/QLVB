import { useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  Hash,
  ScanText,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  UploadCloud,
} from 'lucide-react';

import { api, type ApiErrorEnvelope } from '~/lib/api';
import { PageHeader, Pill } from '~/components/ui';
import { fmtDate, fmtDateTime } from '~/lib/format';
import { CONFIDENTIALITY_LABEL, URGENCY_LABEL } from '~/lib/incoming';

export const Route = createFileRoute('/cong-van-den/vao-so')({
  component: VaoSoPage,
});

const STEPS = [
  { id: 1, label: 'Tải file PDF', icon: UploadCloud },
  { id: 2, label: 'Kiểm tra & OCR', icon: ScanText },
  { id: 3, label: 'Thông tin công văn', icon: FileText },
  { id: 4, label: 'Hoàn tất vào sổ', icon: Hash },
];

interface OrgLite {
  id: number;
  full_name: string;
  short_name: string | null;
}
interface DocTypeLite {
  id: number;
  name: string;
  code: string;
  direction: string;
}
interface Dup {
  layer: number;
  level: string;
  doc_id: number;
  number: string | null;
  reference_number: string | null;
}
interface SigDetail {
  signer: string | null;
  ca: string | null;
  signed_at: string | null;
  valid_until: string | null;
  intact: boolean;
  valid: boolean;
  trusted: boolean;
  expired: boolean;
}
interface SigInfo {
  status: string;
  checked_at: string;
  signatures: SigDetail[];
  warning: string | null;
}
interface Doc {
  id: number;
  reference_number: string | null;
  document_date: string | null;
  sender_org_id: number | null;
  subject: string | null;
  urgency: string;
  confidentiality: string;
  deadline: string | null;
  manager_only: boolean;
  number: string | null;
}

function errBody(res: Response, fallback: string): Promise<string> {
  return res.json().then((b: ApiErrorEnvelope | null) => b?.error?.message ?? fallback).catch(() => fallback);
}

function SignatureBadge({ status, info }: { status: string | null; info: SigInfo | null }) {
  const wrap = (bg: string, border: string): React.CSSProperties => ({
    display: 'flex', alignItems: 'flex-start', gap: 12, padding: 16, borderRadius: 6,
    background: bg, border: `1px solid ${border}`, marginBottom: 16,
  });

  if (status === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 16, borderRadius: 6, background: 'var(--paper-deep)', marginBottom: 16, fontSize: '0.85rem', color: 'var(--ink-muted)' }}>
        <ShieldQuestion size={18} /> Đang kiểm chữ ký số (PAdES)…
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div style={wrap('var(--paper-deep)', 'var(--rule)')}>
        <ShieldQuestion size={20} style={{ color: 'var(--ink-muted)', flexShrink: 0 }} />
        <div style={{ fontSize: '0.85rem', color: 'var(--ink)' }}>
          <strong>Không kiểm được chữ ký số</strong>
          <div className="cell-meta" style={{ marginTop: 4 }}>Hãy kiểm tra thủ công nếu đây là văn bản đã ký số.</div>
        </div>
      </div>
    );
  }
  if (status === 'none') {
    return (
      <div style={wrap('var(--paper-deep)', 'var(--rule)')}>
        <ShieldQuestion size={20} style={{ color: 'var(--ink-muted)', flexShrink: 0 }} />
        <div style={{ fontSize: '0.85rem', color: 'var(--ink)' }}>
          <strong>Chưa ký số</strong>
          <div className="cell-meta" style={{ marginTop: 4 }}>Văn bản không có chữ ký số → chạy kiểm tra trùng 3 lớp bên dưới.</div>
        </div>
      </div>
    );
  }

  const valid = status === 'valid';
  const sigs = info?.signatures ?? [];
  // Cert lạ (intact + hợp lệ mật mã nhưng CHƯA tin cậy) ≠ chữ ký hỏng/sửa nội dung →
  // headline trung tính, tránh ám chỉ giả mạo.
  const untrustedOnly = !valid && sigs.length > 0 && sigs.every((s) => s.intact && s.valid && !s.trusted);
  const Icon = valid ? ShieldCheck : untrustedOnly ? ShieldQuestion : ShieldAlert;
  const headline = valid
    ? 'Chữ ký số hợp lệ'
    : untrustedOnly
      ? 'Chữ ký số chưa được tin cậy — kiểm tra thủ công'
      : 'Chữ ký số không hợp lệ';
  return (
    <div style={wrap(valid ? 'var(--success-soft)' : 'var(--warning-soft)', valid ? 'var(--success)' : 'var(--warning)')}>
      <Icon size={20} style={{ color: valid ? 'var(--success)' : 'var(--warning)', flexShrink: 0 }} />
      <div style={{ fontSize: '0.85rem', color: 'var(--ink)', flex: 1, minWidth: 0 }}>
        <strong>{headline}</strong>
        {!valid && info?.warning && <div className="cell-meta" style={{ marginTop: 4 }}>{info.warning}</div>}
        {sigs.map((s, i) => (
          <div key={i} className="cell-meta" style={{ marginTop: 8, paddingTop: 8, borderTop: i > 0 ? '1px solid var(--rule)' : undefined }}>
            <div>Ký bởi: <strong style={{ color: 'var(--ink)' }}>{s.signer ?? '—'}</strong></div>
            <div>Chứng thư: {s.ca ?? '—'}</div>
            {s.signed_at && <div>Ký lúc: {fmtDateTime(s.signed_at)}</div>}
            {s.valid_until && <div>Hiệu lực đến: {fmtDate(s.valid_until)}{s.expired ? ' (đã hết hạn)' : ''}</div>}
            {!s.trusted && s.intact && s.valid && (
              <div className="flex items-center" style={{ gap: 4, color: 'var(--warning)' }}>
                <AlertTriangle size={12} /> Chứng thư chưa có trong trust list VN
              </div>
            )}
          </div>
        ))}
        {sigs.length > 1 && <div className="cell-meta" style={{ marginTop: 6 }}>Tổng {sigs.length} chữ ký.</div>}
      </div>
    </div>
  );
}

function VaoSoPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [docId, setDocId] = useState<number | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [sigTaskId, setSigTaskId] = useState<string | null>(null);
  const [sigStatus, setSigStatus] = useState<string | null>(null); // null=đang kiểm; none/valid/invalid/error
  const [sigInfo, setSigInfo] = useState<SigInfo | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [doc, setDoc] = useState<Doc | null>(null);
  const [dups, setDups] = useState<Dup[]>([]);
  const [senderHint, setSenderHint] = useState<string | null>(null);
  const [ocrDone, setOcrDone] = useState(false);
  const [result, setResult] = useState<{ number: string | null } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const orgsQuery = useQuery({
    queryKey: ['organizations', 'sender'],
    queryFn: async () => {
      const res = await api.GET('/api/organizations', { params: { query: { role: 'sender', size: 100 } } });
      return (res.data ?? { items: [] }) as { items: OrgLite[] };
    },
  });
  const orgs = useMemo(() => orgsQuery.data?.items ?? [], [orgsQuery.data]);

  const typesQuery = useQuery({
    queryKey: ['document-types', 'in'],
    queryFn: async () => {
      const res = await api.GET('/api/document-types', {});
      const raw = (res.data ?? []) as DocTypeLite[] | { items: DocTypeLite[] };
      const list = Array.isArray(raw) ? raw : raw.items;
      return list.filter((t) => t.direction === 'in');
    },
  });
  const incTypes = typesQuery.data ?? [];

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.type !== 'application/pdf') {
      setErr('Chỉ nhận file PDF');
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', f);
      const res = await fetch('/api/incoming/upload', { method: 'POST', body: form, credentials: 'include' });
      if (!res.ok) throw new Error(await errBody(res, 'Tải file lên thất bại'));
      const body = (await res.json()) as { doc: Doc; ocr_task_id: string; sig_task_id: string };
      setDocId(body.doc.id);
      setDoc(body.doc);
      setTaskId(body.ocr_task_id);
      setSigTaskId(body.sig_task_id);
      setSigStatus(null);
      setSigInfo(null);
      setFileName(f.name);
      setOcrDone(false);
      setStep(2);
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Bước 2: poll OCR cho tới khi xong.
  useEffect(() => {
    if (step !== 2 || !docId || !taskId || ocrDone) return;
    let alive = true;
    const tick = async () => {
      const res = await fetch(`/api/incoming/${docId}/ocr-status?task_id=${encodeURIComponent(taskId)}`, { method: 'POST', credentials: 'include' });
      if (!alive || !res.ok) return false;
      const body = (await res.json()) as { status: string; doc?: Doc; duplicates?: Dup[]; sender_hint?: string | null };
      if (body.status === 'done') {
        if (body.doc) setDoc(body.doc);
        setDups(body.duplicates ?? []);
        setSenderHint(body.sender_hint ?? null);
        setOcrDone(true);
        return true;
      }
      if (body.status === 'error') {
        setOcrDone(true); // vẫn cho nhập tay
        return true;
      }
      return false;
    };
    const iv = setInterval(async () => {
      if (await tick()) clearInterval(iv);
    }, 1200);
    void tick();
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [step, docId, taskId, ocrDone]);

  // Bước 2: poll verify chữ ký số (PAdES) song song OCR — E1.5.
  useEffect(() => {
    if (step !== 2 || !docId || !sigTaskId || sigStatus !== null) return;
    let alive = true;
    const tick = async () => {
      const res = await fetch(`/api/incoming/${docId}/sig-status?task_id=${encodeURIComponent(sigTaskId)}`, { method: 'POST', credentials: 'include' });
      if (!alive || !res.ok) return false;
      const body = (await res.json()) as { status: string; signature_status?: string; signature_info?: SigInfo | null };
      if (body.status === 'done') {
        setSigStatus(body.signature_status ?? 'none');
        setSigInfo(body.signature_info ?? null);
        return true;
      }
      if (body.status === 'error') {
        setSigStatus('error');
        return true;
      }
      return false;
    };
    const iv = setInterval(async () => {
      if (await tick()) clearInterval(iv);
    }, 1200);
    void tick();
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [step, docId, sigTaskId, sigStatus]);

  function setField<K extends keyof Doc>(k: K, v: Doc[K]) {
    setDoc((d) => (d ? { ...d, [k]: v } : d));
  }

  async function saveAndRegister() {
    if (!docId || !doc) return;
    if (!doc.subject?.trim()) {
      setErr('Nhập trích yếu');
      return;
    }
    const typeId = incTypes[0]?.id;
    if (!typeId) {
      setErr('Chưa cấu hình loại văn bản đến (sổ đến) — vào Cấu hình → Sổ công văn');
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      // 1) Lưu metadata
      const patch = await fetch(`/api/incoming/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          reference_number: doc.reference_number,
          document_date: doc.document_date,
          sender_org_id: doc.sender_org_id,
          subject: doc.subject,
          urgency: doc.urgency,
          confidentiality: doc.confidentiality,
          deadline: doc.deadline,
          manager_only: doc.manager_only,
        }),
      });
      if (!patch.ok) throw new Error(await errBody(patch, 'Lưu thông tin thất bại'));

      // 1b) Tái kiểm trùng sau khi user đã chọn cơ quan gửi (lớp 2 metadata mới đủ điều kiện).
      const dupRes = await fetch(`/api/incoming/${docId}/duplicates`, { credentials: 'include' });
      if (dupRes.ok) {
        const soft = ((await dupRes.json()) as Dup[]).filter((d) => d.layer !== 1);
        if (soft.length && !window.confirm(`Phát hiện ${soft.length} dấu hiệu trùng (metadata/nội dung). Vẫn vào sổ?`)) {
          setBusy(false);
          return;
        }
      }

      // 2) Cấp số đến (trùng tuyệt đối → hỏi lý do rồi gửi lại)
      let overrideReason: string | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const reg = await fetch(`/api/incoming/${docId}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ doc_type_id: typeId, override_reason: overrideReason }),
        });
        if (reg.ok) {
          const body = (await reg.json()) as { number: string | null };
          setResult({ number: body.number });
          setStep(4);
          return;
        }
        if (reg.status === 409 && attempt === 0) {
          const reason = window.prompt('Công văn TRÙNG trong sổ. Nhập lý do nếu vẫn muốn vào sổ:');
          if (!reason?.trim()) return;
          overrideReason = reason.trim();
          continue;
        }
        throw new Error(await errBody(reg, 'Cấp số đến thất bại'));
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const DUP_STYLE: Record<string, { icon: typeof Check; color: string }> = {
    red: { icon: AlertCircle, color: 'var(--danger)' },
    yellow: { icon: AlertTriangle, color: 'var(--warning)' },
    green: { icon: AlertCircle, color: 'var(--success)' },
  };

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Công văn đến', to: '/cong-van-den' }, { label: 'Vào sổ mới' }]}
        title="Vào sổ công văn đến"
        subhead="Tải PDF → tự đọc OCR + check trùng → cấp số đến (sổ chung 2 đơn vị)"
        actions={
          <button className="btn-ghost" type="button" onClick={() => navigate({ to: '/cong-van-den' })}>
            <ArrowLeft size={14} /> Quay lại sổ
          </button>
        }
      />

      {err && (
        <div className="card" role="alert" style={{ padding: '10px 16px', marginBottom: 16, color: 'var(--danger)', borderColor: 'var(--danger)' }}>
          {err}
        </div>
      )}

      <div className="flex flex-col lg:flex-row" style={{ gap: 24, alignItems: 'flex-start' }}>
        {/* Step rail */}
        <div className="card" style={{ padding: 16, width: '100%', maxWidth: 280, flexShrink: 0 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Các bước</div>
          <div className="flex flex-col" style={{ gap: 2 }}>
            {STEPS.map((s) => {
              const done = s.id < step;
              const active = s.id === step;
              const Icon = s.icon;
              return (
                <div key={s.id} className="flex items-center" style={{ gap: 12, padding: '10px 12px', borderRadius: 4, background: active ? 'var(--paper-deep)' : 'transparent', color: active ? 'var(--ink)' : 'var(--ink-body)', fontWeight: active ? 600 : 500, fontSize: '0.85rem' }}>
                  <span className="flex items-center justify-center" style={{ width: 24, height: 24, borderRadius: 999, flexShrink: 0, background: done ? 'var(--success)' : active ? 'var(--kinpaku)' : 'var(--light-graphite)', color: done || active ? 'var(--ink)' : 'var(--ink-muted)' }}>
                    {done ? <Check size={14} /> : <Icon size={13} />}
                  </span>
                  {s.label}
                </div>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="card" style={{ padding: 28, flex: 1, minWidth: 0, width: '100%' }}>
          {step === 1 && (
            <div>
              <h2 className="section-title" style={{ marginBottom: 16 }}>Tải file PDF công văn đến</h2>
              <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={onPickFile} />
              <button
                type="button"
                className="flex flex-col items-center justify-center"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                style={{ width: '100%', border: '1.5px dashed var(--rule-strong)', borderRadius: 8, padding: '48px 24px', gap: 12, background: 'var(--paper-deep)', cursor: 'pointer' }}
              >
                <UploadCloud size={40} strokeWidth={1.25} style={{ color: 'var(--kinpaku-deep)' }} />
                <div style={{ fontWeight: 500, color: 'var(--ink)' }}>{busy ? 'Đang tải lên…' : 'Bấm để chọn file PDF'}</div>
                <div className="cell-meta">Chỉ nhận PDF — tối đa 50MB</div>
              </button>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="section-title" style={{ marginBottom: 16 }}>Kết quả kiểm tra tự động</h2>
              <div className="flex items-center" style={{ gap: 10, marginBottom: 16, padding: 12, border: '1px solid var(--rule)', borderRadius: 6 }}>
                <FileText size={16} style={{ color: 'var(--ink-muted)' }} />
                <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--ink)' }}>{fileName}</span>
                <Pill variant="success" dot>Đã tải</Pill>
              </div>

              <SignatureBadge status={sigStatus} info={sigInfo} />

              <div className="eyebrow" style={{ marginBottom: 10 }}>Kiểm tra trùng 3 lớp</div>
              {!ocrDone ? (
                <div className="flex items-center" style={{ gap: 10, padding: 12, color: 'var(--ink-muted)', fontSize: '0.85rem' }}>
                  <ScanText size={16} /> Đang đọc OCR + đối chiếu trùng…
                </div>
              ) : dups.length === 0 ? (
                <div className="flex items-center" style={{ gap: 10, padding: 12, borderRadius: 6, background: 'var(--success-soft)' }}>
                  <Check size={16} style={{ color: 'var(--success)' }} />
                  <span style={{ fontSize: '0.85rem', color: 'var(--ink)' }}>Không phát hiện trùng — an toàn để vào sổ.</span>
                </div>
              ) : (
                <div className="flex flex-col" style={{ gap: 8 }}>
                  {dups.map((d) => {
                    const st = DUP_STYLE[d.level] ?? { icon: AlertCircle, color: 'var(--success)' };
                    const Icon = st.icon;
                    return (
                      <div key={`${d.layer}-${d.doc_id}`} className="flex items-start" style={{ gap: 10, padding: 12, border: '1px solid var(--rule)', borderRadius: 6 }}>
                        <Icon size={16} style={{ color: st.color, flexShrink: 0, marginTop: 2 }} />
                        <div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--ink)' }}>
                            Lớp {d.layer} — {d.layer === 1 ? 'Trùng tuyệt đối (SHA-256)' : d.layer === 2 ? 'Trùng metadata' : 'OCR tương đồng cao'}
                          </div>
                          <div className="cell-meta">Trùng với {d.number ?? d.reference_number ?? `CV #${d.doc_id}`}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {step === 3 && doc && (
            <div>
              <h2 className="section-title" style={{ marginBottom: 4 }}>Thông tin công văn</h2>
              <p className="cell-meta" style={{ marginBottom: 16 }}>Đã tự điền từ OCR — kiểm tra và chỉnh lại nếu cần.</p>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="field-label">Cơ quan gửi</label>
                  <select className="text-input" value={doc.sender_org_id ?? ''} onChange={(e) => setField('sender_org_id', e.target.value ? Number(e.target.value) : null)}>
                    <option value="">— Chọn cơ quan gửi —</option>
                    {orgs.map((o) => <option key={o.id} value={o.id}>{o.short_name ?? o.full_name}</option>)}
                  </select>
                  {senderHint && <div className="cell-meta" style={{ marginTop: 4 }}>OCR gợi ý: {senderHint}</div>}
                </div>
                <div>
                  <label className="field-label">Số ký hiệu</label>
                  <input className="text-input" value={doc.reference_number ?? ''} onChange={(e) => setField('reference_number', e.target.value)} />
                </div>
                <div>
                  <label className="field-label">Ngày văn bản</label>
                  <input className="text-input" type="date" value={doc.document_date ?? ''} onChange={(e) => setField('document_date', e.target.value || null)} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="field-label">Trích yếu</label>
                  <input className="text-input" value={doc.subject ?? ''} onChange={(e) => setField('subject', e.target.value)} />
                </div>
                <div>
                  <label className="field-label">Mức độ khẩn</label>
                  <select className="text-input" value={doc.urgency} onChange={(e) => setField('urgency', e.target.value)}>
                    {Object.entries(URGENCY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">Mức độ mật</label>
                  <select className="text-input" value={doc.confidentiality} onChange={(e) => setField('confidentiality', e.target.value)}>
                    {Object.entries(CONFIDENTIALITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">Hạn xử lý</label>
                  <input className="text-input" type="date" value={doc.deadline ?? ''} onChange={(e) => setField('deadline', e.target.value || null)} />
                </div>
              </div>
              <label className="flex items-center" style={{ gap: 10, marginTop: 16, cursor: 'pointer', fontSize: '0.85rem', color: 'var(--ink)' }}>
                <input type="checkbox" className="qlcv-check" checked={doc.manager_only} onChange={(e) => setField('manager_only', e.target.checked)} />
                Chỉ Quản lý xem (ẩn khỏi Nhân viên)
              </label>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col items-center" style={{ textAlign: 'center', padding: '24px 0', gap: 12 }}>
              <span className="flex items-center justify-center" style={{ width: 56, height: 56, borderRadius: 999, background: 'var(--success-soft)' }}>
                <Check size={28} style={{ color: 'var(--success)' }} />
              </span>
              <h2 className="section-title">Đã vào sổ công văn đến</h2>
              <div className="cell-mono" style={{ fontSize: '0.95rem' }}>Số đến: <span className="num">{result?.number ?? '—'}</span></div>
              <p className="cell-meta" style={{ maxWidth: 380 }}>File PDF gốc đã lưu mã hoá. Có thể phân công xử lý ở bước sau.</p>
              <div className="flex items-center" style={{ gap: 8, marginTop: 8 }}>
                <button className="btn-primary" type="button" onClick={() => navigate({ to: '/cong-van-den' })}>Về sổ CV đến</button>
              </div>
            </div>
          )}

          {step >= 2 && step < 4 && (
            <div className="flex items-center justify-between" style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--rule)' }}>
              <button className="btn-secondary" type="button" disabled={step === 1 || busy} onClick={() => setStep((s) => Math.max(1, s - 1))}>
                <ArrowLeft size={14} /> Quay lại
              </button>
              <span className="cell-meta">Bước {step} / {STEPS.length}</span>
              {step === 2 ? (
                <button className="btn-primary" type="button" disabled={!ocrDone} onClick={() => setStep(3)}>
                  Tiếp tục <ArrowRight size={14} />
                </button>
              ) : (
                <button className="btn-primary" type="button" disabled={busy} onClick={saveAndRegister}>
                  {busy ? 'Đang lưu…' : 'Lưu & cấp số đến'} <ArrowRight size={14} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
