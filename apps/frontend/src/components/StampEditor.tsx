import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';

// pdf.js worker — Vite đóng gói file worker thành asset (cách chuẩn react-pdf + Vite).
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

// Toạ độ % so với kích thước trang (gốc trên-trái, y xuống) — KHỚP engine pdf_stamp:
// x0 = x_pct*W, y0 = y_pct*H, rộng = w_pct*W, cao = h_pct*H. PyMuPDF cùng hệ trục.
export interface StampPos {
  kind: 'seal' | 'signature' | 'date';
  page: number; // 1-based
  x_pct: number;
  y_pct: number;
  w_pct: number;
  h_pct: number;
}

interface StampEditorProps {
  fileUrl: string | null;
  positions: StampPos[];
  onChange: (next: StampPos[]) => void;
  images: { seal?: string; signature?: string };
  onNumPages?: (n: number) => void;
}

const KIND_LABEL: Record<string, string> = { seal: 'Mộc', signature: 'Chữ ký', date: 'Ngày' };
const MIN_W = 0.03;
const MIN_H = 0.02;
const MAX_PAGE_W = 760; // không phóng quá to trên màn rộng (vẫn rõ để kéo)
const MAX_PAGE_H = 500; // fit theo chiều cao → thấy CẢ trang (mộc/chữ ký ở đáy không bị cuộn khuất)
const A4_ASPECT = 842 / 595; // cao/rộng — mặc định trước khi biết kích thước trang thật

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

interface DragState {
  idx: number;
  mode: 'move' | 'resize';
  grabX: number; // lệch điểm bấm so với góc trên-trái box (theo %)
  grabY: number;
}

