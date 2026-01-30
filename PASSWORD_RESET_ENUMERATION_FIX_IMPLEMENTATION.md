# Password Reset Enumeration Fix - Security Documentation

## Issue Fixed: P0 Email Enumeration Vulnerability

### Problem

The password reset endpoint `/api/v1/auth/password-reset/start` had a critical email enumeration vulnerability through rate limiting:

- **Existing emails**: Returned `201` status when rate limited (due to service-level cooldown)
- **Non-existing emails**: Returned `429` status when rate limited (due to controller-level throttler)

This difference allowed attackers to determine if an email address was registered in the system.

### Solution Implemented

#### Architecture Change: Service-Level Rate Limiting

We moved rate limiting from the controller layer (using `@Throttle` decorator) to the service layer:

**Before (Vulnerable):**

```
Request → ThrottlerGuard (returns 429 if exceeded) → Controller → Service → Response
```

**After (Secure):**

```
Request → Controller → Service (checks rate limit internally) → Always returns 201
```

#### Key Security Features

1. **Consistent Response**: Always returns `201` with the same message, even when rate limited:

   ```json
   {
     "ok": true,
     "message": "Eğer bu e-posta kayıtlıysa doğrulama kodu gönderildi."
   }
   ```

2. **IP-Based Rate Limiting**: Limits requests per IP address
   - Default: 20 requests per 15 minutes
   - Configurable via `RESET_START_IP_LIMIT` and `RESET_START_IP_WINDOW_MS`

3. **Email-Based Rate Limiting**: Limits requests per email (hashed)
   - Default: 5 requests per 15 minutes
   - Configurable via `RESET_START_EMAIL_LIMIT` and `RESET_START_EMAIL_WINDOW_MS`

4. **Privacy Protection**:
   - Email addresses are hashed before storing in rate limiter
   - IP addresses are obfuscated in logs (e.g., `192.168.*.*`)
   - Security events are logged without PII

5. **Timing Attack Mitigation**: When rate limited, adds a small constant delay (80ms) to reduce timing differences

6. **Anti-Enumeration Preserved**: All existing protections remain:
   - No user existence disclosure
   - Identical responses for existing/non-existing emails
   - Per-user OTP cooldown (60 seconds)
   - Daily cap (10 OTPs per day)
   - OTP hashing with bcrypt
   - TTL enforcement (10 minutes)
   - Max attempt limits (5 attempts)

### Implementation Details

#### New Components

1. **RateLimiterService** (`backend/src/auth/services/rate-limiter.service.ts`)
   - In-memory Map storage for development
   - Ready for Redis integration in production
   - Automatic cleanup of expired entries
   - Configurable limits via environment variables

2. **ClientIpMiddleware** (`backend/src/common/middleware/client-ip.middleware.ts`)
   - Extracts client IP from various sources:
     - `X-Forwarded-For` (proxies)
     - `X-Real-IP` (nginx)
     - `CF-Connecting-IP` (Cloudflare)
     - Socket remote address (fallback)
   - Handles IPv6-mapped IPv4 addresses
   - Attaches IP to request object

3. **Updated AuthService.passwordResetStart()**
   - Checks rate limits BEFORE user lookup
   - Returns same response when rate limited
   - Skips OTP creation/sending when rate limited
   - Adds constant delay for timing attack mitigation

#### Modified Files

- `backend/src/auth/auth.controller.ts`: Removed `@Throttle` decorator from password-reset/start
- `backend/src/auth/auth.service.ts`: Added rate limiting check at service level
- `backend/src/auth/auth.module.ts`: Registered `RateLimiterService`
- `backend/src/app.module.ts`: Applied `ClientIpMiddleware` globally

### Configuration

Environment variables for rate limiting (optional, with defaults):

```bash
# IP-based limits
RESET_START_IP_LIMIT=20                # Requests per IP
RESET_START_IP_WINDOW_MS=900000       # 15 minutes in milliseconds

# Email-based limits
RESET_START_EMAIL_LIMIT=5              # Requests per email
RESET_START_EMAIL_WINDOW_MS=900000    # 15 minutes in milliseconds
```

### Testing

#### E2E Tests Added

1. **Anti-enumeration under rate limiting**: Verifies both existing and non-existing emails always return 201
2. **Rate limiting enforcement**: Confirms that OTP sending is actually skipped after limit
3. **Response consistency**: Ensures response body is identical regardless of user existence

Run tests:

```bash
cd backend
npm test -- auth/password-reset.e2e-spec.ts
```

### Production Considerations

#### Recommended: Redis for Distributed Rate Limiting

For production with multiple servers, implement Redis-based storage:

```typescript
// Future: RateLimiterService with Redis
interface RateLimitStorage {
  get(key: string): Promise<RateLimitEntry | null>;
  set(key: string, value: RateLimitEntry, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
}

// Use Redis in production, Map in development
const storage = process.env.REDIS_URL
  ? new RedisRateLimitStorage()
  : new InMemoryRateLimitStorage();
```

#### Monitoring

Log analysis queries for security monitoring:

```bash
# Check for rate limit events
grep "Password reset rate limit exceeded" logs/*.log

# Count by reason
grep "Password reset rate limit exceeded" logs/*.log | \
  grep -o "reason: [a-z]*" | sort | uniq -c
```

### Security Verification Checklist

- [x] No 429 status codes returned from password-reset/start
- [x] Identical responses for existing/non-existing emails
- [x] Same response body when rate limited
- [x] Rate limiting enforced (OTP creation skipped)
- [x] IP addresses obfuscated in logs
- [x] Email addresses hashed in rate limiter
- [x] No PII in security event logs
- [x] E2E tests verify anti-enumeration
- [x] Existing OTP protections preserved
- [x] Constant delay added for timing attack mitigation

### Attack Scenarios Mitigated

#### Scenario 1: Mass Email Enumeration

**Attack**: Send 1000 requests with different emails to find valid accounts
**Mitigation**: IP-based rate limit stops after 20 requests, all return same response

#### Scenario 2: Targeted Email Verification

**Attack**: Repeatedly check if specific email exists by observing status codes
**Mitigation**: Always returns 201, no difference between existing/non-existing

#### Scenario 3: Timing Analysis

**Attack**: Measure response time differences between existing/non-existing emails
**Mitigation**: Constant delay added when rate limited, reducing timing signals

#### Scenario 4: Distributed Enumeration

**Attack**: Use multiple IPs to bypass IP-based limits
**Mitigation**: Email-based limits (5 per 15 min) prevent abuse even from different IPs

### Related Documentation

- `PASSWORD_RESET_ENUMERATION_FIX.md`: Original vulnerability analysis and solution options
- `PASSWORD_RESET_IMPLEMENTATION_SUMMARY.md`: Complete password reset flow documentation
- `PASSWORD_RESET_QA_REPORT.md`: QA test results

### Fix History

- **2026-01-30**: Implemented service-level rate limiting to fix P0 enumeration vulnerability
  - Created RateLimiterService with IP and email-based limits
  - Added ClientIpMiddleware for IP extraction
  - Updated passwordResetStart to check limits before user lookup
  - Added E2E tests for anti-enumeration under rate limiting
  - Removed controller-level @Throttle decorator from password-reset/start
