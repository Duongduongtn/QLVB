import { Outlet, createRootRoute } from '@tanstack/react-router';

export const Route = createRootRoute({
  component: () => (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-7xl px-6 py-3 flex items-center gap-3">
          <span className="inline-block w-2 h-2 rounded-full bg-teal-700" />
          <h1 className="text-lg font-semibold">QLCV Thành Đạt</h1>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  ),
});
