import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Upload, ShieldCheck, Download, Search, FileSearch, ChevronUp, ChevronDown, EyeOff, FileArchive } from 'lucide-react'
import { FilterSelect, PageHeader, Pagination, Pill, UnitPill, EmptyState } from '../components/ui'
import { Drawer } from '../components/Drawer'
import { Modal } from '../components/Modal'
import { CongVanDenDetailBody } from '../components/details/CongVanDenDetailBody'

type Urgency = 'thuong' | 'khan' | 'hoatoc'
type ProcState = 'new' | 'done' | 'cancelled'

interface Row {
  soDen: string
  kyHieu: string
  subject: string
  from: string
  unit: 'gdnn' | 'dvdl' | 'both'
  urgency: Urgency
  signed: boolean
  date: string
  state: ProcState
  restricted?: boolean
}

const rows: Row[] = [
  { soDen: '0124', kyHieu: '0124/CV-STC', subject: 'V/v hướng dẫn quyết toán kinh phí đào tạo nghề năm 2025', from: 'Sở Tài chính', unit: 'gdnn', urgency: 'thuong', signed: true, date: '22/06/2026', state: 'new' },
  { soDen: '0123', kyHieu: '0089/TB-SDL', subject: 'Thông báo lịch kiểm tra cơ sở lưu trú Quý 2 năm 2026', from: 'Sở Du lịch', unit: 'dvdl', urgency: 'khan', signed: true, date: '21/06/2026', state: 'new', restricted: true },
  { soDen: '0122', kyHieu: '0312/CV-UBND', subject: 'V/v góp ý dự thảo kế hoạch phát triển nhân lực địa phương', from: 'UBND Tỉnh', unit: 'both', urgency: 'thuong', signed: false, date: '20/06/2026', state: 'new' },
  { soDen: '0121', kyHieu: '0045/GM-LĐLĐ', subject: 'Giấy mời dự Hội nghị tổng kết phong trào thi đua năm 2026', from: 'Liên đoàn Lao động', urgency: 'hoatoc', unit: 'gdnn', signed: true, date: '19/06/2026', state: 'done' },
  { soDen: '0120', kyHieu: '0210/CV-TĐ', subject: 'V/v phối hợp tổ chức chương trình hướng nghiệp học sinh', from: 'Tỉnh Đoàn', unit: 'dvdl', urgency: 'thuong', signed: false, date: '18/06/2026', state: 'cancelled' },
]

const urgencyMap: Record<Urgency, { variant: string; text: string }> = {
  thuong: { variant: 'draft', text: 'Thường' },
  khan: { variant: 'warning', text: 'Khẩn' },
  hoatoc: { variant: 'cancelled', text: 'Hoả tốc' },
}

const stateMap: Record<ProcState, { variant: string; text: string; dot: boolean }> = {
  new: { variant: 'info', text: 'Mới', dot: true },
  done: { variant: 'success', text: 'Hoàn thành', dot: true },
  cancelled: { variant: 'cancelled', text: 'Huỷ', dot: false },
}

type SortKey = 'soDen' | 'date'
const parseDate = (d: string) => {
  const [dd, mm, yy] = d.split('/')
  return Number(`${yy}${mm}${dd}`)
}

function SortTh({ label, field, sort, onSort, width }: { label: string; field: SortKey; sort: { key: SortKey; dir: 1 | -1 } | null; onSort: (k: SortKey) => void; width?: number }) {
  const active = sort?.key === field
  return (
    <th style={{ width }}>
      <button onClick={() => onSort(field)} style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', color: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        {active && (sort!.dir === 1 ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
      </button>
    </th>
  )
}

