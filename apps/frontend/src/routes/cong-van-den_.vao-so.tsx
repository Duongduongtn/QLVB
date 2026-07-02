import { useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  FileText,
  ScanText,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  UploadCloud,
} from 'lucide-react';

import { api, type ApiErrorEnvelope } from '~/lib/api';
import { PageHeader } from '~/components/ui';
import { WizardGuide } from '~/components/WizardGuide';
import { SenderCombobox, type OrgLite } from '~/components/SenderCombobox';
import { fmtDate, fmtDateTime } from '~/lib/format';
import { CONFIDENTIALITY_LABEL, URGENCY_LABEL } from '~/lib/incoming';

export const Route = createFileRoute('/cong-van-den_/vao-so')({
  component: VaoSoPage,
});

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
// E1 batch — 1 mục trong hàng đợi file đã upload (mỗi file = 1 nháp + 2 task OCR/PAdES).
interface QItem {
  docId: number;
  taskId: string;
  sigTaskId: string;
  fileName: string;
}
interface Doc {
  id: number;
  reference_number: string | null;
  document_date: string | null;
  sender_org_id: number | null;
  sender_org_name: string | null;
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

  // E1 batch — hàng đợi nhiều file; duyệt/cấp số TỪNG cái theo `cursor`.
  const [queue, setQueue] = useState<QItem[]>([]);
  const [cursor, setCursor] = useState(0);
  const [registered, setRegistered] = useState<{ fileName: string; number: string | null }[]>([]);
  const [doneIdx, setDoneIdx] = useState<Set<number>>(new Set()); // index file đã lưu/bỏ qua (cho rail)
  const current = queue[cursor] ?? null;
  const docId = current?.docId ?? null;
  const taskId = current?.taskId ?? null;
  const sigTaskId = current?.sigTaskId ?? null;
  const fileName = current?.fileName ?? '';

