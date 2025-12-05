import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { TenantsModule } from './tenants/tenants.module';
import { BranchesModule } from './branches/branches.module';

@Module({
  imports: [PrismaModule, TenantsModule, BranchesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
