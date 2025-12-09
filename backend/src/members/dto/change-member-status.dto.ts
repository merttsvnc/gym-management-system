import { IsEnum } from 'class-validator';
import { MemberStatus } from '@prisma/client';

export class ChangeMemberStatusDto {
  @IsEnum(MemberStatus, {
    message: 'Durum ACTIVE, PAUSED, INACTIVE veya ARCHIVED olmalıdır',
  })
  status: MemberStatus;
}

