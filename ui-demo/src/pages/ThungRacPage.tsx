import { useState } from 'react'
import { RotateCcw, Trash2 } from 'lucide-react'
import { PageHeader, Pill, UnitPill, InfoRow, RowActions } from '../components/ui'
import { Drawer } from '../components/Drawer'

interface Trashed {
  so: string
  subject: string
  unit: 'gdnn' | 'dvdl'
  deletedBy: string
  deletedAt: string
  remain: number
}

const items: Trashed[] = [
  { so: '044/2026/CV-DVDL-TĐ', subject: 'V/v khảo sát nhu cầu lưu trú mùa cao điểm', unit: 'dvdl', deletedBy: 'gd.dvdl', deletedAt: '24/06/2026', remain: 29 },
  { so: '243/2026/TB-GDNN-TĐ', subject: 'Thông báo điều chỉnh lịch học lớp Hàn 3G', unit: 'gdnn', deletedBy: 'vanthu1', deletedAt: '20/06/2026', remain: 25 },
  { so: '0118/CV-SNV', subject: 'V/v rà soát biên chế (vào sổ nhầm — trùng)', unit: 'gdnn', deletedBy: 'vanthu2', deletedAt: '12/06/2026', remain: 17 },
]

export function ThungRacPage() {
  const [sel, setSel] = useState<Trashed | null>(null)
  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Thùng rác' }]}
        title="Thùng rác"
        subhead="Công văn đã xoá được giữ 30 ngày trước khi xoá vĩnh viễn"
      />

      <div
        className="card flex items-center"
        style={{ padding: '12px 18px', gap: 10, marginBottom: 24, background: 'var(--warning-soft)' }}
      >
        <Trash2 size={16} style={{ color: 'var(--warning)' }} />
        <span style={{ fontSize: '0.85rem', color: 'var(--ink)' }}>
          3 mục trong thùng rác. Có thể khôi phục trước khi hết hạn lưu trữ.
        </span>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-scroll">
          <table className="qlcv-table">
            <thead>
              <tr>
                <th style={{ width: 200, paddingLeft: 24 }}>Số CV</th>
                <th>Trích yếu</th>
                <th className="center" style={{ width: 90 }}>
                  Đơn vị
                </th>
                <th style={{ width: 120 }}>Người xoá</th>
                <th style={{ width: 110 }}>Ngày xoá</th>
                <th style={{ width: 130 }}>Còn lại</th>
                <th style={{ width: 100, paddingRight: 24 }} className="center">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.so} onClick={() => setSel(it)} style={{ cursor: 'pointer' }}>
                  <td style={{ paddingLeft: 24 }}>
                    <span className="cell-mono num">{it.so}</span>
                  </td>
                  <td>
                    <span className="subject">{it.subject}</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <UnitPill unit={it.unit} />
                  </td>
                  <td>
                    <span className="cell-mono">{it.deletedBy}</span>
                  </td>
                  <td>
                    <span className="cell-meta">{it.deletedAt}</span>
                  </td>
                  <td>
                    <Pill variant={it.remain < 20 ? 'warning' : 'draft'} dot={it.remain < 20}>
                      {it.remain} ngày
                    </Pill>
                  </td>
                  <td style={{ paddingRight: 24 }}>
                    <div className="flex items-center justify-center" style={{ gap: 4 }}>
                      <button className="action-btn" aria-label="Khôi phục" onClick={(e) => e.stopPropagation()}>
                        <RotateCcw size={15} />
                      </button>
                      <RowActions
                        items={[
                          { label: 'Xem chi tiết', onClick: () => setSel(it) },
                          { label: 'Khôi phục' },
                          { label: 'Xoá vĩnh viễn', danger: true },
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Drawer
        open={!!sel}
        onClose={() => setSel(null)}
        eyebrow="Thùng rác"
        title={sel?.so ?? ''}
        width={460}
        actions={
          <>
            <button className="btn-secondary" style={{ color: 'var(--danger)' }}>
              <Trash2 size={14} /> Xoá vĩnh viễn
            </button>
            <button className="btn-primary">
              <RotateCcw size={14} /> Khôi phục
            </button>
          </>
        }
      >
        {sel && (
          <>
            <div className="subject" style={{ fontWeight: 500 }}>
              {sel.subject}
            </div>
            <div className="card" style={{ padding: 16 }}>
              <InfoRow label="Số CV">
                <span className="cell-mono num">{sel.so}</span>
              </InfoRow>
              <InfoRow label="Đơn vị">
                <UnitPill unit={sel.unit} />
              </InfoRow>
              <InfoRow label="Người xoá">
                <span className="cell-mono">{sel.deletedBy}</span>
              </InfoRow>
              <InfoRow label="Ngày xoá">{sel.deletedAt}</InfoRow>
              <InfoRow label="Tự xoá sau">
                <Pill variant={sel.remain < 20 ? 'warning' : 'draft'} dot={sel.remain < 20}>
                  {sel.remain} ngày
                </Pill>
              </InfoRow>
            </div>
          </>
        )}
      </Drawer>
    </>
  )
}
