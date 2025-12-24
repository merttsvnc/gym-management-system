# Research Document: Collections & Revenue Tracking

**Feature:** Collections & Revenue Tracking (Feature 007)  
**Version:** 1.0.0  
**Date:** 2025-12-18  
**Status:** Complete

---

## Overview

This document consolidates research findings for technical decisions and best practices needed for the Collections & Revenue Tracking module implementation.

---

## Research Item 1: Optimistic Locking in Prisma

### Decision
Implement optimistic locking using a `version` field with explicit version check in Prisma transactions. Use `updateMany` pattern to detect conflicts when version doesn't match.

### Rationale
- **Prisma limitation:** Prisma doesn't have built-in optimistic locking support
- **Explicit control:** Version field with explicit check provides clear conflict detection
- **Transaction safety:** Using Prisma transactions ensures atomic updates
- **Conflict detection:** `updateMany` with version check returns affected count, allowing conflict detection

### Implementation Pattern

```typescript
async correctPayment(
  tenantId: string,
  paymentId: string,
  correctionData: CorrectPaymentData,
  expectedVersion: number
): Promise<Payment> {
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
    if (originalPayment.version !== expectedVersion) {
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
        paymentDate: correctionData.paymentDate ?? originalPayment.paymentDate,
        paymentMethod: correctionData.paymentMethod ?? originalPayment.paymentMethod,
        note: correctionData.note ?? originalPayment.note,
        isCorrection: true,
        correctedPaymentId: originalPayment.id,
        createdBy: this.currentUserId,
      },
    });

    // 4. Update original payment atomically with version increment
    const updateResult = await tx.payment.updateMany({
      where: {
        id: originalPayment.id,
        version: expectedVersion, // Only update if version still matches
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

    return correctedPayment;
  });
}
```

### Alternatives Considered

**Option A: Prisma's `updatedAt` field for optimistic locking**
- **Pros:** No additional field needed
- **Cons:** Less explicit, timestamp comparison can have race conditions, harder to debug
- **Rejected:** Version field is more explicit and easier to reason about

**Option B: Database-level row locking (SELECT FOR UPDATE)**
- **Pros:** Pessimistic locking prevents conflicts entirely
- **Cons:** Blocks concurrent reads, can cause deadlocks, not suitable for read-heavy workloads
- **Rejected:** Optimistic locking is better for this use case (corrections are infrequent)

**Option C: Application-level locking (Redis locks)**
- **Pros:** Distributed locking support
- **Cons:** Adds Redis dependency, more complex, can fail if Redis unavailable
- **Rejected:** Overkill for single-database deployment, adds unnecessary complexity

### Best Practices
- Always check version at the start of transaction
- Use `updateMany` with version condition to detect conflicts
- Throw clear ConflictException (HTTP 409) when version mismatch detected
- Include version in API response so frontend can track it
- Frontend should refresh payment data on 409 conflict

---

## Research Item 2: Rate Limiting in NestJS

### Decision
Use `@nestjs/throttler` package with per-user rate limiting. Configure standard limits: 100 requests per 15 minutes per user for payment endpoints.

### Rationale
- **Standard library:** @nestjs/throttler is the official NestJS rate limiting solution
- **Per-user tracking:** Tracks by user ID from JWT token (not IP address)
- **Flexible configuration:** Supports different limits per endpoint
- **Storage options:** Supports in-memory (dev) or Redis (production)

### Implementation Pattern

```typescript
// app.module.ts
import { ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      ttl: 60, // Time window in seconds (15 minutes = 900 seconds)
      limit: 100, // Max requests per time window
      storage: new ThrottlerStorageRedisService(redisClient), // Or in-memory for dev
    }),
  ],
})
export class AppModule {}

// payments.controller.ts
import { Throttle } from '@nestjs/throttler';

@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  @Post()
  @Throttle({ default: { limit: 100, ttl: 900 } }) // 100 requests per 15 minutes
  async createPayment(@Body() dto: CreatePaymentDto) {
    // ...
  }

  @Post(':id/correct')
  @Throttle({ default: { limit: 100, ttl: 900 } }) // Same limit for corrections
  async correctPayment(@Param('id') id: string, @Body() dto: CorrectPaymentDto) {
    // ...
  }
}
```

