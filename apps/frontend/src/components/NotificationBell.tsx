import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';

import { api } from '~/lib/api';
import { fmtDateTime } from '~/lib/format';

interface Notif {
  id: number;
  type: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

/** Chuông thông báo header — polling số chưa đọc + dropdown danh sách (E2/E3). */
export function NotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const countQuery = useQuery({
    queryKey: ['notif', 'count'],
    refetchInterval: 20000, // polling (TDD §12 — không WebSocket)
    queryFn: async () => {
      const res = await api.GET('/api/notifications/unread-count', {});
      return (res.data ?? { count: 0 }) as { count: number };
    },
  });
  const unread = countQuery.data?.count ?? 0;

  const listQuery = useQuery({
    queryKey: ['notif', 'list'],
    enabled: open,
    queryFn: async () => {
      const res = await api.GET('/api/notifications', { params: { query: { size: 20 } } });
      return (res.data ?? { items: [] }) as { items: Notif[] };
    },
  });
  const items = listQuery.data?.items ?? [];

  const markAll = useMutation({
    mutationFn: async () => {
      await api.POST('/api/notifications/read-all', {});
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notif'] }),
  });

  async function openNotif(n: Notif) {
    await api.POST('/api/notifications/{notif_id}/read', { params: { path: { notif_id: n.id } } });
    await queryClient.invalidateQueries({ queryKey: ['notif'] });
    setOpen(false);
    if (n.link) navigate({ to: n.link });
  }

  return (
    <div className="relative">
      <button className="icon-btn" aria-label="Thông báo" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Bell size={20} />
        {unread > 0 && <span className="noti-dot" />}
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 35 }} aria-hidden="true" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="card"
            style={{ position: 'absolute', right: 0, top: 40, width: 340, maxHeight: 420, overflowY: 'auto', zIndex: 36, padding: 0, boxShadow: '0 10px 30px oklch(18% 0.02 95 / 0.16)' }}
          >
            <div className="flex items-center justify-between" style={{ padding: '12px 14px', borderBottom: '1px solid var(--rule)' }}>
              <span style={{ fontWeight: 600, color: 'var(--ink)', fontSize: '0.9rem' }}>Thông báo{unread > 0 ? ` (${unread})` : ''}</span>
              {unread > 0 && (
                <button type="button" className="btn-ghost" style={{ height: 26, fontSize: '0.78rem' }} onClick={() => markAll.mutate()}>
                  Đánh dấu đã đọc
                </button>
              )}
            </div>
            {items.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink-faint)', fontSize: '0.85rem' }}>Không có thông báo</div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  role="menuitem"
                  onClick={() => openNotif(n)}
                  className="flex flex-col"
                  style={{ width: '100%', textAlign: 'left', gap: 2, padding: '10px 14px', borderBottom: '1px solid var(--rule)', background: n.is_read ? 'transparent' : 'var(--kinpaku-pale)', border: 'none', cursor: 'pointer' }}
                >
                  <span style={{ fontSize: '0.85rem', color: 'var(--ink)' }}>{n.message}</span>
                  <span className="cell-meta">{fmtDateTime(n.created_at)}</span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
