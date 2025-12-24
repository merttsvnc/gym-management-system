# Quickstart Guide: Collections & Revenue Tracking

**Version:** 1.0.0  
**Date:** 2025-12-18  
**Feature:** 007-revenue-tracking

---

## Overview

This guide provides step-by-step instructions for implementing Collections & Revenue Tracking. This feature enables gym owners and managers to record payments collected from members and track revenue over time.

**Estimated Total Time:** 11-14 person-days

---

## Prerequisites

- Backend: NestJS + Prisma + PostgreSQL setup complete
- Existing Member model and service (from feature 002)
- Existing Branch model and service (from feature 001)
- Existing Tenant model (from feature 001)
- Authentication: JWT auth with tenant claims working
- Tenant isolation infrastructure in place
- Frontend: React + Vite + Tailwind + shadcn/ui setup complete

---

## Phase 0: Research & Understanding (1 hour)

### Step 1: Review Research Findings

Read `research.md` to understand:
- **Optimistic locking in Prisma:** Version field with explicit check in transactions
- **Rate limiting:** @nestjs/throttler with per-user tracking
- **Idempotency:** Database-stored idempotency keys with 24-hour TTL
- **Structured logging:** NestJS Logger with JSON format, excludes amounts and notes
- **Date storage:** DateTime type with time component truncated, tenant timezone for validation/display

**Key Decisions:**
- Use version field for optimistic locking (not updatedAt)
- Use @nestjs/throttler for rate limiting (100 requests per 15 minutes)
- Store idempotency keys in database (not Redis)
- Log events exclude amounts and notes (security requirement)
- Store dates as DateTime with truncated time component

**Time:** 1 hour

---

## Phase 1: Database Schema & Migration (Day 1)

### Step 1: Update Prisma Schema

Edit `backend/prisma/schema.prisma`:

1. Add `PaymentMethod` enum:
```prisma
enum PaymentMethod {
  CASH
  CREDIT_CARD
  BANK_TRANSFER
  CHECK
  OTHER
}
```

2. Add `Payment` model:
```prisma
model Payment {
  id                 String        @id @default(cuid())
  tenantId           String
  branchId           String
  memberId           String
  
  // Payment details
  amount             Decimal       @db.Decimal(10, 2)
  paymentDate        DateTime      // Date-only (time component ignored)
  paymentMethod      PaymentMethod
  note               String?       @db.VarChar(500)
  
  // Correction tracking
  isCorrection       Boolean       @default(false)
  correctedPaymentId String?
  isCorrected        Boolean       @default(false)
  
  // Optimistic locking
  version            Int           @default(0)
  
  // Audit fields
  createdBy          String        // User ID
  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt
  
  // Relations
  tenant             Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  branch             Branch        @relation(fields: [branchId], references: [id], onDelete: Restrict)
  member             Member        @relation(fields: [memberId], references: [id], onDelete: Restrict)
  correctedPayment   Payment?      @relation("PaymentCorrection", fields: [correctedPaymentId], references: [id])
  correctingPayment  Payment?      @relation("PaymentCorrection")
  
  @@index([tenantId])
  @@index([tenantId, branchId])
  @@index([tenantId, memberId])
  @@index([tenantId, paymentDate])
  @@index([tenantId, paymentMethod])
  @@index([tenantId, paymentDate, branchId])
  @@index([tenantId, paymentDate, paymentMethod])
  @@index([memberId])
  @@index([branchId])
  @@index([correctedPaymentId])
  @@index([tenantId, isCorrection])
  @@index([tenantId, isCorrected])
}
```

3. Add `IdempotencyKey` model (optional, for idempotency support):
```prisma
model IdempotencyKey {
  id           String    @id @default(cuid())
  key          String    @unique
  tenantId     String
  userId       String
  response     Json      // Cached response
  createdAt    DateTime  @default(now())
  expiresAt    DateTime  // TTL: 24 hours
  
  @@index([key])
  @@index([expiresAt]) // For cleanup job
}
```

4. Update `Tenant` model to add Payment relation:
```prisma
model Tenant {
  // ... existing fields ...
  payments        Payment[]  // NEW
}
```

5. Update `Branch` model to add Payment relation:
```prisma
model Branch {
  // ... existing fields ...
  payments        Payment[]  // NEW
}
```

6. Update `Member` model to add Payment relation:
```prisma
model Member {
  // ... existing fields ...
  payments        Payment[]  // NEW
}
```

**Time:** 1 hour

