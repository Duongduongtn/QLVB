import { ArrowLeft, FileSpreadsheet, Table2, ListFilter, LayoutGrid } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/ui'

const sheets = [
  { icon: LayoutGrid, name: 'Sheet 1 · Tổng quan', desc: 'Pivot CV theo Tháng × Loại VB + biểu đồ cột' },
  { icon: Table2, name: 'Sheet 2 · Chi tiết', desc: 'Liệt kê từng CV với metadata đầy đủ' },
  { icon: ListFilter, name: 'Sheet 3 · Tham số', desc: 'Ghi lại bộ lọc đã chọn khi xuất' },
]

export function BaoCaoTuyChinhPage() {
  const navigate = useNavigate()
  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Báo cáo', to: '/bao-cao' }, { label: 'Báo cáo tuỳ chỉnh' }]}
        title="Báo cáo thống kê tuỳ chỉnh"
        subhead="Lọc theo nhiều tiêu chí → xuất Excel 3 sheet (Tổng quan · Chi tiết · Tham số)"
        actions={
          <button className="btn-ghost" onClick={() => navigate('/bao-cao')}>
            <ArrowLeft size={14} /> Quay lại
          </button>
        }
      />

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 24, alignItems: 'start' }}>
        {/* Bộ lọc */}
        <div className="card" style={{ padding: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>
            Tiêu chí
          </div>
          <div className="flex flex-col" style={{ gap: 16 }}>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="field-label">Từ ngày</label>
                <input className="text-input" defaultValue="01/01/2026" />
              </div>
              <div>
                <label className="field-label">Đến ngày</label>
                <input className="text-input" defaultValue="30/06/2026" />
              </div>
            </div>
            <div>
              <label className="field-label">Đơn vị</label>
              <select className="text-input" defaultValue="all">
                <option value="all">Tất cả</option>
                <option value="gdnn">Trung tâm GDNN</option>
                <option value="dvdl">Công ty CP DVDL</option>
              </select>
            </div>
            <div>
              <label className="field-label">Loại văn bản</label>
              <select className="text-input" defaultValue="all">
                <option value="all">Tất cả</option>
                <option>Công văn (CV)</option>
                <option>Quyết định (QĐ)</option>
                <option>Tờ trình (TTr)</option>
                <option>Thông báo (TB)</option>
              </select>
            </div>
            <div>
              <label className="field-label">Nhóm theo</label>
              <div className="seg">
                <button data-active="true">Tháng</button>
                <button>Quý</button>
                <button>Cơ quan</button>
                <button>Loại</button>
              </div>
            </div>
          </div>
        </div>

        {/* Preview output */}
        <div className="card" style={{ padding: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>
            File Excel sẽ xuất
          </div>
          <div className="flex flex-col" style={{ gap: 10 }}>
            {sheets.map((s) => {
              const Icon = s.icon
              return (
                <div key={s.name} className="flex items-center" style={{ gap: 12, padding: 14, border: '1px solid var(--rule)', borderRadius: 6 }}>
                  <span className="flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--success-soft)', color: 'var(--success)', flexShrink: 0 }}>
                    <Icon size={18} />
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: '0.88rem' }}>{s.name}</div>
                    <div className="cell-meta">{s.desc}</div>
                  </div>
                </div>
              )
            })}
          </div>
          <button className="btn-primary" style={{ marginTop: 18, width: '100%', justifyContent: 'center' }}>
            <FileSpreadsheet size={14} /> Xuất Excel báo cáo
          </button>
        </div>
      </div>
    </>
  )
}
