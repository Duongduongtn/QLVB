import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <h2 className="text-2xl font-semibold mb-2">Trang chủ</h2>
      <p className="text-slate-600">
        Hệ thống Quản lý Công văn — đang khởi tạo cấu trúc, các tính năng triển khai
        theo PRD/TDD trong <code>docs/</code>.
      </p>
    </div>
  );
}
