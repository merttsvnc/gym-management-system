import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import https from 'https';
import { StorageService } from '../interfaces/storage-service.interface';

@Injectable()
export class R2StorageService implements StorageService {
  private readonly logger = new Logger(R2StorageService.name);
  private readonly s3Client: S3Client | null;
  private readonly bucketName: string;
  private readonly publicBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    const accountId = this.configService.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'R2_SECRET_ACCESS_KEY',
    );
    this.bucketName =
      this.configService.get<string>('R2_BUCKET_NAME') || 'gym-members';

    // Only initialize if credentials are present
    // If not present, this service won't be used (LocalDiskStorageService will be used instead)
    if (accountId && accessKeyId && secretAccessKey) {
      this.publicBaseUrl =
        this.configService.get<string>('R2_PUBLIC_BASE_URL') ||
        `https://${accountId}.r2.dev/${this.bucketName}`;

      // Initialize S3 client with R2 endpoint and custom HTTPS agent
      this.s3Client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
        requestHandler: new NodeHttpHandler({
          httpsAgent: new https.Agent({
            maxSockets: 25,
            keepAlive: true,
            rejectUnauthorized: true,
          }),
        }),
      });

      this.logger.log('R2StorageService initialized');
    } else {
      this.logger.warn(
        'R2 credentials not found. R2StorageService will not be used.',
      );
      // Initialize with dummy values to prevent errors
      // This service won't be selected by the factory if credentials are missing
      this.publicBaseUrl = '';
      this.s3Client = null;
    }
  }

  async upload(
    buffer: Buffer,
    key: string,
    contentType: string,
  ): Promise<string> {
    this.logger.log(`🔵 R2StorageService.upload() called for key: ${key}`);

    if (!this.s3Client) {
      this.logger.error('❌ R2StorageService is not initialized!');
      throw new Error(
        'R2StorageService is not properly initialized. Check R2 credentials.',
      );
    }

    const params: PutObjectCommandInput = {
      Bucket: this.bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      // Remove metadata to prevent information leakage
      Metadata: {},
    };

    this.logger.log(`📤 Uploading to R2 bucket: ${this.bucketName}`);

    try {
      await this.s3Client.send(new PutObjectCommand(params));
      this.logger.log(`✅ File uploaded successfully to R2: ${key}`);

      // Return public URL
      const publicUrl = `${this.publicBaseUrl}/${key}`;
      this.logger.log(`🌐 Public URL: ${publicUrl}`);
      return publicUrl;
    } catch (error) {
      this.logger.error(`❌ Failed to upload file ${key}:`, error);
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }
}
