# PR-4: Production Safety Bundle - Summary

## What Changed

### A) ENV / Config Validation (Fail-Fast)

- **Created** `src/config/env.ts` – Zod-based validation of `process.env` on boot
- **Required variables** (app fails to start if missing):
  - `NODE_ENV` (development | test | staging | production)
  - `PORT` (default: 3000)
  - `DATABASE_URL`
  - `JWT_ACCESS_SECRET` (min 32 chars, no fallback)
- **Optional**: `APP_VERSION`, `CORS_ORIGINS`, `FRONTEND_URL`, `CRON_ENABLED` (default: true)
- **Production rule**: `AUTH_EMAIL_VERIFICATION_ENABLED` must be `true` when `NODE_ENV=production`
- **main.ts**: Calls `validateEnv()` before `NestFactory.create()` – fail-fast on invalid env
- **Updated** `backend/.env.example` – template with no secrets
- **Created** `docs/PRODUCTION_ENV.md` – documentation for each env var

### B) CRON Kill Switch

- **Added** `CRON_ENABLED` env var (default: `true`)
- **MembershipPlanChangeSchedulerService**: At job start, checks `CRON_ENABLED`; if `false`, logs `[correlationId] Cron disabled by env` and returns
- **MemberStatusSyncService**: Same behavior
- Existing advisory locks and uniqueness logic unchanged

### C) Rate Limiting (Auth Endpoints)

- **ThrottlerModule**: Default 100 req/min; auth routes use `@Throttle()` for custom limits
- **Auth limits** (per IP, per instance):
  - `POST /auth/login`: 10/min
  - `POST /auth/signup/verify-otp`: 10/min
  - `POST /auth/password-reset/verify-otp`: 10/min
  - `POST /auth/password-reset/start`: 5/min
  - `POST /auth/password-reset/complete`: 5/min
- **Excluded**: `GET /health` via `@SkipThrottle()`
- **Limitation**: Per-instance only (no Redis); multi-instance deployments share no state

### D) Security Headers (Helmet)

- **Added** `helmet` in `main.ts` before CORS
- **Options**: `hidePoweredBy`, `noSniff`, `frameguard: { action: 'deny' }`
- **HSTS**: Enabled only when `NODE_ENV=production` (avoids local dev issues)

---

## Env Vars Added/Required

| Variable        | Required | Default | Description                          |
|----------------|----------|---------|--------------------------------------|
| `CRON_ENABLED` | No       | `true`  | Set to `false` to disable all crons  |

**Required at startup** (unchanged from before, now validated):

- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `JWT_ACCESS_SECRET` (min 32 chars)

---

## How to Verify Locally

```bash
# 1. Config validation – missing JWT_ACCESS_SECRET
unset JWT_ACCESS_SECRET && npm run start
# Expected: "Environment validation failed: JWT_ACCESS_SECRET: ..."

# 2. Valid env – app starts
# Ensure .env has DATABASE_URL, JWT_ACCESS_SECRET (32+ chars), NODE_ENV
npm run start:dev

# 3. CRON kill switch
CRON_ENABLED=false npm run start:dev
# Expected: Cron jobs log "Cron disabled by env" and exit early

# 4. Rate limiting – login 429
for i in {1..12}; do curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"x@x.com","password":"x"}'; done
# Expected: 401 or 500 for first 10, then 429

# 5. Health not rate limited
for i in {1..20}; do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/health; done
# Expected: All 200

# 6. Security headers
curl -I http://localhost:3000/health
# Expected: X-Content-Type-Options: nosniff, X-Frame-Options: DENY
```

---

## Known Limitations

1. **Rate limiting**: Per-instance only. Without Redis, limits are not shared across instances.
2. **Secrets**: Never logged; validation errors do not include secret values.

---

## Rollback Notes

1. **Config validation**: Remove `validateEnv()` call from `main.ts` and delete `src/config/env.ts`.
2. **CRON kill switch**: Remove `CRON_ENABLED` checks from `MembershipPlanChangeSchedulerService` and `MemberStatusSyncService`.
3. **Rate limiting**: Revert `auth.controller.ts` and `app.module.ts` Throttler config; remove `@SkipThrottle()` from health controller.
4. **Helmet**: Remove `app.use(helmet(...))` from `main.ts`.

---

## File-by-File Change List

| File | Change |
|------|--------|
| `src/config/env.ts` | **NEW** – Zod env validation |
| `src/config/configuration.ts` | **NEW** – Config factory (optional use) |
| `src/config/env.spec.ts` | **NEW** – Unit tests for validateEnv |
| `src/main.ts` | Added validateEnv, helmet, use validated port |
| `src/app.module.ts` | Updated ThrottlerModule default config |
| `src/auth/auth.controller.ts` | Updated @Throttle limits, added ThrottlerGuard to password-reset/start and password-reset/complete |
| `src/health/health.controller.ts` | Added @SkipThrottle() |
| `src/members/services/membership-plan-change-scheduler.service.ts` | Added CRON_ENABLED check |
| `src/members/member-status-sync.service.ts` | Added CRON_ENABLED check |
| `src/members/services/membership-plan-change-scheduler.service.spec.ts` | Added ConfigService mock, CRON_ENABLED=false test |
| `src/members/member-status-sync.service.spec.ts` | Added ConfigService mock, CRON_ENABLED=false test |
| `src/main.spec.ts` | Updated to test validateEnv |
| `test/jest-e2e.setup.ts` | Set NODE_ENV, JWT_ACCESS_SECRET for e2e |
| `test/pr4-production-safety.e2e-spec.ts` | **NEW** – E2E tests for rate limit, helmet, health |
| `.env.example` | **NEW** – Template (no secrets) |
| `docs/PRODUCTION_ENV.md` | **NEW** – Env var documentation |
| `package.json` | Added zod, helmet |
