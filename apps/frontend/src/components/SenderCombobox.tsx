import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '~/lib/api';

export interface OrgLite {
  id: number;
  full_name: string;
  short_name: string | null;
}

/**
 * M2 — chọn cơ quan gửi: gõ để tìm trong danh bạ (is_sender) HOẶC giữ tên tự do nếu cơ quan
 * chưa có trong danh bạ (auto-fill từ chữ ký số / OCR). orgId = khớp danh bạ; orgName = tên text.
 * Dùng chung: màn "Thêm công văn đến" + drawer sửa chi tiết.
 */
export function SenderCombobox({
  orgId,
  orgName,
  onChange,
  orgs,
  hint = null,
}: {
  orgId: number | null;
  orgName: string | null;
  onChange: (id: number | null, name: string | null) => void;
  orgs: OrgLite[];
  hint?: string | null;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  const search = useQuery({
    queryKey: ['org-search', 'sender', debounced],
    enabled: open,
    queryFn: async () => {
      const res = await api.GET('/api/organizations', {
        params: { query: { role: 'sender', q: debounced || undefined, size: 12 } },
      });
      return (res.data?.items ?? []) as OrgLite[];
    },
  });
  const results = search.data ?? [];

  const queryClient = useQueryClient();
  // M2 — gợi ý cơ quan tên GẦN GIỐNG (fuzzy) để chọn đúng cơ quan đã có, tránh tạo trùng.
  const similar = useQuery({
    queryKey: ['org-similar', 'sender', debounced],
    enabled: open && debounced.length >= 2,
    queryFn: async () => {
      const { data } = await api.GET('/api/organizations/similar', {
        params: { query: { role: 'sender', name: debounced, limit: 5 } },
      });
      return (data ?? []) as { id: number; full_name: string; short_name: string | null; similarity: number; doc_count: number }[];
    },
  });
  const resultIds = new Set(results.map((o) => o.id));
  const fuzzy = (similar.data ?? []).filter((o) => !resultIds.has(o.id)); // không lặp kết quả tìm thường

  // M2 — auto-tạo cơ quan vào danh bạ ngay khi vào sổ (cơ quan chưa có trong danh bạ).
  const createMut = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await api.POST('/api/organizations', {
        body: { full_name: name, role: 'sender' },
      });
      if (error || !data) throw new Error('Tạo cơ quan thất bại');
      return data as OrgLite;
    },
    onSuccess: async (o) => {
      await queryClient.invalidateQueries({ queryKey: ['organizations'] });
      onChange(o.id, o.short_name ?? o.full_name);
      setOpen(false);
      setText('');
    },
  });

  const selected = orgs.find((o) => o.id === orgId) ?? null;
  // Nhãn hiển thị: ưu tiên org khớp danh bạ, sau đó tên free-text.
  const label = selected ? (selected.short_name ?? selected.full_name) : (orgName ?? '');
  const typed = text.trim();
  const hasValue = orgId !== null || !!orgName;

  return (
    <div className="relative">
      <div className="flex items-center" style={{ gap: 6 }}>
        <input
          className="text-input"
          role="combobox"
          aria-expanded={open}
          aria-label="Cơ quan phát hành"
          placeholder="Gõ tên cơ quan gửi (tìm danh bạ hoặc nhập tự do)…"
          value={open ? text : label}
          onFocus={() => { setOpen(true); setText(''); }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setOpen(false); (e.target as HTMLInputElement).blur(); }
            if (e.key === 'Enter' && typed) { onChange(null, typed); setOpen(false); setText(''); (e.target as HTMLInputElement).blur(); }
          }}
        />
        {hasValue && (
          <button type="button" className="btn-ghost" style={{ height: 32, flexShrink: 0 }} aria-label="Bỏ chọn cơ quan" onClick={() => onChange(null, null)}>
            Bỏ chọn
          </button>
        )}
      </div>
      {/* Cơ quan ngoài danh bạ → hiển thị rõ là tên tự do (chưa liên kết danh bạ). */}
      {!open && orgId === null && orgName && (
        <div className="cell-meta" style={{ marginTop: 4 }}>Tên tự do (chưa có trong danh bạ).</div>
      )}
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 35 }} aria-hidden="true" onClick={() => setOpen(false)} />
          <div role="listbox" className="card" style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, maxHeight: 260, overflowY: 'auto', zIndex: 36, padding: 6, boxShadow: '0 10px 30px oklch(18% 0.02 95 / 0.16)' }}>
            {typed && (
              <button
                type="button"
                className="nav-item w-full"
                style={{ borderLeft: 'none', textAlign: 'left' }}
                onClick={() => { onChange(null, typed); setOpen(false); setText(''); }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', color: 'var(--ink)', fontSize: '0.85rem' }}>Dùng “{typed}”</span>
                  <span className="cell-meta" style={{ display: 'block' }}>Tên tự do — cơ quan chưa có trong danh bạ</span>
                </span>
              </button>
            )}
            {typed && (
              <button
                type="button"
                className="nav-item w-full"
                style={{ borderLeft: 'none', textAlign: 'left' }}
                disabled={createMut.isPending}
                onClick={() => createMut.mutate(typed)}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', color: 'var(--kinpaku-deep)', fontSize: '0.85rem' }}>
                    {createMut.isPending ? 'Đang thêm…' : `➕ Thêm “${typed}” vào danh bạ`}
                  </span>
                  <span className="cell-meta" style={{ display: 'block' }}>Lưu cơ quan gửi mới để lần sau chọn nhanh</span>
                </span>
              </button>
            )}
            {/* Gợi ý gần giống (fuzzy) — tránh tạo trùng cơ quan đã có với tên hơi khác. */}
            {fuzzy.length > 0 && (
              <>
                <div className="cell-meta" style={{ padding: '6px 10px 2px' }}>Có thể bạn muốn:</div>
                {fuzzy.map((o) => (
                  <button
                    key={`sim-${o.id}`}
                    type="button"
                    className="nav-item w-full"
                    style={{ borderLeft: 'none', textAlign: 'left' }}
                    onClick={() => { onChange(o.id, o.short_name ?? o.full_name); setOpen(false); setText(''); }}
                  >
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', color: 'var(--ink)', fontSize: '0.85rem' }}>{o.short_name ?? o.full_name}</span>
                      <span className="cell-meta" style={{ display: 'block' }}>giống {Math.round(o.similarity * 100)}% · {o.doc_count} CV</span>
                    </span>
                  </button>
                ))}
              </>
            )}
            {search.isFetching && results.length === 0 ? (
              <div className="cell-meta" style={{ padding: '8px 10px' }}>Đang tìm…</div>
            ) : results.length === 0 ? (
              <div className="cell-meta" style={{ padding: '8px 10px' }}>Không có cơ quan khớp trong danh bạ — gõ để dùng tên tự do.</div>
            ) : (
              results.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="option"
                  aria-selected={o.id === orgId}
                  className="nav-item w-full"
                  style={{ borderLeft: 'none', textAlign: 'left' }}
                  onClick={() => { onChange(o.id, o.short_name ?? o.full_name); setOpen(false); setText(''); }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', color: 'var(--ink)', fontSize: '0.85rem' }}>{o.short_name ?? o.full_name}</span>
                    {o.short_name && <span className="cell-meta" style={{ display: 'block' }}>{o.full_name}</span>}
                  </span>
                </button>
              ))
            )}
          </div>
        </>
      )}
      {hint && orgId === null && !orgName && (
        <div className="flex items-center cell-meta" style={{ gap: 6, marginTop: 4 }}>
          <span>OCR gợi ý: {hint}</span>
          <button type="button" className="btn-ghost" style={{ height: 24, padding: '0 8px' }} onClick={() => onChange(null, hint)}>
            Dùng
          </button>
        </div>
      )}
    </div>
  );
}
