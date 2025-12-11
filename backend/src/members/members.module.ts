import { Module } from '@nestjs/common';
import { MembersService } from './members.service';
import { MembersController } from './members.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MembershipPlansModule } from '../membership-plans/membership-plans.module';

@Module({
  imports: [PrismaModule, MembershipPlansModule],
  controllers: [MembersController],
  providers: [MembersService],
  exports: [MembersService],
})
export class MembersModule {}
