import { QueryClient } from "@tanstack/react-query";
import { reactQueryBillingErrorHandler } from "./api-error-handler";

/**
 * Configured React Query client with sensible defaults
 * Includes global error handler for billing status errors
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30 seconds
      refetchOnWindowFocus: false,
      retry: 1,
      // Global error handler for queries
      onError: (error) => {
        // Handle billing status errors (403 with TENANT_BILLING_LOCKED code)
        reactQueryBillingErrorHandler(error);
        // Other errors are handled by individual query onError callbacks or axios interceptor
      },
    },
    mutations: {
      // Global error handler for mutations
      onError: (error) => {
        // Handle billing status errors (403 with TENANT_BILLING_LOCKED code)
        // This intercepts mutation errors (POST/PATCH/DELETE) for billing restrictions
        reactQueryBillingErrorHandler(error);
        // Other errors are handled by individual mutation onError callbacks or axios interceptor
      },
    },
  },
});





