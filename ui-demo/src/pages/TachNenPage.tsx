import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { UploadCloud, Stamp, PenTool, Save, ArrowLeft, Sparkles } from 'lucide-react'
import { PageHeader, UnitPill } from '../components/ui'

export function TachNenPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const type = params.get('type') === 'chu-ky' ? 'chu-ky' : 'moc'
  const [threshold, setThreshold] = useState(60)

  const isMoc = type === 'moc'
  const Icon = isMoc ? Stamp : PenTool
  const accent = isMoc ? 'var(--danger)' : 'var(--ink)'

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Mộc & Chữ ký', to: isMoc ? '/moc-chu-ky/moc' : '/moc-chu-ky/chu-ky' }, { label: 'Tách nền' }]}
        title={isMoc ? 'Tải & tách nền mộc' : 'Tải & tách nền chữ ký'}
        subhead={
          isMoc
            ? 'Mộc đỏ tách nền bằng AI (rembg/U2Net), giữ nguyên màu đỏ gốc'
            : 'Chữ ký tách nền bằng OpenCV threshold, giữ nét bút mảnh'
        }
        actions={
          <button className="btn-ghost" onClick={() => navigate(isMoc ? '/moc-chu-ky/moc' : '/moc-chu-ky/chu-ky')}>
            <ArrowLeft size={14} /> Quay lại
          </button>
        }
      />

      {/* chọn loại */}
      <div className="seg" style={{ marginBottom: 20 }}>
        <button data-active={isMoc ? 'true' : undefined} onClick={() => navigate('/moc-chu-ky/upload?type=moc')}>
          Mộc
        </button>
        <button data-active={!isMoc ? 'true' : undefined} onClick={() => navigate('/moc-chu-ky/upload?type=chu-ky')}>
          Chữ ký
        </button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 24, alignItems: 'start' }}>
        {/* Cột trái: upload + cấu hình */}
        <div className="card" style={{ padding: 24 }}>
          <div
            className="flex flex-col items-center justify-center"
            style={{ border: '1.5px dashed var(--rule-strong)', borderRadius: 8, padding: '40px 24px', gap: 12, background: 'var(--paper-deep)', textAlign: 'center', marginBottom: 20 }}
          >
            <UploadCloud size={36} strokeWidth={1.25} style={{ color: 'var(--kinpaku-deep)' }} />
            <div style={{ fontWeight: 500, color: 'var(--ink)' }}>Kéo thả ảnh chụp giấy hoặc bấm để chọn</div>
            <div className="cell-meta">PNG/JPG ≤ {isMoc ? '5MB' : '2MB'} · file &gt;5MB tự resize</div>
            <button className="btn-secondary" style={{ marginTop: 8 }}>
              Chọn ảnh
            </button>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label className="field-label">Đơn vị</label>
            <div className="seg">
              <button data-active="true" data-unit="gdnn">
                GDNN
              </button>
              <button data-unit="dvdl">DVDL</button>
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label className="field-label">Tên hiển thị</label>
            <input className="text-input" defaultValue={isMoc ? 'Mộc tròn GDNN' : 'Trần Văn B — Giám đốc'} />
          </div>

          <div>
            <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
              <label className="field-label" style={{ margin: 0 }}>
                Ngưỡng tách nền
              </label>
              <span className="cell-mono num">{threshold}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--kinpaku-rich)' }}
            />
            <p className="cell-meta" style={{ marginTop: 8 }}>
              Kéo thử rồi xem preview bên phải. Tách thất bại → tải lên bản đã tách sẵn.
            </p>
          </div>
        </div>

        {/* Cột phải: preview before/after */}
        <div className="card" style={{ padding: 24 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
            <span className="eyebrow">Xem trước</span>
            <UnitPill unit="gdnn" />
          </div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {[
              { label: 'Ảnh gốc', bg: 'var(--paper-deep)', faded: false },
              { label: 'Đã tách nền', checker: true, faded: false },
            ].map((p) => (
              <div key={p.label}>
                <div className="cell-meta" style={{ marginBottom: 6, textAlign: 'center' }}>
                  {p.label}
                </div>
                <div
                  className="flex items-center justify-center"
                  style={{
                    aspectRatio: '1 / 1',
                    borderRadius: 6,
                    border: '1px solid var(--rule)',
                    background: p.checker
                      ? 'repeating-conic-gradient(var(--light-graphite) 0% 25%, var(--paper-raised) 0% 50%) 50% / 16px 16px'
                      : 'var(--paper-deep)',
                  }}
                >
                  <Icon size={56} strokeWidth={1.1} style={{ color: accent, opacity: p.checker ? 0.9 : 0.45 }} />
                </div>
              </div>
            ))}
          </div>
          <div
            className="flex items-center"
            style={{ gap: 8, marginTop: 16, padding: 12, borderRadius: 6, background: 'var(--info-soft)' }}
          >
            <Sparkles size={15} style={{ color: 'var(--info)' }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--ink)' }}>
              Xử lý ≤ 5 giây/file. Duyệt bằng mắt — không đo chất lượng tự động.
            </span>
          </div>
          <button className="btn-primary" style={{ marginTop: 16, width: '100%', justifyContent: 'center' }} onClick={() => navigate(isMoc ? '/moc-chu-ky/moc' : '/moc-chu-ky/chu-ky')}>
            <Save size={14} /> Lưu phiên bản đã tách nền
          </button>
        </div>
      </div>
    </>
  )
}
