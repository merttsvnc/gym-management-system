import { IsString, IsNotEmpty } from 'class-validator';

/**
 * DTO for querying revenue month locks
 */
export class MonthLockQueryDto {
  @IsString()
  @IsNotEmpty({ message: 'branchId query parameter is required' })
  branchId: string;
}
