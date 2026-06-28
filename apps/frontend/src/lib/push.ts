/**
 * Web Push (L1 PWA) — đăng ký/huỷ kênh đẩy thông báo trên thiết bị hiện tại.
 *
 * iOS Safari < 16.4 (và trình duyệt không hỗ trợ) → `pushSupported()` = false → UI ẩn nút,
 * dùng chuông in-app làm fallback. Nội dung thông báo do server gửi (việc mới / nhắc hạn).
 */

export type PushState = 'subscribed' | 'unsubscribed' | 'denied' | 'unsupported';

/** Trình duyệt có đủ API Web Push không (SW + PushManager + Notification). */
export function pushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Base64url (khoá công khai VAPID) → Uint8Array cho applicationServerKey. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/** Trạng thái push của thiết bị hiện tại. */
export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'subscribed' : 'unsubscribed';
}

async function vapidPublicKey(): Promise<string | null> {
  const res = await fetch('/api/push/vapid-public-key', { credentials: 'same-origin' });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { public_key?: string | null } | null;
  return body?.public_key ?? null;
}

/**
 * Bật thông báo đẩy: xin quyền → subscribe → gửi subscription lên server.
 * Trả `{ ok }`; `reason` để hiển thị khi thất bại (từ chối quyền / chưa cấu hình server).
 */
export async function enablePush(): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: false, reason: 'Thiết bị không hỗ trợ thông báo đẩy.' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, reason: 'Bạn đã từ chối quyền thông báo. Bật lại trong cài đặt trình duyệt.' };
  }

  const key = await vapidPublicKey();
  if (!key) return { ok: false, reason: 'Máy chủ chưa bật thông báo đẩy.' };

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
  }

  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) return { ok: false, reason: 'Lưu đăng ký thất bại, thử lại sau.' };
  return { ok: true };
}

/** Tắt thông báo đẩy trên thiết bị này (huỷ subscription + báo server xoá). */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => undefined);
  await fetch('/api/push/unsubscribe', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  }).catch(() => undefined);
}
