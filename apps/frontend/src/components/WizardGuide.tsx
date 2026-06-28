import { useState } from 'react';
import { ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';

export interface GuideStep {
  label: string;
  detail: string;
}

/**
 * Hộp hướng dẫn cho người mới ở đầu các wizard (Soạn CV đi / Vào sổ CV đến).
 * Mặc định mở; người dùng có thể thu gọn — trạng thái nhớ qua localStorage theo `storageKey`.
 */
export function WizardGuide({
  storageKey,
  title,
  intro,
  steps,
}: {
  storageKey: string;
  title: string;
  intro?: string;
  steps: GuideStep[];
}) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(storageKey) !== 'collapsed';
    } catch {
      return true;
    }
  });

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, next ? 'open' : 'collapsed');
      } catch {
        /* localStorage chặn (private mode) → bỏ qua, vẫn toggle trong phiên */
      }
      return next;
    });
  }

  return (
    <div
      className="card"
      style={{ padding: 0, marginBottom: 20, background: 'var(--kinpaku-pale)', borderColor: 'var(--kinpaku)' }}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex items-center justify-between"
        style={{
          width: '100%',
          gap: 10,
          padding: '12px 16px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span className="flex items-center" style={{ gap: 10, fontWeight: 600, color: 'var(--ink)', fontSize: '0.9rem' }}>
          <HelpCircle size={16} style={{ color: 'var(--kinpaku-deep)', flexShrink: 0 }} />
          {title}
        </span>
        <span className="flex items-center" style={{ gap: 6, color: 'var(--ink-muted)', fontSize: '0.78rem' }}>
          {open ? 'Thu gọn' : 'Xem hướng dẫn'}
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </span>
      </button>

      {open && (
        <div style={{ padding: '0 16px 16px' }}>
          {intro && (
            <p style={{ fontSize: '0.85rem', color: 'var(--ink-body)', marginBottom: 12 }}>{intro}</p>
          )}
          <ol className="flex flex-col" style={{ gap: 10, margin: 0, paddingLeft: 0, listStyle: 'none' }}>
            {steps.map((s, i) => (
              <li key={i} className="flex items-start" style={{ gap: 10 }}>
                <span
                  className="flex items-center justify-center"
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    flexShrink: 0,
                    background: 'var(--kinpaku)',
                    color: 'var(--ink)',
                    fontWeight: 600,
                    fontSize: '0.74rem',
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ fontSize: '0.85rem', color: 'var(--ink-body)', lineHeight: 1.5 }}>
                  <strong style={{ color: 'var(--ink)' }}>{s.label}.</strong> {s.detail}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
