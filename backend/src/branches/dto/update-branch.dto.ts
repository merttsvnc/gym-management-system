import { IsOptional, IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class UpdateBranchDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9 '\-&]+$/, {
    message: 'Only alphanumeric characters, spaces, hyphens, apostrophes, and ampersands allowed',
  })
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  address?: string;
}