### Step 2: Create Migration

Run Prisma migration:
```bash
cd backend
npx prisma migrate dev --name add_payment_tracking
```

Verify migration:
- Check migration file in `backend/prisma/migrations/`
- Verify Payment table created with all fields
- Verify indexes created correctly
- Verify foreign key constraints created

**Time:** 30 minutes

### Step 3: Test Migration

Test migration on development database:
```bash
# Reset database and run migration
npx prisma migrate reset

# Verify Payment table exists
npx prisma studio
```

**Time:** 30 minutes

---

## Phase 2: Backend Service Layer (Day 2-3)

### Step 1: Create PaymentService

Create `backend/src/payments/payments.service.ts`:

```typescript
import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CorrectPaymentDto } from './dto/correct-payment.dto';

@Injectable()
export class PaymentService {
  constructor(private prisma: PrismaService) {}

  async createPayment(tenantId: string, userId: string, data: CreatePaymentDto) {
    // 1. Validate member belongs to tenant
    const member = await this.prisma.member.findUnique({
      where: { id: data.memberId },
    });

    if (!member || member.tenantId !== tenantId) {
      throw new NotFoundException('Member not found');
    }

    // 2. Validate payment date is not in future (using tenant timezone)
    // Implementation: Use date-fns-tz to check date in tenant timezone

    // 3. Truncate time component (store as start of day in UTC)
    // Implementation: Use date-fns startOfDay and zonedTimeToUtc

    // 4. Create payment
    const payment = await this.prisma.payment.create({
      data: {
        tenantId,
        branchId: member.branchId, // Inherit from member
        memberId: data.memberId,
        amount: data.amount,
        paymentDate: paymentDateUtc, // Truncated date
        paymentMethod: data.paymentMethod,
        note: data.note,
        createdBy: userId,
      },
      include: { member: true, branch: true },
    });

    // 5. Log structured event (exclude amount and note)
    this.logger.log({
      event: 'payment.created',
      paymentId: payment.id,
      tenantId: payment.tenantId,
      branchId: payment.branchId,
      memberId: payment.memberId,
      paymentMethod: payment.paymentMethod,
      paymentDate: payment.paymentDate.toISOString(),
      actorUserId: userId,
      result: 'success',
      correlationId: this.getCorrelationId(),
      timestamp: new Date().toISOString(),
    });

    return payment;
  }

  async correctPayment(
    tenantId: string,
    paymentId: string,
    correctionData: CorrectPaymentDto,
    userId: string
  ) {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Fetch current payment with version check
      const originalPayment = await tx.payment.findUnique({
        where: { id: paymentId, tenantId },
      });

      if (!originalPayment) {
        throw new NotFoundException('Payment not found');
      }

      if (originalPayment.isCorrected) {
        throw new BadRequestException('Payment already corrected');
      }

      // 2. Check version matches expected value
      if (originalPayment.version !== correctionData.version) {
        throw new ConflictException(
          'Payment was modified by another user. Please refresh and try again.'
        );
      }

      // 3. Create corrected payment
      const correctedPayment = await tx.payment.create({
        data: {
          tenantId: originalPayment.tenantId,
          branchId: originalPayment.branchId,
          memberId: originalPayment.memberId,
          amount: correctionData.amount ?? originalPayment.amount,
          paymentDate: correctionData.paymentDate 
            ? this.truncateDate(correctionData.paymentDate)
            : originalPayment.paymentDate,
          paymentMethod: correctionData.paymentMethod ?? originalPayment.paymentMethod,
          note: correctionData.note ?? originalPayment.note,
          isCorrection: true,
          correctedPaymentId: originalPayment.id,
          createdBy: userId,
        },
      });

      // 4. Update original payment atomically with version increment
      const updateResult = await tx.payment.updateMany({
        where: {
          id: originalPayment.id,
          version: correctionData.version, // Only update if version still matches
        },
        data: {
          isCorrected: true,
          correctedPaymentId: correctedPayment.id,
          version: { increment: 1 },
        },
      });

      // 5. Check if update succeeded (version still matched)
      if (updateResult.count === 0) {
        throw new ConflictException(
          'Payment was modified by another user. Please refresh and try again.'
        );
      }

      // 6. Log structured event (exclude amount and note)
      this.logger.log({
        event: 'payment.corrected',
        originalPaymentId: paymentId,
        correctedPaymentId: correctedPayment.id,
        tenantId: correctedPayment.tenantId,
        branchId: correctedPayment.branchId,
        memberId: correctedPayment.memberId,
        paymentMethod: correctedPayment.paymentMethod,
        actorUserId: userId,
        result: 'success',
        correlationId: this.getCorrelationId(),
        timestamp: new Date().toISOString(),
      });

      return correctedPayment;
    });
  }

  async getRevenueReport(tenantId: string, query: RevenueReportQueryDto) {
    // 1. Build date range filters (using tenant timezone)
    const startDateUtc = this.convertToUtc(query.startDate, tenantTimezone);
    const endDateUtc = this.convertToUtc(query.endDate, tenantTimezone);

    // 2. Build where clause
    const where = {
      tenantId,
      paymentDate: { gte: startDateUtc, lte: endDateUtc },
      // Exclude corrected original payments: isCorrection = false OR (isCorrection = true)
      OR: [
        { isCorrection: false, isCorrected: false },
        { isCorrection: true },
      ],
      ...(query.branchId && { branchId: query.branchId }),
      ...(query.paymentMethod && { paymentMethod: query.paymentMethod }),
    };

    // 3. Aggregate revenue using database GROUP BY
    const breakdown = await this.prisma.payment.groupBy({
      by: ['paymentDate'], // Group by date
      where,
      _sum: { amount: true },
      _count: { id: true },
    });

    // 4. Calculate total revenue
    const totalResult = await this.prisma.payment.aggregate({
      where,
      _sum: { amount: true },
      _count: { id: true },
    });

    return {
      totalRevenue: totalResult._sum.amount?.toString() || '0.00',
      currency: tenant.defaultCurrency,
      period: {
        startDate: query.startDate,
        endDate: query.endDate,
      },
      breakdown: breakdown.map(item => ({
        period: item.paymentDate.toISOString().split('T')[0],
        revenue: item._sum.amount?.toString() || '0.00',
        paymentCount: item._count.id,
      })),
      filters: {
        branchId: query.branchId || null,
        paymentMethod: query.paymentMethod || null,
      },
    };
  }

  // Helper methods for date handling, logging, etc.
}
```

