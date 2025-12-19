import { QueryClient } from "@tanstack/react-query";

/**
 * Configured React Query client with sensible defaults
 * Billing status errors are handled by axios interceptor
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30 seconds
      refetchOnWindowFocus: false,
      retry: 1,
      // Billing status errors (403) are handled by axios interceptor
    },
    mutations: {
      // Billing status errors (403) are handled by axios interceptor
    },
  },
});
