import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, Stamp, PenTool, IdCard, UploadCloud, Save } from 'lucide-react'
import { PageHeader, Pill, UnitPill, InfoRow } from '../components/ui'
import { Drawer } from '../components/Drawer'

const tabs = [
  { key: 'moc', label: 'Mộc' },
  { key: 'chu-ky', label: 'Chữ ký' },
  { key: 'ho-so-ky', label: 'Hồ sơ ký' },
]

interface Item {
  name: string
  meta: string
  unit: 'gdnn' | 'dvdl'
  active: boolean
}

const mocs: Item[] = [
  { name: 'Mộc tròn GDNN', meta: 'Tải lên 02/01/2026', unit: 'gdnn', active: true },
  { name: 'Mộc treo GDNN', meta: 'Tải lên 02/01/2026', unit: 'gdnn', active: true },
  { name: 'Mộc tròn DVDL', meta: 'Tải lên 02/01/2026', unit: 'dvdl', active: true },
  { name: 'Mộc tròn DVDL (cũ)', meta: 'Tải lên 10/03/2024', unit: 'dvdl', active: false },
]
const chuKys: Item[] = [
  { name: 'Trần Văn B — Giám đốc', meta: 'GDNN · 02/01/2026', unit: 'gdnn', active: true },
  { name: 'Lê Văn D — Phó Giám đốc', meta: 'GDNN · 02/01/2026', unit: 'gdnn', active: true },
  { name: 'Nguyễn Thị C — Giám đốc', meta: 'DVDL · 02/01/2026', unit: 'dvdl', active: true },
  { name: 'Phạm Văn E — Phó Giám đốc', meta: 'DVDL · 05/02/2026', unit: 'dvdl', active: true },
]
const hoSos: Item[] = [
  { name: 'GĐ Trung tâm GDNN', meta: 'Trần Văn B + Mộc tròn GDNN', unit: 'gdnn', active: true },
  { name: 'PGĐ Trung tâm GDNN', meta: 'Lê Văn D + Mộc tròn GDNN', unit: 'gdnn', active: true },
  { name: 'GĐ Công ty DVDL', meta: 'Nguyễn Thị C + Mộc tròn DVDL', unit: 'dvdl', active: true },
  { name: 'PGĐ Công ty DVDL', meta: 'Phạm Văn E + Mộc tròn DVDL', unit: 'dvdl', active: true },
]

export function MocChuKyPage() {
  const { tab = 'moc' } = useParams()
  const navigate = useNavigate()

  const config = {
    moc: { items: mocs, icon: Stamp, title: 'Quản lý mộc', addLabel: 'Tải mộc mới' },
    'chu-ky': { items: chuKys, icon: PenTool, title: 'Quản lý chữ ký', addLabel: 'Tải chữ ký mới' },
    'ho-so-ky': { items: hoSos, icon: IdCard, title: 'Hồ sơ ký', addLabel: 'Tạo hồ sơ ký' },
  }[tab] ?? { items: mocs, icon: Stamp, title: 'Quản lý mộc', addLabel: 'Tải mộc mới' }

  const Icon = config.icon
  const [sel, setSel] = useState<Item | null>(null)

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Mộc & Chữ ký' }]}
        title={config.title}
        subhead="Mỗi mộc/chữ ký gắn 1 đơn vị — chống nhầm khi phát hành công văn"
        actions={
          <button
            className="btn-primary"
            onClick={() =>
              navigate(
                tab === 'ho-so-ky'
                  ? '/ho-so-ky/tao'
                  : `/moc-chu-ky/upload?type=${tab === 'chu-ky' ? 'chu-ky' : 'moc'}`,
              )
            }
          >
            <Plus size={14} /> {config.addLabel}
          </button>
        }
      />

      <div className="seg" style={{ marginBottom: 24 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            data-active={tab === t.key ? 'true' : undefined}
            onClick={() => navigate(`/moc-chu-ky/${t.key}`)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
        {config.items.map((item) => (
          <div
            key={item.name}
            className="card"
            style={{ padding: 18, opacity: item.active ? 1 : 0.6, cursor: 'pointer' }}
            onClick={() => setSel(item)}
          >
            <div className="flex items-start justify-between" style={{ marginBottom: 14 }}>
              <UnitPill unit={item.unit} />
              <Pill variant={item.active ? 'success' : 'draft'} dot={item.active}>
                {item.active ? 'Đang dùng' : 'Ngừng dùng'}
              </Pill>
            </div>
            <div
              className="flex items-center justify-center"
              style={{
                height: 96,
                borderRadius: 6,
                background: 'var(--paper-deep)',
                border: '1px solid var(--rule)',
                marginBottom: 14,
                color: item.unit === 'gdnn' ? 'var(--unit-gdnn)' : 'var(--unit-dvdl)',
              }}
            >
              <Icon size={40} strokeWidth={1.25} />
            </div>
            <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>{item.name}</div>
            <div className="cell-meta">{item.meta}</div>
          </div>
        ))}
      </div>

      <Drawer
        open={!!sel}
        onClose={() => setSel(null)}
        eyebrow={`${config.title} · Chỉnh sửa`}
        title={sel?.name ?? ''}
        width={460}
        actions={
          <>
            <button className="btn-secondary" style={{ color: sel?.active ? 'var(--danger)' : 'var(--success)' }}>
              {sel?.active ? 'Ngừng dùng' : 'Kích hoạt'}
            </button>
            <button className="btn-primary" onClick={() => setSel(null)}>
              <Save size={14} /> Lưu
            </button>
          </>
        }
      >
        {sel && (
          <>
            <div
              className="flex items-center justify-center"
              style={{
                height: 150,
                borderRadius: 6,
                background:
                  tab === 'ho-so-ky'
                    ? 'var(--paper-deep)'
                    : 'repeating-conic-gradient(var(--light-graphite) 0% 25%, var(--paper-raised) 0% 50%) 50% / 16px 16px',
                border: '1px solid var(--rule)',
                color: sel.unit === 'gdnn' ? 'var(--unit-gdnn)' : 'var(--unit-dvdl)',
              }}
            >
              <Icon size={64} strokeWidth={1.1} />
            </div>

            {tab !== 'ho-so-ky' ? (
              <button
                className="btn-secondary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => navigate(`/moc-chu-ky/upload?type=${tab === 'chu-ky' ? 'chu-ky' : 'moc'}`)}
              >
                <UploadCloud size={14} /> Tải ảnh khác & tách nền lại
              </button>
            ) : (
              <button
                className="btn-secondary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => navigate('/ho-so-ky/tao')}
              >
                <PenTool size={14} /> Sửa chữ ký / mộc / chức danh
              </button>
            )}

            <div>
              <label className="field-label">Tên</label>
              <input className="text-input" defaultValue={sel.name} />
            </div>

            <div className="card" style={{ padding: 16 }}>
              <InfoRow label="Đơn vị">
                <UnitPill unit={sel.unit} />
              </InfoRow>
              <InfoRow label="Trạng thái">
                <Pill variant={sel.active ? 'success' : 'draft'} dot={sel.active}>
                  {sel.active ? 'Đang dùng' : 'Ngừng dùng'}
                </Pill>
              </InfoRow>
              <InfoRow label="Thông tin">{sel.meta}</InfoRow>
            </div>

            <p className="cell-meta">
              Không đổi đơn vị sau khi tạo (chống nhầm mộc). Không xoá cứng — dùng “Ngừng dùng” để công văn cũ vẫn hiển thị đúng.
            </p>
          </>
        )}
      </Drawer>
    </>
  )
}
