import { useQuery } from '@tanstack/react-query';
import { getRevenueReport } from '@/api/payments';
import type {
  RevenueReportQuery,
  RevenueReportResponse,
} from '@/types/payment';
import type { ApiError } from '@/types/error';

/**
 * Query keys for revenue-related queries
 */
const revenueKeys = {
  report: (tenantId: string, query: RevenueReportQuery) =>
    ['revenue', tenantId, query] as const,
};

/**
 * Hook to fetch revenue report with aggregation
 * Automatically disabled if tenantId is not provided or required query params are missing
 */
export function useRevenueReport(
  tenantId: string,
  query: RevenueReportQuery,
) {
  return useQuery<RevenueReportResponse, ApiError>({
    queryKey: revenueKeys.report(tenantId, query),
    queryFn: () => getRevenueReport({ tenantId, ...query }),
    enabled: !!tenantId && !!query.startDate && !!query.endDate,
  });
}

