import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPayments,
  getPaymentById,
  getMemberPayments,
  createPayment,
  correctPayment,
} from '@/api/payments';
import type {
  Payment,
  PaymentListQuery,
  PaymentListResponse,
  CreatePaymentRequest,
  CorrectPaymentRequest,
  CorrectPaymentResponse,
} from '@/types/payment';
import type { ApiError } from '@/types/error';
import { toast } from 'sonner';

/**
 * Creates a stable string representation of a query object for use in query keys.
 * Sorts keys before stringifying to ensure deterministic output.
 */
function stableKey(queryObj?: Record<string, unknown>): string {
  if (!queryObj || Object.keys(queryObj).length === 0) {
    return '';
  }
  const sorted = Object.keys(queryObj)
    .sort()
    .reduce((acc, key) => {
      const value = queryObj[key];
      if (value !== undefined && value !== null) {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, unknown>);
  return JSON.stringify(sorted);
}

/**
 * Query keys for payment-related queries
 * Uses stable string representations for query objects to prevent cache misses
 */
const paymentKeys = {
  list: (tenantId: string, query?: Partial<PaymentListQuery>) =>
    ['payments', tenantId, 'list', stableKey(query)] as const,
  detail: (tenantId: string, paymentId: string) =>
    ['payments', tenantId, 'detail', paymentId] as const,
  memberPayments: (
    tenantId: string,
    memberId: string,
    query?: {
      startDate?: string;
      endDate?: string;
      page?: number;
      limit?: number;
    },
  ) =>
    ['payments', tenantId, 'member', memberId, stableKey(query)] as const,
};

/**
 * Hook to fetch payments for a tenant with filters
 * Automatically disabled if tenantId is not provided
 */
export function usePayments(
  tenantId: string,
  query?: Partial<PaymentListQuery>,
) {
  return useQuery<PaymentListResponse, ApiError>({
    queryKey: paymentKeys.list(tenantId, query),
    queryFn: () => getPayments({ tenantId, ...query }),
    enabled: !!tenantId,
  });
}

/**
 * Hook to fetch a single payment by ID
 * Automatically disabled if tenantId or paymentId is not provided
 */
export function usePayment(tenantId: string, paymentId: string) {
  return useQuery<Payment, ApiError>({
    queryKey: paymentKeys.detail(tenantId, paymentId),
    queryFn: () => getPaymentById(paymentId, tenantId),
    enabled: !!tenantId && !!paymentId,
  });
}

/**
 * Hook to fetch all payments for a specific member (payment history)
 * Automatically disabled if tenantId or memberId is not provided
 */
export function useMemberPayments(
  tenantId: string,
  memberId: string,
  query?: {
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  },
) {
  return useQuery<PaymentListResponse, ApiError>({
    queryKey: paymentKeys.memberPayments(tenantId, memberId, query),
    queryFn: () => getMemberPayments(memberId, tenantId, query),
    enabled: !!tenantId && !!memberId,
  });
}

/**
 * Hook to create a new payment
 * Invalidates payment list and member payment queries on success
 * Includes optimistic update for better UX with proper snapshot/rollback
 */
export function useCreatePayment(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation<Payment, ApiError, CreatePaymentRequest>({
    mutationFn: (payload) => createPayment(payload, tenantId),
    onMutate: async (newPayment) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({
        queryKey: ['payments', tenantId],
      });

      // Snapshot previous values for rollback
      const previousPaymentsList = queryClient.getQueryData<PaymentListResponse>(
        paymentKeys.list(tenantId),
      );

      let previousMemberPayments: PaymentListResponse | undefined;
      const tempId = `temp-${Date.now()}`;

      // Snapshot and optimistically update member payments if memberId exists
      if (newPayment.memberId) {
        previousMemberPayments =
          queryClient.getQueryData<PaymentListResponse>(
            paymentKeys.memberPayments(tenantId, newPayment.memberId),
          );

        if (previousMemberPayments) {
          // Create optimistic payment object
          const optimisticPayment: Payment = {
            id: tempId,
            tenantId,
            branchId: '', // Will be set by backend
            memberId: newPayment.memberId,
            amount: newPayment.amount.toString(),
            paidOn: newPayment.paidOn,
            paymentMethod: newPayment.paymentMethod,
            note: newPayment.note || null,
            isCorrection: false,
            correctedPaymentId: null,
            isCorrected: false,
            version: 0,
            createdBy: '', // Will be set by backend
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          // Optimistically add to member payments list
          queryClient.setQueryData<PaymentListResponse>(
            paymentKeys.memberPayments(tenantId, newPayment.memberId),
            {
              ...previousMemberPayments,
              data: [optimisticPayment, ...previousMemberPayments.data],
              pagination: {
                ...previousMemberPayments.pagination,
                total: previousMemberPayments.pagination.total + 1,
              },
            },
          );
        }
      }

      return {
        previousPaymentsList,
        previousMemberPayments,
        memberId: newPayment.memberId,
        tempId,
      };
    },
    onSuccess: (data, variables, context) => {
      // Remove/replace the temp optimistic entry to prevent duplicates
      if (context?.memberId && context.tempId) {
        const memberPaymentsKey = paymentKeys.memberPayments(
          tenantId,
          context.memberId,
        );
        const currentMemberPayments =
          queryClient.getQueryData<PaymentListResponse>(memberPaymentsKey);

        if (currentMemberPayments) {
          // Remove temp payment and prepend real payment
          const filteredData = currentMemberPayments.data.filter(
            (p) => p.id !== context.tempId,
          );
          queryClient.setQueryData<PaymentListResponse>(memberPaymentsKey, {
            ...currentMemberPayments,
            data: [data, ...filteredData],
          });
        }
      }

      // Invalidate targeted query prefixes for correctness
      queryClient.invalidateQueries({
        queryKey: ['payments', tenantId, 'list'],
      });

      if (data.memberId) {
        queryClient.invalidateQueries({
          queryKey: ['payments', tenantId, 'member', data.memberId],
        });
      }

      toast.success('Ödeme başarıyla kaydedildi');
    },
    onError: (error, variables, context) => {
      // Rollback optimistic updates on error
      if (context?.previousPaymentsList) {
        queryClient.setQueryData(
          paymentKeys.list(tenantId),
          context.previousPaymentsList,
        );
      }

      if (context?.previousMemberPayments && context.memberId) {
        queryClient.setQueryData(
          paymentKeys.memberPayments(tenantId, context.memberId),
          context.previousMemberPayments,
        );
      }

      const apiError = error as ApiError;
      // Handle specific error codes
      if (apiError.statusCode === 400) {
        // Validation error - message already shown by global handler or API client
      } else if (apiError.statusCode === 403) {
        toast.error('Bu üye farklı bir kiracıya ait');
      } else if (apiError.statusCode === 429) {
        toast.error(
          'Çok fazla istek gönderildi. Lütfen birkaç dakika sonra tekrar deneyin.',
        );
      }
      return error;
    },
  });
}

/**
 * Hook to correct an existing payment
 * Invalidates payment list, detail, and member payment queries on success
 * Handles 409 Conflict with targeted refresh of relevant queries
 */
export function useCorrectPayment(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    CorrectPaymentResponse,
    ApiError,
    { paymentId: string; payload: CorrectPaymentRequest }
  >({
    mutationFn: ({ paymentId, payload }) =>
      correctPayment(paymentId, payload, tenantId),
    onSuccess: (data, variables) => {
      // Extract payment from CorrectPaymentResponse (data is Payment & { warning?: string })
      // Store only the Payment part in detail cache
      const { warning, ...payment } = data;

      // The backend returns the NEW corrected payment (different ID from original)
      // Update detail cache for the new corrected payment
      queryClient.setQueryData<Payment>(
        paymentKeys.detail(tenantId, payment.id),
        payment,
      );

      // Invalidate the original payment's detail query (it was updated to mark as corrected)
      queryClient.invalidateQueries({
        queryKey: paymentKeys.detail(tenantId, variables.paymentId),
      });

      // Invalidate targeted query prefixes
      queryClient.invalidateQueries({
        queryKey: ['payments', tenantId, 'list'],
      });

      if (payment.memberId) {
        queryClient.invalidateQueries({
          queryKey: ['payments', tenantId, 'member', payment.memberId],
        });
      }

      // Show warning if present
      if (warning) {
        toast.warning(warning);
      } else {
        toast.success('Ödeme başarıyla düzeltildi');
      }
    },
    onError: (error, variables) => {
      const apiError = error as ApiError;
      // Handle specific error codes
      if (apiError.statusCode === 400) {
        // Check if it's the single-correction rule violation
        const message = apiError.message || '';
        if (
          message.includes('zaten düzeltilmiş') ||
          message.includes('already corrected')
        ) {
          toast.error(
            'Bu ödeme zaten düzeltilmiş. Bir ödeme yalnızca bir kez düzeltilebilir.',
          );
        }
        // Other validation errors - message already shown by global handler
      } else if (apiError.statusCode === 403) {
        toast.error('Bu ödeme farklı bir kiracıya ait');
      } else if (apiError.statusCode === 404) {
        toast.error('Ödeme bulunamadı');
      } else if (apiError.statusCode === 409) {
        // Version conflict - trigger targeted refetch of relevant queries
        toast.error(
          'Ödeme başka bir kullanıcı tarafından güncellenmiş. Veriler yenileniyor...',
        );
        // Invalidate detail query for this specific payment
        queryClient.invalidateQueries({
          queryKey: paymentKeys.detail(tenantId, variables.paymentId),
        });
        // Invalidate member payments if we can determine memberId from cache
        const currentPayment = queryClient.getQueryData<Payment>(
          paymentKeys.detail(tenantId, variables.paymentId),
        );
        if (currentPayment?.memberId) {
          queryClient.invalidateQueries({
            queryKey: ['payments', tenantId, 'member', currentPayment.memberId],
          });
        } else {
          // If memberId unknown, invalidate all member payment queries for this tenant
          queryClient.invalidateQueries({
            queryKey: ['payments', tenantId, 'member'],
          });
        }
        // Also invalidate list queries
        queryClient.invalidateQueries({
          queryKey: ['payments', tenantId, 'list'],
        });
      } else if (apiError.statusCode === 429) {
        toast.error(
          'Çok fazla istek gönderildi. Lütfen birkaç dakika sonra tekrar deneyin.',
        );
      }
      return error;
    },
  });
}