### Alternatives Considered

**Option A: Custom rate limiting middleware**
- **Pros:** Full control over implementation
- **Cons:** More code to maintain, need to handle edge cases, reinventing the wheel
- **Rejected:** Standard library is better maintained and tested

**Option B: Per-IP rate limiting**
- **Pros:** Simpler (no user tracking needed)
- **Cons:** Doesn't work well with shared IPs (offices, VPNs), can be bypassed
- **Rejected:** Per-user tracking is more accurate and fair

**Option C: No rate limiting**
- **Pros:** Simpler implementation
- **Cons:** Vulnerable to abuse, no protection against accidental loops
- **Rejected:** Rate limiting is a security best practice

### Best Practices
- Use per-user tracking (not per-IP) for authenticated endpoints
- Set reasonable limits (100 requests per 15 minutes is standard)
- Return clear 429 error messages with retry-after header
- Monitor rate limit hit rate to detect abuse or adjust limits
- Use Redis storage in production for distributed rate limiting

---

## Research Item 3: Idempotency for Payment Creation

### Decision
Store idempotency keys in database (IdempotencyKey model) with unique constraint. Keys expire after 24 hours. Return cached response if key exists.

### Rationale
- **Database storage:** Reliable, persistent, works across server restarts
- **Unique constraint:** Prevents duplicate payments even under concurrent requests
- **TTL cleanup:** Expires old keys automatically (prevents unbounded growth)
- **Cached response:** Returns same response for duplicate requests (idempotent)

### Implementation Pattern

```typescript
// IdempotencyKey model
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

// PaymentService
async createPayment(
  tenantId: string,
  userId: string,
  data: CreatePaymentData,
  idempotencyKey?: string
): Promise<Payment> {
  // 1. Check idempotency key if provided
  if (idempotencyKey) {
    const existingKey = await this.prisma.idempotencyKey.findUnique({
      where: { key: idempotencyKey },
    });

    if (existingKey && existingKey.expiresAt > new Date()) {
      // Return cached response
      return existingKey.response as Payment;
    }
  }

  // 2. Create payment
  const payment = await this.prisma.payment.create({
    data: {
      tenantId,
      branchId: data.branchId,
      memberId: data.memberId,
      amount: data.amount,
      paymentDate: data.paymentDate,
      paymentMethod: data.paymentMethod,
      note: data.note,
      createdBy: userId,
    },
    include: { member: true, branch: true },
  });

  // 3. Store idempotency key if provided
  if (idempotencyKey) {
    await this.prisma.idempotencyKey.create({
      data: {
        key: idempotencyKey,
        tenantId,
        userId,
        response: payment,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    }).catch(() => {
      // Ignore duplicate key errors (race condition handled by unique constraint)
    });
  }

  return payment;
}
```

### Alternatives Considered

**Option A: Redis for idempotency keys**
- **Pros:** Faster, built-in TTL support
- **Cons:** Requires Redis, keys lost on Redis restart, more complex
- **Rejected:** Database storage is more reliable and simpler

**Option B: No idempotency support**
- **Pros:** Simpler implementation
- **Cons:** Duplicate payments possible on retries, poor user experience
- **Rejected:** Idempotency is critical for payment operations

**Option C: Client-generated payment IDs**
- **Pros:** No server-side storage needed
- **Cons:** Client must generate unique IDs, harder to implement correctly
- **Rejected:** Server-generated IDs are simpler and more reliable

### Best Practices
- Generate idempotency keys on client side (UUID or random string)
- Send idempotency key in `Idempotency-Key` header
- Store keys with 24-hour TTL (sufficient for payment operations)
- Return cached response immediately if key exists
- Clean up expired keys periodically (cron job or scheduled task)
- Handle race conditions gracefully (unique constraint prevents duplicates)

