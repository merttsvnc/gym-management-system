import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MembersService } from './members.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { MemberListQueryDto } from './dto/member-list-query.dto';
import { ChangeMemberStatusDto } from './dto/change-member-status.dto';

@Controller('api/v1/members')
@UseGuards(JwtAuthGuard, TenantGuard)
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  /**
   * GET /api/v1/members
   * Lists members for the current tenant with filters, pagination, and search
   */
  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: MemberListQueryDto,
  ) {
    return this.membersService.findAll(tenantId, query);
  }

  /**
   * GET /api/v1/members/:id
   * Gets a single member by ID
   * Returns 404 if member doesn't belong to tenant
   */
  @Get(':id')
  findOne(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.membersService.findOne(tenantId, id);
  }

  /**
   * POST /api/v1/members
   * Creates a new member for the current tenant
   * Returns 201 Created
   * Enforces phone uniqueness within tenant
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateMemberDto,
  ) {
    return this.membersService.create(tenantId, dto);
  }

  /**
   * PATCH /api/v1/members/:id
   * Updates an existing member
   * Returns 404 if member doesn't belong to tenant
   * Enforces phone uniqueness within tenant (excluding current member)
   */
  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.membersService.update(tenantId, id, dto);
  }

  /**
   * POST /api/v1/members/:id/status
   * Changes member status with transition validation
   * Returns 404 if member doesn't belong to tenant
   * Returns 400 if status transition is invalid
   * Cannot transition from ARCHIVED (terminal status)
   * Cannot set ARCHIVED via this endpoint (use archive endpoint instead)
   */
  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  changeStatus(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: ChangeMemberStatusDto,
  ) {
    return this.membersService.changeStatus(tenantId, id, dto);
  }

  /**
   * POST /api/v1/members/:id/archive
   * Archives a member (sets status to ARCHIVED)
   * Returns 404 if member doesn't belong to tenant
   * Archiving is a terminal action - archived members cannot be reactivated
   */
  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  archive(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.membersService.archive(tenantId, id);
  }
}
