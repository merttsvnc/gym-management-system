import {
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  BRANCH_NAME_REGEX,
  BRANCH_NAME_ERROR_MESSAGE,
} from '../constants/branch-validation.constants';

export class UpdateBranchDto {
  @IsOptional()
  @IsString({ message: 'Şube adı metin olmalıdır' })
  @MinLength(2, { message: 'Şube adı en az 2 karakter olmalıdır' })
  @MaxLength(100, { message: 'Şube adı en fazla 100 karakter olabilir' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(BRANCH_NAME_REGEX, {
    message: BRANCH_NAME_ERROR_MESSAGE,
  })
  name?: string;

  @IsOptional()
  @IsString({ message: 'Adres metin olmalıdır' })
  @MinLength(5, { message: 'Adres en az 5 karakter olmalıdır' })
  @MaxLength(300, { message: 'Adres en fazla 300 karakter olabilir' })
  address?: string;
}
