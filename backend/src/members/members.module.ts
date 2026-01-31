import { Module } from '@nestjs/common';
import { MembersService } from './members.service';
import { MembersController } from './members.controller';
import { MobileMembersController } from './mobile-members.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MembershipPlansModule } from '../membership-plans/membership-plans.module';
import { MembershipPlanChangeSchedulerService } from './services/membership-plan-change-scheduler.service';
import { MemberStatusSyncService } from './member-status-sync.service';

@Module({
  imports: [PrismaModule, MembershipPlansModule],
  controllers: [MembersController, MobileMembersController],
  providers: [
    MembersService,
    MembershipPlanChangeSchedulerService,
    MemberStatusSyncService,
  ],
  exports: [MembersService],
})
export class MembersModule {}