  const [sigStatus, setSigStatus] = useState<string | null>(null); // null=đang kiểm; none/valid/invalid/error
  const [sigInfo, setSigInfo] = useState<SigInfo | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [dups, setDups] = useState<Dup[]>([]);
  const [senderHint, setSenderHint] = useState<string | null>(null);
  const [ocrDone, setOcrDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const touchedRef = useRef<Set<string>>(new Set()); // field user đã tự sửa → auto-fill KHÔNG đè
  const activeDocIdRef = useRef<number | null>(null); // docId đang mở — chống fetch cũ đổ nhầm form

  // Chuyển sang file kế trong hàng đợi → reset trạng thái xử lý + nạp lại nháp tương ứng.
  useEffect(() => {
    if (!current) return;
    activeDocIdRef.current = current.docId;
    let alive = true;
    setErr(null);
    setOcrDone(false);
    setSigStatus(null);
    setSigInfo(null);
    setDups([]);
    setSenderHint(null);
    touchedRef.current = new Set();
    setDoc(null);
    fetch(`/api/incoming/${current.docId}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) setDoc(d as Doc);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.docId]);

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

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    if (files.some((f) => f.type !== 'application/pdf')) {
      setErr('Chỉ nhận file PDF (hỗ trợ Word sẽ bổ sung sau)');
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      // Upload TUẦN TỰ từng file → mỗi file 1 nháp + enqueue OCR/PAdES; gom vào hàng đợi.
      const items: QItem[] = [];
      for (const f of files) {
        const form = new FormData();
        form.append('file', f);
        const res = await fetch('/api/incoming/upload', { method: 'POST', body: form, credentials: 'include' });
        if (!res.ok) throw new Error(await errBody(res, `Tải “${f.name}” thất bại`));
        const body = (await res.json()) as { doc: Doc; ocr_task_id: string; sig_task_id: string };
        items.push({ docId: body.doc.id, taskId: body.ocr_task_id, sigTaskId: body.sig_task_id, fileName: f.name });
      }
      setRegistered([]);
      setDoneIdx(new Set());
      setQueue(items);
      setCursor(0);
      setStep(2);
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // E1 batch — xong 1 file → sang file kế; hết hàng đợi → bước tổng kết.
  function advanceOrFinish() {
    setDoneIdx((s) => new Set(s).add(cursor));
    if (cursor + 1 < queue.length) setCursor((c) => c + 1);
    else setStep(3);
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
        setDups(body.duplicates ?? []);
        setSenderHint(body.sender_hint ?? null);
        setOcrDone(true);
        void applyAutofill(docId!);
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
      const body = (await res.json()) as { status: string; signature_status?: string; signature_info?: SigInfo | null; doc?: Doc };
      if (body.status === 'done') {
        setSigStatus(body.signature_status ?? 'none');
        setSigInfo(body.signature_info ?? null);
        void applyAutofill(docId!); // GET doc mới nhất → đổ tên cơ quan (từ chữ ký số) vào field chưa sửa
        return true;
      }
      if (body.status === 'error') {
        setSigStatus('error');
        void applyAutofill(docId!);
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
    touchedRef.current.add(String(k));
    setDoc((d) => (d ? { ...d, [k]: v } : d));
  }

  // GET doc mới nhất từ server → đổ giá trị auto-fill (OCR + chữ ký) vào các field user CHƯA sửa.
  async function applyAutofill(id: number) {
    const res = await fetch(`/api/incoming/${id}`, { credentials: 'include' });
    if (!res.ok) return;
    const fresh = (await res.json()) as Doc;
    if (activeDocIdRef.current !== id) return; // đã đổi file trong lúc fetch → bỏ, tránh đổ nhầm form
    const t = touchedRef.current;
    setDoc((d) => {
      if (!d) return fresh;
      const next = { ...d };
      if (!t.has('reference_number')) next.reference_number = fresh.reference_number;
      if (!t.has('document_date')) next.document_date = fresh.document_date;
      if (!t.has('subject')) next.subject = fresh.subject;
      if (!t.has('sender')) {
        next.sender_org_id = fresh.sender_org_id;
        next.sender_org_name = fresh.sender_org_name;
      }
      return next;
    });
  }

  async function saveAndRegister() {
    if (!docId || !doc) return;
    if (!doc.subject?.trim()) {
      setErr('Nhập tiêu đề công văn');
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
          sender_org_name: doc.sender_org_name,
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
          setRegistered((r) => [...r, { fileName, number: body.number }]);
          advanceOrFinish();
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

  // Thiếu trường quan trọng (Tiêu đề bắt buộc) → đánh dấu file "cần nhập tay" ở rail.
  const needsInput = ocrDone && !(doc?.subject?.trim());

  /** Trạng thái 1 file trong rail: done ✅ · đang mở ▶ · cần nhập ⚠️ · đang xử lý ⏳ · chờ. */
  function fileState(i: number): 'done' | 'current-warn' | 'current' | 'processing' | 'pending' {
    if (doneIdx.has(i)) return 'done';
    if (i !== cursor) return 'pending';
    if (!ocrDone) return 'processing';
    return needsInput ? 'current-warn' : 'current';
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Công văn đến', to: '/cong-van-den' }, { label: 'Thêm công văn' }]}
        title="Thêm công văn đến"
        subhead="Tải PDF → tự đọc OCR + chữ ký số → xem trang đầu, bổ sung thông tin → cấp số đến"
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

      {step === 1 && (
        <>
          <WizardGuide
            storageKey="guide-vao-so"
            title="Hướng dẫn thêm công văn đến (cho người mới)"
            intro="Tải file PDF, hệ thống tự đọc và điền sẵn thông tin. Bạn xem TRANG ĐẦU công văn ngay bên cạnh để đối chiếu, bổ sung nếu cần rồi cấp số đến."
            steps={[
              { label: 'Tải file PDF', detail: 'Chọn một hoặc nhiều file PDF của công văn nhận được (tối đa 50MB/file).' },
              { label: 'Xem & bổ sung', detail: 'Mỗi file: xem trang đầu bên trái, form thông tin bên phải (đã tự điền từ OCR/chữ ký số). Kiểm tra rồi bấm “Lưu & cấp số đến”.' },
              { label: 'Hoàn tất', detail: 'Hệ thống cấp số đến (sổ chung 2 đơn vị) và lưu vào sổ.' },
            ]}
          />
          <div className="card" style={{ padding: 28 }}>
            <h2 className="section-title" style={{ marginBottom: 16 }}>Tải file PDF công văn đến</h2>
            <input ref={fileRef} type="file" accept="application/pdf" multiple className="hidden" onChange={onPickFiles} />
            <button
              type="button"
              className="flex flex-col items-center justify-center"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              style={{ width: '100%', border: '1.5px dashed var(--rule-strong)', borderRadius: 8, padding: '48px 24px', gap: 12, background: 'var(--paper-deep)', cursor: 'pointer' }}
            >
              <UploadCloud size={40} strokeWidth={1.25} style={{ color: 'var(--kinpaku-deep)' }} />
              <div style={{ fontWeight: 500, color: 'var(--ink)' }}>{busy ? 'Đang tải lên…' : 'Bấm để chọn một hoặc nhiều file PDF'}</div>
              <div className="cell-meta">Chọn nhiều file để vào sổ hàng loạt — mỗi file tối đa 50MB</div>
            </button>
          </div>
        </>
      )}

      {step === 2 && current && (
        <div className="flex flex-col lg:flex-row" style={{ gap: 16, alignItems: 'flex-start' }}>
          {/* ── Khột 1: rail danh sách file + tiến độ ── */}
          <div className="card" style={{ padding: 12, width: '100%', maxWidth: 240, flexShrink: 0 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
              <div className="eyebrow">Danh sách file</div>
              <span className="cell-meta">{doneIdx.size}/{queue.length} xong</span>
            </div>
            <div className="flex flex-col" style={{ gap: 2 }}>
              {queue.map((q, i) => {
                const st = fileState(i);
                const tone =
                  st === 'done' ? 'var(--success)'
                  : st === 'current-warn' ? 'var(--warning)'
                  : st === 'processing' ? 'var(--ink-faint)'
                  : 'var(--ink-muted)';
                const label =
                  st === 'done' ? '✓' : st === 'current-warn' ? '!' : st === 'processing' ? '…' : '•';
                return (
                  <button
                    key={q.docId}
                    type="button"
                    className="flex items-center w-full"
                    onClick={() => {
                      // Rời file đang nhập dở (có sửa tay chưa lưu) → cảnh báo tránh mất dữ liệu.
                      if (i !== cursor && touchedRef.current.size > 0 && !window.confirm('Rời file này? Thông tin đang nhập chưa lưu sẽ mất.')) return;
                      setCursor(i);
                    }}
                    style={{
                      gap: 8, padding: '8px 10px', borderRadius: 4, textAlign: 'left', border: 'none',
                      background: i === cursor ? 'var(--paper-deep)' : 'transparent', cursor: 'pointer',
                    }}
                    title={q.fileName}
                  >
                    <span style={{ width: 16, textAlign: 'center', color: tone, fontWeight: 700, flexShrink: 0 }}>{label}</span>
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.82rem', color: i === cursor ? 'var(--ink)' : 'var(--ink-body)', fontWeight: i === cursor ? 600 : 400 }}>
                      {q.fileName}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="cell-meta" style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span><b style={{ color: 'var(--success)' }}>✓</b> đã xử lý (lưu/bỏ qua) · <b style={{ color: 'var(--warning)' }}>!</b> cần nhập tay</span>
              <span><b>…</b> đang đọc · <b>•</b> chờ</span>
            </div>
          </div>

          {/* ── Khột 2: xem TRANG ĐẦU công văn (PDF) ── */}
          <div className="card" style={{ padding: 0, flex: 1, minWidth: 0, width: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div className="flex items-center" style={{ gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--rule)' }}>
              <FileText size={15} style={{ color: 'var(--ink-muted)', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: '0.85rem', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</span>
              {queue.length > 1 && <span className="cell-meta" style={{ flexShrink: 0 }}>File {cursor + 1}/{queue.length}</span>}
            </div>
            <iframe
              key={docId ?? 'none'}
              title={`Trang đầu công văn ${fileName}`}
              src={docId ? `/api/incoming/${docId}/file` : ''}
              style={{ width: '100%', border: 'none', background: 'var(--paper-deep)', minHeight: '72vh', flex: 1 }}
            />
          </div>

          {/* ── Khột 3: form thông tin + chữ ký + trùng ── */}
          <div className="card" style={{ padding: 20, width: '100%', maxWidth: 440, flexShrink: 0 }}>
            <SignatureBadge status={sigStatus} info={sigInfo} />

            <div className="eyebrow" style={{ marginBottom: 8 }}>Kiểm tra trùng</div>
            {!ocrDone ? (
              <div className="flex items-center" style={{ gap: 10, padding: '4px 0 12px', color: 'var(--ink-muted)', fontSize: '0.85rem' }}>
                <ScanText size={16} /> Đang đọc OCR + đối chiếu trùng…
              </div>
            ) : dups.length === 0 ? (
              <div className="flex items-center" style={{ gap: 10, padding: 10, borderRadius: 6, background: 'var(--success-soft)', marginBottom: 12 }}>
                <Check size={16} style={{ color: 'var(--success)' }} />
                <span style={{ fontSize: '0.85rem', color: 'var(--ink)' }}>Không phát hiện trùng.</span>
              </div>
            ) : (
              <div className="flex flex-col" style={{ gap: 8, marginBottom: 12 }}>
                {dups.map((d) => {
                  const stl = DUP_STYLE[d.level] ?? { icon: AlertCircle, color: 'var(--success)' };
                  const Icon = stl.icon;
                  return (
                    <div key={`${d.layer}-${d.doc_id}`} className="flex items-start" style={{ gap: 10, padding: 10, border: '1px solid var(--rule)', borderRadius: 6 }}>
                      <Icon size={16} style={{ color: stl.color, flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--ink)' }}>
                          Lớp {d.layer} — {d.layer === 1 ? 'Trùng tuyệt đối' : d.layer === 2 ? 'Trùng metadata' : 'Nội dung tương đồng'}
                        </div>
                        <div className="cell-meta">Trùng với {d.number ?? d.reference_number ?? `CV #${d.doc_id}`}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {doc && (
              <>
                <div className="eyebrow" style={{ margin: '4px 0 4px' }}>Thông tin công văn</div>
                <p className="cell-meta" style={{ marginBottom: 12 }}>Đã tự điền từ OCR + chữ ký số — đối chiếu TRANG ĐẦU bên trái, bổ sung nếu cần.</p>
                <div className="flex flex-col" style={{ gap: 12 }}>
                  <div>
                    <label className="field-label">Cơ quan phát hành</label>
                    <SenderCombobox
                      orgId={doc.sender_org_id}
                      orgName={doc.sender_org_name}
                      onChange={(id, name) => {
                        touchedRef.current.add('sender');
                        setDoc((d) => (d ? { ...d, sender_org_id: id, sender_org_name: name } : d));
                      }}
                      orgs={orgs}
                      hint={senderHint}
                    />
                  </div>
                  <div>
                    <label className="field-label">Ngày phát hành</label>
                    <input className="text-input" type="date" value={doc.document_date ?? ''} onChange={(e) => setField('document_date', e.target.value || null)} />
                  </div>
                  <div>
                    <label className="field-label">Tiêu đề công văn</label>
                    <textarea className="text-input" rows={2} value={doc.subject ?? ''} onChange={(e) => setField('subject', e.target.value)} placeholder="Trích yếu / tiêu đề công văn…" />
                    {needsInput && <p className="cell-meta" style={{ color: 'var(--warning)', marginTop: 4 }}>Không đọc được tự động — vui lòng nhập theo trang đầu.</p>}
                  </div>
                  <div>
                    <label className="field-label">Số công văn</label>
                    <input className="text-input" value={doc.reference_number ?? ''} onChange={(e) => setField('reference_number', e.target.value)} placeholder="Số ký hiệu của cơ quan gửi" />
                  </div>
                  <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
                  </div>
                  <label className="flex items-center" style={{ gap: 10, cursor: 'pointer', fontSize: '0.85rem', color: 'var(--ink)' }}>
                    <input type="checkbox" className="qlcv-check" checked={doc.manager_only} onChange={(e) => setField('manager_only', e.target.checked)} />
                    Chỉ Quản lý xem (ẩn khỏi Nhân viên)
                  </label>
                </div>
              </>
            )}

            {/* Nav bước 2 */}
            <div className="flex items-center justify-between" style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--rule)', gap: 8 }}>
              <button className="btn-ghost" type="button" disabled={busy} onClick={() => { setQueue([]); setCursor(0); setStep(1); }}>
                <ArrowLeft size={14} /> Chọn lại
              </button>
              <div className="flex items-center" style={{ gap: 8 }}>
                {queue.length > 1 && cursor + 1 < queue.length && (
                  <button className="btn-secondary" type="button" disabled={busy} onClick={advanceOrFinish} title="Bỏ qua file này, để lại bản nháp">
                    Bỏ qua
                  </button>
                )}
                <button className="btn-primary" type="button" disabled={busy || !ocrDone} onClick={saveAndRegister}>
                  {busy ? 'Đang lưu…' : !ocrDone ? 'Đang đọc…' : queue.length > 1 && cursor + 1 < queue.length ? 'Lưu & file kế' : 'Lưu & cấp số đến'} <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card" style={{ padding: 28 }}>
          <div className="flex flex-col items-center" style={{ textAlign: 'center', padding: '24px 0', gap: 12 }}>
            <span className="flex items-center justify-center" style={{ width: 56, height: 56, borderRadius: 999, background: 'var(--success-soft)' }}>
              <Check size={28} style={{ color: 'var(--success)' }} />
            </span>
            <h2 className="section-title">
              {registered.length > 1 ? `Đã vào sổ ${registered.length} công văn đến` : 'Đã vào sổ công văn đến'}
            </h2>
            {registered.length <= 1 ? (
              <div className="cell-mono" style={{ fontSize: '0.95rem' }}>Số đến: <span className="num">{registered[0]?.number ?? '—'}</span></div>
            ) : (
              <div className="flex flex-col" style={{ gap: 6, width: '100%', maxWidth: 420, textAlign: 'left' }}>
                {registered.map((r, i) => (
                  <div key={i} className="flex items-center justify-between" style={{ gap: 10, padding: '8px 12px', border: '1px solid var(--rule)', borderRadius: 6 }}>
                    <span className="cell-meta" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.fileName}</span>
                    <span className="cell-mono num" style={{ flexShrink: 0 }}>{r.number ?? '—'}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="cell-meta" style={{ maxWidth: 380 }}>File PDF gốc đã lưu mã hoá. Có thể phân công xử lý ở bước sau.</p>
            <div className="flex items-center" style={{ gap: 8, marginTop: 8 }}>
              <button className="btn-primary" type="button" onClick={() => navigate({ to: '/cong-van-den' })}>
                <Clock size={14} /> Về sổ CV đến
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
