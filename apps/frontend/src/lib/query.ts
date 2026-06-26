import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Polling 10s cho list (TDD §6 — không SSE/WebSocket).
      // Mỗi component được phép override staleTime/refetchInterval theo nhu cầu.
      staleTime: 5 * 1000,
      gcTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
