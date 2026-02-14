# Backend Fix Plan

**Project:** gym-management-system  
**Date:** 2026-02-14  
**Linked Report:** `BACKEND_PRODUCTION_READINESS_REPORT.md`

---

## Phase 0 — P0 Blockers (Must Fix Before Deploy)

> **Effort Total:** ~4 hours  
> **Owner:** Backend Engineer + DevOps  
> **Gate:** No deploy until ALL Phase 0 items are checked off.

### 0.1 Remove JWT Secret Hardcoded Fallback

- [ ] **Effort: S (30 min)**
- **Files:**
  - `backend/src/auth/auth.module.ts` L32-33
  - `backend/src/auth/strategies/jwt.strategy.ts` L22-23
- **Change:** Remove `|| 'your_access_secret_here'` fallback. Add startup validation in `main.ts`:
  ```typescript
  // main.ts — add after line 18 (existing email check)
  const requiredSecrets = [
    "JWT_ACCESS_SECRET",
    "JWT_SIGNUP_SECRET",
    "JWT_RESET_SECRET",
  ];
  for (const secret of requiredSecrets) {
    if (!process.env[secret] || process.env[secret]!.length < 32) {
      throw new Error(
        `FATAL: ${secret} must be set and at least 32 characters in production.`,
      );
    }
  }
  ```
  ```typescript
  // auth.module.ts L32 — change to:
  secret: configService.get<string>('JWT_ACCESS_SECRET'),
  // jwt.strategy.ts L22 — change to:
  secretOrKey: configService.get<string>('JWT_ACCESS_SECRET'),
  ```
- **Risk:** App will fail to start if env vars not set (intended behavior).
- **Acceptance:** Server refuses to start when `JWT_ACCESS_SECRET` is missing or < 32 chars.

### 0.2 Rotate Exposed Credentials

- [ ] **Effort: M (1 hour)**
- **Action items:**
  1. Rotate Resend API key at https://resend.com/api-keys
  2. Rotate Cloudflare R2 credentials at Cloudflare dashboard
  3. Generate new JWT secrets (256-bit random): `openssl rand -base64 48`
  4. Store all secrets in deployment platform's secret manager (NOT in `.env` on server)
  5. Update production environment with new values
- **Risk:** Old credentials stop working immediately after rotation.
- **Acceptance:** Old Resend/R2 keys return 401. New keys work.

### 0.3 Fix CORS for Production

- [ ] **Effort: S (30 min)**
- **File:** `backend/src/main.ts` L24-27
- **Change:**

  ```typescript
  // Replace single-origin CORS with multi-origin support
  const corsOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173")
    .split(",")
    .map((o) => o.trim());

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
  });
  ```

- **Env:** Set `CORS_ORIGINS=https://app.yourdomain.com,https://mobile.yourdomain.com`
- **Risk:** Misconfigured origins will block legitimate requests. Test with curl.
- **Acceptance:** Only listed origins are allowed; `Access-Control-Allow-Origin` header matches request origin.

---

## Phase 1 — Stabilize & Observability (Should Fix First Week)

> **Effort Total:** ~12 hours  
> **Owner:** Backend Engineer

### 1.1 Add RBAC to Missing Endpoints

- [ ] **Effort: S (1 hour)**
- **Files & Changes:**

  | File                                                              | Change                                                                                                                     |
  | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
  | `backend/src/branches/branches.controller.ts`                     | Add `@UseGuards(RolesGuard)` and `@Roles('ADMIN')` to `updateBranch`, `archiveBranch`, `restoreBranch`, `setDefaultBranch` |
  | `backend/src/tenants/tenants.controller.ts`                       | Add `@UseGuards(RolesGuard)` and `@Roles('ADMIN')` to `updateTenant`                                                       |
  | `backend/src/revenue-month-lock/revenue-month-lock.controller.ts` | Add `@UseGuards(RolesGuard)` and `@Roles('ADMIN')` to lock/unlock endpoints                                                |
  | `backend/src/products/products.controller.ts`                     | Add `@UseGuards(RolesGuard)` and `@Roles('ADMIN')` to `create`, `update`, `delete`                                         |
  | `backend/src/product-sales/product-sales.controller.ts`           | Add `@UseGuards(RolesGuard)` and `@Roles('ADMIN')` to `delete`                                                             |

