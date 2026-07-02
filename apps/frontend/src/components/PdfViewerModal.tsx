import { useEffect } from 'react';
import { Download, X } from 'lucide-react';

/**
 * Xem PDF công văn gần toàn màn (~92%) — nhúng trình xem PDF của trình duyệt (iframe).
 * `src` trỏ endpoint /file (đã tự chèn watermark cá nhân — H2). `onDownload` ép tải bản về.
 */
export function PdfViewerModal({
  open,
  onClose,
  title,
  src,
  onDownload,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  src: string;
  onDownload?: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="card"
        role="dialog"
        aria-modal="true"
        aria-label={`Xem công văn ${title}`}
        onClick={(e) => e.stopPropagation()}
        style={{ width: '92vw', height: '92vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
      >
        <div
          className="flex items-center justify-between"
          style={{ padding: '12px 16px', borderBottom: '1px solid var(--rule)', gap: 12 }}
        >
          <span
            className="section-title"
            style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {title}
          </span>
          <div className="flex items-center" style={{ gap: 8, flexShrink: 0 }}>
            {onDownload && (
              <button className="btn-secondary" style={{ height: 32 }} type="button" onClick={onDownload}>
                <Download size={14} /> Tải về
              </button>
            )}
            <button className="icon-btn" type="button" onClick={onClose} aria-label="Đóng">
              <X size={18} />
            </button>
          </div>
        </div>
        <iframe
          title={`Nội dung công văn ${title}`}
          src={src}
          style={{ flex: 1, width: '100%', border: 'none', background: 'var(--paper-deep)' }}
        />
      </div>
    </div>
  );
}
