import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Download, Upload, Search, FileSearch, ChevronUp, ChevronDown, FileCheck2, UploadCloud, Tag as TagIcon } from 'lucide-react'
import { FilterSelect, PageHeader, Pagination, TypeTag, UnitPill, EmptyState } from '../components/ui'
import { Drawer } from '../components/Drawer'
import { Modal } from '../components/Modal'
import { CongVanDiDetailBody } from '../components/details/CongVanDiDetailBody'

type Status = 'draft' | 'published' | 'cancelled'
type Unit = 'gdnn' | 'dvdl'

interface Row {
  soCV: string
  subject: string
  reply: string | null
  unit: Unit
  type: string
  signer: string
  date: string
  status: Status
}

const rows: Row[] = [
  { soCV: '247/2026/CV-GDNN-TĐ', subject: 'V/v đăng ký tham gia Hội thi tay nghề cấp tỉnh năm 2026', reply: null, unit: 'gdnn', type: 'CV', signer: 'Trần Văn B', date: '15/06/2026', status: 'published' },
  { soCV: '089/2026/CV-DVDL-TĐ', subject: 'V/v báo cáo doanh thu Quý 2 năm 2026 gửi Sở Du lịch', reply: null, unit: 'dvdl', type: 'CV', signer: 'Nguyễn Thị C', date: '14/06/2026', status: 'published' },
  { soCV: '248/2026/CV-GDNN-TĐ', subject: 'V/v đề xuất bổ sung kinh phí đào tạo nghề năm 2026', reply: null, unit: 'gdnn', type: 'TTr', signer: 'Trần Văn B', date: '-', status: 'draft' },
  { soCV: '052/2026/QĐ-DVDL-TĐ', subject: 'Quyết định bổ nhiệm Trưởng phòng Kinh doanh', reply: null, unit: 'dvdl', type: 'QĐ', signer: 'Nguyễn Thị C', date: '10/06/2026', status: 'published' },
  { soCV: '246/2026/CV-GDNN-TĐ', subject: 'V/v cử cán bộ tham dự tập huấn nghiệp vụ tại Hà Nội', reply: 'Phản hồi CV đến số 12/CV-TCGDNN', unit: 'gdnn', type: 'CV', signer: 'Trần Văn B', date: '08/06/2026', status: 'published' },
  { soCV: '090/2026/CV-DVDL-TĐ', subject: 'V/v rà soát hợp đồng cung cấp dịch vụ lưu trú', reply: null, unit: 'dvdl', type: 'CV', signer: 'Lê Văn D', date: '-', status: 'draft' },
  { soCV: '245/2026/TB-GDNN-TĐ', subject: 'Thông báo lịch nghỉ Lễ 30/4 - 1/5', reply: null, unit: 'gdnn', type: 'TB', signer: 'Trần Văn B', date: '25/04/2026', status: 'published' },
  { soCV: '049/2026/CV-DVDL-TĐ', subject: 'V/v đăng ký nhận hồ sơ ưu đãi thuế năm 2026', reply: null, unit: 'dvdl', type: 'CV', signer: 'Nguyễn Thị C', date: '02/06/2026', status: 'cancelled' },
]

const statusMap: Record<Status, { cls: string; text: string; dot: boolean }> = {
  draft: { cls: 'pill-draft', text: 'Draft', dot: false },
  published: { cls: 'pill-published', text: 'Phát hành', dot: true },
  cancelled: { cls: 'pill-cancelled', text: 'Huỷ', dot: false },
}

type SortKey = 'soCV' | 'signer' | 'date'
const parseDate = (d: string) => {
  if (d === '-') return 0
  const [dd, mm, yy] = d.split('/')
  return Number(`${yy}${mm}${dd}`)
}

