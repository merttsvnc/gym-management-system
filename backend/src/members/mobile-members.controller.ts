import { Controller, Get, Query, UseGuards, Logger } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MembersService } from './members.service';
import { MemberListQueryDto } from './dto/member-list-query.dto';
import { MemberStatus } from '@prisma/client';

/**
 * Mobile-specific members controller
 * Provides endpoints optimized for mobile app member list drill-downs
 */
@Controller('api/mobile/members')
@UseGuards(JwtAuthGuard, TenantGuard)
export class MobileMembersController {
  private readonly logger = new Logger(MobileMembersController.name);

  constructor(private readonly membersService: MembersService) {}

  /**
   * GET /api/mobile/members
   * Lists members for the current tenant with filters, pagination, and search
   * Supports mobile home page card drill-downs:
   * - Total Members (Tümü) -> no status filter
   * - Active (Aktif) -> status=ACTIVE
   * - Passive (Pasif) -> status=PASSIVE (mapped to INACTIVE + PAUSED)
   * - Expired (Süresi Dolanlar) -> expired=true (membershipEndDate < today)
   * - Expiring Soon (Yakında Bitecek) -> expiringDays=7 (or passed value)
   *
   * Query parameters:
   * - status?: ACTIVE | PASSIVE (PASSIVE is mapped to INACTIVE + PAUSED)
   * - expired?: boolean (true for membershipEndDate < today)
   * - expiringDays?: number (implicitly ACTIVE, membershipEndDate in range)
   * - branchId?: string
   * - search?: string (q parameter also supported for compatibility)
   * - page?: number (default 1)
   * - limit?: number (default 20, max 100)
   */
  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: MemberListQueryDto & { q?: string; status?: string },
  ) {
    // DEBUG: Log received query params (no PII)
    this.logger.debug(
      `Mobile members query: status=${query.status}, expired=${query.expired}, expiringDays=${query.expiringDays}, page=${query.page}, limit=${query.limit}, branchId=${query.branchId}, hasSearch=${!!query.search || !!query.q}`,
    );

    // Map 'q' parameter to 'search' for compatibility
    const searchQuery = query.q || query.search;

    // Handle status mapping
    // Query params come as strings, so we check the string value
    const statusStr = query.status as unknown as string | undefined;
    let status = query.status;
    let isPassiveFilter = false;

    if (statusStr && statusStr.toUpperCase() === 'PASSIVE') {
      // PASSIVE should include both INACTIVE and PAUSED members
      isPassiveFilter = true;
      status = undefined; // Don't pass status to service, use isPassiveFilter instead
    }

    // Build query object with mapped values
    // Ensure numeric values are preserved (page and limit should already be numbers from ValidationPipe)
    const memberQuery: MemberListQueryDto & {
      isPassiveFilter?: boolean;
    } = {
      page: query.page,
      limit: query.limit,
      branchId: query.branchId,
      expiringDays: query.expiringDays,
      expired: query.expired,
      includeArchived: query.includeArchived,
      search: searchQuery,
      status: status as MemberStatus | undefined,
      ...(isPassiveFilter && { isPassiveFilter: true }),
    };

    return this.membersService.findAll(tenantId, memberQuery);
  }
}
