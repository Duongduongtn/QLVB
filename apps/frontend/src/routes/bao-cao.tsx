import { useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, SlidersHorizontal } from 'lucide-react';

import { api } from '~/lib/api';
import { useAuth } from '~/stores/auth';
import { fmtInt } from '~/lib/format';
import { FilterMenu, PageHeader } from '~/components/ui';
import { Modal } from '~/components/Modal';

export const Route = createFileRoute('/bao-cao')({
  component: BaoCaoPage,
});

interface Stats {
  year: number;
  kpi: { di_year: number; den_year: number; di_month: number; den_month: number };
  months: { month: number; di: number; den: number }[];
}

const YEARS = (() => {
  const y = new Date().getFullYear();
  return [y, y - 1, y - 2];
})();

const BOOKS = [
  { value: 'di_gdnn', label: 'Sổ đi GDNN' },
  { value: 'di_dvdl', label: 'Sổ đi DVDL' },
  { value: 'den', label: 'Sổ đến (chung 2 đơn vị)' },
];

function BaoCaoPage() {
  const me = useAuth((s) => s.user);
  const navigate = useNavigate();
  const [year, setYear] = useState(String(YEARS[0]));
  const [modalOpen, setModalOpen] = useState(false);
  const [bookYear, setBookYear] = useState(String(YEARS[0]));
  const [book, setBook] = useState('di_gdnn');

  const statsQuery = useQuery({
    queryKey: ['report-stats', year],
    enabled: !!me,
    queryFn: async () => {
      const res = await api.GET('/api/reports/stats', { params: { query: { year: Number(year) } } });
      return res.data as Stats;
    },
  });
  const stats = statsQuery.data;
  const months = useMemo(() => stats?.months ?? [], [stats]);
  const maxBar = useMemo(() => Math.max(1, ...months.flatMap((m) => [m.di, m.den])), [months]);

  const kpis = stats
    ? [
        { label: 'CV đi năm nay', value: stats.kpi.di_year },
        { label: 'CV đến năm nay', value: stats.kpi.den_year },
        { label: 'CV đi tháng này', value: stats.kpi.di_month },
        { label: 'CV đến tháng này', value: stats.kpi.den_month },
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
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        {(kpis.length ? kpis : [0, 1, 2, 3].map(() => ({ label: '—', value: 0 }))).map((k, i) => (
          <div key={i} className="kpi-card">
            <span className="kpi-label">{k.label}</span>
            <div className="flex items-baseline" style={{ gap: 8 }}>
              <span className="kpi-value">{statsQuery.isLoading ? '…' : fmtInt(k.value)}</span>
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
    </>
  );
}
