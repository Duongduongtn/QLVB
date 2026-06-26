import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { PageHeader, FilterSelect, Pill, UnitPill } from '../components/ui'

interface Result {
  kind: 'di' | 'den'
  so: string
  subject: string
  meta: string
  unit: 'gdnn' | 'dvdl'
}

const results: Result[] = [
  { kind: 'di', so: '247/2026/CV-GDNN-TĐ', subject: 'V/v đăng ký tham gia Hội thi tay nghề cấp tỉnh năm 2026', meta: 'Người ký: Trần Văn B · 15/06/2026', unit: 'gdnn' },
  { kind: 'den', so: '0124/CV-STC', subject: 'V/v hướng dẫn quyết toán kinh phí đào tạo nghề năm 2025', meta: 'Sở Tài chính · đến 22/06/2026', unit: 'gdnn' },
  { kind: 'di', so: '089/2026/CV-DVDL-TĐ', subject: 'V/v báo cáo doanh thu Quý 2 năm 2026 gửi Sở Du lịch', meta: 'Người ký: Nguyễn Thị C · 14/06/2026', unit: 'dvdl' },
]

function highlight(text: string, kw: string) {
  const idx = text.toLowerCase().indexOf(kw.toLowerCase())
  if (idx === -1 || !kw) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'var(--kinpaku-pale)', color: 'var(--ink)', borderRadius: 2, padding: '0 1px' }}>
        {text.slice(idx, idx + kw.length)}
      </mark>
      {text.slice(idx + kw.length)}
    </>
  )
}

export function TimKiemPage() {
  const kw = 'tay nghề'
  const navigate = useNavigate()
  const openResult = (r: Result) => {
    const num = r.so.split('/')[0]
    navigate(r.kind === 'di' ? `/cong-van-di?cv=${num}` : `/cong-van-den?cv=${num}`)
  }
  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Tìm kiếm' }]}
        title="Tìm kiếm toàn văn"
        subhead="Tìm theo trích yếu, số CV, cơ quan, người ký và nội dung qua OCR — có dấu hay không dấu đều ra"
      />

      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <div className="relative" style={{ marginBottom: 16 }}>
          <Search size={18} className="absolute" style={{ left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-faint)' }} />
          <input
            className="text-input"
            style={{ height: 48, paddingLeft: 44, fontSize: '1rem' }}
            defaultValue={kw}
            placeholder="Nhập từ khoá… (vd: tay nghề, biên bản, quyết toán)"
          />
        </div>
        <div className="flex flex-wrap items-center" style={{ gap: 12 }}>
          <FilterSelect label="Loại:" value="Tất cả" />
          <FilterSelect label="Đơn vị:" value="Tất cả" />
          <FilterSelect label="Thời gian:" value="Năm 2026" />
          <FilterSelect label="Mức khẩn:" value="Tất cả" />
        </div>
      </div>

      <div className="cell-meta" style={{ marginBottom: 12 }}>
        Tìm thấy {results.length} kết quả cho “{kw}” (0,12 giây)
      </div>

      <div className="flex flex-col" style={{ gap: 12 }}>
        {results.map((r) => (
          <div key={r.so} className="card" style={{ padding: 18, cursor: 'pointer' }} onClick={() => openResult(r)}>
            <div className="flex items-center" style={{ gap: 8, marginBottom: 6 }}>
              <Pill variant={r.kind === 'di' ? 'published' : 'info'} dot>
                {r.kind === 'di' ? 'CV đi' : 'CV đến'}
              </Pill>
              <span className="cell-mono num">{r.so}</span>
              <UnitPill unit={r.unit} />
            </div>
            <div className="subject" style={{ marginBottom: 4 }}>
              {highlight(r.subject, kw)}
            </div>
            <div className="cell-meta">{r.meta}</div>
          </div>
        ))}
      </div>
    </>
  )
}
