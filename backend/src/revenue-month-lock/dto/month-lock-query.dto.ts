import { IsOptional, IsString } from 'class-validator';

/**
 * DTO for querying revenue month locks
 */
export class MonthLockQueryDto {
  @IsOptional()
  @IsString()
  branchId?: string;
}