export function StampEditor({ fileUrl, positions, onChange, images, onNumPages }: StampEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);

  const [containerW, setContainerW] = useState(0);
  const [aspect, setAspect] = useState(A4_ASPECT); // cao/rộng của trang đang xem
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [seeded, setSeeded] = useState(false);

  // Đo bề rộng container → render trang PDF responsive (mobile/tablet/desktop).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      // -2px chừa biên, tránh scrollbar bật/tắt gây dao động đo lại.
      setContainerW(Math.max(0, Math.floor(w) - 2));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Bề rộng render: vừa bề ngang container, vừa fit chiều cao (thấy cả trang), không quá to.
  const pageWidth = useMemo(
    () => Math.max(0, Math.min(containerW, MAX_PAGE_W, Math.floor(MAX_PAGE_H / aspect))),
    [containerW, aspect],
  );

  // Lần đầu có positions + biết số trang → mở đúng trang đặt mộc (thường là trang cuối).
  useEffect(() => {
    if (seeded || numPages === 0) return;
    const withImg = positions.find((p) => p.kind === 'seal' || p.kind === 'signature');
    setCurrentPage(clamp(withImg?.page ?? numPages, 1, numPages));
    setSeeded(true);
  }, [seeded, numPages, positions]);

  const update = useCallback(
    (idx: number, partial: Partial<StampPos>) => {
      const next = positions.map((p, i) => (i === idx ? { ...p, ...partial } : p));
      onChange(next);
    },
    [positions, onChange],
  );

  function onPointerDown(e: React.PointerEvent, idx: number, mode: 'move' | 'resize') {
    e.preventDefault();
    e.stopPropagation();
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const p = positions[idx];
    if (!p) return;
    drag.current = {
      idx,
      mode,
      grabX: (e.clientX - rect.left) / rect.width - p.x_pct,
      grabY: (e.clientY - rect.top) / rect.height - p.y_pct,
    };
    overlayRef.current?.setPointerCapture(e.pointerId);
    setActiveIdx(idx);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!d || !rect || rect.width === 0) return;
    const p = positions[d.idx];
    if (!p) return;
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    if (d.mode === 'move') {
      update(d.idx, {
        x_pct: round4(clamp(px - d.grabX, 0, 1 - p.w_pct)),
        y_pct: round4(clamp(py - d.grabY, 0, 1 - p.h_pct)),
      });
    } else {
      update(d.idx, {
        w_pct: round4(clamp(px - p.x_pct, MIN_W, 1 - p.x_pct)),
        h_pct: round4(clamp(py - p.y_pct, MIN_H, 1 - p.y_pct)),
      });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (drag.current) {
      overlayRef.current?.releasePointerCapture(e.pointerId);
      drag.current = null;
    }
  }

  const pageBoxes = positions
    .map((p, idx) => ({ p, idx }))
    .filter(({ p }) => p.page === currentPage && (p.kind === 'seal' || p.kind === 'signature'));

  return (
    <div>
      {/* Thanh điều hướng trang */}
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <span className="cell-meta">
          Kéo để di chuyển, kéo góc dưới-phải để chỉnh kích thước.
        </span>
        {numPages > 1 && (
          <div className="flex items-center" style={{ gap: 6 }}>
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '4px 8px' }}
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((n) => Math.max(1, n - 1))}
              aria-label="Trang trước"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="cell-meta" style={{ minWidth: 64, textAlign: 'center' }}>
              Trang {currentPage}/{numPages}
            </span>
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '4px 8px' }}
              disabled={currentPage >= numPages}
              onClick={() => setCurrentPage((n) => Math.min(numPages, n + 1))}
              aria-label="Trang sau"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      <div
        ref={containerRef}
        style={{
          background: 'var(--paper-deep)',
          border: '1px solid var(--rule)',
          borderRadius: 6,
          padding: 12,
          overflow: 'auto',
          maxHeight: MAX_PAGE_H + 28,
          textAlign: 'center', // căn giữa trang (wrapper inline-block) + overlay khớp canvas
        }}
      >
        {!fileUrl ? (
          <div className="flex items-center justify-center" style={{ height: 200 }}>
            <span className="cell-meta">Chưa có file để dựng vị trí.</span>
          </div>
        ) : pageWidth > 0 ? (
          <Document
            file={fileUrl}
            loading={
              <div className="flex items-center justify-center" style={{ height: 200 }}>
                <span className="cell-meta">Đang tải trang PDF…</span>
              </div>
            }
            error={
              <div className="flex items-center justify-center" style={{ height: 200 }}>
                <span className="cell-meta" style={{ color: 'var(--danger)' }}>
                  Không đọc được file PDF gốc.
                </span>
              </div>
            }
            onLoadSuccess={({ numPages: n }) => {
              setNumPages(n);
              onNumPages?.(n);
            }}
          >
            {/* Wrapper inline-block = đúng kích thước canvas → overlay phủ khít, box định vị % */}
            <div style={{ position: 'relative', display: 'inline-block', lineHeight: 0, textAlign: 'left' }}>
              <Page
                pageNumber={currentPage}
                width={pageWidth}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                onLoadSuccess={(pg) => {
                  if (pg.width > 0) setAspect(pg.height / pg.width);
                }}
                loading={
                  <div className="flex items-center justify-center" style={{ height: 200 }}>
                    <span className="cell-meta">Đang dựng trang…</span>
                  </div>
                }
              />
              <div
                ref={overlayRef}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
              >
                {pageBoxes.map(({ p, idx }) => {
                  const active = activeIdx === idx;
                  const img = images[p.kind as 'seal' | 'signature'];
                  return (
                    <div
                      key={idx}
                      onPointerDown={(e) => onPointerDown(e, idx, 'move')}
                      style={{
                        position: 'absolute',
                        left: `${p.x_pct * 100}%`,
                        top: `${p.y_pct * 100}%`,
                        width: `${p.w_pct * 100}%`,
                        height: `${p.h_pct * 100}%`,
                        border: `1.5px ${active ? 'solid' : 'dashed'} var(--kinpaku-deep)`,
                        background: active ? 'rgba(201,162,77,0.10)' : 'transparent',
                        borderRadius: 3,
                        cursor: 'move',
                        touchAction: 'none',
                        zIndex: active ? 2 : 1,
                        boxSizing: 'border-box',
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          top: -9,
                          left: -1,
                          fontSize: '0.62rem',
                          fontWeight: 600,
                          lineHeight: 1.4,
                          padding: '0 5px',
                          borderRadius: 3,
                          background: 'var(--kinpaku-deep)',
                          color: 'var(--paper)',
                          pointerEvents: 'none',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {KIND_LABEL[p.kind]}
                      </span>
                      {img ? (
                        <img
                          src={img}
                          alt={KIND_LABEL[p.kind]}
                          draggable={false}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                            objectPosition: 'center',
                            opacity: 0.85,
                            pointerEvents: 'none',
                            userSelect: 'none',
                          }}
                        />
                      ) : null}
                      {/* Tay nắm resize góc dưới-phải */}
                      <span
                        onPointerDown={(e) => onPointerDown(e, idx, 'resize')}
                        aria-hidden
                        style={{
                          position: 'absolute',
                          right: -7,
                          bottom: -7,
                          width: 14,
                          height: 14,
                          borderRadius: 3,
                          background: 'var(--kinpaku)',
                          border: '1.5px solid var(--paper)',
                          cursor: 'nwse-resize',
                          touchAction: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Maximize2 size={8} style={{ color: 'var(--ink)' }} />
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Document>
        ) : (
          <div className="flex items-center justify-center" style={{ height: 200 }}>
            <span className="cell-meta">Đang chuẩn bị khung dựng…</span>
          </div>
        )}
      </div>
    </div>
  );
}
