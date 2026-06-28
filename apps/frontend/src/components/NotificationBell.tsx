import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, BellRing } from 'lucide-react';

import { api } from '~/lib/api';
import { fmtDateTime } from '~/lib/format';
import { disablePush, enablePush, getPushState, type PushState } from '~/lib/push';

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
  const [pushState, setPushState] = useState<PushState>('unsupported');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);

  // Nạp trạng thái push của thiết bị khi mở dropdown (SW đã sẵn sàng).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void getPushState().then((s) => {
      if (alive) setPushState(s);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  async function togglePush() {
    setPushBusy(true);
    setPushMsg(null);
    try {
      if (pushState === 'subscribed') {
        await disablePush();
        setPushState('unsubscribed');
      } else {
        const res = await enablePush();
        if (res.ok) setPushState('subscribed');
        else setPushMsg(res.reason ?? 'Không bật được thông báo.');
      }
    } finally {
      setPushBusy(false);
    }
  }

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
            {/* Web Push (L1) — bật/tắt thông báo đẩy trên thiết bị này. Ẩn khi không hỗ trợ
                (iOS<16.4 / trình duyệt cũ) → dùng chuông in-app làm fallback. */}
            {pushState !== 'unsupported' && (
              <div style={{ padding: '10px 14px', borderTop: '1px solid var(--rule)' }}>
                {pushState === 'denied' ? (
                  <span className="cell-meta" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <BellOff size={14} /> Thông báo bị chặn — bật lại trong cài đặt trình duyệt.
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn-ghost w-full"
                    style={{ justifyContent: 'flex-start', gap: 8, height: 32, fontSize: '0.82rem' }}
                    disabled={pushBusy}
                    onClick={togglePush}
                  >
                    {pushState === 'subscribed' ? <BellRing size={15} /> : <Bell size={15} />}
                    {pushBusy
                      ? 'Đang xử lý…'
                      : pushState === 'subscribed'
                        ? 'Tắt thông báo đẩy thiết bị này'
                        : 'Bật thông báo đẩy thiết bị này'}
                  </button>
                )}
                {pushMsg && (
                  <p className="cell-meta" style={{ color: 'var(--danger)', marginTop: 4 }}>{pushMsg}</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
