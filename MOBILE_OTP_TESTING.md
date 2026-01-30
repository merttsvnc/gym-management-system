# Quick OTP Testing for Mobile Development

## Environment Setup Required

Backend must be running with:
```bash
NODE_ENV=development
AUTH_EMAIL_VERIFICATION_ENABLED=false
AUTH_OTP_DEV_FIXED_CODE=123456
```

## Fixed OTP Code for Development
```
123456
```

## Quick Test - Direct OTP Verification

You can now test OTP verification WITHOUT calling signup/start first!

```bash
# Verify OTP with any email address
curl -X POST http://localhost:3000/api/v1/auth/signup/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "code": "123456"
  }'
```

**Expected Response (HTTP 201)**:
```json
{
  "ok": true,
  "signupToken": "eyJhbGc...",
  "expiresIn": 900
}
```

## Mobile App Request Format

```typescript
// Request
POST /api/v1/auth/signup/verify-otp
Content-Type: application/json

{
  "email": "user@example.com",
  "code": "123456"  // ⚠️ Field name is "code", not "otp"
}

// Success Response (201)
{
  "ok": true,
  "signupToken": "eyJhbG...",
  "expiresIn": 900
}

// Error Response (400)
{
  "statusCode": 400,
  "message": "Geçersiz veya süresi dolmuş doğrulama kodu",
  "code": "INVALID_OTP",
  "timestamp": "2026-01-30T06:24:47.484Z",
  "path": "/api/v1/auth/signup/verify-otp"
}
```

## Important Notes

1. **Field Name**: The DTO expects `code`, NOT `otp`
2. **Format**: 6-digit string: `"123456"`
3. **Case**: Email is automatically normalized to lowercase
4. **Dev Only**: Fixed OTP only works when `AUTH_EMAIL_VERIFICATION_ENABLED=false`

## Common Issues

### Issue: "Kod hatalı veya süresi dolmuş"
**Causes**:
- ❌ Using wrong field name (`otp` instead of `code`)
- ❌ Using wrong OTP code (not "123456")
- ❌ Backend not started with `AUTH_EMAIL_VERIFICATION_ENABLED=false`
- ❌ Backend not started with `AUTH_OTP_DEV_FIXED_CODE=123456`

**Solution**: Check backend logs at startup:
```
[OtpService] OTP Service initialized - NODE_ENV: development, AUTH_EMAIL_VERIFICATION_ENABLED: false, AUTH_OTP_DEV_FIXED_CODE: set (length: 6)
```

### Issue: Rate Limiting (HTTP 429)
The endpoint has throttling: 10 attempts per 15 minutes.

Wait 15 minutes or restart the backend.

## Complete Flow (Optional)

If you want to test the full signup flow:

```bash
# Step 1: Start signup
curl -X POST http://localhost:3000/api/v1/auth/signup/start \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123456!",
    "passwordConfirm": "Test123456!"
  }'

# Step 2: Verify OTP
curl -X POST http://localhost:3000/api/v1/auth/signup/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "code": "123456"
  }'

# Step 3: Complete signup
curl -X POST http://localhost:3000/api/v1/auth/signup/complete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SIGNUP_TOKEN" \
  -d '{
    "gymName": "My Gym",
    "ownerName": "John Doe"
  }'
```

## Testing Different OTP Codes

```bash
# ✅ Correct OTP - Should work
curl -X POST http://localhost:3000/api/v1/auth/signup/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "code": "123456"}'

# ❌ Wrong OTP - Should fail
curl -X POST http://localhost:3000/api/v1/auth/signup/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "code": "999999"}'
```

## Mobile App Code Example (React Native / TypeScript)

```typescript
interface VerifyOtpRequest {
  email: string;
  code: string;  // ⚠️ Not "otp"
}

interface VerifyOtpResponse {
  ok: boolean;
  signupToken: string;
  expiresIn: number;
}

async function verifyOtp(email: string, otpCode: string): Promise<VerifyOtpResponse> {
  const response = await fetch('http://localhost:3000/api/v1/auth/signup/verify-otp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: email.toLowerCase().trim(),
      code: otpCode,  // ⚠️ Use "code", not "otp"
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'OTP verification failed');
  }

  return response.json();
}

// Usage
try {
  const result = await verifyOtp('test@example.com', '123456');
  console.log('Signup token:', result.signupToken);
  // Store the signup token for the complete step
} catch (error) {
  console.error('OTP verification failed:', error.message);
}
```

## Verification Script

Run the comprehensive test script:
```bash
cd backend
./verify-otp-fix.sh
```