- **Risk:** Non-admin users will lose write access. Verify there are no non-admin user flows that require these endpoints.
- **Acceptance:** Non-admin authenticated users get 403 on mutation endpoints.

### 1.2 Strengthen Password Policy

- [ ] **Effort: S (30 min)**
- **Files:**
  - `backend/src/auth/dto/signup-start.dto.ts`
  - `backend/src/auth/dto/register.dto.ts`
  - `backend/src/auth/dto/password-reset-complete.dto.ts`
- **Change (all three files):**
  ```typescript
  @MinLength(10)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/, {
    message: 'Şifre en az bir küçük harf, bir büyük harf, bir rakam ve bir özel karakter içermelidir',
  })
  password: string;
  ```
- **Risk:** Existing users with weak passwords can still login but cannot set weak passwords on reset.
- **Acceptance:** `aaaaaaaaaa1` rejected, `MyPass123!a` accepted.

### 1.3 Fix OTP Generation

- [ ] **Effort: S (15 min)**
- **Files:**
  - `backend/src/auth/services/otp.service.ts` L47-51
  - `backend/src/auth/services/password-reset-otp.service.ts` (same pattern)
- **Change:**

  ```typescript
  import { randomInt } from 'crypto';

  private generateOtp(): string {
    return randomInt(100000, 1000000).toString();
  }
  ```

- **Risk:** None. Drop-in replacement.
- **Acceptance:** OTPs are still 6-digit numbers; generated using crypto-secure RNG.

### 1.4 Add Health Check Endpoint

- [ ] **Effort: M (1 hour)**
- **Steps:**
  1. `npm install @nestjs/terminus`
  2. Create `backend/src/health/health.module.ts` and `health.controller.ts`
  3. Add Prisma health indicator (simple `SELECT 1` query)
  4. Register at `GET /health` (excluded from API prefix)
- **Sample code:**

  ```typescript
  @Controller("health")
  export class HealthController {
    constructor(
      private health: HealthCheckService,
      private prisma: PrismaService,
    ) {}

    @Get()
    @SkipBillingStatusCheck()
    async check() {
      return this.health.check([
        () =>
          this.prisma.$queryRaw`SELECT 1`.then(() => ({
            database: { status: "up" },
          })),
      ]);
    }
  }
  ```

- **Risk:** None.
- **Acceptance:** `GET /health` returns `{ status: 'ok', details: { database: { status: 'up' } } }`.

### 1.5 Remove Hardcoded DB Fallback

- [ ] **Effort: S (15 min)**
- **File:** `backend/src/prisma/prisma.service.ts`
- **Change:** Replace fallback with startup error:
  ```typescript
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("FATAL: DATABASE_URL environment variable is required");
  }
  ```
- **Risk:** App won't start without DATABASE_URL (intended).
- **Acceptance:** Missing DATABASE_URL causes clear error message at startup.

### 1.6 Add Production Guard to test scripts

- [ ] **Effort: S (15 min)**
- **File:** `backend/src/scripts/create-test-user.ts`
- **Change:** Add at top of `main()`:
  ```typescript
  if (process.env.NODE_ENV === "production") {
    console.error("ERROR: This script cannot run in production!");
    process.exit(1);
  }
  ```
- **Risk:** None.
- **Acceptance:** Script exits with error in production.

### 1.7 Fix npm Vulnerabilities

- [ ] **Effort: S (30 min)**
- **Command:** `cd backend && npm audit fix`
- **Specifically:** Update `@aws-sdk/client-s3` to latest to resolve high-severity chain.
- **Risk:** Dependency updates may introduce breaking changes. Run test suite after.
- **Acceptance:** `npm audit` shows 0 high/critical vulnerabilities.

### 1.8 Reduce Verbose Guard Logging

- [ ] **Effort: S (15 min)**
- **File:** `backend/src/auth/guards/billing-status.guard.ts`
- **Changes:**
  - L77: Change `this.logger.log(...)` to `this.logger.debug(...)`
  - L88: Change `this.logger.log(...)` to `this.logger.debug(...)`
  - Remove `JSON.stringify(user)` from log messages
