import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  IsDateString,
  IsUrl,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { MemberGender } from '@prisma/client';

export class CreateMemberDto {
  @IsString({ message: 'Şube ID gereklidir' })
  branchId: string;

  @IsString({ message: 'Ad gereklidir' })
  @MinLength(1, { message: 'Ad en az 1 karakter olmalıdır' })
  @MaxLength(50, { message: 'Ad en fazla 50 karakter olabilir' })
  firstName: string;

  @IsString({ message: 'Soyad gereklidir' })
  @MinLength(1, { message: 'Soyad en az 1 karakter olmalıdır' })
  @MaxLength(50, { message: 'Soyad en fazla 50 karakter olabilir' })
  lastName: string;

  @IsString({ message: 'Telefon numarası gereklidir' })
  @MinLength(10, { message: 'Telefon numarası en az 10 karakter olmalıdır' })
  @MaxLength(20, { message: 'Telefon numarası en fazla 20 karakter olabilir' })
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Geçerli bir telefon numarası formatı giriniz (uluslararası format desteklenir)',
  })
  phone: string;

  @IsOptional()
  @IsEnum(MemberGender, {
    message: 'Cinsiyet MALE veya FEMALE olmalıdır',
  })
  gender?: MemberGender;

  @IsOptional()
  @IsDateString({}, { message: 'Geçerli bir doğum tarihi formatı giriniz (ISO 8601)' })
  dateOfBirth?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi giriniz' })
  email?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Geçerli bir URL giriniz' })
  photoUrl?: string;

  @IsOptional()
  @IsString({ message: 'Üyelik tipi metin olmalıdır' })
  @MinLength(1, { message: 'Üyelik tipi en az 1 karakter olmalıdır' })
  @MaxLength(50, { message: 'Üyelik tipi en fazla 50 karakter olabilir' })
  membershipType?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Geçerli bir üyelik başlangıç tarihi formatı giriniz (ISO 8601)' })
  membershipStartAt?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Geçerli bir üyelik bitiş tarihi formatı giriniz (ISO 8601)' })
  membershipEndAt?: string;

  @IsOptional()
  @IsString({ message: 'Notlar metin olmalıdır' })
  @MaxLength(5000, { message: 'Notlar en fazla 5000 karakter olabilir' })
  notes?: string;
}

