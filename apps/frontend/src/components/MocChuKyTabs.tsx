import { Link } from '@tanstack/react-router';

/**
 * Thanh sub-tab cho mục "Mộc & Chữ ký" — gộp Mộc / Chữ ký / Hồ sơ ký thành 1 mục
 * (theo ui-demo: 1 section, 3 tab). 3 route riêng đóng vai 3 tab; underline khớp
 * style tab ở Cấu hình.
 */
const TABS = [
  { to: '/moc', label: 'Mộc' },
  { to: '/chu-ky', label: 'Chữ ký' },
  { to: '/ho-so-ky', label: 'Hồ sơ ký' },
] as const;

export function MocChuKyTabs() {
  return (
    <div className="mt-5 flex gap-1 border-b border-slate-200">
      {TABS.map((t) => (
        <Link
          key={t.to}
          to={t.to}
          className="-mb-px border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700 [&.active]:border-amber-400 [&.active]:text-amber-600"
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
