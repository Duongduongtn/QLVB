import { useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Inbox, Send, Tag as TagIcon } from 'lucide-react';

import { api } from '~/lib/api';
import { useAuth } from '~/stores/auth';
import { fmtDate } from '~/lib/format';
import { EmptyState, PageHeader, Pill } from '~/components/ui';

export const Route = createFileRoute('/tag')({
  component: TagPage,
});

interface TagCount {
  id: number;
  name: string;
  count: number;
}
interface TagDoc {
  id: number;
  source: 'in' | 'out';
  number: string | null;
  subject: string | null;
  status: string;
  doc_date: string | null;
  created_at: string;
}

function TagPage() {
  const me = useAuth((s) => s.user);
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);

  const tagsQuery = useQuery({
    queryKey: ['tags'],
    enabled: !!me,
    queryFn: async () => {
      const res = await api.GET('/api/tags', {});
      return (res.data ?? []) as TagCount[];
    },
  });
  const tags = useMemo(() => tagsQuery.data ?? [], [tagsQuery.data]);
  const max = useMemo(() => Math.max(1, ...tags.map((t) => t.count)), [tags]);

  const docsQuery = useQuery({
    queryKey: ['tag-docs', selected],
    enabled: !!selected,
    queryFn: async () => {
      const res = await api.GET('/api/tags/documents', { params: { query: { name: selected! } } });
      return (res.data ?? []) as TagDoc[];
    },
  });
  const docs = docsQuery.data ?? [];

  function openDoc(d: TagDoc) {
    const term = d.number ?? d.subject ?? '';
    navigate({ to: d.source === 'out' ? '/cong-van-di' : '/cong-van-den', search: { q: term } });
  }

  if (!me) return <div style={{ padding: '40px 0' }}><p className="cell-meta">Đang tải…</p></div>;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Tag' }]}
        title="Tag tự do"
        subhead="Nhóm công văn cùng chủ đề để tra cứu nhanh"
      />

      {/* Đám mây tag */}
      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <div className="eyebrow" style={{ marginBottom: 16 }}>Đám mây tag</div>
        {tags.length === 0 ? (
          <p className="cell-meta">Chưa có tag nào. Gắn tag cho công văn ở trang chi tiết CV đi / CV đến.</p>
        ) : (
          <div className="flex flex-wrap" style={{ gap: 10 }}>
            {tags.map((t) => (
              <button
                key={t.id}
                type="button"
                className="tag-chip"
                aria-pressed={selected === t.name}
                style={{ fontSize: `${0.72 + (t.count / max) * 0.5}rem`, cursor: 'pointer', border: selected === t.name ? '1px solid var(--kinpaku-deep)' : undefined }}
                onClick={() => setSelected(selected === t.name ? null : t.name)}
              >
                #{t.name}
                <span style={{ opacity: 0.7 }}>{t.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Bảng tag + tỉ trọng */}
      {tags.length > 0 && (
        <div className="card" style={{ overflow: 'hidden', marginBottom: 24 }}>
          <table className="qlcv-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 24 }}>Tag</th>
                <th style={{ width: 140, textAlign: 'center' }}>Số công văn</th>
                <th style={{ width: '40%' }}>Tỉ trọng</th>
              </tr>
            </thead>
            <tbody>
              {[...tags].sort((a, b) => b.count - a.count).map((t) => (
                <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(t.name)}>
                  <td style={{ paddingLeft: 24 }}><span className="tag-chip">#{t.name}</span></td>
                  <td style={{ textAlign: 'center' }}><span className="cell-mono num">{t.count}</span></td>
                  <td>
                    <div style={{ height: 8, borderRadius: 999, background: 'var(--light-graphite)', overflow: 'hidden' }}>
                      <div style={{ width: `${(t.count / max) * 100}%`, height: '100%', background: 'var(--kinpaku-rich)', borderRadius: 999 }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Công văn theo tag đã chọn */}
      {selected && (
        <div className="card" style={{ padding: 20 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
            <div className="eyebrow flex items-center" style={{ gap: 8 }}>
              <TagIcon size={13} /> Công văn gắn <span className="tag-chip">#{selected}</span>
            </div>
            <button className="btn-ghost" style={{ height: 28 }} type="button" onClick={() => setSelected(null)}>
              <ArrowLeft size={13} /> Bỏ chọn
            </button>
          </div>
          {docsQuery.isLoading ? (
            <p className="cell-meta">Đang tải…</p>
          ) : docs.length === 0 ? (
            <EmptyState icon={Inbox} title="Không có công văn" desc="Tag này chưa gắn công văn nào bạn xem được." />
          ) : (
            <div className="flex flex-col" style={{ gap: 8 }}>
              {docs.map((d) => (
                <button
                  key={`${d.source}-${d.id}`}
                  type="button"
                  className="flex items-center"
                  style={{ gap: 10, padding: '8px 10px', border: '1px solid var(--rule)', borderRadius: 6, textAlign: 'left', background: 'transparent', cursor: 'pointer', width: '100%' }}
                  onClick={() => openDoc(d)}
                >
                  <Pill variant={d.source === 'out' ? 'published' : 'info'} dot>
                    {d.source === 'out' ? 'CV đi' : 'CV đến'}
                  </Pill>
                  <span className="cell-mono num" style={{ flexShrink: 0 }}>{d.number ?? '(chưa số)'}</span>
                  <span className="subject" style={{ flex: 1, minWidth: 0 }}>{d.subject ?? '(chưa có trích yếu)'}</span>
                  {d.source === 'out' ? <Send size={13} style={{ color: 'var(--ink-faint)' }} /> : <Inbox size={13} style={{ color: 'var(--ink-faint)' }} />}
                  <span className="cell-meta" style={{ flexShrink: 0 }}>{d.doc_date ? fmtDate(d.doc_date) : fmtDate(d.created_at)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
