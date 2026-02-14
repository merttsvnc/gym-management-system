# Deployment Gate Checklist

**Project:** gym-management-system  
**Date:** 2026-02-14  
**Linked:** `BACKEND_FIX_PLAN.md` (Phase 0 must be complete), `BACKEND_PRODUCTION_READINESS_REPORT.md`

---

## Pre-Deploy Checklist

> All items must be ✅ before proceeding to deploy.

### Security Gate

- [ ] JWT secret fallback removed from `auth.module.ts` and `jwt.strategy.ts`
- [ ] JWT secrets rotated and set in production environment (min 32 chars each)
- [ ] Resend API key rotated and set in production environment
- [ ] Cloudflare R2 credentials rotated and set in production environment
- [ ] `CORS_ORIGINS` env var set to production domain(s)
- [ ] `AUTH_EMAIL_VERIFICATION_ENABLED=true` in production env
- [ ] `NODE_ENV=production` in production env
- [ ] No `.env` file on production server (use platform secrets manager)
- [ ] `create-test-user.ts` cannot run in production (guard added or script removed)

### Environment Variables Verified

```bash
# Required — app will refuse to start if missing
DATABASE_URL=postgresql://...
JWT_ACCESS_SECRET=<min 32 chars>
JWT_SIGNUP_SECRET=<min 32 chars>
JWT_RESET_SECRET=<min 32 chars>
AUTH_EMAIL_VERIFICATION_ENABLED=true
NODE_ENV=production
CORS_ORIGINS=https://your-production-domain.com

# Required for email
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@yourdomain.com

# Required for file uploads
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...
R2_PUBLIC_BASE_URL=...

# Optional (have sane defaults)
PORT=3000
JWT_ACCESS_EXPIRES_IN=900s
UPLOAD_MAX_FILE_SIZE_MB=2
UPLOAD_ALLOWED_MIME_TYPES=image/jpeg,image/png,image/webp
```

- [ ] All required env vars set and verified
- [ ] Database user has appropriate permissions (not superuser)
- [ ] Database connection tested from production network

### Code Quality Gate

- [ ] Phase 0 fixes in `BACKEND_FIX_PLAN.md` implemented
- [ ] `npm run lint` passes with 0 errors
- [ ] `npm run test` passes (unit tests)
- [ ] `npm run build` succeeds without errors
- [ ] `npm audit` shows 0 high/critical vulnerabilities (or acknowledged)
- [ ] No `console.log` in production code (only in scripts/)

### Database Gate

- [ ] Production database exists and is accessible
- [ ] Prisma migrations are up to date: `npx prisma migrate status`
- [ ] No pending destructive migrations
- [ ] Database backup taken before deployment
- [ ] Connection pooling configured (DB_POOL_MAX if using custom pool)

---

## Deploy Steps

### Step 1: Build

```bash
cd backend
npm ci --production=false   # Install all dependencies (including dev for build)
npx prisma generate         # Generate Prisma client
npm run build               # Compile TypeScript → dist/
```

- [ ] Build completed without errors
- [ ] `dist/main.js` exists

### Step 2: Run Migrations

```bash
# IMPORTANT: Run from the backend directory with DATABASE_URL set
npx prisma migrate deploy
```

- [ ] Migrations applied successfully
- [ ] No migration errors in output
- [ ] Verify with: `npx prisma migrate status` — all migrations applied

### Step 3: Start Application

```bash
# Production start command
NODE_ENV=production node dist/main.js
```

- [ ] Application starts without errors
- [ ] No FATAL errors in startup logs
- [ ] Port binding successful (check logs for `Nest application successfully started`)

### Step 4: Verify Startup Checks

The application performs these checks at startup:

1. `AUTH_EMAIL_VERIFICATION_ENABLED=true` in production (enforced in `main.ts`)
2. JWT secrets present (after Phase 0 fix)
3. Database connection established (Prisma connect)

- [ ] All startup checks passed

---

## Post-Deploy Validation (Smoke Tests)

> Run within 5 minutes of deployment.

### Health Check

```bash
curl -s https://your-api-domain.com/ | jq .
# Expected: "Hello World!" (or health check response if implemented)
```

- [ ] Health endpoint responds with 200

### Auth Flow

```bash
# 1. Login with known test account
curl -s -X POST https://your-api-domain.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yourgym.com","password":"YourPassword123!"}' | jq .accessToken
# Expected: JWT token returned

# 2. Verify /auth/me
curl -s https://your-api-domain.com/api/v1/auth/me \
  -H "Authorization: Bearer <token>" | jq .
# Expected: User object with tenant info
```

- [ ] Login returns access token
- [ ] `/auth/me` returns user info with correct tenant

### Tenant Isolation

```bash
# Attempt to access a member from a different tenant (should return 404)
curl -s https://your-api-domain.com/api/v1/members/nonexistent-id \
  -H "Authorization: Bearer <token>"
# Expected: 404 Not Found
```

- [ ] Cross-tenant access returns 404

### Core CRUD Operations

```bash
# List members
curl -s "https://your-api-domain.com/api/v1/members?page=1&limit=5" \
  -H "Authorization: Bearer <token>" | jq '.pagination'
# Expected: Paginated response

# List payments
curl -s "https://your-api-domain.com/api/v1/payments?page=1&limit=5" \
  -H "Authorization: Bearer <token>" | jq '.pagination'
# Expected: Paginated response
```

- [ ] Members list works
- [ ] Payments list works

### Rate Limiting

