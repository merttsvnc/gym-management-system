import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';
import { StorageService } from '../interfaces/storage-service.interface';

@Injectable()
export class LocalDiskStorageService implements StorageService {
  private readonly logger = new Logger(LocalDiskStorageService.name);
  private readonly uploadDir: string;
  private readonly publicBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    // Use /tmp/uploads for development, or configured path
    this.uploadDir =
      this.configService.get<string>('LOCAL_UPLOAD_DIR') ||
      path.join(process.cwd(), 'tmp', 'uploads');
    this.publicBaseUrl =
      this.configService.get<string>('LOCAL_PUBLIC_BASE_URL') ||
      'http://localhost:3000/uploads';

    // Ensure upload directory exists
    this.ensureUploadDirectory();
  }

  private async ensureUploadDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
      this.logger.log(`Local upload directory ready: ${this.uploadDir}`);
    } catch (error) {
      this.logger.error(`Failed to create upload directory: ${error.message}`);
      throw error;
    }
  }

  async upload(buffer: Buffer, key: string, contentType: string): Promise<string> {
    const filePath = path.join(this.uploadDir, key);

    // Ensure parent directories exist
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    try {
      await fs.writeFile(filePath, buffer);
      this.logger.debug(`File saved locally: ${filePath}`);

      // Return public URL (relative path for local dev)
      const publicUrl = `${this.publicBaseUrl}/${key}`;
      return publicUrl;
    } catch (error) {
      this.logger.error(`Failed to save file ${key}:`, error);
      throw new Error(`Failed to save file: ${error.message}`);
    }
  }
}
