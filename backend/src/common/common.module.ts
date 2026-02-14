import { Global, Module } from '@nestjs/common';
import { PgAdvisoryLockService } from './services/pg-advisory-lock.service';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [PgAdvisoryLockService],
  exports: [PgAdvisoryLockService],
})
export class CommonModule {}