- **Risk:** None. Debug-level logs still available when needed.
- **Acceptance:** No per-request billing guard logs at default log level.

### 1.9 Add Config Validation Schema

- [ ] **Effort: M (1 hour)**
- **File:** `backend/src/app.module.ts`
- **Change:** Install `joi` and add validation:

  ```typescript
  import * as Joi from 'joi';

  ConfigModule.forRoot({
    isGlobal: true,
    validationSchema: Joi.object({
      NODE_ENV: Joi.string().valid('development', 'staging', 'production').default('development'),
      DATABASE_URL: Joi.string().required(),
      JWT_ACCESS_SECRET: Joi.string().min(32).required(),
      JWT_SIGNUP_SECRET: Joi.string().min(32).required(),
      JWT_RESET_SECRET: Joi.string().min(32).required(),
      CORS_ORIGINS: Joi.string().default('http://localhost:5173'),
      PORT: Joi.number().default(3000),
      AUTH_EMAIL_VERIFICATION_ENABLED: Joi.string().valid('true', 'false').required(),
      RESEND_API_KEY: Joi.string().when('AUTH_EMAIL_VERIFICATION_ENABLED', {
        is: 'true',
        then: Joi.required(),
      }),
    }),
    validationOptions: { abortEarly: true },
  }),
  ```

- **Risk:** App won't start with missing/invalid config (intended fail-fast behavior).
- **Acceptance:** Missing required env vars produce clear error at startup.

---

## Phase 2 — Refactor & Cleanup (First Sprint After Deploy)

> **Effort Total:** ~16 hours  
> **Owner:** Backend Engineer

### 2.1 Add Request Correlation ID Interceptor

- [ ] **Effort: M (2 hours)**
- Create `CorrelationIdInterceptor` that:
  1. Reads `X-Request-ID` from request headers (or generates UUID)
  2. Sets `X-Request-ID` in response headers
  3. Attaches to NestJS `Logger` context for all downstream logs
- Register globally in `main.ts`
- **Acceptance:** Every response has `X-Request-ID` header. All logs include `requestId`.

### 2.2 Migrate Rate Limiter to Redis

- [ ] **Effort: L (4 hours)**
- Replace in-memory `Map` in `RateLimiterService` with Redis-backed store
- Install `ioredis`, create `RedisModule`
- Update `RateLimiterService` to use Redis `INCR`/`EXPIRE` pattern
- **Acceptance:** Rate limits persist across app restarts and work in multi-instance deployment.

### 2.3 Add Distributed Lock for Cron Jobs

- [ ] **Effort: M (2 hours)**
- Use PostgreSQL advisory locks (`pg_advisory_xact_lock`) or Redis-based lock
- Wrap cron handlers:
  ```typescript
  @Cron('0 3 * * *')
  async handleMemberStatusSync() {
    const acquired = await this.acquireLock('member-status-sync');
    if (!acquired) return;
    try { /* ... */ } finally { await this.releaseLock('member-status-sync'); }
  }
  ```
- **Acceptance:** Only one instance processes cron at a time.

### 2.4 Add DTO ID Format Validators

- [ ] **Effort: S (1 hour)**
- Apply `@IsCuid()` or `@Matches(/^c[a-z0-9]{24}$/)` to all `*Id` fields:
  - `CreateMemberDto.branchId`, `CreateMemberDto.membershipPlanId`
  - `CreatePaymentDto.memberId`
  - `SchedulePlanChangeDto.membershipPlanId`
  - `ProductQueryDto.branchId`
  - All `:id` route params (use `ParseCuidPipe`)
- **Acceptance:** Invalid ID formats rejected at DTO layer with 400 error.

### 2.5 Deprecate Legacy Date Fields

- [ ] **Effort: S (1 hour)**
- In `UpdateMemberDto`: Mark `membershipStartAt` and `membershipEndAt` as `@IsForbidden()`
- Update service to only accept `membershipStartDate`/`membershipEndDate`
- **Risk:** Mobile clients using old field names will get 400. Coordinate with frontend team.
- **Acceptance:** Only `membershipStartDate`/`membershipEndDate` accepted.

### 2.6 Dashboard Aggregation Optimization

