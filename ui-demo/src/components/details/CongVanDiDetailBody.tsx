import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileCheck2, Link2 } from 'lucide-react'
import { InfoRow, Pill, SectionCard, Timeline, UnitPill, PdfPreview } from '../ui'

export function CongVanDiDetailBody({ id, status = 'published' }: { id: string; status?: 'draft' | 'published' | 'cancelled' }) {
  const navigate = useNavigate()
  const isDraft = status === 'draft'
  const [tab, setTab] = useState<'chua-ky' | 'da-ky'>(isDraft ? 'chua-ky' : 'da-ky')

  const statusPill =
    status === 'draft' ? (
      <Pill variant="draft">Draft — chờ ký số</Pill>
    ) : status === 'cancelled' ? (
      <Pill variant="cancelled">Huỷ</Pill>
    ) : (
      <Pill variant="published" dot>
        Đã phát hành
      </Pill>
    )

  return (
    <>
      <div className="flex items-center flex-wrap" style={{ gap: 8 }}>
        <UnitPill unit="gdnn" />
        {statusPill}
      </div>

      <SectionCard title="Thông tin công văn">
        <div>
          <InfoRow label="Số CV">
            <span className="cell-mono num">{id}/2026/CV-GDNN-TĐ</span>
          </InfoRow>
          <InfoRow label="Loại văn bản">
            <span className="type-tag">CV</span> Công văn
          </InfoRow>
          <InfoRow label="Đơn vị">
            <UnitPill unit="gdnn" /> Trung tâm GDNN Thành Đạt
          </InfoRow>
          <InfoRow label="Người ký">Trần Văn B — Giám đốc</InfoRow>
          <InfoRow label="Hồ sơ ký">GĐ Trung tâm GDNN</InfoRow>
          <InfoRow label="Ngày phát hành">15/06/2026</InfoRow>
          <InfoRow label="Giáp lai">Toàn bộ (3 trang)</InfoRow>
          <InfoRow label="Người tạo">Lê Văn D</InfoRow>
        </div>
      </SectionCard>

      <div className="card" style={{ padding: 16 }}>
        {isDraft ? (
          <div className="flex items-center" style={{ gap: 6, marginBottom: 14, fontSize: '0.78rem', color: 'var(--warning)' }}>
            <FileCheck2 size={14} /> Chưa ký số — tải bản chưa ký, ký bằng USB Token rồi tải lên lại
          </div>
        ) : (
          <div className="flex items-center justify-between flex-wrap" style={{ gap: 10, marginBottom: 14 }}>
            <div className="seg">
              <button data-active={tab === 'chua-ky' ? 'true' : undefined} onClick={() => setTab('chua-ky')}>
                Chưa ký số
              </button>
              <button data-active={tab === 'da-ky' ? 'true' : undefined} onClick={() => setTab('da-ky')}>
                Đã ký số
              </button>
            </div>
            {tab === 'da-ky' && (
              <span className="flex items-center" style={{ gap: 6, fontSize: '0.75rem', color: 'var(--success)' }}>
                <FileCheck2 size={14} /> USB Token Viettel-CA
              </span>
            )}
          </div>
        )}
        <div style={{ maxWidth: 320, margin: '0 auto' }}>
          <PdfPreview label={!isDraft && tab === 'da-ky' ? 'Bản đã ký số (3 trang)' : 'Bản chưa ký số'} signed />
        </div>
      </div>

      <SectionCard title="Nơi nhận">
        <div className="flex flex-col" style={{ gap: 8 }}>
          {['Sở Lao động – Thương binh và Xã hội', 'Tổng cục Giáo dục nghề nghiệp', 'UBND Tỉnh (b/c)'].map((n) => (
            <div key={n} className="flex items-center" style={{ gap: 8, fontSize: '0.85rem', color: 'var(--ink)' }}>
              <span style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--kinpaku-rich)' }} />
              {n}
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Liên kết">
        <button
          className="flex items-center w-full"
          style={{ gap: 8, padding: 12, border: '1px solid var(--rule)', borderRadius: 6, background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
          onClick={() => navigate('/cong-van-den?cv=0124')}
        >
          <Link2 size={15} style={{ color: 'var(--info)', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div className="cell-meta">Phản hồi công văn đến</div>
            <div className="cell-mono num">12/CV-TCGDNN</div>
          </div>
        </button>
      </SectionCard>

      <SectionCard title="Tag">
        <div className="flex flex-wrap" style={{ gap: 8 }}>
          <span className="tag-chip">#thi-tay-nghe</span>
          <span className="tag-chip">#dao-tao-nghe</span>
        </div>
      </SectionCard>

      <SectionCard title="Lịch sử thay đổi">
        <Timeline
          items={[
            { time: '15/06/2026 10:22', by: 'Trần Văn B', text: 'Upload file đã ký số → Đã phát hành' },
            { time: '15/06/2026 10:05', by: 'Trần Văn B', text: `Cấp số ${id}/2026/CV-GDNN-TĐ` },
            { time: '15/06/2026 09:48', by: 'Lê Văn D', text: 'Chèn mộc + chữ ký (hồ sơ "GĐ Trung tâm GDNN")' },
            { time: '15/06/2026 09:30', by: 'Lê Văn D', text: 'Tạo bản nháp, upload file Word gốc' },
          ]}
        />
      </SectionCard>
    </>
  )
}
