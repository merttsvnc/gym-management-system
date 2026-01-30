# Critical Fix: Rate Limiter Enumeration Leak

## Problem

The rate limiter exposes email existence through status code differences:
- **Existing email** (within cooldown): Returns `201` with generic message
- **Non-existing email** (rate limited): Returns `429` with "Too many requests"

## Root Cause

The `@Throttle()` decorator on the controller applies BEFORE the service logic:

```
Request → ThrottlerGuard (IP-based, returns 429 if exceeded)
       → Controller
       → Service (cooldown/daily cap logic)
       → Response (always 201 for anti-enumeration)
```

For existing users within cooldown:
- Service returns early with success (no email sent)
- Response: `201`

For non-existing users OR rate-limited requests:
- If rate limit not hit: Service logic runs, returns `201`
- If rate limit hit: ThrottlerGuard returns `429` BEFORE service

## Security Impact

**Severity:** HIGH  
**Attack Vector:** Email enumeration  

Attacker can:
1. Rapidly send requests for different emails
2. Observe status codes:
   - `201` repeatedly → Email exists (cooldown protection)
   - `429` → Email may not exist OR rate limited

## Solution Options

### Option 1: Move Rate Limiting Inside Service (Recommended)

Remove `@Throttle()` decorator and implement IP-based rate limiting in service:

```typescript
// auth.service.ts
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AuthService {
  private readonly rateLimitStore = new Map<string, { count: number; resetAt: number }>();
  private readonly logger = new Logger(AuthService.name);

  async passwordResetStart(dto: PasswordResetStartDto, clientIp: string) {
    // Check rate limit FIRST (before any user lookup)
    const rateKey = `password-reset:${clientIp}`;
    const now = Date.now();
    const limit = 5;
    const windowMs = 15 * 60 * 1000; // 15 minutes

    const existing = this.rateLimitStore.get(rateKey);
    if (existing && existing.resetAt > now) {
      if (existing.count >= limit) {
        // Rate limited - but STILL return same response for anti-enumeration
        this.logger.warn(`Rate limit exceeded for IP ${clientIp}`);
        
        // Add small delay to prevent timing attacks
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Return SAME response as success case
        return {
          ok: true,
          message: 'Eğer bu e-posta kayıtlıysa doğrulama kodu gönderildi.',
        };
      }
      existing.count++;
    } else {
      this.rateLimitStore.set(rateKey, { count: 1, resetAt: now + windowMs });
    }

    // NOW proceed with user lookup
    const normalizedEmail = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (user) {
      await this.passwordResetOtpService.createAndSendOtp(user.id, normalizedEmail);
    } else {
      // Add small delay for non-existent users
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    return {
      ok: true,
      message: 'Eğer bu e-posta kayıtlıysa doğrulama kodu gönderildi.',
    };
  }
}
```

### Option 2: Custom Throttler with Anti-Enumeration Response

Create a custom throttler that always returns `201`:

```typescript
// anti-enum-throttler.guard.ts
import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class AntiEnumThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return await super.canActivate(context);
    } catch (error) {
      // If rate limit exceeded, DON'T throw 429
      // Instead, inject a flag for the controller to handle
      const request = context.switchToHttp().getRequest();
      request.rateLimited = true;
      return true; // Allow request to continue
    }
  }
}
```

Then in controller:
```typescript
@Post('password-reset/start')
@UseGuards(AntiEnumThrottlerGuard)
async passwordResetStart(@Body() dto: PasswordResetStartDto, @Req() req) {
  if (req.rateLimited) {
    // Rate limited - return same success response with small delay
    await new Promise(resolve => setTimeout(resolve, 100));
    return {
      ok: true,
      message: 'Eğer bu e-posta kayıtlıysa doğrulama kodu gönderildi.',
    };
  }
  
  return await this.authService.passwordResetStart(dto);
}
```

### Option 3: Remove Controller-Level Rate Limiting (Quick Fix)

Simply remove `@Throttle()` and rely only on cooldown/daily cap:

```typescript
// auth.controller.ts

@Post('password-reset/start')
// Remove: @UseGuards(ThrottlerGuard)
// Remove: @Throttle({ default: { limit: 5, ttl: 900000 } })
async passwordResetStart(@Body() dto: PasswordResetStartDto) {
  return await this.authService.passwordResetStart(dto);
}
```

**Pros:** Immediate fix, no enumeration leak  
**Cons:** Less protection against brute-force (relies only on cooldown)

## Recommended Approach

