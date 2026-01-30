import { IsString, IsNotEmpty } from 'class-validator';

export class SchedulePlanChangeDto {
  @IsString({ message: 'Üyelik planı ID metin olmalıdır' })
  @IsNotEmpty({ message: 'Üyelik planı ID gereklidir' })
  membershipPlanId: string;
}
