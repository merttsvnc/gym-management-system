import { Module } from '@nestjs/common';
import { ProductSalesController } from './product-sales.controller';
import { ProductSalesService } from './product-sales.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ProductSalesController],
  providers: [ProductSalesService],
  exports: [ProductSalesService],
})
export class ProductSalesModule {}
