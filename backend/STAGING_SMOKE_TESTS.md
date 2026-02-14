# Staging Smoke Tests

Copy/paste curl commands and SQL checks for staging verification. Replace `BASE_URL` with your staging API URL (e.g. `https://api-staging.example.com` or `http://localhost:3000`).

```bash
# Set once for all tests
export BASE_URL="https://api-staging.example.com"
# or: export BASE_URL="http://localhost:3000"
```

---

## 1) Health

### 1.1 GET /health returns 200

```bash
curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/health"
```

**Expected:** HTTP 200, JSON with `db: "ok"`, `status: "ok"`, `timestamp`, optionally `version`.

### 1.2 Response includes db: ok

```bash
curl -s "$BASE_URL/health" | jq -e '.db == "ok"'
```

**Expected:** Exit 0 (no output).

### 1.3 Response header includes X-Request-Id

```bash
curl -s -i "$BASE_URL/health" | grep -i "x-request-id"
```

**Expected:** `X-Request-Id: <uuid-or-custom-id>`

---

## 2) RequestId reuse

Send `X-Request-Id: test-123` and verify response uses same value:

```bash
curl -s -i -H "X-Request-Id: test-123" "$BASE_URL/health" | grep -i "x-request-id"
```

**Expected:** `X-Request-Id: test-123`

---

## 3) Error shape (404)

Hit a non-existing route; verify JSON includes `requestId` and `timestamp`:

```bash
curl -s "$BASE_URL/api/v1/nonexistent-route-xyz" | jq .
```

**Expected:** JSON with `statusCode: 404`, `error`, `message`, `requestId`, `timestamp`. No stack trace or raw SQL.

---

## 4) Auth sanity

### 4.1 Login (or token acquisition)

Create a test tenant and user first (via seed or admin tool), then:

```bash
# Replace with real staging credentials
curl -s -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@staging.example.com","password":"YourSecurePass123!"}' | jq .
```

**Expected:** 201, `accessToken`, `refreshToken`, `user` with `email`, `tenantId`, `role`.

### 4.2 Protected endpoint returns 200

```bash
# Replace TOKEN with accessToken from 4.1
export TOKEN="<access-token>"
curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/api/v1/branches" \
  -H "Authorization: Bearer $TOKEN" | tail -1
```

**Expected:** `HTTP_CODE:200`

### 4.3 Logs include tenantId/userId (no PII)

Check server logs for a request to `/api/v1/branches` (or similar). Expect structured JSON line with `tenantId` and `userId` (opaque IDs, not email/phone). No `Authorization` header or token in logs.

---

## 5) Tenant isolation sanity

Using two tenants (A and B) with users and branches:

### 5.1 Tenant A user accesses Tenant B branch by ID → 404

```bash
# TOKEN_A = token for Tenant A user
# BRANCH_B_ID = branch ID belonging to Tenant B
curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/api/v1/branches/$BRANCH_B_ID" \
  -H "Authorization: Bearer $TOKEN_A" | tail -1
```

**Expected:** `HTTP_CODE:404` (not 403, not revealing existence).

### 5.2 Tenant B user accesses Tenant A branch by ID → 404

```bash
curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/api/v1/branches/$BRANCH_A_ID" \
  -H "Authorization: Bearer $TOKEN_B" | tail -1
```

**Expected:** `HTTP_CODE:404`

### 5.3 Tenant A user accesses own branch → 200

```bash
curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/api/v1/branches/$BRANCH_A_ID" \
  -H "Authorization: Bearer $TOKEN_A" | tail -1
```

**Expected:** `HTTP_CODE:200`

---

## 6) PR-2 uniqueness guard (DB)

Run against staging PostgreSQL:

```sql
SELECT "memberId", "effectiveDateDay", COUNT(*)
FROM "MemberPlanChangeHistory"
WHERE "changeType" = 'APPLIED'
GROUP BY "memberId", "effectiveDateDay"
HAVING COUNT(*) > 1;
```

**Expected:** 0 rows (no duplicate APPLIED per member per effective date).

---

## 7) Cron lock behavior (staging rehearsal)

### Goal

Verify that with two instances running, only one acquires the advisory lock per member; the other skips.

### Option A: Two instances, temporary cron every minute

1. **Staging-only change:** In `membership-plan-change-scheduler.service.ts`, temporarily change:
   ```ts
   @Cron('0 2 * * *')  // original
   ```
   to:
   ```ts
   @Cron('* * * * *')   // every minute, staging only
   ```
2. Rebuild and deploy.
3. Run two instances:
   - Instance 1: `PORT=3000` (or default)
   - Instance 2: `PORT=3001` (e.g. `PORT=3001 node dist/main.js` in a second terminal, or second container)
4. Wait for the next minute. Check logs on both instances.
5. **Expected:** One instance logs `Lock acquired: cron:plan-change:<memberId>` and applies changes; the other logs `Skipped member <id> (lock held by another instance)` or `Lock skipped (held by another instance)`.
6. **Revert** the cron change before promoting to production.

### Option B: Two containers (Docker)

```bash
# Start first container
docker run -d --name api-1 -p 3000:3000 -e PORT=3000 --env-file .env.staging gym-backend:staging

# Start second container (different port)
docker run -d --name api-2 -p 3001:3000 -e PORT=3000 --env-file .env.staging gym-backend:staging

# Tail logs from both
docker logs -f api-1 &
docker logs -f api-2 &
```

When cron runs (every minute if modified), one should show lock acquisition, the other skip.

### Option C: Call internal method from script (no cron change)

Create a one-off script that boots the Nest app and calls the scheduler:

```ts
// scripts/trigger-plan-change-cron.ts (staging only)
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { MembershipPlanChangeSchedulerService } from '../src/members/services/membership-plan-change-scheduler.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const scheduler = app.get(MembershipPlanChangeSchedulerService);
  await (scheduler as any).applyScheduledMembershipPlanChanges();
  await app.close();
}
main();
```

Run twice in parallel (e.g. two terminals) against the same DB:

```bash
npx ts-node -r tsconfig-paths/register scripts/trigger-plan-change-cron.ts &
npx ts-node -r tsconfig-paths/register scripts/trigger-plan-change-cron.ts &
wait
```

Check logs: one run should acquire locks and apply; the other should skip members due to lock contention.

---

## Quick run script (1–4)

```bash
#!/bin/bash
BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "1. Health 200 + db ok"
curl -s "$BASE_URL/health" | jq -e '.db == "ok"' && echo "OK" || echo "FAIL"

echo "2. X-Request-Id header"
curl -s -i "$BASE_URL/health" | grep -qi "x-request-id" && echo "OK" || echo "FAIL"

echo "3. X-Request-Id reuse"
curl -s -i -H "X-Request-Id: test-123" "$BASE_URL/health" | grep -q "X-Request-Id: test-123" && echo "OK" || echo "FAIL"

echo "4. 404 error shape"
curl -s "$BASE_URL/api/v1/nonexistent-xyz" | jq -e 'has("requestId") and has("timestamp")' && echo "OK" || echo "FAIL"
```
