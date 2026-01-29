import { Module, Provider, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { R2StorageService } from './services/r2-storage.service';
import { LocalDiskStorageService } from './services/local-disk-storage.service';
import { StorageService } from './interfaces/storage-service.interface';

/**
 * Storage module factory
 * Provides StorageService implementation based on environment variables
 * - If R2 credentials are present: uses R2StorageService
 * - Otherwise: uses LocalDiskStorageService for development
 */
const storageServiceProvider: Provider = {
  provide: 'StorageService',
  useFactory: (
    configService: ConfigService,
    r2Service: R2StorageService,
    localService: LocalDiskStorageService,
  ): StorageService => {
    const logger = new Logger('StorageModule');
    const accountId = configService.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = configService.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = configService.get<string>('R2_SECRET_ACCESS_KEY');

    // Use R2 if all credentials are present
    if (accountId && accessKeyId && secretAccessKey) {
      const bucketName = configService.get<string>('R2_BUCKET_NAME') || 'gym-members';
      const publicBaseUrl = configService.get<string>('R2_PUBLIC_BASE_URL') || `https://${accountId}.r2.dev/${bucketName}`;
      
      logger.log('✅ Storage Provider Selected: R2StorageService');
      logger.log(`   R2_BUCKET_NAME: ${bucketName}`);
      logger.log(`   R2_PUBLIC_BASE_URL: ${publicBaseUrl}`);
      
      return r2Service;
    }

    // Fallback to local disk storage for development
    logger.warn('⚠️  Storage Provider Selected: LocalDiskStorageService (fallback)');
    logger.warn('   R2 credentials not found. Using local disk storage.');
    
    return localService;
  },
  inject: [ConfigService, R2StorageService, LocalDiskStorageService],
};

@Module({
  imports: [ConfigModule],
  providers: [
    R2StorageService,
    LocalDiskStorageService,
    storageServiceProvider,
  ],
  exports: ['StorageService'],
})
export class StorageModule {}