function SortTh({
  label,
  field,
  sort,
  onSort,
  width,
}: {
  label: string
  field: SortKey
  sort: { key: SortKey; dir: 1 | -1 } | null
  onSort: (k: SortKey) => void
  width?: number
}) {
  const active = sort?.key === field
  return (
    <th style={{ width }}>
      <button
        onClick={() => onSort(field)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', color: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4, textTransform: 'inherit', letterSpacing: 'inherit' }}
      >
        {label}
        {active &&
          (sort!.dir === 1 ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
      </button>
    </th>
  )
}

function SoCV({ soCV }: { soCV: string }) {
  const parts = soCV.split('/')
  return (
    <div className="cell-mono">
      <span className="num">{parts[0]}</span>/{parts.slice(1).join('/')}
    </div>
  )
}

export function CongVanDiPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const cv = params.get('cv')
  const selRow = rows.find((r) => r.soCV.split('/')[0] === cv)

  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [signUpload, setSignUpload] = useState<Row | null>(null)

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    let out = rows.filter((r) => !q || r.soCV.toLowerCase().includes(q) || r.subject.toLowerCase().includes(q))
    if (sort) {
      out = [...out].sort((a, b) => {
        let v = 0
        if (sort.key === 'soCV') v = parseInt(a.soCV) - parseInt(b.soCV)
        else if (sort.key === 'date') v = parseDate(a.date) - parseDate(b.date)
        else v = a.signer.localeCompare(b.signer, 'vi')
        return v * sort.dir
      })
    }
    return out
  }, [query, sort])

  const onSort = (k: SortKey) =>
    setSort((s) => (s?.key === k ? { key: k, dir: s.dir === 1 ? -1 : 1 } : { key: k, dir: 1 }))

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  const allChecked = list.length > 0 && list.every((r) => selected.has(r.soCV))
  const toggleAll = () =>
    setSelected(allChecked ? new Set() : new Set(list.map((r) => r.soCV)))

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Công văn đi' }]}
        title="Danh sách công văn đi"
        subhead="247 công văn: 156 đã phát hành, 89 đang soạn, 2 huỷ"
        actions={
          <>
            <button className="btn-secondary">
              <Download size={14} />
              Xuất Excel
            </button>
            <button className="btn-primary" onClick={() => navigate('/cong-van-di/soan')}>
              <Upload size={14} />
              Nạp công văn mới
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
                placeholder="Tìm số CV / trích yếu…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <FilterSelect label="Đơn vị:" value="Tất cả" />
            <FilterSelect label="Thời gian:" value="Năm 2026" />
            <FilterSelect label="Loại VB:" value="Tất cả" />
            <FilterSelect label="Trạng thái:" value="Tất cả" />
            <FilterSelect label="Người ký:" value="Tất cả" />
            <FilterSelect label="Nơi nhận:" value="Tất cả" />
            <div className="flex-1" />
            <button className="btn-ghost" onClick={() => { setQuery(''); setSort(null) }}>
              Đặt lại bộ lọc
            </button>
          </>
        }
      />

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div
          className="card flex items-center flex-wrap"
          style={{ padding: '10px 16px', gap: 12, marginBottom: 12, background: 'var(--kinpaku-pale)', borderColor: 'var(--rule-strong)' }}
        >
          <span style={{ fontWeight: 600, color: 'var(--ink)', fontSize: '0.85rem' }}>Đã chọn {selected.size}</span>
          <div className="flex-1" />
          <button className="btn-secondary" style={{ height: 32 }}>
            <Download size={13} /> Xuất Excel
          </button>
          <button className="btn-secondary" style={{ height: 32 }}>
            <TagIcon size={13} /> Gắn tag
          </button>
          <button className="btn-secondary" style={{ height: 32, color: 'var(--danger)' }}>
            Huỷ công văn
          </button>
          <button className="btn-ghost" onClick={() => setSelected(new Set())}>
            Bỏ chọn
          </button>
        </div>
      )}

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-scroll">
          <table className="qlcv-table">
            <thead>
              <tr>
                <th style={{ width: 48, paddingLeft: 24 }}>
                  <input type="checkbox" className="qlcv-check" aria-label="Chọn tất cả" checked={allChecked} onChange={toggleAll} />
                </th>
                <SortTh label="Số CV" field="soCV" sort={sort} onSort={onSort} width={200} />
                <th>Trích yếu</th>
                <th className="center" style={{ width: 100 }}>
                  Đơn vị
                </th>
                <th style={{ width: 80 }}>Loại</th>
                <SortTh label="Người ký" field="signer" sort={sort} onSort={onSort} width={140} />
                <SortTh label="Phát hành" field="date" sort={sort} onSort={onSort} width={120} />
                <th style={{ width: 110, paddingRight: 24 }}>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const s = statusMap[r.status]
                const goDetail = () => setParams({ cv: r.soCV.split('/')[0] })
                return (
                  <tr key={r.soCV} onClick={goDetail} style={{ cursor: 'pointer' }}>
                    <td style={{ paddingLeft: 24 }} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="qlcv-check" aria-label="Chọn dòng" checked={selected.has(r.soCV)} onChange={() => toggle(r.soCV)} />
                    </td>
                    <td>
                      <SoCV soCV={r.soCV} />
                    </td>
                    <td>
                      <div className="subject">{r.subject}</div>
                      {r.reply && <span className="subject-link">↳ {r.reply}</span>}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <UnitPill unit={r.unit} />
                    </td>
                    <td>
                      <TypeTag>{r.type}</TypeTag>
                    </td>
                    <td>
                      <span className="signer">{r.signer}</span>
                    </td>
                    <td>
                      <span className={r.date === '-' ? 'cell-meta dash' : 'cell-meta'}>{r.date}</span>
                    </td>
                    <td style={{ paddingRight: 24 }}>
                      <span className={`pill ${s.cls}`}>
                        {s.dot && <span className="dot" />}
                        {s.text}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {list.length === 0 && (
            <EmptyState icon={FileSearch} title="Không tìm thấy công văn" desc={`Không có kết quả cho “${query}”`} />
          )}
        </div>

        {list.length > 0 && <Pagination rangeLabel={`Hiện 1-${list.length} / 247 công văn`} />}
      </div>

      <Drawer
        open={!!cv}
        onClose={() => setParams({})}
        eyebrow="Công văn đi"
        title={cv ? `Công văn ${cv}/2026/CV-GDNN-TĐ` : ''}
        actions={
          selRow?.status === 'draft' ? (
            <>
              <button className="btn-secondary" style={{ height: 32 }}>
                <Download size={13} /> Tải PDF chưa ký
              </button>
              <button className="btn-secondary" style={{ height: 32 }} onClick={() => navigate('/cong-van-di/soan')}>
                Sửa nháp
              </button>
              <button className="btn-secondary" style={{ height: 32, color: 'var(--danger)' }}>
                Huỷ
              </button>
              <button className="btn-primary" style={{ height: 32 }} onClick={() => selRow && setSignUpload(selRow)}>
                <FileCheck2 size={13} /> Tải lên bản đã ký số
              </button>
            </>
          ) : (
            <>
              <button className="btn-secondary" style={{ height: 32 }}>
                <Download size={13} /> Tải PDF
              </button>
              <button className="btn-secondary" style={{ height: 32 }}>
                Tải bản gốc
              </button>
              <button className="btn-secondary" style={{ height: 32, color: 'var(--danger)' }}>
                Thu hồi
              </button>
            </>
          )
        }
      >
        {cv && <CongVanDiDetailBody id={cv} status={selRow?.status} />}
      </Drawer>

      {/* Upload bản đã ký số → Draft sang Đã phát hành */}
      <Modal
        open={!!signUpload}
        onClose={() => setSignUpload(null)}
        title="Tải lên bản đã ký số"
        actions={
          <>
            <button className="btn-secondary" onClick={() => setSignUpload(null)}>
              Huỷ
            </button>
            <button className="btn-primary" onClick={() => setSignUpload(null)}>
              <FileCheck2 size={14} /> Xác nhận phát hành
            </button>
          </>
        }
      >
        {signUpload && (
          <>
            <div className="card" style={{ padding: 12, background: 'var(--paper-deep)' }}>
              <div className="cell-meta">Công văn</div>
              <div className="cell-mono num">{signUpload.soCV}</div>
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
          </>
        )}
      </Modal>
    </>
  )
}