```bash
# Attempt 6 rapid login attempts (should get throttled on 6th)
for i in {1..6}; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST https://your-api-domain.com/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}';
done
# Expected: First 5 return 401, 6th returns 429
```

- [ ] Rate limiting active on login endpoint

### CORS Verification

```bash
curl -s -I -X OPTIONS https://your-api-domain.com/api/v1/auth/login \
  -H "Origin: https://your-production-domain.com" \
  -H "Access-Control-Request-Method: POST" | grep -i access-control
# Expected: Access-Control-Allow-Origin matches production domain

curl -s -I -X OPTIONS https://your-api-domain.com/api/v1/auth/login \
  -H "Origin: https://evil-site.com" \
  -H "Access-Control-Request-Method: POST" | grep -i access-control
# Expected: No Access-Control-Allow-Origin header (or blocked)
```

- [ ] CORS allows production origin
- [ ] CORS blocks unauthorized origins

### File Upload (if R2 configured)

```bash
# Upload a test image
curl -s -X POST https://your-api-domain.com/api/v1/uploads/member-photo \
  -H "Authorization: Bearer <token>" \
  -F "file=@test-image.jpg" | jq .
# Expected: Public URL returned
```

- [ ] File upload to R2 works (or LocalDisk fallback works)

### Email Verification

- [ ] Trigger signup flow — verify OTP email is received via Resend
- [ ] Trigger password reset flow — verify reset email is received

---

## Rollback Plan

### Immediate Rollback (< 5 min)

If critical issues are found during smoke tests:

1. **Stop the new deployment:**

   ```bash
   # Kill the new process / stop the container
   kill <pid>  # or: docker stop <container>
   ```

2. **Restart previous version:**

   ```bash
   # If using blue/green: switch back to previous deployment
   # If using rolling: restart with previous image/artifact
   ```

3. **Rollback database migrations (if needed):**

   ```bash
   # ONLY if the new migration caused data issues
   # Check which migration was last applied:
   npx prisma migrate status

   # Manually revert (Prisma doesn't support automatic rollback)
   # Apply a reverse SQL script if prepared
   psql $DATABASE_URL -f rollback_migration_YYYYMMDD.sql
   ```

   > ⚠️ **Note:** Prisma Migrate does not support automatic rollback. Prepare reverse SQL scripts for any destructive migrations BEFORE deploying.

4. **Verify rollback:**
   - [ ] Previous version is running
   - [ ] Health check passes
   - [ ] Login works
   - [ ] Data integrity verified

### Rollback Decision Matrix

| Symptom                     | Action                                    |
| --------------------------- | ----------------------------------------- |
| App won't start             | Check env vars, roll back code            |
| 500 errors on all endpoints | Check logs, roll back code                |
| Migration failure           | Roll back migration with reverse SQL      |
| Login broken                | Check JWT secrets, roll back auth changes |
| Data corruption             | Stop immediately, restore from backup     |
| Performance degradation     | Monitor for 15 min, scale up if needed    |
| Non-critical feature broken | Keep deployed, hotfix forward             |

---

## Monitoring Checklist — First 24 Hours

### Hour 0-1 (Immediately After Deploy)

- [ ] Application logs show no ERROR level entries
- [ ] No unhandled promise rejections
- [ ] Memory usage stable (no upward trend)
- [ ] CPU usage normal
- [ ] Database connection count within pool limits
- [ ] Response latency within expected range (< 500ms avg)

### Hour 1-6

- [ ] Cron job `MemberStatusSync` (03:00 UTC) runs successfully (check logs)
- [ ] Cron job `PlanChangeScheduler` (03:30 UTC) runs successfully
- [ ] No duplicate cron executions (if multi-instance)
- [ ] Email delivery working (check Resend dashboard)
- [ ] R2 uploads working (check Cloudflare dashboard)
- [ ] No rate limit false positives reported by users

### Hour 6-24

- [ ] Error rate < 1% of total requests
- [ ] No tenant data leakage incidents
- [ ] IdempotencyKey cleanup working (old keys expiring)
- [ ] Database query latency stable
- [ ] No disk space issues (logs, uploads)
- [ ] User reports reviewed — no critical bugs

### Key Log Patterns to Watch

```bash
# Search for errors in application logs
grep -i "error\|fatal\|exception\|unhandled" /path/to/app.log | tail -50

# Search for billing guard blocks (indicates tenant issues)
grep "TENANT_BILLING_LOCKED\|TRIAL_EXPIRED" /path/to/app.log | tail -20

# Search for rate limit triggers
grep "Rate limit exceeded" /path/to/app.log | tail -20

# Search for Prisma errors
grep "PrismaClient" /path/to/app.log | tail -20
```

### Alert Thresholds (if monitoring is available)

| Metric                 | Warning                  | Critical               |
| ---------------------- | ------------------------ | ---------------------- |
| Error rate (5xx)       | > 2% of requests         | > 5% of requests       |
| Response latency (p95) | > 1000ms                 | > 3000ms               |
| Memory usage           | > 80% of container limit | > 95%                  |
| DB connections         | > 80% of pool max        | > 95%                  |
| Cron job failure       | 1 consecutive failure    | 3 consecutive failures |

---

## Sign-Off

| Role            | Name | Date | Approved |
| --------------- | ---- | ---- | -------- |
| Backend Lead    |      |      | ☐        |
| Security Review |      |      | ☐        |
| DevOps/SRE      |      |      | ☐        |
| Product Owner   |      |      | ☐        |

> **Deploy only after all Phase 0 items are complete and all sign-offs obtained.**
