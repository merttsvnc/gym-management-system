import { IsOptional, IsBoolean, IsString } from 'class-validator';
import { Transform, Type } from 'class-transformer';

/**
 * DTO for querying products
 */
export class ProductQueryDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean = true;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  branchId?: string;
}
