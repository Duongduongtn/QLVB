/**
 * API client type-safe, sinh từ OpenAPI của FastAPI (QĐ #8).
 *
 * `src/api/schema.ts` được .gitignore (file SINH RA) → CI build không cần backend chạy.
 * Vì vậy mặc định `paths = any` (stub). Khi dev muốn type thật:
 *     npm run gen:api          (cần backend dev ở http://localhost:8003)
 *   rồi đổi dòng `type paths = any` thành: import type { paths } from '~/api/schema';
 *
 * Path key trong schema có sẵn prefix `/api` (router FastAPI prefix) → gọi đầy đủ
 * `api.POST('/api/auth/login', ...)`, KHÔNG đặt baseUrl '/api'. Đổi sang type thật
 * không phải sửa lại chỗ gọi.
 * Cookie session HttpOnly tự gửi nhờ `credentials: 'include'`.
 */
import createClient from 'openapi-fetch';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type paths = any;

export const api = createClient<paths>({
  credentials: 'include',
});

/** Error envelope chuẩn của backend (xem app/core/errors.py): { error: { code, message } }. */
export type ApiErrorEnvelope = { error: { code: string; message: string } };
