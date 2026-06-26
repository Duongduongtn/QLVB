import { ChevronDown, ChevronLeft, ChevronRight, MoreVertical, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

export interface Crumb {
  label: string
  to?: string
}

/* ---------- Sticky page chrome: breadcrumb + title + subhead + actions ---------- */
export function PageHeader({
  breadcrumb,
  title,
  subhead,
  actions,
  filters,
}: {
  breadcrumb: Crumb[]
  title: string
  subhead?: ReactNode
  actions?: ReactNode
  filters?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  // Đo chiều cao vùng chrome (header trang + filter) → CSS var để bảng tính max-height + thead sticky đúng.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const set = () => document.documentElement.style.setProperty('--chrome-h', `${el.offsetHeight}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="page-chrome" ref={ref}>
      {breadcrumb.length > 0 && (
        <nav className="breadcrumb" aria-label="Breadcrumb">
          {breadcrumb.map((c, i) => (
            <span key={i} className="flex items-center" style={{ gap: 6 }}>
              {i > 0 && <span className="sep">/</span>}
              {c.to ? (
                <Link to={c.to}>{c.label}</Link>
              ) : (
                <span className={i === breadcrumb.length - 1 ? 'current' : undefined}>{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex items-start justify-between flex-wrap" style={{ gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="page-title">{title}</h1>
          {subhead && <div className="page-subhead">{subhead}</div>}
        </div>
        {actions && (
          <div className="flex items-center flex-wrap" style={{ gap: 8 }}>
            {actions}
          </div>
        )}
      </div>
      {filters && <div className="page-filters">{filters}</div>}
    </div>
  )
}

/* ---------- Filter select (display-only) ---------- */
export function FilterSelect({ label, value }: { label: string; value: string }) {
  return (
    <button className="filter-select" type="button">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      <ChevronDown size={14} style={{ color: 'var(--ink-muted)' }} />
    </button>
  )
}

/* ---------- Unit pill ---------- */
export function UnitPill({ unit }: { unit: 'gdnn' | 'dvdl' }) {
  return (
    <span className={`pill pill-${unit}`}>
      <span className="dot" />
      {unit.toUpperCase()}
    </span>
  )
}

/* ---------- Generic pill ---------- */
export function Pill({
  variant,
  children,
  dot = false,
  strike = false,
}: {
  variant: string
  children: ReactNode
  dot?: boolean
  strike?: boolean
}) {
  return (
    <span className={`pill pill-${variant}`} style={strike ? { textDecoration: 'line-through' } : undefined}>
      {dot && <span className="dot" />}
      {children}
    </span>
  )
}

export function TypeTag({ children }: { children: ReactNode }) {
  return <span className="type-tag">{children}</span>
}

/* ---------- Pagination ---------- */
export function Pagination({
  rangeLabel,
  pages = [1, 2, 3, 4],
  active = 1,
  last = 13,
}: {
  rangeLabel: string
  pages?: number[]
  active?: number
  last?: number
}) {
  return (
    <div
      className="flex items-center justify-between border-t flex-wrap"
      style={{ padding: '16px 24px', borderColor: 'var(--rule)', gap: 12 }}
    >
      <div className="flex items-center" style={{ gap: 16 }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--ink-muted)' }}>{rangeLabel}</span>
        <div className="filter-select" style={{ height: 32 }}>
          <span className="label">Mỗi trang:</span>
          <span className="value">20</span>
          <ChevronDown size={14} style={{ color: 'var(--ink-muted)' }} />
        </div>
      </div>
      <div className="flex items-center" style={{ gap: 4 }}>
        <button className="pg-btn" aria-label="Trang trước">
          <ChevronLeft size={14} />
        </button>
        {pages.map((p) => (
          <button key={p} className="pg-btn" data-active={p === active ? 'true' : undefined}>
            {p}
          </button>
        ))}
        {last > pages[pages.length - 1] + 1 && (
          <>
            <span style={{ color: 'var(--ink-muted)', padding: '0 4px' }}>…</span>
            <button className="pg-btn">{last}</button>
          </>
        )}
        <button className="pg-btn" aria-label="Trang sau">
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

/* ---------- Empty state ---------- */
export function EmptyState({
  icon: Icon,
  title,
  desc,
}: {
  icon: LucideIcon
  title: string
  desc?: string
}) {
  return (
    <div className="empty-state">
      <Icon size={40} strokeWidth={1.25} style={{ color: 'var(--ink-disabled)' }} />
      <div style={{ fontSize: '0.95rem', color: 'var(--ink-muted)', fontWeight: 500 }}>{title}</div>
      {desc && <div style={{ fontSize: '0.85rem' }}>{desc}</div>}
    </div>
  )
}

/* ---------- Info row (definition list) ---------- */
export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      className="flex items-start"
      style={{ gap: 16, padding: '11px 0', borderBottom: '1px solid var(--rule)' }}
    >
      <span style={{ width: 116, flexShrink: 0, fontSize: '0.8rem', color: 'var(--ink-muted)' }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: '0.875rem', color: 'var(--ink)' }}>{children}</span>
    </div>
  )
}

/* ---------- Card section with title ---------- */
export function SectionCard({
  title,
  action,
  children,
  pad = 20,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  pad?: number
}) {
  return (
    <div className="card" style={{ padding: pad }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
        <span className="eyebrow">{title}</span>
        {action}
      </div>
      {children}
    </div>
  )
}

/* ---------- Timeline ---------- */
export interface TimelineItem {
  time: string
  text: ReactNode
  by?: string
}
export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <div className="flex flex-col">
      {items.map((it, i) => (
        <div key={i} className="flex" style={{ gap: 12 }}>
          <div className="flex flex-col items-center" style={{ width: 12 }}>
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: 999,
                background: i === 0 ? 'var(--kinpaku-rich)' : 'var(--light-graphite-2)',
                marginTop: 5,
                flexShrink: 0,
              }}
            />
            {i < items.length - 1 && <span style={{ width: 1, flex: 1, background: 'var(--rule)' }} />}
          </div>
          <div style={{ paddingBottom: i < items.length - 1 ? 18 : 0, minWidth: 0 }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--ink)' }}>{it.text}</div>
            <div className="cell-meta" style={{ marginTop: 2 }}>
              {it.time}
              {it.by ? ` · ${it.by}` : ''}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ---------- PDF preview placeholder ---------- */
export function PdfPreview({ label = 'Xem trước PDF', signed = false }: { label?: string; signed?: boolean }) {
  return (
    <div
      className="flex items-center justify-center"
      style={{
        aspectRatio: '1 / 1.414',
        width: '100%',
        background: 'var(--paper-deep)',
        border: '1px solid var(--rule)',
        borderRadius: 6,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div className="flex flex-col items-center" style={{ gap: 8, color: 'var(--ink-faint)' }}>
        <span className="cell-meta">{label}</span>
        {signed && (
          <span
            className="flex items-center justify-center"
            style={{
              width: 88,
              height: 88,
              borderRadius: 999,
              border: '2px solid var(--danger)',
              color: 'var(--danger)',
              fontSize: '0.58rem',
              textAlign: 'center',
              opacity: 0.7,
            }}
          >
            MỘC ĐƠN VỊ
          </span>
        )}
      </div>
    </div>
  )
}

/* ---------- Row action menu (⋮) ---------- */
export interface RowAction {
  label: string
  onClick?: () => void
  danger?: boolean
}
export function RowActions({ items }: { items: RowAction[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button className="action-btn" aria-label="Hành động" aria-haspopup="menu" onClick={() => setOpen((v) => !v)}>
        <MoreVertical size={16} />
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 35 }} aria-hidden="true" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="card"
            style={{ position: 'absolute', right: 0, top: 32, width: 184, padding: 6, zIndex: 36, boxShadow: '0 10px 30px oklch(18% 0.02 95 / 0.16)' }}
          >
            {items.map((it, i) => (
              <button
                key={i}
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  it.onClick?.()
                }}
                className="nav-item"
                style={{
                  borderLeft: 'none',
                  width: '100%',
                  textAlign: 'left',
                  fontSize: '0.85rem',
                  color: it.danger ? 'var(--danger)' : undefined,
                }}
              >
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* ---------- Avatar from name ---------- */
export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
  return <span className="avatar">{initials}</span>
}
