/**
 * Pill dùng chung cho mục Mộc & Chữ ký (theo ui-demo: UnitPill + trạng thái Đang/Ngừng
 * dùng trên đầu mỗi card). Màu đơn vị động theo `unit.color`; còn lại dùng token/pill
 * của design system (KHÔNG màu Tailwind raw).
 */

export interface UnitLite {
  id: number;
  code: string;
  short_name: string | null;
  full_name: string;
  color: string;
}

export function UnitPill({ unit }: { unit?: UnitLite }) {
  if (!unit) {
    return (
      <span
        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
        style={{ background: 'var(--light-graphite)', color: 'var(--ink-faint)' }}
      >
        Chưa gán đơn vị
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${unit.color}1a`, color: unit.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: unit.color }} />
      {unit.short_name ?? unit.code}
    </span>
  );
}

export function StatusPill({ active }: { active: boolean }) {
  return active ? (
    <span className="pill pill-success">
      <span className="dot" />
      Đang dùng
    </span>
  ) : (
    <span className="pill pill-draft">Ngừng dùng</span>
  );
}
