import { useEffect, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';

import { api } from '~/lib/api';
import { useAuth } from '~/stores/auth';
import { fmtDate } from '~/lib/format';
import { FilterMenu, PageHeader, Pill } from '~/components/ui';
import { URGENCY_LABEL } from '~/lib/incoming';

export const Route = createFileRoute('/tim-kiem')({
  component: TimKiemPage,
  validateSearch: (s: Record<string, unknown>): { q?: string } => ({
    q: typeof s.q === 'string' ? s.q : undefined,
  }),
});

interface Result {
  id: number;
  source: 'in' | 'out';
  number: string | null;
  subject: string | null;
  status: string;
  doc_date: string | null;
  created_at: string;
}

const YEARS = (() => {
  const y = new Date().getFullYear();
  return [y, y - 1, y - 2];
})();

function deaccent(s: string): string {
  return s.normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

function highlight(text: string, kw: string) {
  const t = kw.trim();
  if (!t) return text;
  const idx = deaccent(text).toLowerCase().indexOf(deaccent(t).toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'var(--kinpaku-pale)', color: 'var(--ink)', borderRadius: 2, padding: '0 1px' }}>
        {text.slice(idx, idx + t.length)}
      </mark>
      {text.slice(idx + t.length)}
    </>
  );
}

function TimKiemPage() {
  const me = useAuth((s) => s.user);
  const navigate = useNavigate();
  const { q: urlQ } = Route.useSearch();
  const [q, setQ] = useState(urlQ ?? '');
  const [debounced, setDebounced] = useState(urlQ ?? '');
  const [type, setType] = useState<'all' | 'in' | 'out'>('all');
  const [year, setYear] = useState('all');
  const [urgency, setUrgency] = useState('all');

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(id);
  }, [q]);
  useEffect(() => {
    if (urlQ !== undefined) {
      setQ(urlQ);
      setDebounced(urlQ);
    }
  }, [urlQ]);

  const term = debounced.trim();
  const query = useQuery({
    queryKey: ['tim-kiem', term, type, year, urgency],
    enabled: !!me && term.length >= 2,
    queryFn: async () => {
      const res = await api.GET('/api/search', {
        params: {
          query: {
            q: term,
            type,
            urgency: urgency === 'all' ? undefined : urgency,
            date_from: year === 'all' ? undefined : `${year}-01-01`,
            date_to: year === 'all' ? undefined : `${year}-12-31`,
            size: 30,
          },
        },
      });
      return (res.data ?? { items: [], total: 0 }) as { items: Result[]; total: number };
    },
  });
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;

  function openResult(r: Result) {
    const t = r.number ?? r.subject ?? '';
    navigate({ to: r.source === 'out' ? '/cong-van-di' : '/cong-van-den', search: { q: t } });
  }

  if (!me) return <div style={{ padding: '40px 0' }}><p className="cell-meta">Đang tải…</p></div>;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Tìm kiếm' }]}
        title="Tìm kiếm toàn văn"
        subhead="Tìm theo trích yếu, số CV, nội dung qua OCR — có dấu hay không dấu đều ra"
      />

      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <div className="relative" style={{ marginBottom: 16 }}>
          <Search size={18} className="absolute" style={{ left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-faint)' }} />
          <input
            className="text-input"
            style={{ height: 48, paddingLeft: 44, fontSize: '1rem' }}
            value={q}
            autoFocus
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nhập từ khoá… (vd: tay nghề, biên bản, quyết toán)"
          />
        </div>
        <div className="flex flex-wrap items-center" style={{ gap: 12 }}>
          <FilterMenu
            label="Loại:"
            value={type}
            options={[{ value: 'all', label: 'Tất cả' }, { value: 'out', label: 'Công văn đi' }, { value: 'in', label: 'Công văn đến' }]}
            onChange={(v) => setType(v as 'all' | 'in' | 'out')}
          />
          <FilterMenu
            label="Thời gian:"
            value={year}
            options={[{ value: 'all', label: 'Tất cả' }, ...YEARS.map((y) => ({ value: String(y), label: `Năm ${y}` }))]}
            onChange={setYear}
          />
          <FilterMenu
            label="Mức khẩn:"
            value={urgency}
            options={[{ value: 'all', label: 'Tất cả' }, ...Object.entries(URGENCY_LABEL).map(([value, label]) => ({ value, label }))]}
            onChange={setUrgency}
          />
        </div>
      </div>

      {term.length < 2 ? (
        <div className="cell-meta">Nhập ít nhất 2 ký tự để tìm.</div>
      ) : (
        <>
          <div className="cell-meta" style={{ marginBottom: 12 }}>
            {query.isFetching ? 'Đang tìm…' : `Tìm thấy ${total} kết quả cho “${term}”`}
          </div>
          <div className="flex flex-col" style={{ gap: 12 }}>
            {items.map((r) => (
              <div key={`${r.source}-${r.id}`} className="card" style={{ padding: 18, cursor: 'pointer' }} onClick={() => openResult(r)}>
                <div className="flex items-center" style={{ gap: 8, marginBottom: 6 }}>
                  <Pill variant={r.source === 'out' ? 'published' : 'info'} dot>
                    {r.source === 'out' ? 'CV đi' : 'CV đến'}
                  </Pill>
                  <span className="cell-mono num">{r.number ?? '(chưa số)'}</span>
                </div>
                <div className="subject" style={{ marginBottom: 4 }}>{highlight(r.subject ?? '(chưa có trích yếu)', term)}</div>
                <div className="cell-meta">{r.doc_date ? `Ngày VB: ${fmtDate(r.doc_date)}` : `Tạo: ${fmtDate(r.created_at)}`}</div>
              </div>
            ))}
            {!query.isFetching && items.length === 0 && (
              <div className="cell-meta">Không có kết quả phù hợp.</div>
            )}
          </div>
        </>
      )}
    </>
  );
}
