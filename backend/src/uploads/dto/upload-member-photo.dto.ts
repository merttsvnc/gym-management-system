import { IsOptional, IsString, IsUUID } from 'class-validator';

export class UploadMemberPhotoDto {
  /**
   * Optional memberId to associate the photo with
   * If not provided, a temporary ID will be generated
   * (Decision: Allow optional memberId for flexibility - mobile can upload before member creation)
   */
  @IsOptional()
  @IsString()
  @IsUUID()
  memberId?: string;
}
