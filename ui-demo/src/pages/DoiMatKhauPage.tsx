import { Lock, ShieldCheck, Save } from 'lucide-react'
import { PageHeader } from '../components/ui'

const rules = ['Tối thiểu 8 ký tự', 'Có cả chữ và số', 'Khác mật khẩu hiện tại']

export function DoiMatKhauPage() {
  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Tài khoản' }, { label: 'Đổi mật khẩu' }]}
        title="Đổi mật khẩu"
        subhead="Bảo mật tài khoản cá nhân — đổi xong sẽ phải đăng nhập lại"
      />

      <div className="card" style={{ padding: 28, maxWidth: 460 }}>
        <form onSubmit={(e) => e.preventDefault()} className="flex flex-col" style={{ gap: 16 }}>
          <div>
            <label className="field-label">Mật khẩu hiện tại</label>
            <div className="relative">
              <Lock size={16} className="absolute" style={{ left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-faint)' }} />
              <input type="password" className="text-input" style={{ paddingLeft: 38 }} placeholder="••••••••" />
            </div>
          </div>
          <div>
            <label className="field-label">Mật khẩu mới</label>
            <div className="relative">
              <Lock size={16} className="absolute" style={{ left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-faint)' }} />
              <input type="password" className="text-input" style={{ paddingLeft: 38 }} placeholder="••••••••" />
            </div>
          </div>
          <div>
            <label className="field-label">Nhập lại mật khẩu mới</label>
            <div className="relative">
              <Lock size={16} className="absolute" style={{ left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-faint)' }} />
              <input type="password" className="text-input" style={{ paddingLeft: 38 }} placeholder="••••••••" />
            </div>
          </div>

          <div className="card" style={{ padding: 14, background: 'var(--paper-deep)' }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Yêu cầu mật khẩu
            </div>
            <div className="flex flex-col" style={{ gap: 6 }}>
              {rules.map((r) => (
                <div key={r} className="flex items-center" style={{ gap: 8, fontSize: '0.82rem', color: 'var(--ink-body)' }}>
                  <ShieldCheck size={14} style={{ color: 'var(--success)' }} />
                  {r}
                </div>
              ))}
            </div>
          </div>

          <button className="btn-primary" type="submit" style={{ alignSelf: 'flex-start' }}>
            <Save size={14} /> Đổi mật khẩu
          </button>
        </form>
      </div>
    </>
  )
}
