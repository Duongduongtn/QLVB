import { useState } from 'react'
import { Plus, KeyRound } from 'lucide-react'
import { Pill, Avatar, InfoRow, RowActions } from './ui'
import { Drawer } from './Drawer'

interface User {
  name: string
  username: string
  email: string
  role: 'quanly' | 'nhanvien'
  active: boolean
}

const users: User[] = [
  { name: 'Trần Văn B', username: 'gd.gdnn', email: 'gd.gdnn@thanhdat.vn', role: 'quanly', active: true },
  { name: 'Nguyễn Thị C', username: 'gd.dvdl', email: 'gd.dvdl@thanhdat.vn', role: 'quanly', active: true },
  { name: 'Lê Văn D', username: 'vanthu1', email: 'vanthu1@thanhdat.vn', role: 'nhanvien', active: true },
  { name: 'Phạm Văn E', username: 'vanthu2', email: 'vanthu2@thanhdat.vn', role: 'nhanvien', active: true },
  { name: 'Hoàng Thị F', username: 'hanhchinh', email: 'hanhchinh@thanhdat.vn', role: 'nhanvien', active: false },
]

export function UserManager() {
  const [sel, setSel] = useState<User | null>(null)
  const [adding, setAdding] = useState(false)
  const drawerOpen = !!sel || adding
  const closeDrawer = () => {
    setSel(null)
    setAdding(false)
  }

  return (
    <>
      <div className="flex items-center justify-between flex-wrap" style={{ gap: 12, marginBottom: 16 }}>
        <span className="cell-meta">5 tài khoản: 2 Quản lý, 3 Nhân viên — 1 đang khoá</span>
        <button className="btn-primary" onClick={() => setAdding(true)}>
          <Plus size={14} /> Thêm user mới
        </button>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-scroll">
          <table className="qlcv-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 24 }}>Họ tên</th>
                <th style={{ width: 140 }}>Tên đăng nhập</th>
                <th style={{ width: 220 }}>Email</th>
                <th style={{ width: 120 }}>Vai trò</th>
                <th style={{ width: 120 }}>Trạng thái</th>
                <th style={{ width: 100, paddingRight: 24 }} className="center">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.username} onClick={() => setSel(u)} style={{ cursor: 'pointer' }}>
                  <td style={{ paddingLeft: 24 }}>
                    <div className="flex items-center" style={{ gap: 10 }}>
                      <Avatar name={u.name} />
                      <span style={{ fontWeight: 500 }}>{u.name}</span>
                    </div>
                  </td>
                  <td>
                    <span className="cell-mono">{u.username}</span>
                  </td>
                  <td>
                    <span className="cell-meta">{u.email}</span>
                  </td>
                  <td>
                    <Pill variant={u.role === 'quanly' ? 'gdnn' : 'draft'} dot={u.role === 'quanly'}>
                      {u.role === 'quanly' ? 'Quản lý' : 'Nhân viên'}
                    </Pill>
                  </td>
                  <td>
                    <Pill variant={u.active ? 'success' : 'cancelled'} dot={u.active}>
                      {u.active ? 'Hoạt động' : 'Đã khoá'}
                    </Pill>
                  </td>
                  <td style={{ paddingRight: 24 }}>
                    <div className="flex items-center justify-center" style={{ gap: 4 }}>
                      <button className="action-btn" aria-label="Reset mật khẩu" onClick={(e) => e.stopPropagation()}>
                        <KeyRound size={15} />
                      </button>
                      <RowActions
                        items={[
                          { label: 'Sửa thông tin', onClick: () => setSel(u) },
                          { label: 'Reset mật khẩu' },
                          { label: u.active ? 'Khoá tài khoản' : 'Mở khoá', danger: u.active },
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
        open={drawerOpen}
        onClose={closeDrawer}
        eyebrow="Người dùng"
        title={adding ? 'Thêm user mới' : sel?.name ?? ''}
        width={480}
        actions={
          adding ? (
            <>
              <button className="btn-secondary" onClick={closeDrawer}>
                Huỷ
              </button>
              <button className="btn-primary" onClick={closeDrawer}>
                Tạo user
              </button>
            </>
          ) : (
            <>
              <button className="btn-secondary">
                <KeyRound size={14} /> Reset mật khẩu
              </button>
              <button className="btn-secondary" style={{ color: sel?.active ? 'var(--danger)' : 'var(--success)' }}>
                {sel?.active ? 'Khoá tài khoản' : 'Mở khoá'}
              </button>
              <button className="btn-primary" onClick={closeDrawer}>
                Lưu
              </button>
            </>
          )
        }
      >
        {drawerOpen && (
          <>
            {sel && !adding && (
              <div className="flex items-center" style={{ gap: 12 }}>
                <Avatar name={sel.name} />
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{sel.name}</div>
                  <div className="cell-mono">{sel.username}</div>
                </div>
              </div>
            )}
            <div>
              <label className="field-label">Họ tên</label>
              <input className="text-input" defaultValue={sel?.name ?? ''} placeholder="Nguyễn Văn A" />
            </div>
            {adding && (
              <div>
                <label className="field-label">Tên đăng nhập</label>
                <input className="text-input" placeholder="vanthu3" />
              </div>
            )}
            <div>
              <label className="field-label">Email</label>
              <input className="text-input" defaultValue={sel?.email ?? ''} placeholder="email@thanhdat.vn" />
            </div>
            <div>
              <label className="field-label">Vai trò</label>
              <select className="text-input" defaultValue={sel?.role ?? 'nhanvien'}>
                <option value="quanly">Quản lý</option>
                <option value="nhanvien">Nhân viên</option>
              </select>
            </div>
            {adding ? (
              <div>
                <label className="field-label">Mật khẩu tạm</label>
                <input className="text-input" defaultValue="QLCV@2026" />
              </div>
            ) : (
              sel && (
                <div className="card" style={{ padding: 16 }}>
                  <InfoRow label="Trạng thái">
                    <Pill variant={sel.active ? 'success' : 'cancelled'} dot={sel.active}>
                      {sel.active ? 'Hoạt động' : 'Đã khoá'}
                    </Pill>
                  </InfoRow>
                  <InfoRow label="Đăng nhập cuối">25/06/2026 09:42</InfoRow>
                  <InfoRow label="Phiên đang mở">2 thiết bị</InfoRow>
                </div>
              )
            )}
          </>
        )}
      </Drawer>
    </>
  )
}
