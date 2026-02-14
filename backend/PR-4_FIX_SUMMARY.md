# PR-4 Blocker Fixes Summary

Minimal, production-safe patches for PR-4 blockers before production deploy.

## Fix #1 — Trust Proxy (Rate Limiting Correct IP)

**Goal:** Ensure `req.ip` reflects real client IP when behind reverse proxy.

**Changes in `src/main.ts`:**
- Import `NestExpressApplication` from `@nestjs/platform-express`
- Bootstrap with `NestFactory.create<NestExpressApplication>(AppModule)`
- After app creation, before helmet/CORS:
  ```ts
  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }
  ```
- Trust proxy is **not** enabled in development.

## Fix #2 — CORS Configuration

**Goal:** Use `CORS_ORIGINS` when defined, fallback to `FRONTEND_URL`.

**Changes in `src/main.ts`:**
- Replace CORS setup with:
  ```ts
  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : process.env.FRONTEND_URL || 'http://localhost:5173';
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });
  ```
- Precedence: `CORS_ORIGINS` → `FRONTEND_URL` → `http://localhost:5173`
- Matches `docs/PRODUCTION_ENV.md`.

## Fix #3 — 429 Responses Include requestId

**Goal:** Throttler 429 responses include `requestId` for support traceability.

**Changes:**
- `src/common/filters/throttler-exception.filter.ts`
- `src/common/filters/payment-throttler-exception.filter.ts`

Both filters now return:
```json
{
  "statusCode": 429,
  "message": "...",
  "requestId": "<from request.requestId or 'unknown'>",
  "timestamp": "<ISO8601>"
}
```
Shape matches `AllExceptionsFilter`.

## Test Updates

- **`test/pr4-blockers.e2e-spec.ts`** (new):
  - Trust proxy: `NODE_ENV=production` → `app.get('trust proxy') === 1`
  - Trust proxy: `NODE_ENV=development` → trust proxy not set
  - CORS: `CORS_ORIGINS` defined → multiple origins allowed
  - CORS: `CORS_ORIGINS` not defined → `FRONTEND_URL` used

- **`test/pr4-production-safety.e2e-spec.ts`**:
  - 429 response includes `requestId` and `timestamp`
  - Sends `X-Request-Id` header and asserts it appears in response

## Files Changed

| File | Change |
|------|--------|
| `src/main.ts` | Trust proxy, NestExpressApplication, CORS logic |
| `src/common/filters/throttler-exception.filter.ts` | Add requestId, timestamp |
| `src/common/filters/payment-throttler-exception.filter.ts` | Add requestId, timestamp |
| `test/pr4-blockers.e2e-spec.ts` | New: trust proxy + CORS tests |
| `test/pr4-production-safety.e2e-spec.ts` | Assert 429 includes requestId |
