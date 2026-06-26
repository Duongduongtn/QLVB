import { useNavigate } from 'react-router-dom'
import { ShieldCheck, Paperclip, Download, Link2, UserPlus } from 'lucide-react'
import { Avatar, InfoRow, Pill, SectionCard, Timeline, UnitPill, PdfPreview } from '../ui'

const tasks = [
  { unit: 'gdnn' as const, assignee: 'Lê Văn D', state: 'processing' as const, due: '26/06/2026' },
  { unit: 'dvdl' as const, assignee: 'Phạm Văn E', state: 'new' as const, due: '26/06/2026' },
]
const stateMap = {
  new: { variant: 'info', text: 'Mới giao' },
  processing: { variant: 'warning', text: 'Đang xử lý' },
  done: { variant: 'success', text: 'Đã xong' },
} as const

export function CongVanDenDetailBody({ id }: { id: string }) {
  const navigate = useNavigate()

  return (
    <>
      <div className="flex items-center flex-wrap" style={{ gap: 8 }}>
        <Pill variant="info" dot>
          Mới
        </Pill>
        <Pill variant="draft">Thường</Pill>
      </div>

      {/* Verify chữ ký số */}
      <div className="flex items-start" style={{ gap: 12, padding: 14, borderRadius: 6, background: 'var(--success-soft)' }}>
        <ShieldCheck size={18} style={{ color: 'var(--success)', flexShrink: 0 }} />
        <div style={{ fontSize: '0.82rem', color: 'var(--ink)' }}>
          <strong>Chữ ký số hợp lệ</strong> — Sở Tài chính, Viettel-CA, hiệu lực đến 14/03/2027.
        </div>
      </div>

      <SectionCard title="Thông tin công văn">
        <div>
          <InfoRow label="Số đến">
            <span className="cell-mono num">{id}</span>
          </InfoRow>
          <InfoRow label="Cơ quan gửi">Sở Tài chính</InfoRow>
          <InfoRow label="Số ký hiệu">0124/CV-STC</InfoRow>
          <InfoRow label="Ngày văn bản">20/06/2026</InfoRow>
          <InfoRow label="Ngày đến">22/06/2026</InfoRow>
          <InfoRow label="Loại VB">
            <span className="type-tag">CV</span> Công văn
          </InfoRow>
          <InfoRow label="Mức khẩn">
            <Pill variant="draft">Thường</Pill>
          </InfoRow>
          <InfoRow label="Hiển thị">
            <Pill variant="success" dot>
              Công khai
            </Pill>
          </InfoRow>
          <InfoRow label="Hạn xử lý">26/06/2026</InfoRow>
        </div>
      </SectionCard>

      <div className="card" style={{ padding: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          Nội dung công văn
        </div>
        <div style={{ maxWidth: 320, margin: '0 auto' }}>
          <PdfPreview label="Xem trước PDF (2 trang)" />
        </div>
      </div>

      <SectionCard
        title="Phân công xử lý"
        action={
          <button className="btn-ghost" style={{ padding: '4px 8px' }}>
            <UserPlus size={13} /> Thêm
          </button>
        }
      >
        <div className="flex flex-col" style={{ gap: 10 }}>
          {tasks.map((t) => {
            const st = stateMap[t.state]
            return (
              <div key={t.unit} className="flex items-center" style={{ gap: 12, padding: 12, border: '1px solid var(--rule)', borderRadius: 6 }}>
                <Avatar name={t.assignee} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="flex items-center" style={{ gap: 8 }}>
                    <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{t.assignee}</span>
                    <UnitPill unit={t.unit} />
                  </div>
                  <div className="cell-meta">Hạn: {t.due}</div>
                </div>
                <Pill variant={st.variant} dot>
                  {st.text}
                </Pill>
              </div>
            )
          })}
        </div>
      </SectionCard>

      <SectionCard title="Phụ lục đính kèm">
        <div className="flex flex-col" style={{ gap: 8 }}>
          {[
            { name: 'Biểu mẫu quyết toán.xlsx', size: '124 KB' },
            { name: 'Hướng dẫn chi tiết.pdf', size: '1,2 MB' },
          ].map((f) => (
            <div key={f.name} className="flex items-center" style={{ gap: 10, padding: 10, border: '1px solid var(--rule)', borderRadius: 6 }}>
              <Paperclip size={15} style={{ color: 'var(--ink-muted)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {f.name}
                </div>
                <div className="cell-meta">{f.size}</div>
              </div>
              <button className="action-btn" aria-label="Tải phụ lục">
                <Download size={14} />
              </button>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="CV đi phản hồi">
        <button
          className="flex items-center w-full"
          style={{ gap: 8, padding: 12, border: '1px solid var(--rule)', borderRadius: 6, background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
          onClick={() => navigate('/cong-van-di?cv=246')}
        >
          <Link2 size={15} style={{ color: 'var(--success)', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div className="cell-meta">Đã phản hồi bằng</div>
            <div className="cell-mono num">246/2026/CV-GDNN-TĐ</div>
          </div>
        </button>
      </SectionCard>

      <SectionCard title="Lịch sử xử lý">
        <Timeline
          items={[
            { time: '23/06/2026 08:40', by: 'Lê Văn D', text: 'Mở task → Đang xử lý' },
            { time: '22/06/2026 15:10', by: 'vanthu2', text: 'Phân công cho cả 2 đơn vị (GDNN + DVDL)' },
            { time: '22/06/2026 14:55', by: 'vanthu2', text: `Vào sổ — cấp số đến ${id}` },
          ]}
        />
      </SectionCard>
    </>
  )
}