export function CongVanDenPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [assignOpen, setAssignOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null)
  const cv = params.get('cv')
  const selRow = rows.find((r) => r.soDen === cv)

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    let out = rows.filter(
      (r) =>
        !q ||
        r.soDen.includes(q) ||
        r.kyHieu.toLowerCase().includes(q) ||
        r.subject.toLowerCase().includes(q) ||
        r.from.toLowerCase().includes(q),
    )
    if (sort) {
      out = [...out].sort((a, b) => {
        const v = sort.key === 'soDen' ? Number(a.soDen) - Number(b.soDen) : parseDate(a.date) - parseDate(b.date)
        return v * sort.dir
      })
    }
    return out
  }, [query, sort])

  const onSort = (k: SortKey) => setSort((s) => (s?.key === k ? { key: k, dir: s.dir === 1 ? -1 : 1 } : { key: k, dir: 1 }))

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Công văn đến' }]}
        title="Sổ công văn đến"
        subhead="124 công văn đến (sổ chung 2 đơn vị): 3 mới chưa xử lý"
        actions={
          <>
            <button className="btn-secondary">
              <Download size={14} />
              Xuất Excel
            </button>
            <button className="btn-primary" onClick={() => navigate('/cong-van-den/vao-so')}>
              <Upload size={14} />
              Vào sổ mới
            </button>
          </>
        }
        filters={
          <>
            <div className="relative">
              <Search size={15} className="absolute" style={{ left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-faint)' }} />
              <input
                className="search-input"
                style={{ width: 240, height: 36 }}
                placeholder="Tìm số đến / ký hiệu / cơ quan…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <FilterSelect label="Thời gian:" value="Năm 2026" />
            <FilterSelect label="Cơ quan gửi:" value="Tất cả" />
            <FilterSelect label="Mức khẩn:" value="Tất cả" />
            <FilterSelect label="Trạng thái:" value="Tất cả" />
            <FilterSelect label="Đơn vị xử lý:" value="Tất cả" />
            <FilterSelect label="Hiển thị:" value="Tất cả" />
            <div className="flex-1" />
            <button className="btn-ghost" onClick={() => { setQuery(''); setSort(null) }}>
              Đặt lại bộ lọc
            </button>
          </>
        }
      />

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-scroll">
          <table className="qlcv-table">
            <thead>
              <tr>
                <SortTh label="Số đến" field="soDen" sort={sort} onSort={onSort} width={80} />
                <th style={{ width: 150 }}>Số ký hiệu</th>
                <th>Trích yếu</th>
                <th style={{ width: 160 }}>Cơ quan gửi</th>
                <th className="center" style={{ width: 90 }}>
                  Xử lý
                </th>
                <th style={{ width: 90 }}>Khẩn</th>
                <SortTh label="Ngày đến" field="date" sort={sort} onSort={onSort} width={110} />
                <th style={{ width: 120, paddingRight: 24 }}>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const u = urgencyMap[r.urgency]
                const st = stateMap[r.state]
                return (
                  <tr key={r.soDen} onClick={() => setParams({ cv: r.soDen })} style={{ cursor: 'pointer' }}>
                    <td style={{ paddingLeft: 24 }}>
                      <span className="cell-mono num">{r.soDen}</span>
                    </td>
                    <td>
                      <span className="cell-mono">{r.kyHieu}</span>
                    </td>
                    <td>
                      <div className="flex items-center" style={{ gap: 6 }}>
                        {r.restricted && (
                          <EyeOff size={14} style={{ color: 'var(--warning)', flexShrink: 0 }} aria-label="Chỉ Quản lý xem" />
                        )}
                        <span className="subject">{r.subject}</span>
                        {r.signed && <ShieldCheck size={14} style={{ color: 'var(--success)', flexShrink: 0 }} aria-label="Đã ký số hợp lệ" />}
                      </div>
                    </td>
                    <td>
                      <span className="cell-meta">{r.from}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {r.unit === 'both' ? (
                        <div className="flex items-center justify-center" style={{ gap: 4 }}>
                          <UnitPill unit="gdnn" />
                          <UnitPill unit="dvdl" />
                        </div>
                      ) : (
                        <UnitPill unit={r.unit} />
                      )}
                    </td>
                    <td>
                      <Pill variant={u.variant}>{u.text}</Pill>
                    </td>
                    <td>
                      <span className="cell-meta">{r.date}</span>
                    </td>
                    <td style={{ paddingRight: 24 }}>
                      <Pill variant={st.variant} dot={st.dot}>
                        {st.text}
                      </Pill>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {list.length === 0 && (
            <EmptyState icon={FileSearch} title="Không tìm thấy công văn đến" desc={`Không có kết quả cho “${query}”`} />
          )}
        </div>
        {list.length > 0 && <Pagination rangeLabel={`Hiện 1-${list.length} / 124 công văn`} last={7} />}
      </div>

      <Drawer
        open={!!cv}
        onClose={() => setParams({})}
        eyebrow="Công văn đến"
        title={cv ? `Số đến ${cv} · 0124/CV-STC` : ''}
        actions={
          <>
            <button className="btn-secondary" style={{ height: 32 }}>
              <Download size={13} /> Tải PDF
            </button>
            <button className="btn-secondary" style={{ height: 32 }}>
              <FileArchive size={13} /> Tải ZIP
            </button>
            <button className="btn-secondary" style={{ height: 32 }}>
              {selRow?.restricted ? 'Bỏ ẩn' : 'Chỉ Quản lý xem'}
            </button>
            <button className="btn-secondary" style={{ height: 32, color: 'var(--danger)' }}>
              Huỷ vào sổ
            </button>
            <button className="btn-primary" style={{ height: 32 }} onClick={() => setAssignOpen(true)}>
              Phân công
            </button>
          </>
        }
      >
        {cv && <CongVanDenDetailBody id={cv} />}
      </Drawer>

      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Phân công xử lý"
        actions={
          <>
            <button className="btn-secondary" onClick={() => setAssignOpen(false)}>
              Huỷ
            </button>
            <button className="btn-primary" onClick={() => setAssignOpen(false)}>
              Giao việc
            </button>
          </>
        }
      >
        <div>
          <label className="field-label">Đơn vị xử lý</label>
          <div className="seg">
            <button data-active="true" data-unit="gdnn">
              GDNN
            </button>
            <button data-unit="dvdl">DVDL</button>
            <button>Cả 2 đơn vị</button>
          </div>
        </div>
        <div>
          <label className="field-label">Người xử lý</label>
          <select className="text-input">
            <option>Lê Văn D</option>
            <option>Phạm Văn E</option>
            <option>Hoàng Thị F</option>
          </select>
        </div>
        <div>
          <label className="field-label">Hạn xử lý</label>
          <input className="text-input" defaultValue="26/06/2026" />
        </div>
        <div>
          <label className="field-label">Ghi chú phân công</label>
          <textarea className="text-input" rows={3} placeholder="Nội dung cần xử lý…" />
        </div>
        <p className="cell-meta">Chọn “Cả 2 đơn vị” sẽ tạo 2 task xử lý độc lập.</p>
      </Modal>
    </>
  )
}
