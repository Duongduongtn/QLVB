import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  UploadCloud,
  FileText,
  Stamp,
  PenTool,
  Layers,
  ShieldAlert,
  Hash,
  Download,
  FileCheck2,
} from 'lucide-react'
import { PageHeader, Pill } from '../components/ui'
import { Modal } from '../components/Modal'

const steps = [
  { id: 1, label: 'Tải file gốc', icon: UploadCloud },
  { id: 2, label: 'Thông tin công văn', icon: FileText },
  { id: 3, label: 'Đơn vị & Hồ sơ ký', icon: PenTool },
  { id: 4, label: 'Vị trí mộc / chữ ký', icon: Stamp },
  { id: 5, label: 'Giáp lai & Ký nháy', icon: Layers },
  { id: 6, label: 'Xác nhận & Cấp số', icon: ShieldAlert },
  { id: 7, label: 'Tải PDF ký số', icon: Download },
]

export function SoanCongVanPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [unit, setUnit] = useState<'gdnn' | 'dvdl'>('gdnn')
  const [signOpen, setSignOpen] = useState(false)
  const soCV = unit === 'gdnn' ? '249/2026/CV-GDNN-TĐ' : '091/2026/CV-DVDL-TĐ'

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Công văn đi', to: '/cong-van-di' }, { label: 'Soạn mới' }]}
        title="Soạn công văn đi"
        subhead="Quy trình phát hành: tải file → chèn mộc/ký → cấp số → tải PDF sẵn sàng ký số"
        actions={
          <button className="btn-ghost" onClick={() => navigate('/cong-van-di')}>
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

        {/* Step content */}
        <div className="card" style={{ padding: 28, flex: 1, minWidth: 0, width: '100%' }}>
          {step === 1 && (
            <div>
              <h2 className="section-title" style={{ marginBottom: 16 }}>
                Tải file công văn gốc
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
                <div style={{ fontWeight: 500, color: 'var(--ink)' }}>Kéo thả file hoặc bấm để chọn</div>
                <div className="cell-meta">Hỗ trợ Word (.docx, .doc) hoặc PDF — tối đa 50MB</div>
                <button className="btn-secondary" style={{ marginTop: 8 }}>
                  Chọn file
                </button>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', marginTop: 12 }}>
                File Word sẽ được tự động chuyển sang PDF bằng LibreOffice trước khi chèn mộc.
              </p>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="section-title" style={{ marginBottom: 16 }}>
                Thông tin công văn
              </h2>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="field-label">Trích yếu</label>
                  <input className="text-input" defaultValue="V/v đăng ký tham gia Hội thi tay nghề cấp tỉnh năm 2026" />
                </div>
                <div>
                  <label className="field-label">Loại văn bản</label>
                  <input className="text-input" defaultValue="Công văn (CV)" />
                </div>
                <div>
                  <label className="field-label">Ngày phát hành</label>
                  <input className="text-input" defaultValue="25/06/2026" />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="field-label">Nơi nhận (chọn từ danh bạ)</label>
                  <input className="text-input" placeholder="Sở Lao động – Thương binh và Xã hội, …" />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="field-label">Phản hồi công văn đến (tuỳ chọn)</label>
                  <input className="text-input" placeholder="Tìm công văn đến để liên kết…" />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="section-title" style={{ marginBottom: 16 }}>
                Chọn đơn vị phát hành &amp; hồ sơ ký
              </h2>
              <label className="field-label">Đơn vị phát hành</label>
              <div className="seg" style={{ marginBottom: 20 }}>
                <button data-active={unit === 'gdnn' ? 'true' : undefined} data-unit="gdnn" onClick={() => setUnit('gdnn')}>
                  Trung tâm GDNN
                </button>
                <button data-active={unit === 'dvdl' ? 'true' : undefined} data-unit="dvdl" onClick={() => setUnit('dvdl')}>
                  Công ty CP DVDL
                </button>
              </div>

              <label className="field-label">Hồ sơ ký (lọc theo đơn vị — chống nhầm mộc)</label>
              <div className="flex flex-col" style={{ gap: 10 }}>
                {(unit === 'gdnn'
                  ? [
                      { name: 'Giám đốc Trung tâm', signer: 'Trần Văn B' },
                      { name: 'Phó Giám đốc Trung tâm', signer: 'Lê Văn D' },
                    ]
                  : [
                      { name: 'Giám đốc Công ty', signer: 'Nguyễn Thị C' },
                      { name: 'Phó Giám đốc Công ty', signer: 'Phạm Văn E' },
                    ]
                ).map((p, i) => (
                  <label
                    key={p.name}
                    className="flex items-center"
                    style={{
                      gap: 12,
                      padding: 14,
                      border: '1px solid var(--rule)',
                      borderRadius: 6,
                      cursor: 'pointer',
                      background: i === 0 ? 'var(--paper-deep)' : 'var(--paper-raised)',
                    }}
                  >
                    <input type="radio" name="hoso" defaultChecked={i === 0} className="qlcv-check" style={{ borderRadius: 999 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{p.name}</div>
                      <div className="cell-meta">Người ký: {p.signer}</div>
                    </div>
                    <Pill variant={unit}>{unit.toUpperCase()}</Pill>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h2 className="section-title" style={{ marginBottom: 16 }}>
                Vị trí mộc &amp; chữ ký
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', marginBottom: 16 }}>
                Hệ thống tự dò vị trí (placeholder → regex → template → kéo thả). Xem trước rồi tinh chỉnh.
              </p>
              <div
                className="flex items-center justify-center"
                style={{
                  aspectRatio: '1 / 1.414',
                  maxWidth: 360,
                  margin: '0 auto',
                  background: 'var(--paper-raised)',
                  border: '1px solid var(--rule)',
                  borderRadius: 6,
                  position: 'relative',
                }}
              >
                <span className="cell-meta">Xem trước trang cuối</span>
                <div
                  className="flex items-center justify-center"
                  style={{
                    position: 'absolute',
                    right: '18%',
                    bottom: '14%',
                    width: 84,
                    height: 84,
                    borderRadius: 999,
                    border: '2px solid var(--danger)',
                    color: 'var(--danger)',
                    fontSize: '0.6rem',
                    textAlign: 'center',
                    opacity: 0.75,
                  }}
                >
                  MỘC ĐƠN VỊ
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div>
              <h2 className="section-title" style={{ marginBottom: 16 }}>
                Đóng giáp lai &amp; ký nháy
              </h2>
              <div className="flex flex-col" style={{ gap: 20 }}>
                <div>
                  <label className="field-label">Đóng giáp lai</label>
                  <div className="seg">
                    <button data-active="true">Không</button>
                    <button>Toàn bộ</button>
                    <button>Theo khoảng trang</button>
                  </div>
                </div>
                <div>
                  <label className="field-label">Ký nháy mỗi trang</label>
                  <div className="seg">
                    <button data-active="true">Không</button>
                    <button>Toàn bộ</button>
                    <button>Theo khoảng trang</button>
                  </div>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                  Giáp lai dùng chính mộc của hồ sơ ký đã chọn, cắt thành nhiều phần dọc theo số trang.
                </p>
              </div>
            </div>
          )}

          {step === 6 && (
            <div>
              <h2 className="section-title" style={{ marginBottom: 16 }}>
                Xác nhận chống nhầm mộc
              </h2>
              <div
                style={{
                  padding: 18,
                  borderRadius: 6,
                  background: 'var(--warning-soft)',
                  border: '1px solid var(--rule-strong)',
                  marginBottom: 20,
                  display: 'flex',
                  gap: 12,
                }}
              >
                <ShieldAlert size={20} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                <div style={{ fontSize: '0.9rem', color: 'var(--ink)' }}>
                  Phát hành công văn với mộc của{' '}
                  <strong>{unit === 'gdnn' ? 'TRUNG TÂM GDNN THÀNH ĐẠT' : 'CÔNG TY CP DVDL THÀNH ĐẠT'}</strong>. Đúng chứ?
                </div>
              </div>

              <label className="field-label">Cấp số công văn</label>
              <div className="flex flex-col" style={{ gap: 10 }}>
                <label className="flex items-center" style={{ gap: 12, padding: 14, border: '1px solid var(--rule)', borderRadius: 6, cursor: 'pointer', background: 'var(--paper-deep)' }}>
                  <input type="radio" name="capso" defaultChecked className="qlcv-check" style={{ borderRadius: 999 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: 'var(--ink)' }}>Tự cấp số</div>
                    <div className="cell-meta">
                      Số kế tiếp:{' '}
                      <span className="num">{unit === 'gdnn' ? '249/2026/CV-GDNN-TĐ' : '091/2026/CV-DVDL-TĐ'}</span>
                    </div>
                  </div>
                  <Hash size={16} style={{ color: 'var(--ink-muted)' }} />
                </label>
                <label className="flex items-center" style={{ gap: 12, padding: 14, border: '1px solid var(--rule)', borderRadius: 6, cursor: 'pointer' }}>
                  <input type="radio" name="capso" className="qlcv-check" style={{ borderRadius: 999 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: 'var(--ink)' }}>Dùng số có sẵn</div>
                    <div className="cell-meta">Nhập số đã in trên file Word — hệ thống kiểm tra trùng</div>
                  </div>
                </label>
              </div>
            </div>
          )}

          {step === 7 && (
            <div>
              <div className="flex items-center" style={{ gap: 12, marginBottom: 20 }}>
                <span
                  className="flex items-center justify-center"
                  style={{ width: 44, height: 44, borderRadius: 999, background: 'var(--success-soft)', flexShrink: 0 }}
                >
                  <Check size={24} style={{ color: 'var(--success)' }} />
                </span>
                <div>
                  <h2 className="section-title">Đã cấp số — chờ ký số</h2>
                  <div className="cell-mono num">{soCV}</div>
                </div>
              </div>

              {/* Bước 1 */}
              <div className="card" style={{ padding: 18, marginBottom: 12 }}>
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
                      Mở file bằng vSign + USB Token Viettel-CA để ký số (ngoài hệ thống), rồi quay lại.
                    </div>
                    <button className="btn-secondary">
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
                    <div style={{ fontWeight: 600, color: 'var(--ink)' }}>Tải lên bản đã ký số để hoàn tất phát hành</div>
                    <div className="cell-meta" style={{ marginBottom: 12 }}>
                      Hệ thống kiểm tra số CV trong tên file để tránh nhầm, rồi chuyển trạng thái “Đã phát hành”.
                    </div>
                    <button className="btn-primary" onClick={() => setSignOpen(true)}>
                      <FileCheck2 size={14} /> Tải lên bản đã ký số
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end" style={{ marginTop: 20 }}>
                <button className="btn-ghost" onClick={() => navigate('/cong-van-di')}>
                  Để sau, về danh sách
                </button>
              </div>
            </div>
          )}

          {/* Footer nav */}
          {step < 7 && (
            <div className="flex items-center justify-between" style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--rule)' }}>
              <button className="btn-secondary" disabled={step === 1} onClick={() => setStep((s) => Math.max(1, s - 1))} style={step === 1 ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}>
                <ArrowLeft size={14} /> Quay lại
              </button>
              <span className="cell-meta">
                Bước {step} / {steps.length}
              </span>
              <button className="btn-primary" onClick={() => setStep((s) => Math.min(7, s + 1))}>
                {step === 6 ? 'Xác nhận phát hành' : 'Tiếp tục'} <ArrowRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Upload bản đã ký số → hoàn tất phát hành */}
      <Modal
        open={signOpen}
        onClose={() => setSignOpen(false)}
        title="Tải lên bản đã ký số"
        actions={
          <>
            <button className="btn-secondary" onClick={() => setSignOpen(false)}>
              Huỷ
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                setSignOpen(false)
                navigate('/cong-van-di')
              }}
            >
              <FileCheck2 size={14} /> Xác nhận phát hành
            </button>
          </>
        }
      >
        <div className="card" style={{ padding: 12, background: 'var(--paper-deep)' }}>
          <div className="cell-meta">Công văn</div>
          <div className="cell-mono num">{soCV}</div>
        </div>
        <div
          className="flex flex-col items-center justify-center"
          style={{ border: '1.5px dashed var(--rule-strong)', borderRadius: 8, padding: '32px 20px', gap: 10, background: 'var(--paper-deep)', textAlign: 'center' }}
        >
          <UploadCloud size={32} strokeWidth={1.25} style={{ color: 'var(--kinpaku-deep)' }} />
          <div style={{ fontWeight: 500, color: 'var(--ink)' }}>Kéo thả PDF đã ký số bằng vSign + USB Token</div>
          <div className="cell-meta">Hệ thống kiểm tra số CV trong tên file để tránh upload nhầm</div>
          <button className="btn-secondary">Chọn file</button>
        </div>
        <p className="cell-meta">Sau khi xác nhận, công văn chuyển trạng thái “Đã phát hành” và vào sổ chính thức.</p>
      </Modal>
    </>
  )
}
