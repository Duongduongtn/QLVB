/**
 * API client type-safe, sinh từ OpenAPI của FastAPI (QĐ #8).
 *
 * Chạy lại schema khi BE đổi:
 *     pnpm gen:api
 * (yêu cầu backend dev đang chạy ở http://localhost:8003)
 *
 * Cookie session HttpOnly được gửi tự động khi `credentials: 'include'`.
 */
import createClient from 'openapi-fetch';

// `paths` sẽ có sau khi chạy `pnpm gen:api`. Trước đó stub `any` để build pass.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type paths = any;

export const api = createClient<paths>({
  baseUrl: '/api',
  credentials: 'include',
});
