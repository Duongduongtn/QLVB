import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, Lock, User } from 'lucide-react'

export function LoginPage() {
  const navigate = useNavigate()
  const [remember, setRemember] = useState(true)

  return (
    <div className="login-bg">
      <div className="w-full" style={{ maxWidth: 408 }}>
        {/* Brand */}
        <div className="flex flex-col items-center" style={{ gap: 12, marginBottom: 28 }}>
          <div className="flex items-center" style={{ gap: 12 }}>
            <div className="brand-mark" aria-hidden="true" />
            <div className="flex flex-col">
              <span className="wordmark">QLCV</span>
              <span className="tagline">Thành Đạt</span>
            </div>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', textAlign: 'center' }}>
            Hệ thống Quản lý Công văn và Ký số
          </p>
        </div>

        <div className="card" style={{ padding: 28 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Đăng nhập
          </div>
          <h1 className="section-title" style={{ marginBottom: 20 }}>
            Chào mừng trở lại
          </h1>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              navigate('/cong-van-di')
            }}
          >
            <div style={{ marginBottom: 16 }}>
              <label className="field-label" htmlFor="username">
                Tên đăng nhập
              </label>
              <div className="relative">
                <User
                  size={16}
                  className="absolute"
                  style={{ left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-faint)' }}
                />
                <input
                  id="username"
                  className="text-input"
                  style={{ paddingLeft: 38 }}
                  placeholder="vanthu.gdnn"
                  defaultValue="admin"
                  autoComplete="username"
                />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="field-label" htmlFor="password">
                Mật khẩu
              </label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute"
                  style={{ left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-faint)' }}
                />
                <input
                  id="password"
                  type="password"
                  className="text-input"
                  style={{ paddingLeft: 38 }}
                  placeholder="••••••••"
                  defaultValue="demo1234"
                  autoComplete="current-password"
                />
              </div>
            </div>

            <label
              className="flex items-center"
              style={{ gap: 8, marginBottom: 20, cursor: 'pointer', fontSize: '0.85rem' }}
            >
              <input
                type="checkbox"
                className="qlcv-check"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span className="text-ink-body">Ghi nhớ đăng nhập (7 ngày)</span>
            </label>

            <button className="btn-primary" type="submit" style={{ width: '100%', justifyContent: 'center' }}>
              Đăng nhập
            </button>
          </form>

          <div
            className="flex items-center"
            style={{ gap: 8, marginTop: 18, fontSize: '0.75rem', color: 'var(--ink-faint)' }}
          >
            <ShieldCheck size={14} />
            Sai mật khẩu 5 lần trong 15 phút sẽ bị khoá tạm thời.
          </div>
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: '0.75rem', color: 'var(--ink-faint)' }}>
          © 2026 Trung tâm GDNN &amp; Công ty CP DVDL Thành Đạt
        </p>
      </div>
    </div>
  )
}
