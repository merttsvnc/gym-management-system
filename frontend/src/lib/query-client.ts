import { QueryClient } from "@tanstack/react-query";

/**
 * Configured React Query client with sensible defaults
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30 seconds
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