**Time:** 4 hours

### Step 2: Implement Validation Logic

Add validation methods to PaymentService:
- Amount validation (positive, max 999999.99, 2 decimal places)
- Payment date validation (not future, using tenant timezone)
- Member validation (belongs to tenant)
- Payment method validation (enum value)

**Time:** 1 hour

### Step 3: Implement Revenue Calculation Logic

Implement `getRevenueReport` method:
- Exclude corrected original payments
- Include corrected payment amounts
- Filter by tenant, branch, payment method, date range
- Use database aggregation (GROUP BY) for performance

**Time:** 2 hours

### Step 4: Implement Structured Logging

Add logging to PaymentService:
- Log payment.created event (exclude amount and note)
- Log payment.corrected event (exclude amount and note)
- Include metadata: tenantId, branchId, paymentId, memberId, paymentMethod, actorUserId, result, correlationId

**Time:** 1 hour

---

## Phase 3: Backend DTOs & Validation (Day 3)

### Step 1: Create DTOs

Create DTO files in `backend/src/payments/dto/`:

1. `create-payment.dto.ts`:
```typescript
import { IsString, IsNumber, IsDateString, IsEnum, IsOptional, MaxLength, Min, Max } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreatePaymentDto {
  @IsString()
  memberId: string;

  @IsNumber()
  @Min(0.01)
  @Max(999999.99)
  amount: number;

  @IsDateString()
  paymentDate: string;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
```

2. `correct-payment.dto.ts`:
```typescript
import { IsNumber, IsDateString, IsEnum, IsOptional, IsInt, MaxLength, Min, Max } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CorrectPaymentDto {
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(999999.99)
  amount?: number;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  correctionReason?: string;

  @IsInt()
  version: number;
}
```

3. `payment-list-query.dto.ts`:
```typescript
import { IsOptional, IsString, IsDateString, IsEnum, IsBoolean, IsInt, Min, Max } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class PaymentListQueryDto {
  @IsOptional()
  @IsString()
  memberId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  includeCorrections?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
```

4. `revenue-report-query.dto.ts`:
```typescript
import { IsString, IsDateString, IsOptional, IsEnum } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class RevenueReportQueryDto {
  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsEnum(['day', 'week', 'month'])
  groupBy?: 'day' | 'week' | 'month';
}
```

**Time:** 2 hours

---

## Phase 4: Backend Controller & API (Day 4)

