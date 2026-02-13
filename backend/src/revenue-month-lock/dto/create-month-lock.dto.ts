import { IsString, IsNotEmpty, Matches } from 'class-validator';

/**
 * DTO for creating a new revenue month lock
 */
export class CreateMonthLockDto {
  @IsString()
  @IsNotEmpty({ message: 'Month is required' })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'Month must be in YYYY-MM format (e.g., 2026-02)',
  })
  month: string;
}
