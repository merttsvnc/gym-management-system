import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key for skipping billing status check
 */
export const SKIP_BILLING_STATUS_CHECK_KEY = 'skipBillingStatusCheck';

/**
 * Decorator to skip billing status check for a route
 *
 * Use this decorator on routes that should bypass billing status restrictions,
 * such as authentication endpoints (login, register, refresh token).
 *
 * Example:
 * @SkipBillingStatusCheck()
 * @Post('login')
 * async login() { ... }
 */
export const SkipBillingStatusCheck = () =>
  SetMetadata(SKIP_BILLING_STATUS_CHECK_KEY, true);

