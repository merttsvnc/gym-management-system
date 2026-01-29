import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Body,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Inject } from '@nestjs/common';
import { StorageService } from '../storage/interfaces/storage-service.interface';
import { UploadMemberPhotoDto } from './dto/upload-member-photo.dto';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

// Allowed MIME types for images
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB in bytes

@Controller('api/v1/uploads')
@UseGuards(JwtAuthGuard, TenantGuard)
export class UploadsController {
  constructor(
    @Inject('StorageService')
    private readonly storageService: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * POST /api/v1/uploads/member-photo
   * Uploads a member photo to R2 storage
   *
   * @param file - Multipart file upload (field name: "file")
   * @param body - Optional memberId to associate photo with
   * @param tenantId - Extracted from JWT token
   * @returns Public URL of uploaded photo
   */
  @Post('member-photo')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async uploadMemberPhoto(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadMemberPhotoDto,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    // Validate file is present
    if (!file) {
      throw new BadRequestException('File is required. Use field name "file".');
    }

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      );
    }

    // Determine memberId
    // Decision: Allow optional memberId for flexibility
    // - If provided: validate member exists and belongs to tenant
    // - If not provided: generate temporary UUID (mobile can upload before member creation)
    let memberId = body.memberId;

    if (memberId) {
      // Validate member exists and belongs to tenant
      const member = await this.prisma.member.findUnique({
        where: { id: memberId },
        select: { id: true, tenantId: true },
      });

      if (!member) {
        throw new BadRequestException('Member not found');
      }

      if (member.tenantId !== tenantId) {
        throw new BadRequestException('Member does not belong to your tenant');
      }
    } else {
      // Generate temporary UUID for upload before member creation
      memberId = `temp-${randomUUID()}`;
    }

    // Generate object key: tenants/{tenantId}/members/{memberId}/{uuid}.jpg
    const fileExtension = this.getFileExtension(file.mimetype);
    const objectKey = `tenants/${tenantId}/members/${memberId}/${randomUUID()}.${fileExtension}`;

    // Upload to storage
    const publicUrl = await this.storageService.upload(
      file.buffer,
      objectKey,
      file.mimetype,
    );

    return {
      url: publicUrl,
    };
  }

  /**
   * Get file extension from MIME type
   */
  private getFileExtension(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    return mimeToExt[mimeType] || 'jpg';
  }
}
