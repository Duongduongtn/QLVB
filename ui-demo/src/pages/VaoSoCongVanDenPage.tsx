import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  UploadCloud,
  FileText,
  ScanText,
  ShieldCheck,
  Hash,
  AlertTriangle,
  AlertCircle,
} from 'lucide-react'
import { PageHeader, Pill } from '../components/ui'

const steps = [
  { id: 1, label: 'Tải file PDF', icon: UploadCloud },
  { id: 2, label: 'Kiểm tra & OCR', icon: ScanText },
  { id: 3, label: 'Thông tin công văn', icon: FileText },
  { id: 4, label: 'Hoàn tất vào sổ', icon: Hash },
]

export function VaoSoCongVanDenPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Công văn đến', to: '/cong-van-den' }, { label: 'Vào sổ mới' }]}
        title="Vào sổ công văn đến"
        subhead="Tải PDF → tự đọc OCR + kiểm chữ ký số + check trùng → cấp số đến (sổ chung 2 đơn vị)"
        actions={
          <button className="btn-ghost" onClick={() => navigate('/cong-van-den')}>
            <ArrowLeft size={14} /> Quay lại sổ
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
            {steps.map((s) => {
              const done = s.id < step
              const active = s.id === step
              const Icon = s.icon
              return (
                <button
                  key={s.id}
                  onClick={() => setStep(s.id)}
                  className="flex items-center"
                  style={{
                    gap: 12,
                    padding: '10px 12px',
                    borderRadius: 4,
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    background: active ? 'var(--paper-deep)' : 'transparent',
                    color: active ? 'var(--ink)' : 'var(--ink-body)',
                    fontWeight: active ? 600 : 500,
                    fontSize: '0.85rem',
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
              )
            })}
          </div>
        </div>

        {/* Content */}
        <div className="card" style={{ padding: 28, flex: 1, minWidth: 0, width: '100%' }}>
          {step === 1 && (
            <div>
              <h2 className="section-title" style={{ marginBottom: 16 }}>
                Tải file PDF công văn đến
              </h2>
              <div
                className="flex flex-col items-center justify-center"
                style={{
                  border: '1.5px dashed var(--rule-strong)',
                  borderRadius: 8,
                  padding: '48px 24px',
                  gap: 12,
                  background: 'var(--paper-deep)',
                  textAlign: 'center',
                }}
              >
                <UploadCloud size={40} strokeWidth={1.25} style={{ color: 'var(--kinpaku-deep)' }} />
                <div style={{ fontWeight: 500, color: 'var(--ink)' }}>Kéo thả PDF hoặc bấm để chọn (hỗ trợ nhiều file)</div>
                <div className="cell-meta">Chỉ nhận PDF — tối đa 50MB / file</div>
                <button className="btn-secondary" style={{ marginTop: 8 }}>
                  Chọn file
                </button>
              </div>
              <div
                className="flex items-center"
                style={{ gap: 10, marginTop: 14, padding: 12, border: '1px solid var(--rule)', borderRadius: 6 }}
              >
                <FileText size={16} style={{ color: 'var(--ink-muted)' }} />
                <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--ink)' }}>0124_CV-STC_quyettoan.pdf</span>
                <span className="cell-meta">1,4 MB · 2 trang</span>
                <Pill variant="success" dot>
                  Đã tải
                </Pill>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="section-title" style={{ marginBottom: 16 }}>
                Kết quả kiểm tra tự động
              </h2>

              {/* Verify chữ ký số */}
              <div
                className="flex items-start"
                style={{ gap: 12, padding: 16, borderRadius: 6, background: 'var(--success-soft)', marginBottom: 16 }}
              >
                <ShieldCheck size={20} style={{ color: 'var(--success)', flexShrink: 0 }} />
                <div style={{ fontSize: '0.85rem', color: 'var(--ink)' }}>
                  <strong>Chữ ký số hợp lệ</strong> — Sở Tài chính, chứng thư Viettel-CA, hiệu lực đến 14/03/2027.
                  <div className="cell-meta" style={{ marginTop: 4 }}>
                    Có chữ ký số → bỏ qua kiểm tra trùng 3 lớp.
                  </div>
                </div>
              </div>

              {/* Check trùng 3 lớp */}
              <div className="eyebrow" style={{ marginBottom: 10 }}>
                Kiểm tra trùng 3 lớp
              </div>
              <div className="flex flex-col" style={{ gap: 8, marginBottom: 16 }}>
                {[
                  { icon: Check, color: 'var(--success)', title: 'Lớp 1 — SHA-256 hash', note: 'Không trùng tuyệt đối' },
                  { icon: AlertTriangle, color: 'var(--warning)', title: 'Lớp 2 — Trùng metadata', note: 'Có thể cùng CV gửi cả 2 đơn vị → cân nhắc gán xử lý "Cả 2"' },
                  { icon: AlertCircle, color: 'var(--success)', title: 'Lớp 3 — OCR similarity', note: 'Tương đồng 23% — không nghi trùng' },
                ].map((l) => {
                  const Icon = l.icon
                  return (
                    <div
                      key={l.title}
                      className="flex items-start"
                      style={{ gap: 10, padding: 12, border: '1px solid var(--rule)', borderRadius: 6 }}
                    >
                      <Icon size={16} style={{ color: l.color, flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--ink)' }}>{l.title}</div>
                        <div className="cell-meta">{l.note}</div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div
                className="flex items-center"
                style={{ gap: 10, padding: 12, borderRadius: 6, background: 'var(--info-soft)' }}
              >
                <ScanText size={16} style={{ color: 'var(--info)' }} />
                <span style={{ fontSize: '0.82rem', color: 'var(--ink)' }}>
                  Đã trích xuất text bằng PyMuPDF (PDF có text layer) — tự điền form ở bước sau.
                </span>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="section-title" style={{ marginBottom: 4 }}>
                Thông tin công văn
              </h2>
              <p className="cell-meta" style={{ marginBottom: 16 }}>
                Đã tự điền từ OCR — kiểm tra và chỉnh lại nếu cần.
              </p>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="field-label">Cơ quan gửi</label>
                  <input className="text-input" defaultValue="Sở Tài chính" />
                </div>
                <div>
                  <label className="field-label">Số ký hiệu</label>
                  <input className="text-input" defaultValue="0124/CV-STC" />
                </div>
                <div>
                  <label className="field-label">Ngày văn bản</label>
                  <input className="text-input" defaultValue="20/06/2026" />
                </div>
                <div>
                  <label className="field-label">Loại văn bản</label>
                  <input className="text-input" defaultValue="Công văn (CV)" />
                </div>
                <div>
                  <label className="field-label">Hạn xử lý</label>
                  <input className="text-input" defaultValue="26/06/2026" />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="field-label">Trích yếu</label>
                  <input className="text-input" defaultValue="V/v hướng dẫn quyết toán kinh phí đào tạo nghề năm 2025" />
                </div>
                <div>
                  <label className="field-label">Mức độ khẩn</label>
                  <select className="text-input" defaultValue="Thường">
                    <option>Thường</option>
                    <option>Khẩn</option>
                    <option>Thượng khẩn</option>
                    <option>Hoả tốc</option>
                    <option>Hoả tốc hẹn giờ</option>
                  </select>
                </div>
              </div>
              <label
                className="flex items-center"
                style={{ gap: 10, marginTop: 16, cursor: 'pointer', fontSize: '0.85rem', color: 'var(--ink)' }}
              >
                <input type="checkbox" className="qlcv-check" />
                Chỉ Quản lý xem (ẩn khỏi Nhân viên + không index tìm kiếm)
              </label>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col items-center" style={{ textAlign: 'center', padding: '24px 0', gap: 12 }}>
              <span
                className="flex items-center justify-center"
                style={{ width: 56, height: 56, borderRadius: 999, background: 'var(--success-soft)' }}
              >
                <Check size={28} style={{ color: 'var(--success)' }} />
              </span>
              <h2 className="section-title">Đã vào sổ công văn đến</h2>
              <div className="cell-mono" style={{ fontSize: '0.95rem' }}>
                Số đến: <span className="num">0125</span> · 0124/CV-STC
              </div>
              <p className="cell-meta" style={{ maxWidth: 380 }}>
                File PDF gốc đã lưu mã hoá (local + sync R2). Bạn có thể phân công xử lý ngay.
              </p>
              <div className="flex items-center" style={{ gap: 8, marginTop: 8 }}>
                <button className="btn-primary" onClick={() => navigate('/cong-van-den/0124')}>
                  Mở chi tiết & phân công
                </button>
                <button className="btn-secondary" onClick={() => navigate('/cong-van-den')}>
                  Về sổ CV đến
                </button>
              </div>
            </div>
          )}

          {step < 4 && (
            <div
              className="flex items-center justify-between"
              style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--rule)' }}
            >
              <button
                className="btn-secondary"
                disabled={step === 1}
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                style={step === 1 ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
              >
                <ArrowLeft size={14} /> Quay lại
              </button>
              <span className="cell-meta">
                Bước {step} / {steps.length}
              </span>
              <button className="btn-primary" onClick={() => setStep((s) => Math.min(4, s + 1))}>
                {step === 3 ? 'Lưu & cấp số đến' : 'Tiếp tục'} <ArrowRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
