import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, Sparkles, UploadCloud } from 'lucide-react';

import { type ApiErrorEnvelope } from '~/lib/api';
import { type UnitLite } from '~/components/sign-ui';

/**
 * Tải & tách nền mộc/chữ ký — C3 (SIG.BG), bám ui-demo TachNenPage (2 cột: cấu hình |
 * preview gốc/đã tách). Mộc → rembg (AI, không ngưỡng); chữ ký → OpenCV threshold (slider).
 * Lưu = POST ảnh ĐÃ tách sang /api/seals|/api/signatures. Tách lỗi/worker chưa chạy →
 * fallback "Lưu ảnh gốc" (PRD edge: cho upload bản đã tách sẵn).
 */

type Kind = 'seal' | 'signature';
const CHECKER = 'bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#fff_0%_50%)] bg-[length:16px_16px]';
const fieldClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100';
const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500';

function errMsg(error: unknown, fallback: string): string {
  return (error as ApiErrorEnvelope | undefined)?.error?.message ?? fallback;
}

interface ProcessResult {
  status: 'done' | 'pending' | 'error';
  result_key?: string;
  message?: string;
}

// Biên upload rộng (ảnh chụp giấy lớn) — backend tự resize trước khi xử lý (PRD C3).
// Giới hạn thật mộc 5MB / chữ ký 2MB áp ở bước lưu cuối (ảnh đã tách, nhỏ hơn nhiều).
const INPUT_MAX_BYTES = 20 * 1024 * 1024;

