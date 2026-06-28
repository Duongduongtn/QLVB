import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Tag as TagIcon, X } from 'lucide-react';

import { api } from '~/lib/api';

/** F2 — gắn/gỡ tag tự do cho 1 CV (đi/đến). Chips + gợi ý autocomplete, chuẩn hoá ở BE. */
export function TagEditor({ objectType, objectId }: { objectType: 'incoming' | 'outgoing'; objectId: number }) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const tagsQuery = useQuery({
    queryKey: ['doc-tags', objectType, objectId],
    queryFn: async () => {
      const res = await api.GET('/api/tags/{object_type}/{object_id}', {
        params: { path: { object_type: objectType, object_id: objectId } },
      });
      return ((res.data ?? { names: [] }) as { names: string[] }).names;
    },
  });
  const tags = useMemo(() => tagsQuery.data ?? [], [tagsQuery.data]);

  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebounced(input), 200);
    return () => clearTimeout(id);
  }, [input]);

  const suggestQuery = useQuery({
    queryKey: ['tag-suggest', debounced],
    enabled: open,
    queryFn: async () => {
      const res = await api.GET('/api/tags/suggest', { params: { query: { q: debounced } } });
      return (res.data ?? []) as string[];
    },
  });
  const suggestions = (suggestQuery.data ?? []).filter((s) => !tags.includes(s)).slice(0, 8);

  async function save(names: string[]) {
    setErr(null);
    setBusy(true);
    try {
      const res = await api.PUT('/api/tags/{object_type}/{object_id}', {
        params: { path: { object_type: objectType, object_id: objectId } },
        body: { names },
      });
      if (res.error) throw new Error('Lưu tag thất bại');
      await queryClient.invalidateQueries({ queryKey: ['doc-tags', objectType, objectId] });
      await queryClient.invalidateQueries({ queryKey: ['tags'] });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function normalize(s: string): string {
    return s
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function add(raw: string) {
    const name = normalize(raw);
    if (!name) return;
    setInput('');
    setOpen(false);
    if (tags.includes(name)) return; // tags BE đã chuẩn hoá → so trực tiếp
    void save([...tags, name]);
  }

  function remove(name: string) {
    void save(tags.filter((t) => t !== name));
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }} ref={boxRef}>
      <div className="eyebrow flex items-center" style={{ gap: 6, marginBottom: 10 }}>
        <TagIcon size={13} /> Tag
      </div>

      <div className="flex flex-wrap items-center" style={{ gap: 6, marginBottom: 8 }}>
        {tags.map((t) => (
          <span key={t} className="tag-chip">
            #{t}
            <button
              type="button"
              aria-label={`Gỡ tag ${t}`}
              disabled={busy}
              style={{ display: 'inline-flex', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--ink-muted)' }}
              onClick={() => remove(t)}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {tags.length === 0 && <span className="cell-meta">Chưa có tag.</span>}
      </div>

      <div className="relative">
        <input
          className="text-input"
          style={{ height: 34 }}
          placeholder="Thêm tag… (Enter để thêm)"
          value={input}
          disabled={busy}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(input);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
        {open && suggestions.length > 0 && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 35 }} aria-hidden="true" onClick={() => setOpen(false)} />
            <div className="card" style={{ position: 'absolute', top: 38, left: 0, right: 0, zIndex: 36, padding: 4, maxHeight: 200, overflowY: 'auto' }}>
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="nav-item w-full"
                  style={{ borderLeft: 'none', height: 30 }}
                  disabled={busy}
                  onClick={() => add(s)}
                >
                  <span className="tag-chip">#{s}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      {err && <div className="cell-meta" role="alert" style={{ color: 'var(--danger)', marginTop: 6 }}>{err}</div>}
    </div>
  );
}
