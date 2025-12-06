import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { TenantsModule } from './tenants/tenants.module';
import { BranchesModule } from './branches/branches.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PlanModule } from './plan/plan.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    TenantsModule,
    BranchesModule,
    UsersModule,
    AuthModule,
    PlanModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