### Step 1: Create PaymentsController

Create `backend/src/payments/payments.controller.ts`:

```typescript
import { Controller, Post, Get, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Throttle } from '@nestjs/throttler';
import { PaymentService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CorrectPaymentDto } from './dto/correct-payment.dto';
import { PaymentListQueryDto } from './dto/payment-list-query.dto';
import { RevenueReportQueryDto } from './dto/revenue-report-query.dto';

@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class PaymentsController {
  constructor(private paymentService: PaymentService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 100, ttl: 900 } }) // 100 requests per 15 minutes
  async createPayment(@Body() dto: CreatePaymentDto, @Req() req) {
    return this.paymentService.createPayment(req.user.tenantId, req.user.userId, dto);
  }

  @Get()
  async listPayments(@Query() query: PaymentListQueryDto, @Req() req) {
    return this.paymentService.listPayments(req.user.tenantId, query);
  }

  @Get(':id')
  async getPayment(@Param('id') id: string, @Req() req) {
    return this.paymentService.getPaymentById(req.user.tenantId, id);
  }

  @Post(':id/correct')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 100, ttl: 900 } }) // 100 requests per 15 minutes
  async correctPayment(
    @Param('id') id: string,
    @Body() dto: CorrectPaymentDto,
    @Req() req
  ) {
    return this.paymentService.correctPayment(req.user.tenantId, id, dto, req.user.userId);
  }

  @Get('members/:memberId/payments')
  async getMemberPayments(
    @Param('memberId') memberId: string,
    @Query() query: MemberPaymentsQueryDto,
    @Req() req
  ) {
    return this.paymentService.getMemberPayments(req.user.tenantId, memberId, query);
  }
}

@Controller('revenue')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class RevenueController {
  constructor(private paymentService: PaymentService) {}

  @Get()
  async getRevenueReport(@Query() query: RevenueReportQueryDto, @Req() req) {
    return this.paymentService.getRevenueReport(req.user.tenantId, query);
  }
}
```

**Time:** 2 hours

### Step 2: Configure Rate Limiting

Install @nestjs/throttler:
```bash
npm install @nestjs/throttler
```

Configure in `app.module.ts`:
```typescript
import { ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      ttl: 900, // 15 minutes
      limit: 100, // Max requests per time window
    }),
  ],
})
export class AppModule {}
```

**Time:** 30 minutes

### Step 3: Add Error Handling

Add error handling for:
- 409 Conflict (version mismatch)
- 429 Too Many Requests (rate limit)
- 400 Validation errors
- 403 Forbidden (tenant violations)

**Time:** 1 hour

---

## Phase 5: Backend Testing (Day 5-6)

### Step 1: Unit Tests

Create `backend/src/payments/payments.service.spec.ts`:
- Test createPayment validation
- Test correctPayment optimistic locking
- Test revenue calculation logic
- Test tenant isolation

**Time:** 4 hours

### Step 2: Integration Tests

Create `backend/test/payments.e2e-spec.ts`:
- Test all API endpoints
- Test rate limiting (429 responses)
- Test optimistic locking (409 responses)
- Test tenant isolation (403 responses)

**Time:** 6 hours

---

## Phase 6: Frontend Types & API Client (Day 7)

### Step 1: Add Payment Types

Create `frontend/src/types/payment.ts`:
- Copy types from `contracts/types.ts`
- Ensure types match backend contracts

**Time:** 30 minutes

### Step 2: Create API Client

Create `frontend/src/api/payments.ts`:
- Implement createPayment method
- Implement getPayments method
- Implement getPaymentById method
- Implement getMemberPayments method
- Implement correctPayment method
- Implement getRevenueReport method
- Add error handling for 409, 429, 400, 403

**Time:** 2 hours

---

## Phase 7: Frontend Components (Day 8-9)

### Step 1: Create PaymentForm Component

Create `frontend/src/components/payments/PaymentForm.tsx`:
- Member selector (searchable dropdown)
- Amount input (currency formatted)
- Payment date picker (date-only, tenant timezone)
- Payment method dropdown
- Note textarea (optional, max 500 chars)
- Form validation
- Loading states
- Error handling

**Time:** 3 hours

### Step 2: Create PaymentHistoryTable Component

Create `frontend/src/components/payments/PaymentHistoryTable.tsx`:
- Table with columns: date, amount, payment method, note, status, actions
- Correction indicator badge
- Pagination controls
- Date range filter
- Loading skeleton

**Time:** 2 hours

