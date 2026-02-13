import { Module } from '@nestjs/common';
import { ProductSalesController } from './product-sales.controller';
import { ProductSalesService } from './product-sales.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BranchesModule } from '../branches/branches.module';

@Module({
  imports: [PrismaModule, BranchesModule],
  controllers: [ProductSalesController],
  providers: [ProductSalesService],
  exports: [ProductSalesService],
})
export class ProductSalesModule {}
