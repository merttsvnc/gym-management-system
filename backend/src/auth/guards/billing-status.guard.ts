import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  BILLING_ERROR_CODES,
  BILLING_ERROR_MESSAGES,
} from '../../common/constants/billing-messages';
import { SKIP_BILLING_STATUS_CHECK_KEY } from '../decorators/skip-billing-status-check.decorator';
import { BillingEntitlementService } from '../../billing/billing-entitlement.service';
import { JwtPayload } from '../strategies/jwt.strategy';

/**
 * BillingStatusGuard enforces premium (RevenueCat) access for authenticated requests.
 *
 * IMPORTANT: This is a GLOBAL guard (APP_GUARD) that runs BEFORE controller-level guards
 * Execution order: BillingStatusGuard → JwtAuthGuard → TenantGuard → RolesGuard
 *
 * Global guards run before controller-level JwtAuthGuard. This guard verifies the same
 * JWT access token when `req.user` is not yet populated so premium and suspension rules
 * apply to authenticated traffic. Invalid tokens are left for JwtAuthGuard to reject.
 *
 * Access rules (applied only when user is authenticated):
 * Uses BillingEntitlementService.getPremiumAccessForTenant (RevenueCat entitlement snapshot;
 * optional legacy tenant billing fallback when BILLING_LEGACY_FALLBACK_ENABLED=true).
 *
 * - hasPremiumAccess: full access (all methods allowed).
 * - Otherwise: read-only for GET, HEAD, OPTIONS.
 * - Mutations when not premium: 402 PAYMENT_REQUIRED with BILLING_ERROR_CODES.PREMIUM_REQUIRED if the
 *   entitlement source is `none`; otherwise 403 FORBIDDEN with TENANT_BILLING_LOCKED and
 *   PREMIUM_MUTATIONS_LOCKED (inactive RevenueCat entitlement, legacy fallback without access, etc.).
 *
 * PAST_DUE vs RevenueCat: BillingEntitlementService is authoritative. When a RevenueCat entitlement
 * snapshot exists for the premium id, access follows that snapshot (and SUSPENDED only). Tenant
 * billingStatus PAST_DUE does not override an active RevenueCat entitlement. With legacy fallback only
 * (no snapshot), PAST_DUE does not grant access (same as pre-RevenueCat read-only semantics for manual billing).
 *
 * Performance: bounded by entitlement + tenant reads; warn threshold logged above 10ms.
 */
@Injectable()
export class BillingStatusGuard implements CanActivate {
  private readonly logger = new Logger(BillingStatusGuard.name);
  private readonly EXECUTION_TIME_WARN_THRESHOLD_MS = 10;

  constructor(
    private readonly billingEntitlementService: BillingEntitlementService,
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
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
      user?: JwtPayload;
      method: string;
      url: string;
      headers: { authorization?: string };
    }>();
    this.attachUserFromAccessTokenIfNeeded(request);
    const user = request.user;

    // Skip billing check if user is not authenticated
    if (!user || !user.tenantId) {
      return true;
    }

    const tenantId: string = user.tenantId;
    const method: string = request.method;

    try {
      const premiumStatus =
        await this.billingEntitlementService.getPremiumAccessForTenant(tenantId);

      if (premiumStatus.tenantSuspended) {
        throw new HttpException(
          {
            code: BILLING_ERROR_CODES.TENANT_BILLING_LOCKED,
            message: BILLING_ERROR_MESSAGES.SUSPENDED_ACCESS,
          },
          HttpStatus.FORBIDDEN,
        );
      }

      if (premiumStatus.hasPremiumAccess) {
        const executionTime = Date.now() - startTime;
        if (executionTime > this.EXECUTION_TIME_WARN_THRESHOLD_MS) {
          this.logger.warn(
            `Billing guard execution exceeded threshold: ${executionTime}ms, tenantId: ${tenantId}`,
          );
        }
        return true;
      }

      const isReadOperation = ['GET', 'HEAD', 'OPTIONS'].includes(method);
      if (isReadOperation) {
        return true;
      }

      if (premiumStatus.source === 'none') {
        throw new HttpException(
          {
            code: BILLING_ERROR_CODES.PREMIUM_REQUIRED,
            message: BILLING_ERROR_MESSAGES.PREMIUM_REQUIRED,
            source: premiumStatus.source,
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }

      throw new HttpException(
        {
          code: BILLING_ERROR_CODES.TENANT_BILLING_LOCKED,
          message: BILLING_ERROR_MESSAGES.PREMIUM_MUTATIONS_LOCKED,
          source: premiumStatus.source,
        },
        HttpStatus.FORBIDDEN,
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      const executionTime = Date.now() - startTime;
      if (executionTime > this.EXECUTION_TIME_WARN_THRESHOLD_MS) {
        this.logger.warn(
          `Billing guard execution exceeded threshold: ${executionTime}ms, tenantId: ${tenantId}`,
        );
      }
      this.logger.error(
        `Unexpected error in billing guard: ${error instanceof Error ? error.message : String(error)}, tenantId: ${tenantId}, executionTime: ${executionTime}ms`,
      );
      throw new HttpException('Access denied', HttpStatus.FORBIDDEN);
    }
  }

  private attachUserFromAccessTokenIfNeeded(request: {
    user?: JwtPayload;
    headers: { authorization?: string };
  }): void {
    if (request.user?.tenantId) {
      return;
    }
    const raw = request.headers?.authorization;
    if (!raw || typeof raw !== 'string') {
      return;
    }
    const token = raw.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return;
    }
    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      if (payload?.sub && payload?.tenantId) {
        request.user = payload;
      }
    } catch {
      // Invalid or expired token: defer to JwtAuthGuard.
    }
  }
}
