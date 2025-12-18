import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingStatus } from '@prisma/client';
import {
  BILLING_ERROR_CODES,
  BILLING_ERROR_MESSAGES,
} from '../../common/constants/billing-messages';
import { SKIP_BILLING_STATUS_CHECK_KEY } from '../decorators/skip-billing-status-check.decorator';

/**
 * BillingStatusGuard enforces billing status-based access restrictions
 *
 * This guard runs after JwtAuthGuard and TenantGuard, ensuring:
 * - User is authenticated (JWT validated)
 * - Tenant context is available (tenantId in request.user)
 *
 * Access rules:
 * - TRIAL/ACTIVE: Full access (all requests allowed)
 * - PAST_DUE: Read-only access (GET allowed, POST/PATCH/DELETE blocked with 403)
 * - SUSPENDED: Full blocking (all requests blocked with 403 and error code TENANT_BILLING_LOCKED)
 *
 * The guard queries the Tenant table to fetch billingStatus for each request.
 * Performance: Uses primary key lookup (tenantId), expected overhead <5ms per request.
 */
@Injectable()
export class BillingStatusGuard implements CanActivate {
  private readonly logger = new Logger(BillingStatusGuard.name);
  private readonly EXECUTION_TIME_WARN_THRESHOLD_MS = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked to skip billing status check
    const skipCheck = this.reflector.getAllAndOverride<boolean>(
      SKIP_BILLING_STATUS_CHECK_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skipCheck) {
      // Skip billing status check for this route (e.g., auth routes)
      return true;
    }

    const startTime = Date.now();
    const request = context.switchToHttp().getRequest<{
      user?: { tenantId?: string };
      method: string;
      url: string;
    }>();
    const user = request.user;

    // Skip billing check if user is not authenticated
    // This allows unauthenticated routes to pass through
    // JwtAuthGuard will handle authentication for protected routes
    if (!user || !user.tenantId) {
      // User not authenticated yet - skip billing check
      // This is expected for routes that don't have JwtAuthGuard
      return true;
    }

    const tenantId: string = user.tenantId;
    const method: string = request.method;
    const path: string = request.url;

    try {
      // Query Tenant table to fetch billingStatus
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { billingStatus: true },
      });

      if (!tenant) {
        // Tenant not found (should not happen in normal flow)
        this.logger.error(
          `Tenant not found for tenantId: ${tenantId}, path: ${path}`,
        );
        throw new ForbiddenException('Tenant not found');
      }

      // Add defensive check for billingStatus field
      if (!tenant.billingStatus) {
        this.logger.error(
          `BillingStatus field is null or undefined for tenantId: ${tenantId}, tenant: ${JSON.stringify(tenant)}`,
        );
        // Default to ACTIVE if billingStatus is missing (should not happen)
        return true;
      }

      const billingStatus: BillingStatus = tenant.billingStatus;

      // Check billing status and enforce access rules
      if (billingStatus === BillingStatus.SUSPENDED) {
        // SUSPENDED: Block all requests with error code
        const executionTime = Date.now() - startTime;
        this.logger.warn(
          `Billing status restriction: SUSPENDED tenant blocked, tenantId: ${tenantId}, method: ${method}, path: ${path}, executionTime: ${executionTime}ms`,
        );

        throw new ForbiddenException({
          code: BILLING_ERROR_CODES.TENANT_BILLING_LOCKED,
          message: BILLING_ERROR_MESSAGES.SUSPENDED_ACCESS,
        });
      }

      if (billingStatus === BillingStatus.PAST_DUE) {
        // PAST_DUE: Allow GET requests, block mutations
        const isReadOperation = ['GET', 'HEAD', 'OPTIONS'].includes(method);

        if (!isReadOperation) {
          // Block mutation operations (POST, PATCH, DELETE, PUT)
          const executionTime = Date.now() - startTime;
          this.logger.warn(
            `Billing status restriction: PAST_DUE tenant mutation blocked, tenantId: ${tenantId}, method: ${method}, path: ${path}, executionTime: ${executionTime}ms`,
          );

          throw new ForbiddenException({
            code: BILLING_ERROR_CODES.TENANT_BILLING_LOCKED,
            message: BILLING_ERROR_MESSAGES.PAST_DUE_MUTATION,
          });
        }

        // Allow read operations
        const executionTime = Date.now() - startTime;
        if (executionTime > this.EXECUTION_TIME_WARN_THRESHOLD_MS) {
          this.logger.warn(
            `BillingStatusGuard execution time exceeded threshold: ${executionTime}ms, tenantId: ${tenantId}, path: ${path}`,
          );
        }

        return true;
      }

      // TRIAL/ACTIVE: Allow all requests
      const executionTime = Date.now() - startTime;
      if (executionTime > this.EXECUTION_TIME_WARN_THRESHOLD_MS) {
        this.logger.warn(
          `BillingStatusGuard execution time exceeded threshold: ${executionTime}ms, tenantId: ${tenantId}, path: ${path}`,
        );
      }

      return true;
    } catch (error) {
      // Re-throw ForbiddenException (already formatted)
      if (error instanceof ForbiddenException) {
        throw error;
      }

      // Log unexpected errors
      const executionTime = Date.now() - startTime;
      this.logger.error(
        `Unexpected error in BillingStatusGuard: ${error instanceof Error ? error.message : String(error)}, tenantId: ${tenantId}, path: ${path}, executionTime: ${executionTime}ms`,
      );

      // Re-throw as ForbiddenException for safety
      throw new ForbiddenException('Access denied');
    }
  }
}
