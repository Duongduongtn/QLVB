/**
 * Branding query — B3b (CFG.BRD). GET /api/settings công khai (kể cả trang đăng nhập).
 * queryKey ['settings'] dùng chung → đổi branding ở Cấu hình invalidate là header cập nhật ngay.
 */
import { useQuery } from '@tanstack/react-query';

import { api } from './api';

export interface Branding {
  app_name: string;
  logo_file_id: number | null;
}

const FALLBACK: Branding = { app_name: 'QLCV Thành Đạt', logo_file_id: null };

export function useBranding() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data } = await api.GET('/api/settings', {});
      return (data ?? FALLBACK) as Branding;
    },
    staleTime: 5 * 60 * 1000,
  });
}
