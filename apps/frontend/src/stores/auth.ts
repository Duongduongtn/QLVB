/**
 * Auth store — client state (QĐ #10).
 *
 * KHÔNG lưu password/session_id (cookie HttpOnly nắm session).
 * Chỉ giữ snapshot user hiện tại để UI render nhanh, server query luôn là nguồn chân lý.
 */
import { create } from 'zustand';

export type Role = 'manager' | 'staff';

interface AuthState {
  user: { id: number; username: string; full_name: string; role: Role } | null;
  setUser: (user: AuthState['user']) => void;
  clear: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  clear: () => set({ user: null }),
}));
