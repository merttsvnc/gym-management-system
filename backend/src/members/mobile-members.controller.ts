import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
  constructor(private readonly membersService: MembersService) {}

  /**
   * GET /api/mobile/members
   * Lists members for the current tenant with filters, pagination, and search
   * Supports mobile home page card drill-downs:
   * - Total Members -> no status filter
   * - Active -> status=ACTIVE
   * - Passive -> status=INACTIVE (mapped from PASSIVE)
   * - Expiring Soon -> expiringDays=7 (or passed value)
   *
   * Query parameters:
   * - status?: ACTIVE | INACTIVE (PASSIVE is mapped to INACTIVE)
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
    // Map 'q' parameter to 'search' for compatibility
    const searchQuery = query.q || query.search;

    // Map PASSIVE status to INACTIVE (for mobile compatibility)
    // Query params come as strings, so we check the string value
    let status = query.status;
    const statusStr = query.status as unknown as string | undefined;
    if (statusStr && statusStr.toUpperCase() === 'PASSIVE') {
      status = MemberStatus.INACTIVE;
    }

    // Build query object with mapped values
    // Ensure numeric values are preserved (page and limit should already be numbers from ValidationPipe)
    const memberQuery: MemberListQueryDto = {
      page: query.page,
      limit: query.limit,
      branchId: query.branchId,
      expiringDays: query.expiringDays,
      includeArchived: query.includeArchived,
      search: searchQuery,
      status: status as MemberStatus | undefined,
    };

    return this.membersService.findAll(tenantId, memberQuery);
  }
}
