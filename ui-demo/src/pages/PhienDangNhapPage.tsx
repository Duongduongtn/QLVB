import { Monitor, Smartphone, LogOut } from 'lucide-react'
import { PageHeader, Pill } from '../components/ui'

interface Session {
  device: string
  kind: 'desktop' | 'mobile'
  ip: string
  last: string
  current?: boolean
}

const sessions: Session[] = [
  { device: 'Chrome · Windows 11', kind: 'desktop', ip: '113.161.x.x', last: 'Đang hoạt động', current: true },
  { device: 'Safari · iPhone 15', kind: 'mobile', ip: '171.244.x.x', last: '25/06/2026 08:12' },
  { device: 'Edge · Windows 10', kind: 'desktop', ip: '14.241.x.x', last: '23/06/2026 17:40' },
]

export function PhienDangNhapPage() {
  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Tài khoản' }, { label: 'Phiên đăng nhập' }]}
        title="Phiên đăng nhập"
        subhead="Các thiết bị đang đăng nhập tài khoản của bạn — đăng xuất từng phiên nếu cần"
        actions={
          <button className="btn-secondary" style={{ color: 'var(--danger)' }}>
            <LogOut size={14} /> Đăng xuất tất cả thiết bị khác
          </button>
        }
      />

      <div className="flex flex-col" style={{ gap: 12, maxWidth: 720 }}>
        {sessions.map((s) => {
          const Icon = s.kind === 'mobile' ? Smartphone : Monitor
          return (
            <div key={s.device} className="card flex items-center" style={{ padding: 16, gap: 14 }}>
              <span
                className="flex items-center justify-center"
                style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--paper-deep)', color: 'var(--ink-muted)', flexShrink: 0 }}
              >
                <Icon size={20} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center" style={{ gap: 8 }}>
                  <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{s.device}</span>
                  {s.current && (
                    <Pill variant="success" dot>
                      Phiên hiện tại
                    </Pill>
                  )}
                </div>
                <div className="cell-meta">
                  IP {s.ip} · {s.last}
                </div>
              </div>
              {!s.current && (
                <button className="btn-secondary" style={{ height: 32, color: 'var(--danger)' }}>
                  <LogOut size={13} /> Đăng xuất
                </button>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