---

## Research Item 4: Structured Event Logging

### Decision
Use NestJS Logger with structured JSON format. Log payment events (payment.created, payment.corrected) with metadata only. Explicitly exclude payment amounts and notes from logs.

### Rationale
- **NestJS Logger:** Built-in, no additional dependencies
- **Structured format:** JSON logs are parseable and searchable
- **Security requirement:** Payment amounts must NOT appear in application logs
- **Metadata only:** Log event type, IDs, timestamps, but not sensitive data

### Implementation Pattern

```typescript
// PaymentService
import { Logger } from '@nestjs/common';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  async createPayment(
    tenantId: string,
    userId: string,
    data: CreatePaymentData
  ): Promise<Payment> {
    const payment = await this.prisma.payment.create({
      data: {
        tenantId,
        branchId: data.branchId,
        memberId: data.memberId,
        amount: data.amount, // NOT logged
        paymentDate: data.paymentDate,
        paymentMethod: data.paymentMethod,
        note: data.note, // NOT logged
        createdBy: userId,
      },
    });

    // Structured event logging (excludes amount and note)
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
      // Explicitly exclude: amount, note
    });

    return payment;
  }

  async correctPayment(
    tenantId: string,
    paymentId: string,
    correctionData: CorrectPaymentData,
    userId: string
  ): Promise<Payment> {
    // ... correction logic ...

    // Structured event logging (excludes amount and note)
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
      // Explicitly exclude: amount, note, correctionReason
    });

    return correctedPayment;
  }
}
```

### Log Event Schema

**payment.created:**
```json
{
  "event": "payment.created",
  "paymentId": "clx123...",
  "tenantId": "clx456...",
  "branchId": "clx789...",
  "memberId": "clxabc...",
  "paymentMethod": "CASH",
  "paymentDate": "2025-12-18T00:00:00.000Z",
  "actorUserId": "clxdef...",
  "result": "success",
  "correlationId": "req-123",
  "timestamp": "2025-12-18T10:30:00.000Z"
}
```

**payment.corrected:**
```json
{
  "event": "payment.corrected",
  "originalPaymentId": "clx123...",
  "correctedPaymentId": "clx456...",
  "tenantId": "clx789...",
  "branchId": "clxabc...",
  "memberId": "clxdef...",
  "paymentMethod": "CREDIT_CARD",
  "actorUserId": "clxghi...",
  "result": "success",
  "correlationId": "req-124",
  "timestamp": "2025-12-18T11:00:00.000Z"
}
```

### Alternatives Considered

**Option A: Winston logger with custom formatter**
- **Pros:** More features, better performance
- **Cons:** Additional dependency, more configuration
- **Rejected:** NestJS Logger is sufficient and built-in

**Option B: Pino logger**
- **Pros:** Very fast, structured logging by default
- **Cons:** Additional dependency, requires adapter for NestJS
- **Rejected:** NestJS Logger is sufficient, can switch to Pino later if needed

**Option C: Log everything including amounts**
- **Pros:** Simpler, more information
- **Cons:** Security risk, violates requirement
- **Rejected:** Explicitly violates security requirement

### Best Practices
- Use structured JSON format for logs
- Include correlation ID for request tracing
- Log event type, IDs, timestamps, but NOT sensitive data
- Explicitly exclude amounts and notes from logs
- Use consistent event naming (payment.created, payment.corrected)
- Include actorUserId for audit trail
- Log result (success/failure) for monitoring

---

## Research Item 5: Date-Only Storage in PostgreSQL

### Decision
Use Prisma `DateTime` type, truncate time component at application layer, validate dates using tenant timezone for display/selection.

### Rationale
- **Prisma limitation:** Prisma doesn't have native DATE-only type (only DateTime)
- **Application-level handling:** Truncate time component when storing, validate using tenant timezone
- **Display consistency:** Use tenant timezone for date selection and display
- **Database storage:** Store as DateTime but ignore time component

