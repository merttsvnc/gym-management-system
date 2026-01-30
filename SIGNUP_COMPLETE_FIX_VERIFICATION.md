# Signup Complete Fix - Verification Checklist

## Root Cause

**Root Cause Statement:**
The signup/complete endpoint had two issues: (1) The DTO only accepted `gymName` but mobile clients may send `tenantName`, causing validation to fail silently or use defaults; (2) The guard did not explicitly reject requests without Authorization headers, and dev-mode tenant creation with "Dev Test Tenant" name prevented proper tenant name updates during signup completion.

## Files Changed

1. `backend/src/auth/dto/signup-complete.dto.ts` - Added support for both `tenantName` (primary) and `gymName` (alias)
2. `backend/src/auth/auth.service.ts` - Updated `signupComplete` to use `getTenantName()` method and handle dev-mode tenants
3. `backend/src/auth/guards/signup-token.guard.ts` - Enhanced to explicitly reject requests without Authorization header
4. `backend/test/auth/signup-complete.e2e-spec.ts` - Added comprehensive E2E tests

## Verification Checklist

### Prerequisites

1. Start the backend server:
   ```bash
   cd backend
   npm run start:dev
   ```

2. Ensure environment variables are set:
   - `JWT_SIGNUP_SECRET` - Secret for signing signup tokens
   - `JWT_ACCESS_SECRET` - Secret for signing access tokens
   - `AUTH_EMAIL_VERIFICATION_ENABLED` - Set to `false` for dev mode testing

### Step 1: Signup Start

```bash
# Start signup process
curl -X POST http://localhost:3000/api/v1/auth/signup/start \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123!"
  }'
```

**Expected:** `200 OK` with message about OTP being sent

**Save the email** - you'll need the OTP code for the next step.

### Step 2: Verify OTP and Get Signup Token

```bash
# Verify OTP (use the code from email or dev mode fixed code)
curl -X POST http://localhost:3000/api/v1/auth/signup/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "code": "123456"
  }'
```

**Expected:** `200 OK` with `signupToken` in response

**Save the signupToken** - you'll need it for signup/complete.

Example response:
```json
{
  "ok": true,
  "signupToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900
}
```

### Step 3: Test signup/complete with tenantName

```bash
# Replace SIGNUP_TOKEN with the token from Step 2
curl -X POST http://localhost:3000/api/v1/auth/signup/complete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SIGNUP_TOKEN" \
  -d '{
    "tenantName": "Qwe",
    "ownerName": "John Doe"
  }'
```

**Expected:** `201 Created` with response containing:
- `accessToken` - Regular JWT access token
- `tenant.name` should be **"Qwe"** (not "Dev Test Tenant")
- `user` object
- `branch` object

**Verify:** Check that `tenant.name` matches the input `tenantName`.

### Step 4: Test signup/complete with gymName (alias support)

```bash
# Start a new signup flow
curl -X POST http://localhost:3000/api/v1/auth/signup/start \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test2@example.com",
    "password": "SecurePass123!"
  }'

# Verify OTP and get signup token (use code from email)
curl -X POST http://localhost:3000/api/v1/auth/signup/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test2@example.com",
    "code": "123456"
  }'

# Complete signup using gymName (backward compatibility)
curl -X POST http://localhost:3000/api/v1/auth/signup/complete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SIGNUP_TOKEN_FROM_STEP_ABOVE" \
  -d '{
    "gymName": "Gym B",
    "ownerName": "Jane Smith"
  }'
```

**Expected:** `201 Created` with `tenant.name` = **"Gym B"**

**Verify:** Check that `tenant.name` matches the input `gymName`.

### Step 5: Security Test - Missing Authorization Header

```bash
curl -X POST http://localhost:3000/api/v1/auth/signup/complete \
  -H "Content-Type: application/json" \
  -d '{
    "tenantName": "Test Gym",
    "ownerName": "Test User"
  }'
```

**Expected:** `401 Unauthorized` with message containing "Authorization"

**Verify:** Request is rejected when Authorization header is missing.

### Step 6: Security Test - Regular Access Token (Should Fail)

```bash
# First, login to get a regular access token
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "existing@example.com",
    "password": "password123"
  }'

# Save the accessToken from response, then try to use it with signup/complete
curl -X POST http://localhost:3000/api/v1/auth/signup/complete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN_FROM_LOGIN" \
  -d '{
    "tenantName": "Test Gym",
    "ownerName": "Test User"
  }'
```

**Expected:** `401 Unauthorized` with message about signup token

**Verify:** Regular access tokens are rejected; only signup tokens work.

### Step 7: Test Field Preference (tenantName over gymName)

```bash
# Start new signup flow
curl -X POST http://localhost:3000/api/v1/auth/signup/start \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test3@example.com",
    "password": "SecurePass123!"
  }'

# Verify OTP
curl -X POST http://localhost:3000/api/v1/auth/signup/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test3@example.com",
    "code": "123456"
  }'

# Complete with both fields (tenantName should be preferred)
curl -X POST http://localhost:3000/api/v1/auth/signup/complete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SIGNUP_TOKEN" \
  -d '{
    "tenantName": "Preferred Name",
    "gymName": "Ignored Name",
    "ownerName": "Test User"
  }'
```

**Expected:** `201 Created` with `tenant.name` = **"Preferred Name"** (not "Ignored Name")

**Verify:** When both fields are provided, `tenantName` takes precedence.

## Test Execution

Run the E2E tests:

```bash
cd backend
npm run test:e2e -- signup-complete.e2e-spec.ts
```

**Expected:** All tests pass

## Summary of Fixes

1. ✅ **Field Compatibility**: DTO now accepts both `tenantName` (primary) and `gymName` (alias)
2. ✅ **Security**: SignupTokenGuard explicitly rejects requests without Authorization header
3. ✅ **Dev Tenant Handling**: Fixed logic to allow updating tenants created with "Dev Test Tenant" name
4. ✅ **Tests**: Comprehensive E2E tests covering all scenarios
5. ✅ **Validation**: Proper validation ensures at least one name field is provided

## Verification Results

- [ ] Step 1: Signup start works
- [ ] Step 2: OTP verification returns signup token
- [ ] Step 3: signup/complete with `tenantName` returns correct tenant name
- [ ] Step 4: signup/complete with `gymName` returns correct tenant name
- [ ] Step 5: Missing Authorization header returns 401
- [ ] Step 6: Regular access token returns 401
- [ ] Step 7: `tenantName` preferred over `gymName` when both provided
- [ ] E2E tests pass

## Notes

- The fix maintains backward compatibility by accepting `gymName` as an alias
- Security is enhanced by explicitly checking for Authorization header
- Dev-mode tenants can now be properly updated during signup completion
- All changes are minimal and focused on the specific issues reported