**Use Option 1** (Service-level rate limiting) because:
1. ✅ Maintains anti-enumeration
2. ✅ Applies rate limiting uniformly
3. ✅ Single source of truth for limits
4. ✅ Easy to test

## Implementation

```typescript
// File: backend/src/auth/auth.service.ts

import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AuthService {
  // In-memory rate limit store (use Redis in production)
  private readonly rateLimitStore = new Map<
    string,
    { count: number; resetAt: number }
  >();
  
  private readonly logger = new Logger(AuthService.name);

  constructor(/* ... */) {
    // Clean up expired rate limit entries every 5 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.rateLimitStore.entries()) {
        if (value.resetAt < now) {
          this.rateLimitStore.delete(key);
        }
      }
    }, 5 * 60 * 1000);
  }

  private async checkRateLimit(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<boolean> {
    const now = Date.now();
    const existing = this.rateLimitStore.get(key);

    if (existing && existing.resetAt > now) {
      if (existing.count >= limit) {
        return false; // Rate limited
      }
      existing.count++;
      return true;
    }

    this.rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  async passwordResetStart(
    dto: PasswordResetStartDto,
    clientIp?: string,
  ) {
    const normalizedEmail = dto.email.toLowerCase().trim();
    
    // Generic response for anti-enumeration
    const genericResponse = {
      ok: true,
      message: 'Eğer bu e-posta kayıtlıysa doğrulama kodu gönderildi.',
    };

    // Apply rate limiting (5 per 15 minutes per IP)
    if (clientIp) {
      const rateKey = `password-reset:${clientIp}`;
      const allowed = await this.checkRateLimit(rateKey, 5, 15 * 60 * 1000);
      
      if (!allowed) {
        this.logger.warn(`Rate limit exceeded for password reset from IP ${clientIp}`);
        // Add delay to prevent timing attacks
        await new Promise(resolve => setTimeout(resolve, 100));
        return genericResponse; // SAME response as success
      }
    }

    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (user) {
      // User exists - send OTP (respects cooldown/daily cap internally)
      await this.passwordResetOtpService.createAndSendOtp(
        user.id,
        normalizedEmail,
      );
    } else {
      // User doesn't exist - add small delay to prevent timing attacks
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    return genericResponse;
  }
}
```

Controller changes:
```typescript
// File: backend/src/auth/auth.controller.ts

@Post('password-reset/start')
// REMOVE ThrottlerGuard:
// @UseGuards(ThrottlerGuard)
// @Throttle({ default: { limit: 5, ttl: 900000 } })
// @UseFilters(ThrottlerExceptionFilter)
async passwordResetStart(
  @Body() dto: PasswordResetStartDto,
  @Req() req: Request,
) {
  const clientIp = req.ip || 'unknown';
  return await this.authService.passwordResetStart(dto, clientIp);
}
```

## Testing After Fix

```bash
# Test 1: Existing email (within cooldown)
curl -X POST http://localhost:3000/api/v1/auth/password-reset/start \
  -H "Content-Type: application/json" \
  -d '{"email": "existing@example.com"}'
# Expected: {"ok":true,"message":"..."}
# Status: 201

# Test 2: Non-existing email
curl -X POST http://localhost:3000/api/v1/auth/password-reset/start \
  -H "Content-Type: application/json" \
  -d '{"email": "nonexist@example.com"}'
# Expected: {"ok":true,"message":"..."}
# Status: 201

# Test 3: Rate limited (6th request)
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/v1/auth/password-reset/start \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"test$i@example.com\"}"
  echo ""
done
# Expected: All return {"ok":true,"message":"..."}
# Status: All 201 (even 6th request!)
```

## Production Considerations

For production, replace in-memory Map with Redis:

```typescript
import { Redis } from 'ioredis';

@Injectable()
export class AuthService {
  private readonly redis: Redis;

  constructor(
    private readonly configService: ConfigService,
    // ... other services
  ) {
    this.redis = new Redis(configService.get('REDIS_URL'));
  }

  private async checkRateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<boolean> {
    const count = await this.redis.incr(key);
    
    if (count === 1) {
      await this.redis.expire(key, windowSeconds);
    }
    
    return count <= limit;
  }
}
```

## Summary

- **Problem:** Rate limiter causes 429 vs 201 status code difference
- **Impact:** Email enumeration attack possible
- **Fix:** Move rate limiting into service layer, always return 201
- **Effort:** ~30 minutes implementation + testing
- **Priority:** P0 (must fix before mobile release)