### Implementation Pattern

```typescript
// PaymentService
import { startOfDay, endOfDay } from 'date-fns';
import { zonedTimeToUtc, utcToZonedTime } from 'date-fns-tz';

async createPayment(
  tenantId: string,
  data: CreatePaymentData
): Promise<Payment> {
  // 1. Get tenant timezone
  const tenant = await this.prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { timezone: true }, // Assume timezone field exists
  });

  const tenantTimezone = tenant?.timezone || 'UTC';

  // 2. Validate payment date is not in future (using tenant timezone)
  const paymentDateInTenantTz = utcToZonedTime(
    new Date(data.paymentDate),
    tenantTimezone
  );
  const todayInTenantTz = utcToZonedTime(new Date(), tenantTimezone);

  if (paymentDateInTenantTz > todayInTenantTz) {
    throw new BadRequestException('Payment date cannot be in the future');
  }

  // 3. Truncate time component (store as start of day in UTC)
  const paymentDateUtc = zonedTimeToUtc(
    startOfDay(paymentDateInTenantTz),
    tenantTimezone
  );

  // 4. Create payment with truncated date
  const payment = await this.prisma.payment.create({
    data: {
      tenantId,
      branchId: data.branchId,
      memberId: data.memberId,
      amount: data.amount,
      paymentDate: paymentDateUtc, // Stored as DateTime, time component is 00:00:00 UTC
      paymentMethod: data.paymentMethod,
      note: data.note,
      createdBy: this.currentUserId,
    },
  });

  return payment;
}

// When querying by date range
async getPaymentsByDateRange(
  tenantId: string,
  startDate: string, // ISO date string (YYYY-MM-DD)
  endDate: string
): Promise<Payment[]> {
  const tenant = await this.prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { timezone: true },
  });

  const tenantTimezone = tenant?.timezone || 'UTC';

  // Convert date strings to start/end of day in tenant timezone, then to UTC
  const startDateUtc = zonedTimeToUtc(
    startOfDay(new Date(startDate)),
    tenantTimezone
  );
  const endDateUtc = zonedTimeToUtc(
    endOfDay(new Date(endDate)),
    tenantTimezone
  );

  return await this.prisma.payment.findMany({
    where: {
      tenantId,
      paymentDate: {
        gte: startDateUtc,
        lte: endDateUtc,
      },
    },
  });
}
```

### Alternatives Considered

**Option A: PostgreSQL DATE type**
- **Pros:** True date-only type, no time component
- **Cons:** Prisma doesn't support DATE type directly, requires raw SQL
- **Rejected:** Prisma limitation makes this impractical

**Option B: Store as string (YYYY-MM-DD)**
- **Pros:** Simple, no time component
- **Cons:** Can't use date functions, harder to query, type safety issues
- **Rejected:** DateTime type is better for queries and type safety

**Option C: Store with time component, ignore in queries**
- **Pros:** Simpler storage
- **Cons:** Time component can cause issues in date range queries
- **Rejected:** Truncating time component is safer and more explicit

### Best Practices
- Always truncate time component when storing payment dates
- Use tenant timezone for date validation and display
- Store dates as start of day in UTC (00:00:00 UTC)
- Use date-fns-tz for timezone conversions
- Validate dates using tenant timezone (not UTC)
- Display dates using tenant timezone in frontend

---

## Summary

All technical decisions have been made:

1. **Optimistic Locking:** Version field with explicit check in Prisma transactions
2. **Rate Limiting:** @nestjs/throttler with per-user tracking (100 requests per 15 minutes)
3. **Idempotency:** Database-stored idempotency keys with 24-hour TTL
4. **Structured Logging:** NestJS Logger with JSON format, excludes amounts and notes
5. **Date Storage:** DateTime type with time component truncated, tenant timezone for validation/display

All decisions align with constitutional principles and project requirements.

---

**End of Research Document**

