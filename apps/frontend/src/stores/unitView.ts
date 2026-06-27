/**
 * Unit view store — B3a (CFG.VEW). Client state (QĐ #10), lưu localStorage.
 *
 * 'all' = xem tất cả (chỉ Quản lý), hoặc id đơn vị cụ thể (GDNN/DVDL). Mọi list nghiệp
 * vụ (CV đi, danh bạ, sổ…) đọc giá trị này để lọc theo đơn vị đang chọn.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UnitView = 'all' | number;

interface UnitViewState {
  view: UnitView;
  setView: (view: UnitView) => void;
}

export const useUnitView = create<UnitViewState>()(
  persist(
    (set) => ({
      view: 'all',
      setView: (view) => set({ view }),
    }),
    { name: 'qlcv_unit_view' },
  ),
);
