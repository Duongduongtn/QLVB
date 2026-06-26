import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Save, Plus } from 'lucide-react'
import { PageHeader, Pill } from '../components/ui'
import { Drawer } from '../components/Drawer'
import { UserManager } from '../components/UserManager'

type Tab = 'don-vi' | 'so-cong-van' | 'nguoi-dung' | 'branding'

interface DocType {
  name: string
  code: string
  fmt: string
  reset: string
  pad: number
  cur: number
}

const docTypes: DocType[] = [
  { name: 'Công văn', code: 'CV', fmt: '{STT}/{NĂM}/CV-GDNN-TĐ', reset: 'Theo năm', pad: 3, cur: 248 },
  { name: 'Quyết định', code: 'QĐ', fmt: '{STT}/{NĂM}/QĐ-GDNN-TĐ', reset: 'Theo năm', pad: 4, cur: 52 },
  { name: 'Tờ trình', code: 'TTr', fmt: '{STT}/{NĂM}/TTr-GDNN-TĐ', reset: 'Theo năm', pad: 3, cur: 17 },
  { name: 'Thông báo', code: 'TB', fmt: '{STT}/{NĂM}/TB-GDNN-TĐ', reset: 'Theo năm', pad: 3, cur: 31 },
]

export function CauHinhPage() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'don-vi'
  const setTab = (t: Tab) => setParams({ tab: t })
  const [sel, setSel] = useState<DocType | null>(null)
  const [adding, setAdding] = useState(false)
  const drawerOpen = !!sel || adding
  const closeDrawer = () => {
    setSel(null)
    setAdding(false)
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Cấu hình' }]}
        title="Cấu hình hệ thống"
        subhead="Đơn vị, sổ công văn, người dùng và thương hiệu hiển thị"
      />

      <div className="seg" style={{ marginBottom: 24 }}>
        <button data-active={tab === 'don-vi' ? 'true' : undefined} onClick={() => setTab('don-vi')}>
          2 Đơn vị
        </button>
        <button data-active={tab === 'so-cong-van' ? 'true' : undefined} onClick={() => setTab('so-cong-van')}>
          Sổ công văn
        </button>
        <button data-active={tab === 'nguoi-dung' ? 'true' : undefined} onClick={() => setTab('nguoi-dung')}>
          Người dùng
        </button>
        <button data-active={tab === 'branding' ? 'true' : undefined} onClick={() => setTab('branding')}>
          Branding
        </button>
      </div>

      {tab === 'nguoi-dung' && <UserManager />}

      {tab === 'don-vi' && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
          {[
            { name: 'Trung tâm GDNN Thành Đạt', short: 'GDNN', color: 'var(--unit-gdnn)', unit: 'gdnn' as const },
            { name: 'Công ty CP DVDL Thành Đạt', short: 'DVDL', color: 'var(--unit-dvdl)', unit: 'dvdl' as const },
          ].map((u) => (
            <div key={u.short} className="card" style={{ padding: 24 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 18 }}>
                <Pill variant={u.unit} dot>
                  {u.short}
                </Pill>
                <span className="flex items-center" style={{ gap: 6, fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                  Mã màu
                  <span style={{ width: 16, height: 16, borderRadius: 4, background: u.color, display: 'inline-block' }} />
                </span>
              </div>
              <div className="flex flex-col" style={{ gap: 14 }}>
                <div>
                  <label className="field-label">Tên đầy đủ</label>
                  <input className="text-input" defaultValue={u.name} />
                </div>
                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="field-label">Viết tắt</label>
                    <input className="text-input" defaultValue={u.short} />
                  </div>
                  <div>
                    <label className="field-label">MST</label>
                    <input className="text-input" defaultValue="0312xxxxxx" />
                  </div>
                </div>
                <div>
                  <label className="field-label">Địa chỉ</label>
                  <input className="text-input" defaultValue="TP. Tỉnh lỵ" />
                </div>
              </div>
              <button className="btn-primary" style={{ marginTop: 18 }}>
                <Save size={14} /> Lưu thay đổi
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'so-cong-van' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="flex items-center flex-wrap" style={{ padding: 16, gap: 12, borderBottom: '1px solid var(--rule)' }}>
            <div className="seg">
              <button data-active="true">Sổ đi GDNN</button>
              <button>Sổ đi DVDL</button>
              <button>Sổ đến (chung)</button>
            </div>
            <div className="flex-1" />
            <button className="btn-primary" onClick={() => setAdding(true)}>
              <Plus size={14} /> Thêm loại
            </button>
          </div>
          <table className="qlcv-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 24 }}>Loại văn bản</th>
                <th style={{ width: 100 }}>Mã</th>
                <th>Format số</th>
                <th style={{ width: 120 }}>Reset</th>
                <th className="center" style={{ width: 90 }}>
                  Zero-pad
                </th>
                <th className="center" style={{ width: 110 }}>
                  STT hiện tại
                </th>
              </tr>
            </thead>
            <tbody>
              {docTypes.map((r) => (
                <tr key={r.code} onClick={() => setSel(r)} style={{ cursor: 'pointer' }}>
                  <td style={{ paddingLeft: 24 }}>
                    <span style={{ fontWeight: 500 }}>{r.name}</span>
                  </td>
                  <td>
                    <span className="type-tag">{r.code}</span>
                  </td>
                  <td>
                    <span className="cell-mono">{r.fmt}</span>
                  </td>
                  <td>
                    <span className="cell-meta">{r.reset}</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="cell-mono">{r.pad}</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="cell-mono num">{r.cur}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'branding' && (
        <div className="card" style={{ padding: 24, maxWidth: 520 }}>
          <div className="flex flex-col" style={{ gap: 16 }}>
            <div>
              <label className="field-label">Tên ứng dụng (header)</label>
              <input className="text-input" defaultValue="QLCV" />
            </div>
            <div>
              <label className="field-label">Dòng tagline</label>
              <input className="text-input" defaultValue="Thành Đạt" />
            </div>
            <div>
              <label className="field-label">Logo</label>
              <div className="flex items-center" style={{ gap: 12 }}>
                <div className="brand-mark" style={{ width: 48, height: 48 }} aria-hidden="true" />
                <button className="btn-secondary">Tải logo mới (PNG/JPG ≤ 2MB)</button>
              </div>
            </div>
            <button className="btn-primary" style={{ alignSelf: 'flex-start' }}>
              <Save size={14} /> Lưu branding
            </button>
          </div>
        </div>
      )}

      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        eyebrow="Sổ công văn"
        title={adding ? 'Thêm loại văn bản' : sel ? `Sửa loại: ${sel.name}` : ''}
        width={480}
        actions={
          <>
            {!adding && (
              <button className="btn-secondary" style={{ color: 'var(--danger)' }}>
                Ngừng dùng
              </button>
            )}
            <button className="btn-primary" onClick={closeDrawer}>
              <Save size={14} /> {adding ? 'Tạo loại' : 'Lưu'}
            </button>
          </>
        }
      >
        {drawerOpen && (
          <>
            <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', gap: 12 }}>
              <div>
                <label className="field-label">Tên loại văn bản</label>
                <input className="text-input" defaultValue={sel?.name ?? ''} placeholder="vd: Kế hoạch" />
              </div>
              <div>
                <label className="field-label">Mã viết tắt</label>
                <input className="text-input" defaultValue={sel?.code ?? ''} placeholder="KH" />
              </div>
            </div>
            <div>
              <label className="field-label">Format số</label>
              <input className="text-input font-mono" defaultValue={sel?.fmt ?? '{STT}/{NĂM}/{LOẠI}-GDNN-TĐ'} />
              <p className="cell-meta" style={{ marginTop: 6 }}>
                Biến: {'{STT}'} {'{NĂM}'} {'{THÁNG}'} {'{ĐƠN VỊ}'} {'{LOẠI}'} — bắt buộc có {'{STT}'}.
              </p>
            </div>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="field-label">Chính sách reset</label>
                <select className="text-input" defaultValue={sel?.reset ?? 'Theo năm'}>
                  <option>Theo năm</option>
                  <option>Theo tháng</option>
                  <option>Không reset</option>
                </select>
              </div>
              <div>
                <label className="field-label">Độ rộng STT (zero-pad)</label>
                <input className="text-input" type="number" min={0} max={6} defaultValue={sel?.pad ?? 3} />
              </div>
            </div>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="field-label">STT bắt đầu</label>
                <input className="text-input" type="number" defaultValue={1} />
              </div>
              <div>
                <label className="field-label">STT hiện tại</label>
                <input className="text-input" type="number" defaultValue={sel?.cur ?? 0} />
              </div>
            </div>
            <div className="card" style={{ padding: 14, background: 'var(--paper-deep)' }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>
                Xem trước số kế tiếp
              </div>
              <div className="cell-mono num">
                {String((sel?.cur ?? 0) + 1).padStart(sel?.pad ?? 3, '0')}/2026/{sel?.code ?? 'KH'}-GDNN-TĐ
              </div>
            </div>
          </>
        )}
      </Drawer>
    </>
  )
}
