// File này được TanStack Router Vite plugin tự sinh khi dev/build.
// Stub tạm cho phép `tsc --noEmit` pass trước khi chạy lần đầu — KHÔNG sửa tay.
// Sau `pnpm dev` hoặc `pnpm build`, plugin sẽ ghi đè file này theo cây src/routes/.

import { createRoute, type AnyRoute } from '@tanstack/react-router';

export const routeTree: AnyRoute = createRoute({
  getParentRoute: () => null as unknown as AnyRoute,
  path: '/',
});
