import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { R2StorageService } from './r2-storage.service';
import { S3Client } from '@aws-sdk/client-s3';

// Mock AWS SDK
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  PutObjectCommand: jest.fn(),
}));

describe('R2StorageService', () => {
  let service: R2StorageService;
  let _configService: ConfigService;
  let mockS3Client: jest.Mocked<S3Client>;

  const mockConfig = {
    R2_ACCOUNT_ID: 'test-account-id',
    R2_ACCESS_KEY_ID: 'test-access-key',
    R2_SECRET_ACCESS_KEY: 'test-secret-key',
    R2_BUCKET_NAME: 'test-bucket',
    R2_PUBLIC_BASE_URL: 'https://test-account-id.r2.dev/test-bucket',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        R2StorageService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(
              (key: string) => mockConfig[key as keyof typeof mockConfig],
            ),
          },
        },
      ],
    }).compile();

    service = module.get<R2StorageService>(R2StorageService);
    configService = module.get<ConfigService>(ConfigService);
    mockS3Client = {
      send: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<S3Client>;

    // Replace the s3Client with our mock
    (service as any).s3Client = mockS3Client;
    (service as any).bucketName = mockConfig.R2_BUCKET_NAME;
    (service as any).publicBaseUrl = mockConfig.R2_PUBLIC_BASE_URL;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('upload', () => {
    it('should upload file and return public URL', async () => {
      const buffer = Buffer.from('test file content');
      const key = 'tenants/123/members/456/uuid.jpg';
      const contentType = 'image/jpeg';

      const result = await service.upload(buffer, key, contentType);

      expect(mockS3Client.send).toHaveBeenCalledTimes(1);
      expect(result).toBe(`${mockConfig.R2_PUBLIC_BASE_URL}/${key}`);
    });

    it('should handle upload errors', async () => {
      const buffer = Buffer.from('test file content');
      const key = 'tenants/123/members/456/uuid.jpg';
      const contentType = 'image/jpeg';

      const error = new Error('Upload failed');
      mockS3Client.send = jest.fn().mockRejectedValue(error);

      await expect(service.upload(buffer, key, contentType)).rejects.toThrow(
        'Failed to upload file: Upload failed',
      );
    });

    it('should set correct ContentType', async () => {
      const buffer = Buffer.from('test file content');
      const key = 'tenants/123/members/456/uuid.jpg';
      const contentType = 'image/png';

      await service.upload(buffer, key, contentType);

      const callArgs = mockS3Client.send.mock.calls[0][0];
      expect(callArgs.input.ContentType).toBe(contentType);
    });
  });
});
