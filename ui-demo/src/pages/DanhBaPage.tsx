import { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { PageHeader, Pill, Pagination, InfoRow, RowActions } from '../components/ui'
import { Drawer } from '../components/Drawer'

type Tab = 'noi-nhan' | 'co-quan-gui'

interface Org {
  name: string
  short: string
  address: string
  kind: 'chung' | 'gdnn' | 'dvdl'
  count: number
  last: string
}

const orgs: Record<Tab, Org[]> = {
  'noi-nhan': [
    { name: 'Sở Lao động – Thương binh và Xã hội', short: 'Sở LĐTBXH', address: 'TP. Tỉnh lỵ', kind: 'gdnn', count: 42, last: '15/06/2026' },
    { name: 'Sở Du lịch', short: 'Sở DL', address: 'TP. Tỉnh lỵ', kind: 'dvdl', count: 28, last: '14/06/2026' },
    { name: 'UBND Tỉnh', short: 'UBND', address: 'TP. Tỉnh lỵ', kind: 'chung', count: 67, last: '10/06/2026' },
    { name: 'Tổng cục Giáo dục nghề nghiệp', short: 'TCGDNN', address: 'Hà Nội', kind: 'gdnn', count: 19, last: '08/06/2026' },
  ],
  'co-quan-gui': [
    { name: 'Sở Tài chính', short: 'STC', address: 'TP. Tỉnh lỵ', kind: 'chung', count: 31, last: '22/06/2026' },
    { name: 'Sở Du lịch', short: 'SDL', address: 'TP. Tỉnh lỵ', kind: 'dvdl', count: 24, last: '21/06/2026' },
    { name: 'Liên đoàn Lao động Tỉnh', short: 'LĐLĐ', address: 'TP. Tỉnh lỵ', kind: 'chung', count: 12, last: '19/06/2026' },
    { name: 'Tỉnh Đoàn', short: 'TĐ', address: 'TP. Tỉnh lỵ', kind: 'chung', count: 9, last: '18/06/2026' },
  ],
}

const kindLabel = { chung: 'Chung', gdnn: 'Riêng GDNN', dvdl: 'Riêng DVDL' } as const

export function DanhBaPage() {
  const [tab, setTab] = useState<Tab>('noi-nhan')
  const [sel, setSel] = useState<Org | null>(null)
  const [adding, setAdding] = useState(false)
  const list = orgs[tab]
  const drawerOpen = !!sel || adding
  const closeDrawer = () => {
    setSel(null)
    setAdding(false)
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Danh bạ' }]}
        title="Danh bạ cơ quan"
        subhead="Quản lý nơi nhận công văn đi và cơ quan gửi công văn đến"
        actions={
          <button className="btn-primary" onClick={() => setAdding(true)}>
            <Plus size={14} /> Thêm cơ quan
          </button>
        }
        filters={
          <>
            <div className="seg">
              <button data-active={tab === 'noi-nhan' ? 'true' : undefined} onClick={() => setTab('noi-nhan')}>
                Nơi nhận (CV đi)
              </button>
              <button data-active={tab === 'co-quan-gui' ? 'true' : undefined} onClick={() => setTab('co-quan-gui')}>
                Cơ quan gửi (CV đến)
              </button>
            </div>
            <div className="relative">
              <Search size={16} className="absolute" style={{ left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-faint)' }} />
              <input className="search-input" style={{ width: 280 }} placeholder="Tìm cơ quan…" />
            </div>
          </>
        }
      />

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-scroll">
          <table className="qlcv-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 24 }}>Tên cơ quan</th>
                <th style={{ width: 120 }}>Viết tắt</th>
                <th style={{ width: 160 }}>Địa chỉ</th>
                <th style={{ width: 130 }}>Phân loại</th>
                <th className="center" style={{ width: 110 }}>
                  Số CV
                </th>
                <th style={{ width: 120 }}>Lần cuối</th>
                <th style={{ width: 44, paddingRight: 24 }} />
              </tr>
            </thead>
            <tbody>
              {list.map((o) => (
                <tr key={o.name} onClick={() => setSel(o)} style={{ cursor: 'pointer' }}>
                  <td style={{ paddingLeft: 24 }}>
                    <span className="subject" style={{ fontWeight: 500 }}>
                      {o.name}
                    </span>
                  </td>
                  <td>
                    <span className="cell-mono">{o.short}</span>
                  </td>
                  <td>
                    <span className="cell-meta">{o.address}</span>
                  </td>
                  <td>
                    <Pill variant={o.kind === 'chung' ? 'draft' : o.kind}>{kindLabel[o.kind]}</Pill>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="cell-mono num">{o.count}</span>
                  </td>
                  <td>
                    <span className="cell-meta">{o.last}</span>
                  </td>
                  <td style={{ paddingRight: 24 }}>
                    <RowActions
                      items={[
                        { label: 'Sửa', onClick: () => setSel(o) },
                        { label: 'Xoá', danger: true },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination rangeLabel={`Hiện 1-${list.length} / ${list.length} cơ quan`} pages={[1]} last={1} />
      </div>

      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        eyebrow="Danh bạ cơ quan"
        title={adding ? 'Thêm cơ quan' : sel?.name ?? ''}
        width={480}
        actions={
          <>
            {!adding && (
              <button className="btn-secondary" style={{ color: 'var(--danger)' }}>
                Xoá
              </button>
            )}
            <button className="btn-primary" onClick={closeDrawer}>
              {adding ? 'Tạo cơ quan' : 'Lưu'}
            </button>
          </>
        }
      >
        {drawerOpen && (
          <>
            {sel && !adding && (
              <div className="card" style={{ padding: 16 }}>
                <InfoRow label="Phân loại">
                  <Pill variant={sel.kind === 'chung' ? 'draft' : sel.kind}>{kindLabel[sel.kind]}</Pill>
                </InfoRow>
                <InfoRow label="Số CV liên quan">
                  <span className="cell-mono num">{sel.count}</span>
                </InfoRow>
                <InfoRow label="Lần cuối">{sel.last}</InfoRow>
              </div>
            )}
            <div>
              <label className="field-label">Tên đầy đủ</label>
              <input className="text-input" defaultValue={sel?.name ?? ''} placeholder="Tên cơ quan…" />
            </div>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="field-label">Viết tắt</label>
                <input className="text-input" defaultValue={sel?.short ?? ''} />
              </div>
              <div>
                <label className="field-label">Phân loại</label>
                <select className="text-input" defaultValue={sel?.kind ?? 'chung'}>
                  <option value="chung">Chung</option>
                  <option value="gdnn">Riêng GDNN</option>
                  <option value="dvdl">Riêng DVDL</option>
                </select>
              </div>
            </div>
            <div>
              <label className="field-label">Địa chỉ</label>
              <input className="text-input" defaultValue={sel?.address ?? ''} />
            </div>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="field-label">Email</label>
                <input className="text-input" placeholder="email@coquan.gov.vn" />
              </div>
              <div>
                <label className="field-label">Điện thoại</label>
                <input className="text-input" placeholder="0123 456 789" />
              </div>
            </div>
          </>
        )}
      </Drawer>
    </>
  )
}
