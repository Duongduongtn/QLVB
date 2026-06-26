import { useState } from 'react'
import { LogIn, Upload, Pencil, Trash2, Download, Stamp } from 'lucide-react'
import { PageHeader, FilterSelect, Pagination, InfoRow, Pill } from '../components/ui'
import { Drawer } from '../components/Drawer'
import type { LucideIcon } from 'lucide-react'

interface Log {
  time: string
  user: string
  action: string
  object: string
  ip: string
  icon: LucideIcon
}

const logs: Log[] = [
  { time: '25/06/2026 09:42', user: 'gd.gdnn', action: 'Đăng nhập', object: '—', ip: '113.161.x.x', icon: LogIn },
  { time: '25/06/2026 09:40', user: 'vanthu1', action: 'Phát hành CV', object: '248/2026/CV-GDNN-TĐ', ip: '113.161.x.x', icon: Stamp },
  { time: '25/06/2026 09:15', user: 'vanthu2', action: 'Vào sổ CV đến', object: '0124/CV-STC', ip: '171.244.x.x', icon: Upload },
  { time: '24/06/2026 16:30', user: 'gd.dvdl', action: 'Tải PDF', object: '089/2026/CV-DVDL-TĐ', ip: '113.161.x.x', icon: Download },
  { time: '24/06/2026 14:05', user: 'vanthu1', action: 'Sửa metadata', object: '090/2026/CV-DVDL-TĐ', ip: '171.244.x.x', icon: Pencil },
  { time: '24/06/2026 11:20', user: 'gd.gdnn', action: 'Xoá (soft) CV', object: '044/2026/CV-DVDL-TĐ', ip: '113.161.x.x', icon: Trash2 },
]

export function AuditLogPage() {
  const [sel, setSel] = useState<Log | null>(null)
  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Audit log' }]}
        title="Nhật ký hệ thống (Audit log)"
        subhead="Mọi thao tác: đăng nhập, tạo, sửa, xoá, tải, phát hành"
        actions={
          <button className="btn-secondary">
            <Download size={14} /> Xuất log
          </button>
        }
        filters={
          <>
            <FilterSelect label="Người dùng:" value="Tất cả" />
            <FilterSelect label="Hành động:" value="Tất cả" />
            <FilterSelect label="Thời gian:" value="7 ngày" />
          </>
        }
      />

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-scroll">
          <table className="qlcv-table">
            <thead>
              <tr>
                <th style={{ width: 160, paddingLeft: 24 }}>Thời gian</th>
                <th style={{ width: 140 }}>Người dùng</th>
                <th style={{ width: 180 }}>Hành động</th>
                <th>Đối tượng</th>
                <th style={{ width: 130, paddingRight: 24 }}>IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l, i) => {
                const Icon = l.icon
                return (
                  <tr key={i} onClick={() => setSel(l)} style={{ cursor: 'pointer' }}>
                    <td style={{ paddingLeft: 24 }}>
                      <span className="cell-meta">{l.time}</span>
                    </td>
                    <td>
                      <span className="cell-mono">{l.user}</span>
                    </td>
                    <td>
                      <span className="flex items-center" style={{ gap: 8 }}>
                        <Icon size={15} style={{ color: 'var(--ink-muted)' }} />
                        {l.action}
                      </span>
                    </td>
                    <td>
                      <span className="cell-mono">{l.object}</span>
                    </td>
                    <td style={{ paddingRight: 24 }}>
                      <span className="cell-meta">{l.ip}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Pagination rangeLabel="Hiện 1-6 / 1.284 bản ghi" last={64} />
      </div>

      <Drawer open={!!sel} onClose={() => setSel(null)} eyebrow="Audit log" title={sel?.action ?? ''} width={460}>
        {sel && (
          <div className="card" style={{ padding: 16 }}>
            <InfoRow label="Thời gian">{sel.time}</InfoRow>
            <InfoRow label="Người dùng">
              <span className="cell-mono">{sel.user}</span>
            </InfoRow>
            <InfoRow label="Hành động">{sel.action}</InfoRow>
            <InfoRow label="Đối tượng">
              <span className="cell-mono">{sel.object}</span>
            </InfoRow>
            <InfoRow label="Địa chỉ IP">
              <span className="cell-mono">{sel.ip}</span>
            </InfoRow>
            <InfoRow label="User-Agent">
              <span className="cell-meta">Chrome 124 · Windows 11</span>
            </InfoRow>
            <InfoRow label="Kết quả">
              <Pill variant="success" dot>
                Thành công
              </Pill>
            </InfoRow>
          </div>
        )}
      </Drawer>
    </>
  )
}
