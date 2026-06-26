import { PageHeader } from '../components/ui'

const tags = [
  { name: 'thi-tay-nghe', count: 18 },
  { name: 'kiem-toan-2026', count: 12 },
  { name: 'tap-huan', count: 9 },
  { name: 'tuyen-sinh', count: 24 },
  { name: 'bao-cao-quy', count: 15 },
  { name: 'hop-dong', count: 7 },
  { name: 'le-tet', count: 5 },
  { name: 'nhan-su', count: 11 },
  { name: 'dao-tao-nghe', count: 31 },
  { name: 'du-lich', count: 14 },
]

export function TagPage() {
  const max = Math.max(...tags.map((t) => t.count))
  return (
    <>
      <PageHeader breadcrumb={[{ label: 'Tag' }]} title="Tag tự do" subhead="Nhóm công văn cùng chủ đề để tra cứu nhanh" />

      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <div className="eyebrow" style={{ marginBottom: 16 }}>
          Đám mây tag
        </div>
        <div className="flex flex-wrap" style={{ gap: 10 }}>
          {tags.map((t) => (
            <span
              key={t.name}
              className="tag-chip"
              style={{ fontSize: `${0.72 + (t.count / max) * 0.5}rem`, cursor: 'pointer' }}
            >
              #{t.name}
              <span style={{ opacity: 0.7 }}>{t.count}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="qlcv-table">
          <thead>
            <tr>
              <th style={{ paddingLeft: 24 }}>Tag</th>
              <th className="center" style={{ width: 140 }}>
                Số công văn
              </th>
              <th style={{ width: '40%' }}>Tỉ trọng</th>
            </tr>
          </thead>
          <tbody>
            {[...tags]
              .sort((a, b) => b.count - a.count)
              .map((t) => (
                <tr key={t.name}>
                  <td style={{ paddingLeft: 24 }}>
                    <span className="tag-chip">#{t.name}</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="cell-mono num">{t.count}</span>
                  </td>
                  <td>
                    <div style={{ height: 8, borderRadius: 999, background: 'var(--light-graphite)', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${(t.count / max) * 100}%`,
                          height: '100%',
                          background: 'var(--kinpaku-rich)',
                          borderRadius: 999,
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
