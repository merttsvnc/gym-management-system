# PR-3 Implementation Summary: Production Observability & Reliability

## Overview

PR-3 adds request correlation, structured logging, health checks, and hardened exception handling to the NestJS backend. All changes are production-safe with minimal behavior impact on existing business logic.

---

## What Changed

### 1. RequestId (HTTP Correlation) End-to-End

- **New:** `src/common/middleware/request-id.middleware.ts`
  - Generates `requestId` per incoming HTTP request (or reuses `X-Request-Id` if provided, sanitized to 128 chars)
  - Uses `crypto.randomUUID()` with fallback to `timestamp+random`
  - Attaches to `req.requestId`
  - Sets response header `X-Request-Id` on every response

### 2. Structured Logging

- **New:** `src/common/interceptors/http-logging.interceptor.ts`
  - Logs one structured JSON line per request on response finish
  - Fields: `requestId`, `method`, `path`, `statusCode`, `durationMs`, `tenantId?`, `userId?`
  - `tenantId` and `userId` taken from `req.user` when present (JWT)
  - `userId` masked when it looks like email/phone; UUIDs logged as opaque
  - Log levels: 2xx/3xx → `log`, 4xx → `warn` (404 → `log` to avoid spam), 5xx → `error`
  - Does **not** log headers, body, Authorization, tokens, passwords, or OTPs

### 3. Health Endpoint

- **New:** `src/health/health.controller.ts`, `src/health/health.module.ts`
  - Route: `GET /health` (excluded from `/api/v1` prefix)
  - Response: `{ status, db, timestamp, version? }`
  - DB check: `prisma.$queryRaw\`SELECT 1\`` with 2s timeout
  - 200 when DB ok; 503 when DB down or timeout
  - Optional `version` from `APP_VERSION` env or `package.json`

### 4. Global Exception Filter Hardening

- **New:** `src/common/filters/all-exceptions.filter.ts`
- **Replaced:** `HttpExceptionFilter` (kept for reference; no longer used globally)
- Response shape:
  ```json
  {
    "statusCode": 409,
    "error": "Conflict",
    "message": "Conflict",
    "requestId": "abc-123",
    "timestamp": "2025-02-14T..."
  }
  ```
- Prisma mapping:
  - `P2002` → 409 Conflict
  - `P2025` → 404 Not Found
  - Others → 500 Internal Server Error
- Production: hides internal messages for unknown errors (`"Internal server error"`)
- Non-production: allows more detail (still no secrets)
- Logs stack traces server-side only for 5xx
- Never logs Authorization tokens
- `requestId` included in every error payload for support traceability

### 5. Wiring

- **main.ts:** Uses `AllExceptionsFilter`; adds `health` to `setGlobalPrefix` exclude
- **app.module.ts:**
  - Registers `RequestIdMiddleware` (before `ClientIpMiddleware`)
  - Registers `HttpLoggingInterceptor` via `APP_INTERCEPTOR`
  - Imports `HealthModule`

---

## File-by-File Changes

| File | Action |
|------|--------|
| `src/common/middleware/request-id.middleware.ts` | **New** |
| `src/common/interceptors/http-logging.interceptor.ts` | **New** |
| `src/common/filters/all-exceptions.filter.ts` | **New** |
| `src/health/health.controller.ts` | **New** |
| `src/health/health.module.ts` | **New** |
| `src/app.module.ts` | Modified: middleware, interceptor, HealthModule |
| `src/main.ts` | Modified: AllExceptionsFilter, exclude `health` |
| `test/utils/test-app.ts` | Modified: AllExceptionsFilter, exclude `health` |
| `test/health-observability.e2e-spec.ts` | **New** (PR-3 e2e tests) |
| `test/*.e2e-spec.ts` (tenants, branches, etc.) | Modified: AllExceptionsFilter, exclude `health` |
| `src/common/filters/http-exception.filter.ts` | **Unchanged** (kept; no longer used globally) |

---

## How to Verify Locally

### 1. Start the server

```bash
cd backend && npm run start:dev
```

### 2. RequestId header

```bash
curl -i http://localhost:3000/health
# Expect: X-Request-Id header in response

curl -i -H "X-Request-Id: my-custom-id" http://localhost:3000/health
# Expect: X-Request-Id: my-custom-id
```

### 3. Health endpoint

```bash
curl http://localhost:3000/health
# Expect: {"status":"ok","db":"ok","timestamp":"...","version":"0.0.1"}
```

### 4. Error response shape (404)

```bash
curl http://localhost:3000/api/v1/nonexistent
# Expect: {"statusCode":404,"error":"Not Found","message":"...","requestId":"...","timestamp":"..."}
```

### 5. Structured logs

Check server logs for JSON lines like:

```json
{"requestId":"...","method":"GET","path":"/health","statusCode":200,"durationMs":5,"timestamp":"..."}
```

---

## Example Log Lines

**Success (2xx):**
```json
{"requestId":"a1b2c3d4-...","method":"GET","path":"/health","statusCode":200,"durationMs":3}
```

**Authenticated request:**
```json
{"requestId":"...","method":"GET","path":"/api/v1/tenants/current","statusCode":200,"durationMs":12,"tenantId":"tenant-uuid","userId":"user-uuid"}
```

**4xx (warn):**
```json
{"requestId":"...","method":"POST","path":"/api/v1/auth/login","statusCode":401,"durationMs":5}
```

**5xx (error):**
```json
{"requestId":"...","method":"GET","path":"/api/v1/...","statusCode":500,"durationMs":120}
```

---

## Security Notes

### What is masked / not logged

- **Never logged:** Authorization header, Bearer tokens, passwords, OTPs, request/response bodies
- **userId:** Masked when it looks like email (`u***@***.com`) or phone (`***1234`); UUIDs logged as opaque
- **tenantId:** Logged as-is (opaque UUID)
- **Production errors:** Internal stack traces, SQL, raw Prisma messages never sent to clients

### What is logged

- `requestId`, `method`, `path`, `statusCode`, `durationMs`
- `tenantId`, `userId` (masked when PII-like) when available from JWT
- Server-side: stack traces for 5xx (for debugging; not in client response)

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `APP_VERSION` | Optional; included in `GET /health` response when set |
| `NODE_ENV` | `production` enables stricter error hiding (no internal messages to clients) |

No new required env vars. Existing `DATABASE_URL` is used for health DB check.

---

## Tests

- **test/health-observability.e2e-spec.ts**
  1. `GET /health` returns 200 with `db: "ok"` when Prisma resolves
  2. `GET /health` returns 503 with `db: "down"` when Prisma rejects (mocked)
  3. `X-Request-Id` present in responses
  4. Incoming `X-Request-Id` is reused when provided
  5. Exception filter includes `requestId` in 404 error payload

Run:

```bash
npm run test:e2e -- test/health-observability.e2e-spec.ts
```