export function TachNenModal({
  kind,
  units,
  onClose,
}: {
  kind: Kind;
  units: UnitLite[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isSeal = kind === 'seal';

  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(60);
  const [phase, setPhase] = useState<'idle' | 'processing' | 'preview' | 'failed'>('idle');
  const [resultKey, setResultKey] = useState<string | null>(null);
  const [sourceKey, setSourceKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Metadata lưu (khác nhau theo loại).
  const [unitId, setUnitId] = useState<string>(String(units[0]?.id ?? ''));
  const [name, setName] = useState('');
  const [sealType, setSealType] = useState('round');
  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');

  const cancelled = useRef(false);
  const runSeq = useRef(0); // bỏ qua kết quả của lần chạy cũ khi kéo slider nhanh
  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);
  useEffect(() => {
    if (!originalUrl) return;
    return () => URL.revokeObjectURL(originalUrl);
  }, [originalUrl]);

  async function pollResult(taskId: string): Promise<ProcessResult> {
    for (let i = 0; i < 20; i++) {
      // ~14s tối đa (PRD: ≤5s/file; nới biên cho lần đầu nạp model)
      await new Promise((r) => setTimeout(r, 700));
      if (cancelled.current) return { status: 'pending' };
      const res = await fetch(`/api/bg-removal/result/${taskId}`, { credentials: 'include' });
      if (!res.ok) continue;
      const body = (await res.json()) as ProcessResult;
      if (body.status === 'done' || body.status === 'error') return body;
    }
    return { status: 'error', message: 'Quá thời gian xử lý (worker chưa chạy?)' };
  }

  // 1 đường xử lý: lần đầu truyền `pickedFile` (state set bất đồng bộ); kéo slider dùng
  // lại `source_key` ảnh gốc đã tải (không upload lại).
  async function runBgRemoval(opts: { pickedFile?: File; useSource?: boolean }) {
    const seq = ++runSeq.current;
    setErr(null);
    setPhase('processing');
    try {
      const form = new FormData();
      form.append('kind', kind);
      form.append('threshold', String(threshold));
      if (opts.useSource && sourceKey) form.append('source_key', sourceKey);
      else if (opts.pickedFile) form.append('file', opts.pickedFile);
      else if (file) form.append('file', file);
      const res = await fetch('/api/bg-removal', { method: 'POST', body: form, credentials: 'include' });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as ApiErrorEnvelope | null;
        throw new Error(b?.error?.message ?? 'Gửi yêu cầu tách nền thất bại');
      }
      const { task_id, source_key } = (await res.json()) as { task_id: string; source_key: string };
      setSourceKey(source_key);
      const result = await pollResult(task_id);
      if (cancelled.current || seq !== runSeq.current) return; // có lần kéo mới hơn
      if (result.status === 'done' && result.result_key) {
        setResultKey(result.result_key);
        setPhase('preview');
      } else {
        setErr(result.message ?? 'Tách nền thất bại');
        setPhase('failed');
      }
    } catch (e) {
      if (cancelled.current) return;
      setErr((e as Error).message);
      setPhase('failed');
    }
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setErr(null);
    setResultKey(null);
    setSourceKey(null);
    if (!f) return;
    if (f.size > INPUT_MAX_BYTES) {
      setErr(`Ảnh vượt quá ${INPUT_MAX_BYTES / (1024 * 1024)}MB`);
      return;
    }
    if (!['image/png', 'image/jpeg'].includes(f.type)) {
      setErr('Ảnh phải là PNG hoặc JPG');
      return;
    }
    setFile(f);
    setOriginalUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    void runBgRemoval({ pickedFile: f });
  }

  function validMeta(): string | null {
    if (isSeal) {
      if (!unitId) return 'Chọn đơn vị';
      if (!name.trim()) return 'Nhập tên mộc';
    } else {
      if (!fullName.trim()) return 'Nhập họ tên người ký';
    }
    return null;
  }

  async function save(useProcessed: boolean) {
    const metaErr = validMeta();
    if (metaErr) {
      setErr(metaErr);
      return;
    }
    setErr(null);
    setSaving(true);
    try {
      // Lấy blob ảnh sẽ lưu: bản đã tách (preview) hoặc ảnh gốc (fallback).
      let blob: Blob;
      let filename: string;
      if (useProcessed && resultKey) {
        const r = await fetch(`/api/bg-removal/asset?key=${encodeURIComponent(resultKey)}`, {
          credentials: 'include',
        });
        if (!r.ok) throw new Error('Không tải được ảnh đã tách nền');
        blob = await r.blob();
        filename = 'tach-nen.png';
      } else {
        if (!file) throw new Error('Chưa có ảnh');
        blob = file;
        filename = file.name;
      }

      const form = new FormData();
      form.append('file', blob, filename);
      let endpoint: string;
      if (isSeal) {
        form.append('unit_id', unitId);
        form.append('name', name.trim());
        form.append('seal_type', sealType);
        endpoint = '/api/seals';
      } else {
        form.append('full_name', fullName.trim());
        if (title.trim()) form.append('title', title.trim());
        if (unitId) form.append('default_unit_id', unitId);
        endpoint = '/api/signatures';
      }
      const res = await fetch(endpoint, { method: 'POST', body: form, credentials: 'include' });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as ApiErrorEnvelope | null;
        throw new Error(b?.error?.message ?? 'Lưu thất bại');
      }
      await queryClient.invalidateQueries({ queryKey: [isSeal ? 'seals' : 'signatures'] });
      onClose();
    } catch (e) {
      setErr(errMsg(e, (e as Error).message));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <button type="button" aria-label="Đóng" onClick={onClose} className="fixed inset-0 bg-slate-900/40" />
      <div className="relative z-10 w-full max-w-4xl rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">Mộc &amp; Chữ ký</p>
            <h3 className="text-lg font-semibold text-slate-800">
              {isSeal ? 'Tải & tách nền mộc' : 'Tải & tách nền chữ ký'}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {isSeal
                ? 'Mộc đỏ tách nền bằng AI (rembg/U2Net), giữ nguyên màu đỏ gốc'
                : 'Chữ ký tách nền bằng OpenCV threshold, giữ nét bút mảnh'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100">
            <ArrowLeft size={15} /> Quay lại
          </button>
        </div>

        {err && (
          <div role="alert" className="mx-6 mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {err}
          </div>
        )}

        <div className="grid gap-6 p-6 lg:grid-cols-2">
          {/* Cột trái: upload + cấu hình */}
          <div className="space-y-4">
            <label
              htmlFor="bg_file"
              className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center hover:border-amber-300"
            >
              <UploadCloud size={32} className="text-amber-500" strokeWidth={1.5} />
              <span className="text-sm font-medium text-slate-700">Bấm để chọn ảnh chụp giấy</span>
              <span className="text-xs text-slate-400">
                PNG/JPG ≤ {isSeal ? '5MB' : '2MB'} · ảnh lớn tự thu nhỏ
              </span>
              <input id="bg_file" type="file" accept="image/png,image/jpeg" className="hidden" onChange={onPickFile} />
            </label>

            {isSeal ? (
              <>
                <div>
                  <label className={labelClass} htmlFor="m_unit">Đơn vị (gắn cố định)</label>
                  <select id="m_unit" className={fieldClass} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.short_name ?? u.full_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor="m_name">Tên mộc</label>
                  <input id="m_name" className={fieldClass} placeholder="VD: Mộc tròn GDNN" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="m_type">Loại mộc</label>
                  <select id="m_type" className={fieldClass} value={sealType} onChange={(e) => setSealType(e.target.value)}>
                    <option value="round">Mộc tròn</option>
                    <option value="hanging">Mộc treo</option>
                    <option value="overlap">Mộc giáp lai</option>
                  </select>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className={labelClass} htmlFor="g_name">Họ tên người ký</label>
                  <input id="g_name" className={fieldClass} placeholder="VD: Nguyễn Văn A" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="g_title">Chức danh</label>
                  <input id="g_title" className={fieldClass} placeholder="VD: Giám đốc" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="g_unit">Đơn vị mặc định</label>
                  <select id="g_unit" className={fieldClass} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                    <option value="">— Không gán —</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.short_name ?? u.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Ngưỡng — chỉ chữ ký (OpenCV); mộc dùng AI không cần ngưỡng */}
            {!isSeal ? (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className={labelClass + ' mb-0'} htmlFor="g_thr">Ngưỡng tách nền</label>
                  <span className="font-mono text-sm text-slate-600">{threshold}%</span>
                </div>
                <input
                  id="g_thr"
                  type="range"
                  min={0}
                  max={100}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  onMouseUp={() => sourceKey && void runBgRemoval({ useSource: true })}
                  onTouchEnd={() => sourceKey && void runBgRemoval({ useSource: true })}
                  className="w-full accent-amber-500"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Kéo rồi thả để xem lại preview. Tách thất bại → lưu ảnh đã tách sẵn.
                </p>
              </div>
            ) : (
              <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
                Mộc dùng AI (rembg/U2Net) tự tách nền, không cần chỉnh ngưỡng.
              </p>
            )}
          </div>

          {/* Cột phải: preview before/after */}
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Xem trước</p>
            <div className="grid grid-cols-2 gap-3">
              <PreviewBox label="Ảnh gốc">
                {originalUrl ? (
                  <img src={originalUrl} alt="Ảnh gốc" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-xs text-slate-400">Chưa có ảnh</span>
                )}
              </PreviewBox>
              <PreviewBox label="Đã tách nền" checker>
                {phase === 'processing' ? (
                  <span className="text-xs text-slate-400">Đang xử lý…</span>
                ) : phase === 'preview' && resultKey ? (
                  <img
                    src={`/api/bg-removal/asset?key=${encodeURIComponent(resultKey)}`}
                    alt="Đã tách nền"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : phase === 'failed' ? (
                  <span className="px-2 text-center text-xs text-red-500">Tách nền thất bại</span>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </PreviewBox>
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-800">
              <Sparkles size={14} className="mt-0.5 shrink-0 text-sky-500" />
              Xử lý ≤ 5 giây/file. Duyệt bằng mắt — không đo chất lượng tự động.
            </div>

            <button
              type="button"
              onClick={() => save(true)}
              disabled={saving || phase !== 'preview'}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-500 disabled:opacity-50"
            >
              <Save size={15} /> Lưu phiên bản đã tách nền
            </button>
            {(phase === 'failed' || phase === 'preview') && file && (
              <button
                type="button"
                onClick={() => save(false)}
                disabled={saving}
                className="mt-2 w-full rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Lưu ảnh gốc (đã tách sẵn)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewBox({
  label,
  checker = false,
  children,
}: {
  label: string;
  checker?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-center text-xs text-slate-400">{label}</p>
      <div
        className={`flex aspect-square items-center justify-center rounded-md border border-slate-200 p-2 ${
          checker ? CHECKER : 'bg-slate-50'
        }`}
      >
        {children}
      </div>
    </div>
  );
}
