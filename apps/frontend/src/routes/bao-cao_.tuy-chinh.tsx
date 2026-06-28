import { useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileSpreadsheet, LayoutGrid, ListFilter, Table2 } from 'lucide-react';

import { api } from '~/lib/api';
import { useAuth } from '~/stores/auth';
import { PageHeader } from '~/components/ui';

export const Route = createFileRoute('/bao-cao_/tuy-chinh')({
  component: BaoCaoTuyChinhPage,
});

interface DocType {
  code: string;
  name: string;
}

const GROUPS = [
  { value: 'month', label: 'Tháng' },
  { value: 'quarter', label: 'Quý' },
  { value: 'sender', label: 'Cơ quan' },
  { value: 'type', label: 'Loại' },
];

const SHEETS = [
  { icon: LayoutGrid, name: 'Sheet 1 · Tổng quan', desc: 'Pivot CV theo nhóm × Loại VB + biểu đồ cột' },
  { icon: Table2, name: 'Sheet 2 · Chi tiết', desc: 'Liệt kê từng CV với metadata đầy đủ' },
  { icon: ListFilter, name: 'Sheet 3 · Tham số', desc: 'Ghi lại bộ lọc đã chọn khi xuất' },
];

function isoFirstOfYear(): string {
  return `${new Date().getFullYear()}-01-01`;
}
function isoToday(): string {
  // Ngày theo giờ local (không dùng toISOString = UTC, lệch 1 ngày lúc gần nửa đêm VN).
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function BaoCaoTuyChinhPage() {
  const navigate = useNavigate();
  const me = useAuth((s) => s.user);

  const [fromDate, setFromDate] = useState(isoFirstOfYear());
  const [toDate, setToDate] = useState(isoToday());
  const [unit, setUnit] = useState('all');
  const [docType, setDocType] = useState('all');
  const [groupBy, setGroupBy] = useState('month');

  // Loại VB lấy từ cấu hình sổ (gộp cả đi + đến, lọc theo code duy nhất).
  const typesQuery = useQuery({
    queryKey: ['document-types', 'all'],
    enabled: !!me,
    queryFn: async () => {
      const res = await api.GET('/api/document-types', {});
      return (res.data?.items ?? []) as DocType[];
    },
  });
  const docTypeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of typesQuery.data ?? []) if (!seen.has(t.code)) seen.set(t.code, t.name);
    return [...seen.entries()].map(([code, name]) => ({ code, name }));
  }, [typesQuery.data]);

  const invalidRange = fromDate > toDate;

  function exportExcel() {
    if (invalidRange) return;
    const qs = new URLSearchParams({
      date_from: fromDate,
      date_to: toDate,
      unit,
      doc_type: docType,
      group_by: groupBy,
    });
    window.open(`/api/reports/custom.xlsx?${qs.toString()}`, '_blank');
  }

  if (!me) return <div style={{ padding: '40px 0' }}><p className="cell-meta">Đang tải…</p></div>;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Báo cáo', to: '/bao-cao' }, { label: 'Báo cáo tuỳ chỉnh' }]}
        title="Báo cáo thống kê tuỳ chỉnh"
        subhead="Lọc theo nhiều tiêu chí → xuất Excel 3 sheet (Tổng quan · Chi tiết · Tham số)"
        actions={
          <button className="btn-secondary" type="button" onClick={() => navigate({ to: '/bao-cao' })}>
            <ArrowLeft size={14} /> Quay lại
          </button>
        }
      />

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 24, alignItems: 'start' }}>
        {/* Bộ lọc */}
        <div className="card" style={{ padding: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>Tiêu chí</div>
          <div className="flex flex-col" style={{ gap: 16 }}>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="field-label" htmlFor="from-date">Từ ngày</label>
                <input id="from-date" type="date" className="text-input" value={fromDate} max={toDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <div>
                <label className="field-label" htmlFor="to-date">Đến ngày</label>
                <input id="to-date" type="date" className="text-input" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
            </div>
            {invalidRange && (
              <p className="cell-meta" style={{ color: 'var(--danger)' }}>“Từ ngày” phải trước hoặc bằng “Đến ngày”.</p>
            )}
            <div>
              <label className="field-label" htmlFor="unit-sel">Đơn vị</label>
              <select id="unit-sel" className="text-input" value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="all">Tất cả</option>
                <option value="gdnn">Trung tâm GDNN</option>
                <option value="dvdl">Công ty CP DVDL</option>
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="type-sel">Loại văn bản</label>
              <select id="type-sel" className="text-input" value={docType} onChange={(e) => setDocType(e.target.value)}>
                <option value="all">Tất cả</option>
                {docTypeOptions.map((t) => (
                  <option key={t.code} value={t.code}>{t.name} ({t.code})</option>
                ))}
              </select>
            </div>
            <div>
              <div className="field-label" id="group-by-label">Nhóm theo</div>
              <div className="seg" role="group" aria-labelledby="group-by-label">
                {GROUPS.map((g) => (
                  <button key={g.value} type="button" aria-pressed={groupBy === g.value} data-active={groupBy === g.value ? 'true' : undefined} onClick={() => setGroupBy(g.value)}>
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="cell-meta">CV đến dùng chung 2 đơn vị nên luôn được tính, không phụ thuộc bộ lọc đơn vị.</p>
          </div>
        </div>

        {/* Preview output */}
        <div className="card" style={{ padding: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>File Excel sẽ xuất</div>
          <div className="flex flex-col" style={{ gap: 10 }}>
            {SHEETS.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.name} className="flex items-center" style={{ gap: 12, padding: 14, border: '1px solid var(--rule)', borderRadius: 6 }}>
                  <span className="flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--success-soft)', color: 'var(--success)', flexShrink: 0 }}>
                    <Icon size={18} />
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: '0.88rem' }}>{s.name}</div>
                    <div className="cell-meta">{s.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <button className="btn-primary" type="button" disabled={invalidRange} style={{ marginTop: 18, width: '100%', justifyContent: 'center' }} onClick={exportExcel}>
            <FileSpreadsheet size={14} /> Xuất Excel báo cáo
          </button>
        </div>
      </div>
    </>
  );
}