### Step 3: Create RevenueReport Component

Create `frontend/src/components/payments/RevenueReport.tsx`:
- Time period selector (daily, weekly, monthly)
- Date range picker
- Branch filter dropdown
- Payment method filter dropdown
- Report display (total revenue, breakdown table)
- Loading states
- Error handling

**Time:** 3 hours

### Step 4: Create Helper Components

Create:
- `PaymentMethodBadge.tsx`: Badge with payment method icon/color
- `CorrectionIndicator.tsx`: Badge indicating correction status

**Time:** 1 hour

---

## Phase 8: Frontend Integration (Day 10-11)

### Step 1: Add Payment History to Member Detail Page

Edit `frontend/src/pages/MemberDetailPage.tsx`:
- Add "Payment History" tab
- Integrate PaymentHistoryTable component
- Add "Record Payment" button

**Time:** 1 hour

### Step 2: Add Payment Recording Modal

Edit `frontend/src/pages/MemberDetailPage.tsx`:
- Open PaymentForm modal on button click
- Pre-fill member in form
- Refresh payment history on success

**Time:** 1 hour

### Step 3: Create Revenue Reports Page

Create `frontend/src/pages/RevenuePage.tsx`:
- Create new route `/revenue`
- Integrate RevenueReport component
- Add to navigation menu

**Time:** 1 hour

### Step 4: Add Payment Correction Workflow

Edit `frontend/src/components/payments/PaymentHistoryTable.tsx`:
- Add "Correct Payment" button to payment row
- Open correction form modal
- Pre-fill original payment values
- Show warning if payment >90 days old
- Handle 409 Conflict error (show refresh message)
- Handle 429 Rate Limit error (show retry message)

**Time:** 2 hours

### Step 5: Add React Query Integration

Create hooks:
- `usePayments.ts`: List payments with filters
- `useCreatePayment.ts`: Create payment mutation
- `useCorrectPayment.ts`: Correct payment mutation
- `useRevenueReport.ts`: Revenue report query
- `useMemberPayments.ts`: Member payment history query

Configure cache invalidation and optimistic updates.

**Time:** 2 hours

---

## Phase 9: Testing & Polish (Day 12-14)

### Step 1: E2E Tests

Create E2E tests for:
- Payment recording workflow
- Payment correction workflow
- Revenue reports workflow
- 409 Conflict handling
- 429 Rate Limit handling

**Time:** 4 hours

### Step 2: Manual Testing

Test all user flows:
- Record payment from member detail page
- Record payment from payments page
- View member payment history
- Correct payment (with and without conflicts)
- Generate revenue reports with various filters

**Time:** 2 hours

### Step 3: Documentation

Update:
- API documentation (OpenAPI spec)
- README with payment tracking features
- Code comments for complex logic

**Time:** 2 hours

---

## Common Issues & Solutions

### Issue 1: Optimistic Locking Conflicts

**Problem:** Getting 409 Conflict errors frequently.

**Solution:**
- Ensure frontend sends current version in correction request
- Refresh payment data before correction
- Show clear error message: "Payment was modified. Please refresh and try again."

### Issue 2: Date Timezone Issues

**Problem:** Payment dates showing incorrect dates due to timezone.

**Solution:**
- Always use tenant timezone for date validation and display
- Store dates as start of day in UTC (00:00:00 UTC)
- Use date-fns-tz for timezone conversions

### Issue 3: Rate Limiting False Positives

**Problem:** Legitimate users hitting rate limits.

**Solution:**
- Monitor rate limit hit rate
- Adjust limits if needed (100 requests per 15 minutes is standard)
- Show clear error message with retry guidance

### Issue 4: Revenue Calculation Incorrect

**Problem:** Revenue includes corrected original payments.

**Solution:**
- Ensure revenue query excludes corrected originals:
  ```typescript
  OR: [
    { isCorrection: false, isCorrected: false },
    { isCorrection: true },
  ]
  ```

---

## Next Steps

After completing this implementation:

1. **Monitor Performance:**
   - Track payment creation rate
   - Monitor revenue report generation time
   - Check for slow queries

2. **Gather Feedback:**
   - Collect user feedback on payment recording workflow
   - Identify common correction scenarios
   - Improve error messages based on user feedback

3. **Future Enhancements:**
   - Payment export to CSV
   - Payment reconciliation with bank statements
   - Payment provider integration (Stripe, PayPal)
   - Recurring payment automation

---

**End of Quickstart Guide**

