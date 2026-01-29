import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LocalDiskStorageService } from './local-disk-storage.service';
import { promises as fs } from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    writeFile: jest.fn(),
  },
}));

describe('LocalDiskStorageService', () => {
  let service: LocalDiskStorageService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocalDiskStorageService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'LOCAL_UPLOAD_DIR') {
                return '/tmp/test-uploads';
              }
              if (key === 'LOCAL_PUBLIC_BASE_URL') {
                return 'http://localhost:3000/uploads';
              }
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<LocalDiskStorageService>(LocalDiskStorageService);
    configService = module.get<ConfigService>(ConfigService);

    // Reset mocks
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('upload', () => {
    it('should save file and return public URL', async () => {
      const buffer = Buffer.from('test file content');
      const key = 'tenants/123/members/456/uuid.jpg';
      const contentType = 'image/jpeg';

      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      const result = await service.upload(buffer, key, contentType);

      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(key),
        buffer,
      );
      expect(result).toBe(`http://localhost:3000/uploads/${key}`);
    });

    it('should create parent directories', async () => {
      const buffer = Buffer.from('test file content');
      const key = 'tenants/123/members/456/uuid.jpg';
      const contentType = 'image/jpeg';

      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      await service.upload(buffer, key, contentType);

      // Should create directory for the file
      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('tenants/123/members/456'),
        { recursive: true },
      );
    });

    it('should handle write errors', async () => {
      const buffer = Buffer.from('test file content');
      const key = 'tenants/123/members/456/uuid.jpg';
      const contentType = 'image/jpeg';

      const error = new Error('Write failed');
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockRejectedValue(error);

      await expect(service.upload(buffer, key, contentType)).rejects.toThrow(
        'Failed to save file: Write failed',
      );
    });
  });
});
