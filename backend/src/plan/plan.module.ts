import { Module } from '@nestjs/common';
import { PlanService } from './plan.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [PlanService],
  exports: [PlanService],
})
export class PlanModule {}
