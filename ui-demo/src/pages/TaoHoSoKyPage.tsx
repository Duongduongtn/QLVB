import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, PenTool, Stamp, Check, Save } from 'lucide-react'
import { PageHeader, Pill, UnitPill } from '../components/ui'

type Unit = 'gdnn' | 'dvdl'

const signatures: Record<Unit, { id: string; name: string; title: string }[]> = {
  gdnn: [
    { id: 'b', name: 'Trần Văn B', title: 'Giám đốc' },
    { id: 'd', name: 'Lê Văn D', title: 'Phó Giám đốc' },
  ],
  dvdl: [
    { id: 'c', name: 'Nguyễn Thị C', title: 'Giám đốc' },
    { id: 'e', name: 'Phạm Văn E', title: 'Phó Giám đốc' },
  ],
}

const seals: Record<Unit, { id: string; name: string }[]> = {
  gdnn: [
    { id: 'g1', name: 'Mộc tròn GDNN' },
    { id: 'g2', name: 'Mộc treo GDNN' },
  ],
  dvdl: [{ id: 'd1', name: 'Mộc tròn DVDL' }],
}

export function TaoHoSoKyPage() {
  const navigate = useNavigate()
  const [unit, setUnit] = useState<Unit>('gdnn')
  const [sig, setSig] = useState('b')
  const [seal, setSeal] = useState('g1')
  const [title, setTitle] = useState('Giám đốc')

  const onUnit = (u: Unit) => {
    setUnit(u)
    setSig(signatures[u][0].id)
    setSeal(seals[u][0].id)
    setTitle(signatures[u][0].title)
  }

  const sigObj = signatures[unit].find((s) => s.id === sig)
  const unitColor = unit === 'gdnn' ? 'var(--unit-gdnn)' : 'var(--unit-dvdl)'

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Hồ sơ ký', to: '/moc-chu-ky/ho-so-ky' }, { label: 'Tạo hồ sơ ký' }]}
        title="Tạo hồ sơ ký"
        subhead="Mỗi hồ sơ = người ký + chữ ký + chức danh + mộc cùng đơn vị → chọn 1 lần là áp đủ, chống nhầm mộc"
        actions={
          <button className="btn-ghost" onClick={() => navigate('/moc-chu-ky/ho-so-ky')}>
            <ArrowLeft size={14} /> Quay lại
          </button>
        }
      />

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 24, alignItems: 'start' }}>
        {/* Form */}
        <div className="card" style={{ padding: 24, minWidth: 0 }}>
          {/* Đơn vị */}
          <label className="field-label">1. Đơn vị</label>
          <div className="seg" style={{ marginBottom: 22 }}>
            <button data-active={unit === 'gdnn' ? 'true' : undefined} data-unit="gdnn" onClick={() => onUnit('gdnn')}>
              Trung tâm GDNN
            </button>
            <button data-active={unit === 'dvdl' ? 'true' : undefined} data-unit="dvdl" onClick={() => onUnit('dvdl')}>
              Công ty CP DVDL
            </button>
          </div>

          {/* Chữ ký */}
          <label className="field-label">2. Chữ ký (lọc theo đơn vị)</label>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 22 }}>
            {signatures[unit].map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setSig(s.id)
                  setTitle(s.title)
                }}
                className="flex items-center"
                style={{
                  gap: 10,
                  padding: 12,
                  borderRadius: 6,
                  border: `1px solid ${sig === s.id ? 'var(--rule-strong)' : 'var(--rule)'}`,
                  background: sig === s.id ? 'var(--paper-deep)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span
                  className="flex items-center justify-center"
                  style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--paper-deep)', color: unitColor, flexShrink: 0 }}
                >
                  <PenTool size={16} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: '0.85rem' }}>{s.name}</div>
                  <div className="cell-meta">{s.title}</div>
                </div>
                {sig === s.id && <Check size={15} style={{ color: 'var(--success)', marginLeft: 'auto', flexShrink: 0 }} />}
              </button>
            ))}
          </div>

          {/* Mộc */}
          <label className="field-label">3. Mộc đi kèm (chỉ hiện mộc {unit.toUpperCase()} — chống nhầm)</label>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 22 }}>
            {seals[unit].map((s) => (
              <button
                key={s.id}
                onClick={() => setSeal(s.id)}
                className="flex items-center"
                style={{
                  gap: 10,
                  padding: 12,
                  borderRadius: 6,
                  border: `1px solid ${seal === s.id ? 'var(--rule-strong)' : 'var(--rule)'}`,
                  background: seal === s.id ? 'var(--paper-deep)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span
                  className="flex items-center justify-center"
                  style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--paper-deep)', color: unitColor, flexShrink: 0 }}
                >
                  <Stamp size={16} />
                </span>
                <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: '0.85rem' }}>{s.name}</div>
                {seal === s.id && <Check size={15} style={{ color: 'var(--success)', marginLeft: 'auto', flexShrink: 0 }} />}
              </button>
            ))}
          </div>

          {/* Chức danh + tên hồ sơ */}
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label className="field-label">4. Chức danh hiển thị trên CV</label>
              <input className="text-input" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Tên hồ sơ (ngắn gọn)</label>
              <input
                className="text-input"
                defaultValue={unit === 'gdnn' ? 'GĐ Trung tâm GDNN' : 'GĐ Công ty DVDL'}
              />
            </div>
          </div>

          <button className="btn-primary" style={{ marginTop: 22 }} onClick={() => navigate('/moc-chu-ky/ho-so-ky')}>
            <Save size={14} /> Lưu hồ sơ ký
          </button>
        </div>

        {/* Live preview */}
        <div className="card" style={{ padding: 20 }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>
            Xem trước block ký
          </div>
          <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
            <UnitPill unit={unit} />
            <Pill variant="success" dot>
              Cùng đơn vị
            </Pill>
          </div>

          {/* Block ký mô phỏng góc CV */}
          <div
            style={{
              border: '1px solid var(--rule)',
              borderRadius: 6,
              padding: '20px 16px',
              background: 'var(--paper-raised)',
              textAlign: 'center',
              position: 'relative',
            }}
          >
            <div style={{ fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink)', fontSize: '0.82rem', letterSpacing: '0.04em' }}>
              {title}
            </div>
            {/* mộc đè 1/3 lên chữ ký */}
            <div className="flex items-center justify-center" style={{ position: 'relative', height: 110, marginTop: 8 }}>
              <span
                className="flex items-center justify-center"
                style={{
                  width: 92,
                  height: 92,
                  borderRadius: 999,
                  border: `2px solid ${unitColor}`,
                  color: unitColor,
                  fontSize: '0.55rem',
                  opacity: 0.55,
                  position: 'absolute',
                  top: 0,
                  textAlign: 'center',
                  lineHeight: 1.2,
                }}
              >
                {seals[unit].find((s) => s.id === seal)?.name}
              </span>
              <span
                className="font-display"
                style={{ position: 'absolute', bottom: 12, fontSize: '1.6rem', color: 'var(--ink-body)', transform: 'rotate(-4deg)' }}
              >
                {sigObj?.name}
              </span>
            </div>
            <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: '0.9rem', marginTop: 4 }}>{sigObj?.name}</div>
          </div>

          <p className="cell-meta" style={{ marginTop: 14 }}>
            Khi soạn CV, chọn hồ sơ này sẽ tự áp chữ ký + mộc + chức danh ở trên. Mộc luôn cùng đơn vị với chữ ký.
          </p>
        </div>
      </div>
    </>
  )
}
