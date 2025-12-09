import {
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

export class UpdateBranchDto {
  @IsOptional()
  @IsString({ message: 'Şube adı metin olmalıdır' })
  @MinLength(2, { message: 'Şube adı en az 2 karakter olmalıdır' })
  @MaxLength(100, { message: 'Şube adı en fazla 100 karakter olabilir' })
  @Matches(/^[a-zA-Z0-9 '\-&]+$/, {
    message:
      "Şube adı sadece harf, rakam, boşluk, tire (-), kesme işareti (') ve & karakterlerini içerebilir",
  })
  name?: string;

  @IsOptional()
  @IsString({ message: 'Adres metin olmalıdır' })
  @MinLength(5, { message: 'Adres en az 5 karakter olmalıdır' })
  @MaxLength(300, { message: 'Adres en fazla 300 karakter olabilir' })
  address?: string;
}
