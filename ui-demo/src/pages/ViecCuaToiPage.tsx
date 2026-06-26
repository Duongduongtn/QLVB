import { useState } from 'react'
import { Clock, AlertTriangle, Inbox, CheckCircle2, ArrowRight, Link2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PageHeader, Pill, UnitPill, InfoRow } from '../components/ui'
import { Drawer } from '../components/Drawer'

interface Task {
  soDen: string
  subject: string
  from: string
  unit: 'gdnn' | 'dvdl'
  due: string
  state: 'new' | 'processing' | 'done'
  overdue?: boolean
}

const tasks: Task[] = [
  { soDen: '0124/CV-STC', subject: 'V/v hướng dẫn quyết toán kinh phí đào tạo nghề năm 2025', from: 'Sở Tài chính', unit: 'gdnn', due: '26/06/2026', state: 'new', overdue: false },
  { soDen: '0089/TB-SDL', subject: 'Thông báo lịch kiểm tra cơ sở lưu trú Quý 2', from: 'Sở Du lịch', unit: 'dvdl', due: '24/06/2026', state: 'processing', overdue: true },
  { soDen: '0312/CV-UBND', subject: 'V/v góp ý dự thảo kế hoạch phát triển nhân lực địa phương', from: 'UBND Tỉnh', unit: 'gdnn', due: '28/06/2026', state: 'processing', overdue: false },
  { soDen: '0045/GM-LĐLĐ', subject: 'Giấy mời dự Hội nghị tổng kết phong trào thi đua', from: 'Liên đoàn Lao động', unit: 'gdnn', due: '30/06/2026', state: 'new', overdue: false },
  { soDen: '0210/CV-CT', subject: 'V/v phối hợp tổ chức chương trình hướng nghiệp học sinh', from: 'Tỉnh Đoàn', unit: 'dvdl', due: '02/07/2026', state: 'done', overdue: false },
]

const stateMap: Record<Task['state'], { variant: string; text: string; dot: boolean }> = {
  new: { variant: 'info', text: 'Mới giao', dot: true },
  processing: { variant: 'warning', text: 'Đang xử lý', dot: true },
  done: { variant: 'success', text: 'Đã xong', dot: true },
}

export function ViecCuaToiPage() {
  const [sel, setSel] = useState<Task | null>(null)
  const navigate = useNavigate()
  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Việc của tôi' }]}
        title="Việc của tôi"
        subhead="Bạn có 7 công văn đến được giao xử lý — 1 quá hạn, 2 đang xử lý"
      />

      {/* KPI nhỏ */}
      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}
      >
        <div className="kpi-card">
          <div className="flex items-center justify-between">
            <span className="kpi-label">Mới giao</span>
            <Inbox size={18} style={{ color: 'var(--info)' }} />
          </div>
          <span className="kpi-value">2</span>
        </div>
        <div className="kpi-card">
          <div className="flex items-center justify-between">
            <span className="kpi-label">Đang xử lý</span>
            <Clock size={18} style={{ color: 'var(--warning)' }} />
          </div>
          <span className="kpi-value">2</span>
        </div>
        <div className="kpi-card">
          <div className="flex items-center justify-between">
            <span className="kpi-label">Quá hạn</span>
            <AlertTriangle size={18} style={{ color: 'var(--danger)' }} />
          </div>
          <span className="kpi-value" style={{ color: 'var(--danger)' }}>
            1
          </span>
        </div>
        <div className="kpi-card">
          <div className="flex items-center justify-between">
            <span className="kpi-label">Đã hoàn thành (tháng)</span>
            <CheckCircle2 size={18} style={{ color: 'var(--success)' }} />
          </div>
          <span className="kpi-value">18</span>
        </div>
      </div>

      {/* Danh sách task */}
      <div className="flex flex-col" style={{ gap: 12 }}>
        {tasks.map((t) => {
          const st = stateMap[t.state]
          return (
            <div
              key={t.soDen}
              className="card"
              style={{
                padding: 18,
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                borderLeft: t.overdue ? '3px solid var(--danger)' : '1px solid var(--rule)',
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="flex items-center" style={{ gap: 8, marginBottom: 6 }}>
                  <span className="cell-mono num">{t.soDen}</span>
                  <UnitPill unit={t.unit} />
                  <Pill variant={st.variant} dot={st.dot}>
                    {st.text}
                  </Pill>
                </div>
                <div className="subject" style={{ marginBottom: 4 }}>
                  {t.subject}
                </div>
                <div className="cell-meta">Từ: {t.from}</div>
              </div>
              <div className="flex flex-col items-end" style={{ gap: 8 }}>
                <div
                  className="flex items-center"
                  style={{ gap: 6, fontSize: '0.8rem', color: t.overdue ? 'var(--danger)' : 'var(--ink-muted)' }}
                >
                  <Clock size={14} />
                  Hạn: {t.due}
                </div>
                <button className="btn-secondary" style={{ height: 32 }} onClick={() => setSel(t)}>
                  Mở xử lý
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <Drawer
        open={!!sel}
        onClose={() => setSel(null)}
        eyebrow="Việc của tôi"
        title={sel ? `Xử lý ${sel.soDen}` : ''}
        width={480}
        actions={
          <>
            <button className="btn-secondary">Chuyển người khác</button>
            <button className="btn-primary">Đánh dấu xong</button>
          </>
        }
      >
        {sel && (
          <>
            <div className="flex items-center" style={{ gap: 8 }}>
              <UnitPill unit={sel.unit} />
              <Pill variant={stateMap[sel.state].variant} dot>
                {stateMap[sel.state].text}
              </Pill>
              {sel.overdue && <Pill variant="cancelled">Quá hạn</Pill>}
            </div>
            <div className="subject" style={{ fontWeight: 500 }}>
              {sel.subject}
            </div>
            <div className="card" style={{ padding: 16 }}>
              <InfoRow label="Số đến">
                <span className="cell-mono num">{sel.soDen}</span>
              </InfoRow>
              <InfoRow label="Cơ quan gửi">{sel.from}</InfoRow>
              <InfoRow label="Đơn vị xử lý">
                <UnitPill unit={sel.unit} />
              </InfoRow>
              <InfoRow label="Hạn xử lý">
                <span style={{ color: sel.overdue ? 'var(--danger)' : undefined }}>{sel.due}</span>
              </InfoRow>
            </div>
            <div>
              <label className="field-label">Cập nhật trạng thái</label>
              <select className="text-input" defaultValue={sel.state}>
                <option value="new">Mới giao</option>
                <option value="processing">Đang xử lý</option>
                <option value="done">Đã xong</option>
              </select>
            </div>
            <div>
              <label className="field-label">Ghi chú xử lý</label>
              <textarea className="text-input" rows={3} placeholder="Nhập ghi chú…" />
            </div>
            <button
              className="flex items-center w-full"
              style={{ gap: 8, padding: 12, border: '1px solid var(--rule)', borderRadius: 6, background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
              onClick={() => navigate(`/cong-van-den?cv=${sel.soDen.split('/')[0]}`)}
            >
              <Link2 size={15} style={{ color: 'var(--info)', flexShrink: 0 }} />
              <span className="cell-meta">Mở công văn đến gốc</span>
            </button>
          </>
        )}
      </Drawer>
    </>
  )
}
