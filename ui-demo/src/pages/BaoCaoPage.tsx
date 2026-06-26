import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, FileSpreadsheet, FileArchive, TrendingUp, TrendingDown } from 'lucide-react'
import { PageHeader, FilterSelect } from '../components/ui'
import { Modal } from '../components/Modal'

const months = [
  { m: 'T1', di: 32, den: 18 },
  { m: 'T2', di: 28, den: 22 },
  { m: 'T3', di: 41, den: 25 },
  { m: 'T4', di: 38, den: 19 },
  { m: 'T5', di: 45, den: 28 },
  { m: 'T6', di: 36, den: 12 },
]

const kpis = [
  { label: 'CV đi tháng này', value: '36', delta: '+12%', up: true },
  { label: 'CV đến tháng này', value: '12', delta: '-8%', up: false },
  { label: 'CV chưa xử lý', value: '3', delta: '', up: true },
  { label: 'Tỉ lệ đúng hạn', value: '94%', delta: '+3%', up: true },
]

export function BaoCaoPage() {
  const max = Math.max(...months.flatMap((m) => [m.di, m.den]))
  const navigate = useNavigate()
  const [modal, setModal] = useState<'nd30' | 'zip' | null>(null)
  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Báo cáo' }]}
        title="Báo cáo & Dashboard"
        subhead="Tổng quan công văn 2 đơn vị năm 2026"
        actions={
          <>
            <button className="btn-secondary" onClick={() => setModal('nd30')}>
              <FileSpreadsheet size={14} /> Xuất sổ NĐ 30
            </button>
            <button className="btn-secondary" onClick={() => setModal('zip')}>
              <FileArchive size={14} /> Export ZIP năm
            </button>
            <button className="btn-primary" onClick={() => navigate('/bao-cao/tuy-chinh')}>
              <Download size={14} /> Báo cáo tuỳ chỉnh
            </button>
          </>
        }
        filters={
          <>
            <FilterSelect label="Đơn vị:" value="Tất cả" />
            <FilterSelect label="Thời gian:" value="Năm 2026" />
            <FilterSelect label="Nhóm theo:" value="Tháng" />
          </>
        }
      />

      {/* KPI cards */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        {kpis.map((k) => (
          <div key={k.label} className="kpi-card">
            <span className="kpi-label">{k.label}</span>
            <div className="flex items-baseline" style={{ gap: 8 }}>
              <span className="kpi-value">{k.value}</span>
              {k.delta && (
                <span
                  className="flex items-center"
                  style={{ gap: 2, fontSize: '0.78rem', color: k.up ? 'var(--success)' : 'var(--danger)' }}
                >
                  {k.up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                  {k.delta}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div className="card" style={{ padding: 24 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
          <span className="section-title">Công văn theo tháng</span>
          <div className="flex items-center" style={{ gap: 16, fontSize: '0.78rem' }}>
            <span className="flex items-center" style={{ gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--kinpaku-rich)' }} /> CV đi
            </span>
            <span className="flex items-center" style={{ gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--unit-gdnn)' }} /> CV đến
            </span>
          </div>
        </div>
        <div className="flex items-end justify-between" style={{ gap: 16, height: 220 }}>
          {months.map((m) => (
            <div key={m.m} className="flex flex-col items-center" style={{ flex: 1, gap: 8 }}>
              <div className="flex items-end justify-center" style={{ gap: 6, height: 180, width: '100%' }}>
                <div
                  title={`CV đi: ${m.di}`}
                  style={{ width: 18, height: `${(m.di / max) * 100}%`, background: 'var(--kinpaku-rich)', borderRadius: '3px 3px 0 0' }}
                />
                <div
                  title={`CV đến: ${m.den}`}
                  style={{ width: 18, height: `${(m.den / max) * 100}%`, background: 'var(--unit-gdnn)', borderRadius: '3px 3px 0 0' }}
                />
              </div>
              <span className="cell-meta">{m.m}</span>
            </div>
          ))}
        </div>
      </div>

      {/* G2 — Xuất sổ NĐ 30 */}
      <Modal
        open={modal === 'nd30'}
        onClose={() => setModal(null)}
        title="Xuất sổ theo NĐ 30/2020"
        actions={
          <>
            <button className="btn-secondary" onClick={() => setModal(null)}>
              Huỷ
            </button>
            <button className="btn-primary" onClick={() => setModal(null)}>
              <FileSpreadsheet size={14} /> Tải Excel
            </button>
          </>
        }
      >
        <div>
          <label className="field-label">Năm</label>
          <select className="text-input" defaultValue="2026">
            <option>2026</option>
            <option>2025</option>
          </select>
        </div>
        <div>
          <label className="field-label">Loại sổ</label>
          <select className="text-input">
            <option>Sổ đi GDNN</option>
            <option>Sổ đi DVDL</option>
            <option>Sổ đến (chung 2 đơn vị)</option>
          </select>
        </div>
        <p className="cell-meta">Excel đúng template Phụ lục III NĐ 30/2020, có đủ cột chuẩn + tiếng Việt có dấu.</p>
      </Modal>

      {/* G4 — Export ZIP theo năm */}
      <Modal
        open={modal === 'zip'}
        onClose={() => setModal(null)}
        title="Export ZIP toàn bộ CV theo năm"
        actions={
          <>
            <button className="btn-secondary" onClick={() => setModal(null)}>
              Huỷ
            </button>
            <button className="btn-primary" onClick={() => setModal(null)}>
              <FileArchive size={14} /> Tạo ZIP
            </button>
          </>
        }
      >
        <div>
          <label className="field-label">Năm xuất</label>
          <select className="text-input" defaultValue="2026">
            <option>2026</option>
            <option>2025</option>
          </select>
        </div>
        <div className="card" style={{ padding: 14, background: 'var(--paper-deep)' }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Cấu trúc ZIP
          </div>
          {['2026-CV-Den/', '2026-CV-Di-GDNN/', '2026-CV-Di-DVDL/', 'index.xlsx + index.pdf (mẫu NĐ 30)'].map((f) => (
            <div key={f} className="cell-mono" style={{ fontSize: '0.75rem', padding: '2px 0' }}>
              {f}
            </div>
          ))}
        </div>
        <p className="cell-meta">Mỗi PDF kèm metadata.json. ZIP &gt; 2GB sẽ gợi ý chia theo quý.</p>
      </Modal>
    </>
  )
}