- [ ] **Effort: M (2 hours)**
- Replace `DashboardService.getMonthlyMembers()` in-memory counting with `groupBy`:
  ```typescript
  const monthlyCounts = await this.prisma.member.groupBy({
    by: ['createdAt'], // needs date truncation via raw SQL
    where: { tenantId, ... },
    _count: true,
  });
  ```
  Or use raw SQL: `SELECT date_trunc('month', "createdAt") as month, COUNT(*) FROM "Member" WHERE ... GROUP BY month`
- Similarly optimize `RevenueReportService.getRevenueTrend()`
- **Acceptance:** Dashboard queries use DB-level aggregation, not in-memory.

### 2.7 Add MaxLength to Unbounded String Fields

- [ ] **Effort: S (1 hour)**
- Add `@MaxLength()` to all string fields lacking it:
  - `LoginDto.password` → `@MaxLength(128)`
  - `RegisterDto.branchAddress` → `@MaxLength(500)`
  - `SignupCompleteDto.branchAddress` → `@MaxLength(500)`
  - `ProductQueryDto.category` → `@MaxLength(100)`
  - `RevenueReportQueryDto.branchId` → `@MaxLength(50)`
- **Acceptance:** Oversized strings rejected at DTO layer.

### 2.8 Fix Client IP Trust Order

- [ ] **Effort: S (30 min)**
- **File:** `backend/src/common/middleware/client-ip.middleware.ts`
- Reorder header checks: `CF-Connecting-IP` → `X-Real-IP` → `X-Forwarded-For` (first entry) → `req.ip`
- Make configurable via env: `TRUSTED_PROXY_HEADER=CF-Connecting-IP`
- **Acceptance:** Behind Cloudflare, `CF-Connecting-IP` is used. Configurable for other proxies.

### 2.9 Add Pool Configuration

- [ ] **Effort: S (30 min)**
- **File:** `backend/src/prisma/prisma.service.ts`
- Add configurable pool settings via env vars (`DB_POOL_MAX`, `DB_POOL_IDLE_TIMEOUT`, `DB_POOL_CONNECT_TIMEOUT`)
- **Acceptance:** Pool size configurable via environment.

### 2.10 Remove Dead Code

- [ ] **Effort: S (30 min)**
- Remove redundant `findMany` in `MemberStatusSyncService` (keep only `updateMany`)
- Remove unreachable defense-in-depth checks in `MembershipPlansService.updatePlanForTenant()`
- Move `@types/jsonwebtoken` from `dependencies` to `devDependencies`
- Remove redundant `luxon` or `date-fns` (consolidate to one)
- **Acceptance:** No unused imports or unreachable code paths.

---

## Phase 3 — Nice-to-Have Improvements

> **Not blocking deploy. Schedule for future sprints.**

### 3.1 Add Refresh Token Flow

- [ ] **Effort: L (6 hours)** — Improves mobile UX by avoiding frequent re-logins

### 3.2 Add Structured Logging with Pino

- [ ] **Effort: M (3 hours)** — Replace NestJS default logger with JSON-structured Pino

### 3.3 Add Prometheus Metrics

- [ ] **Effort: M (2 hours)** — HTTP latency histogram, error rate, cron success/fail

### 3.4 Products Pagination

- [ ] **Effort: S (1 hour)** — Add `take`/`skip` to `ProductsService.findAll()`

### 3.5 Auto-Renew Implementation

- [ ] **Effort: L (6 hours)** — If `autoRenew` flag is user-facing, implement actual renewal cron job

### 3.6 CI/CD Pipeline

- [ ] **Effort: L (4 hours)** — Add GitHub Actions: lint → test → build → deploy with migration

### 3.7 Add Test Coverage Thresholds

- [ ] **Effort: S (30 min)** — Add `coverageThreshold` to `jest.config.js`

---

## Summary

| Phase       | Items              | Effort    | Timeline                  |
| ----------- | ------------------ | --------- | ------------------------- |
| **Phase 0** | 3 P0 blockers      | ~4 hours  | Before deploy (mandatory) |
| **Phase 1** | 9 P1 fixes         | ~12 hours | First week                |
| **Phase 2** | 10 P2 improvements | ~16 hours | First sprint              |
| **Phase 3** | 7 nice-to-haves    | ~23 hours | Future sprints            |
