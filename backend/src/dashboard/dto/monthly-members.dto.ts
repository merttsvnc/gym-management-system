import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query DTO for monthly members endpoint
 */
export class MonthlyMembersQueryDto {
  @IsOptional()
  branchId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  months?: number;
}

/**
 * Response DTO for monthly members endpoint
 */
export class MonthlyMembersItemDto {
  month: string; // "YYYY-MM"
  newMembers: number;
}
