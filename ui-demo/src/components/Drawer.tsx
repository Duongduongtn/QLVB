import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function Drawer({
  open,
  onClose,
  title,
  eyebrow,
  actions,
  width = 560,
  children,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  eyebrow?: ReactNode
  actions?: ReactNode
  width?: number
  children: ReactNode
}) {
  // ESC để đóng + khoá cuộn nền khi mở
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  return (
    <>
      <div className="drawer-backdrop" data-open={open ? 'true' : undefined} onClick={onClose} aria-hidden="true" />
      <aside
        className="drawer-panel"
        data-open={open ? 'true' : undefined}
        role="dialog"
        aria-modal="true"
        aria-hidden={open ? undefined : 'true'}
        style={{ width }}
      >
        <div className="drawer-header">
          <div style={{ minWidth: 0 }}>
            {eyebrow && <div className="drawer-eyebrow">{eyebrow}</div>}
            <div className="drawer-title">{title}</div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Đóng" style={{ flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {actions && <div className="drawer-footer">{actions}</div>}
      </aside>
    </>
  )
}
