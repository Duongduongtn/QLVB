import { useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Archive, Download, FileSpreadsheet, SlidersHorizontal } from 'lucide-react';

import { api } from '~/lib/api';
import { useAuth } from '~/stores/auth';
import { useUnitView } from '~/stores/unitView';
import { fmtInt, fmtNum } from '~/lib/format';
import { FilterMenu, PageHeader } from '~/components/ui';
import { Modal } from '~/components/Modal';

interface ZipStatus {
  status: 'pending' | 'progress' | 'done' | 'error';
  done?: number;
  total?: number;
  counts?: Record<string, number>;
  size_bytes?: number;
  errors?: number;
  oversize?: boolean;
  year?: number;
  message?: string;
}

function fmtSize(bytes?: number): string {
  if (!bytes) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${fmtNum(Number((mb / 1024).toFixed(2)))} GB`;
  return `${fmtNum(Number(mb.toFixed(2)))} MB`;
}

export const Route = createFileRoute('/bao-cao')({
  component: BaoCaoPage,
});

interface NameCount {
  name: string;
  count: number;
}
interface Stats {
  year: number;
  kpi: {
    di_year: number;
    den_year: number;
    di_month: number;
    den_month: number;
    chua_xu_ly: number;
    qua_han: number;
  };
  months: { month: number; di: number; den: number }[];
  top_senders: NameCount[];
  by_type: NameCount[];
}

// Bảng màu lát bánh (chỉ token design-system, KHÔNG raw Tailwind).
const SLICE_COLORS = [
  'var(--kinpaku-rich)',
  'var(--unit-gdnn)',
  'var(--unit-dvdl)',
  'var(--info)',
  'var(--success)',
  'var(--warning)',
  'var(--kinpaku-deep)',
];

const YEARS = (() => {
  const y = new Date().getFullYear();
  return [y, y - 1, y - 2];
})();

const BOOKS = [
  { value: 'di_gdnn', label: 'Sổ đi GDNN' },
  { value: 'di_dvdl', label: 'Sổ đi DVDL' },
  { value: 'den', label: 'Sổ đến (chung 2 đơn vị)' },
];

/** Donut cơ cấu loại VB (conic-gradient bằng token design-system) + chú thích. */
function Donut({ data }: { data: NameCount[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return <p className="cell-meta">Chưa có dữ liệu.</p>;
  let acc = 0;
  const stops = data
    .map((d, i) => {
      const start = (acc / total) * 360;
      acc += d.count;
      return `${SLICE_COLORS[i % SLICE_COLORS.length]} ${start}deg ${(acc / total) * 360}deg`;
    })
    .join(', ');
  return (
    <div className="flex items-center" style={{ gap: 20, flexWrap: 'wrap' }}>
      <div
        style={{ width: 140, height: 140, borderRadius: '50%', background: `conic-gradient(${stops})`, flexShrink: 0, position: 'relative' }}
        role="img"
        aria-label="Biểu đồ cơ cấu loại văn bản"
      >
        <div style={{ position: 'absolute', inset: 28, borderRadius: '50%', background: 'var(--paper-raised)' }} />
      </div>
      <ul className="flex flex-col" style={{ gap: 6, margin: 0, padding: 0, listStyle: 'none', minWidth: 0, flex: 1 }}>
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center" style={{ gap: 8, fontSize: '0.82rem' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: SLICE_COLORS[i % SLICE_COLORS.length], flexShrink: 0 }} />
            <span style={{ color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
            <span className="cell-meta" style={{ marginLeft: 'auto', flexShrink: 0 }}>
              {fmtInt(d.count)} · {Math.round((d.count / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Top cơ quan gửi — thanh ngang tỉ lệ. */
function SenderBars({ data }: { data: NameCount[] }) {
  if (data.length === 0) return <p className="cell-meta">Chưa có dữ liệu.</p>;
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <ul className="flex flex-col" style={{ gap: 10, margin: 0, padding: 0, listStyle: 'none' }}>
      {data.map((d) => (
        <li key={d.name} className="flex flex-col" style={{ gap: 4 }}>
          <div className="flex items-center justify-between" style={{ gap: 8, fontSize: '0.82rem' }}>
            <span style={{ color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
            <span className="cell-meta" style={{ flexShrink: 0 }}>{fmtInt(d.count)}</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--rule)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(d.count / max) * 100}%`, background: 'var(--kinpaku-rich)' }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function BaoCaoPage() {
  const me = useAuth((s) => s.user);
  const navigate = useNavigate();
  // Toggle đơn vị tái dùng switcher toàn cục ở header (B3a). 'all' → không lọc; số → unit_id.
  const unitView = useUnitView((s) => s.view);
  const unitId = typeof unitView === 'number' ? unitView : undefined;
  const [year, setYear] = useState(String(YEARS[0]));
  const [modalOpen, setModalOpen] = useState(false);
  const [bookYear, setBookYear] = useState(String(YEARS[0]));
  const [book, setBook] = useState('di_gdnn');

  // G4 — xuất ZIP năm (chạy nền ở worker, poll tiến độ).
  const [zipOpen, setZipOpen] = useState(false);
  const [zipYear, setZipYear] = useState(String(YEARS[0]));
  const [zipUnit, setZipUnit] = useState('all');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [zipError, setZipError] = useState<string | null>(null);

  const zipQuery = useQuery({
    queryKey: ['export-zip', taskId],
    enabled: !!taskId,
    refetchInterval: (q) => {
      const s = (q.state.data as ZipStatus | undefined)?.status;
      return s === 'done' || s === 'error' ? false : 1500;
    },
    queryFn: async (): Promise<ZipStatus> => {
      const r = await fetch(`/api/reports/export-zip/${taskId}`, { credentials: 'same-origin' });
      return r.json();
    },
  });
  const zip = zipQuery.data;

  async function startZip() {
    setTaskId(null);
    setZipError(null);
    const qs = new URLSearchParams({ year: zipYear });
    if (zipUnit !== 'all') qs.set('unit', zipUnit);
    try {
      const r = await fetch(`/api/reports/export-zip?${qs.toString()}`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!r.ok) {
        setZipError('Không gửi được yêu cầu xuất ZIP. Vui lòng thử lại.');
        return;
      }
      const d = (await r.json()) as { task_id: string };
      setTaskId(d.task_id);
    } catch {
      setZipError('Lỗi kết nối khi gửi yêu cầu xuất ZIP.');
    }
  }

  function openZip() {
    setTaskId(null);
    setZipError(null);
    setZipYear(year);
    setZipOpen(true);
  }

  const statsQuery = useQuery({
    queryKey: ['report-stats', year, unitId ?? 'all'],
    enabled: !!me,
    queryFn: async () => {
      const query: { year: number; unit_id?: number } = { year: Number(year) };
      if (unitId !== undefined) query.unit_id = unitId;
      const res = await api.GET('/api/reports/stats', { params: { query } });
      return res.data as Stats;
    },
  });
  const stats = statsQuery.data;
  const months = useMemo(() => stats?.months ?? [], [stats]);
  const maxBar = useMemo(() => Math.max(1, ...months.flatMap((m) => [m.di, m.den])), [months]);
  const topSenders = useMemo(() => stats?.top_senders ?? [], [stats]);
  const byType = useMemo(() => stats?.by_type ?? [], [stats]);

  const kpis = stats
    ? [
        { label: 'CV đi tháng này', value: stats.kpi.di_month },
        { label: 'CV đến tháng này', value: stats.kpi.den_month },
        { label: 'CV đi năm nay', value: stats.kpi.di_year },
        { label: 'CV đến năm nay', value: stats.kpi.den_year },
        { label: 'CV chưa xử lý', value: stats.kpi.chua_xu_ly },
        { label: 'CV quá hạn', value: stats.kpi.qua_han, danger: stats.kpi.qua_han > 0 },
      ]
    : [];

  function downloadRegister() {
    window.open(`/api/reports/register.xlsx?year=${bookYear}&book=${book}`, '_blank');
    setModalOpen(false);
  }

  if (!me) return <div style={{ padding: '40px 0' }}><p className="cell-meta">Đang tải…</p></div>;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Báo cáo' }]}
        title="Báo cáo & Dashboard"
        subhead={`Tổng quan công văn 2 đơn vị năm ${year}`}
        actions={
          <>
            <button className="btn-secondary" type="button" onClick={() => navigate({ to: '/bao-cao/tuy-chinh' })}>
              <SlidersHorizontal size={14} /> Báo cáo tuỳ chỉnh
            </button>
            <button className="btn-secondary" type="button" onClick={openZip}>
              <Archive size={14} /> Xuất ZIP năm
            </button>
            <button className="btn-primary" type="button" onClick={() => { setBookYear(year); setModalOpen(true); }}>
              <FileSpreadsheet size={14} /> Xuất sổ NĐ 30
            </button>
          </>
        }
        filters={
          <FilterMenu
            label="Thời gian:"
            value={year}
            options={YEARS.map((y) => ({ value: String(y), label: `Năm ${y}` }))}
            onChange={setYear}
          />
        }
      />

      {/* KPI cards */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        {(kpis.length ? kpis : Array.from({ length: 6 }, () => ({ label: '—', value: 0, danger: false }))).map((k, i) => (
          <div key={i} className="kpi-card">
            <span className="kpi-label">{k.label}</span>
            <div className="flex items-baseline" style={{ gap: 8 }}>
              <span
                className="kpi-value"
                style={'danger' in k && k.danger ? { color: 'var(--danger)' } : undefined}
              >
                {statsQuery.isLoading ? '…' : fmtInt(k.value)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Bar chart CV theo tháng */}
      <div className="card" style={{ padding: 24 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
          <span className="section-title">Công văn theo tháng</span>
          <div className="flex items-center" style={{ gap: 16, fontSize: '0.78rem' }}>
            <span className="flex items-center" style={{ gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--kinpaku-rich)' }} /> CV đi
            </span>
            <span className="flex items-center" style={{ gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--unit-gdnn)' }} /> CV đến
            </span>
          </div>
        </div>
        <div className="flex items-end justify-between" style={{ gap: 12, height: 220 }}>
          {months.map((m) => (
            <div key={m.month} className="flex flex-col items-center" style={{ flex: 1, gap: 8 }}>
              <div className="flex items-end justify-center" style={{ gap: 5, height: 180, width: '100%' }}>
                <div title={`CV đi: ${m.di}`} style={{ width: 16, height: `${(m.di / maxBar) * 100}%`, background: 'var(--kinpaku-rich)', borderRadius: '3px 3px 0 0' }} />
                <div title={`CV đến: ${m.den}`} style={{ width: 16, height: `${(m.den / maxBar) * 100}%`, background: 'var(--unit-gdnn)', borderRadius: '3px 3px 0 0' }} />
              </div>
              <span className="cell-meta">T{m.month}</span>
            </div>
          ))}
          {months.length === 0 && <div className="cell-meta" style={{ margin: 'auto' }}>Chưa có dữ liệu.</div>}
        </div>
      </div>

      {/* Cơ cấu loại VB (pie) + Top cơ quan gửi */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginTop: 24 }}>
        <div className="card" style={{ padding: 24 }}>
          <span className="section-title" style={{ display: 'block', marginBottom: 20 }}>Cơ cấu loại văn bản đi</span>
          <Donut data={byType} />
        </div>
        <div className="card" style={{ padding: 24 }}>
          <span className="section-title" style={{ display: 'block', marginBottom: 20 }}>Top cơ quan gửi (CV đến)</span>
          <SenderBars data={topSenders} />
        </div>
      </div>

      {/* G2 — Xuất sổ NĐ 30 */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Xuất sổ theo NĐ 30/2020"
        actions={
          <>
            <button className="btn-secondary" type="button" onClick={() => setModalOpen(false)}>Huỷ</button>
            <button className="btn-primary" type="button" onClick={downloadRegister}>
              <FileSpreadsheet size={14} /> Tải Excel
            </button>
          </>
        }
      >
        <div>
          <label className="field-label">Năm</label>
          <select className="text-input" value={bookYear} onChange={(e) => setBookYear(e.target.value)}>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">Loại sổ</label>
          <select className="text-input" value={book} onChange={(e) => setBook(e.target.value)}>
            {BOOKS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        </div>
        <p className="cell-meta">Excel đúng cột Phụ lục III NĐ 30/2020, tiếng Việt có dấu đầy đủ.</p>
      </Modal>

      {/* G4 — Xuất ZIP toàn bộ CV theo năm */}
      <Modal
        open={zipOpen}
        onClose={() => setZipOpen(false)}
        title="Xuất ZIP toàn bộ CV theo năm"
        actions={
          <>
            <button className="btn-secondary" type="button" onClick={() => setZipOpen(false)}>Đóng</button>
            {zip?.status === 'done' ? (
              <button className="btn-primary" type="button" onClick={() => window.open(`/api/reports/export-zip/${taskId}/download`, '_blank')}>
                <Download size={14} /> Tải ZIP
              </button>
            ) : (
              <button className="btn-primary" type="button" disabled={!!taskId && zip?.status !== 'error'} onClick={startZip}>
                <Archive size={14} /> Bắt đầu xuất
              </button>
            )}
          </>
        }
      >
        {!taskId && (
          <>
            <div>
              <label className="field-label" htmlFor="zip-year">Năm</label>
              <select id="zip-year" className="text-input" value={zipYear} onChange={(e) => setZipYear(e.target.value)}>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="zip-unit">Đơn vị (lọc CV đi)</label>
              <select id="zip-unit" className="text-input" value={zipUnit} onChange={(e) => setZipUnit(e.target.value)}>
                <option value="all">Cả 2 đơn vị</option>
                <option value="gdnn">Trung tâm GDNN</option>
                <option value="dvdl">Công ty CP DVDL</option>
              </select>
            </div>
            <p className="cell-meta">ZIP gồm PDF + metadata.json từng CV theo thư mục năm, kèm index.xlsx + index.pdf (sổ NĐ 30). CV đến dùng chung 2 đơn vị nên luôn gồm.</p>
            {zipError && <p className="cell-meta" style={{ color: 'var(--danger)' }}>{zipError}</p>}
          </>
        )}

        {taskId && (zip?.status === 'pending' || zip?.status === 'progress') && (
          <div className="flex flex-col" style={{ gap: 12 }}>
            <p className="cell-meta">
              Đang gom công văn… {zip?.status === 'progress' && zip.total ? `${fmtInt(zip.done ?? 0)}/${fmtInt(zip.total)}` : ''}
            </p>
            <div style={{ height: 8, borderRadius: 4, background: 'var(--rule)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: '100%', transformOrigin: 'left', transform: `scaleX(${zip?.total ? (zip.done ?? 0) / zip.total : 0.1})`, background: 'var(--kinpaku-rich)', transition: 'transform .3s' }} />
            </div>
          </div>
        )}

        {zip?.status === 'done' && (
          <div className="flex flex-col" style={{ gap: 8 }}>
            <p style={{ color: 'var(--ink)', fontWeight: 600 }}>Đã xuất xong {fmtInt(zip.total ?? 0)} công văn — {fmtSize(zip.size_bytes)}</p>
            {zip.counts && (
              <ul className="cell-meta" style={{ margin: 0, paddingLeft: 18 }}>
                {Object.entries(zip.counts).map(([folder, n]) => (
                  <li key={folder}>{folder}: {fmtInt(n)} CV</li>
                ))}
              </ul>
            )}
            {!!zip.errors && <p className="cell-meta" style={{ color: 'var(--danger)' }}>{fmtInt(zip.errors)} file lỗi đọc đã bỏ qua.</p>}
            {zip.oversize && <p className="cell-meta" style={{ color: 'var(--danger)' }}>Gói &gt; 2GB — cân nhắc xuất theo từng đơn vị hoặc chia quý.</p>}
          </div>
        )}

        {zip?.status === 'error' && (
          <p className="cell-meta" style={{ color: 'var(--danger)' }}>{zip.message ?? 'Xuất ZIP thất bại, thử lại sau.'}</p>
        )}
      </Modal>
    </>
  );
}
