# Password Reset API - Mobile Integration Guide

**Status:** ⚠️ PENDING SECURITY FIX  
**Version:** v1.0  
**Base URL:** `https://your-api.com/api/v1/auth`

---

## Quick Reference

### Flow Overview

```
1. User clicks "Forgot Password"
   ↓
2. App sends email to /password-reset/start
   ↓
3. User receives OTP email (or dev code: 123456)
   ↓
4. App sends email + code to /password-reset/verify-otp
   ↓
5. Backend returns resetToken (15 min expiry)
   ↓
6. App sends resetToken + newPassword to /password-reset/complete
   ↓
7. Password updated ✓
```

---

## API Endpoints

### 1. Start Password Reset

```http
POST /password-reset/start
Content-Type: application/json

{
  "email": "user@example.com"
}
```

**Response:** Always 201 (success or not)

```json
{
  "ok": true,
  "message": "Eğer bu e-posta kayıtlıysa doğrulama kodu gönderildi."
}
```

**Rate Limit:** 5 requests per 15 minutes per IP  
**Behavior:**

- ✅ Email exists → Sends OTP email
- ✅ Email doesn't exist → Returns same response (anti-enumeration)
- ⚠️ Too frequent → Returns same response (60s cooldown)

---

### 2. Verify OTP

```http
POST /password-reset/verify-otp
Content-Type: application/json

{
  "email": "user@example.com",
  "code": "123456"
}
```

**Success Response:** 201

```json
{
  "ok": true,
  "resetToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900
}
```

**Error Response:** 400

```json
{
  "statusCode": 400,
  "message": "Kod hatalı veya süresi dolmuş",
  "code": "INVALID_OTP"
}
```

**Rate Limit:** 10 requests per 15 minutes per IP  
**OTP Rules:**

- 6-digit numeric code
- Valid for 10 minutes
- Max 5 verification attempts
- Dev mode: fixed code `123456` (when EMAIL_VERIFICATION=false)

---

### 3. Complete Reset

```http
POST /password-reset/complete
Content-Type: application/json
Authorization: Bearer <resetToken>

{
  "newPassword": "SecurePassword123",
  "newPasswordConfirm": "SecurePassword123"
}
```

**Success Response:** 201

```json
{
  "ok": true
}
```

**Error Responses:**

| Status | Code              | Message               | Cause                      |
| ------ | ----------------- | --------------------- | -------------------------- |
| 401    | -                 | Unauthorized          | Missing/invalid resetToken |
| 401    | -                 | Invalid token type    | Using accessToken instead  |
| 400    | INVALID_INPUT     | Validation errors     | Password too short/weak    |
| 400    | PASSWORD_MISMATCH | Passwords don't match | Confirm mismatch           |

**Password Rules:**

- Min length: 10 characters
- Must contain: letters and numbers
- Must match confirmation

---

## Mobile Implementation

### Swift Example

```swift
class PasswordResetService {
    let baseURL = "https://your-api.com/api/v1/auth"

    // Step 1: Start reset
    func startReset(email: String) async throws {
        let url = URL(string: "\(baseURL)/password-reset/start")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["email": email])

        let (_, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 201 else {
            throw PasswordResetError.networkError
        }
    }

    // Step 2: Verify OTP
    func verifyOTP(email: String, code: String) async throws -> String {
        let url = URL(string: "\(baseURL)/password-reset/verify-otp")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode([
            "email": email,
            "code": code
        ])

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw PasswordResetError.networkError
        }

        if httpResponse.statusCode == 201 {
            let result = try JSONDecoder().decode(VerifyOTPResponse.self, from: data)
            return result.resetToken
        } else {
            let error = try JSONDecoder().decode(APIError.self, from: data)
            throw PasswordResetError.invalidOTP(error.message)
        }
    }

    // Step 3: Complete reset
    func completeReset(
        resetToken: String,
        newPassword: String,
        confirm: String
    ) async throws {
        let url = URL(string: "\(baseURL)/password-reset/complete")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(resetToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode([
            "newPassword": newPassword,
            "newPasswordConfirm": confirm
        ])

        let (_, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 201 else {
            throw PasswordResetError.resetFailed
        }
    }
}

struct VerifyOTPResponse: Codable {
    let ok: Bool
    let resetToken: String
    let expiresIn: Int
}
```

### Kotlin Example

```kotlin
class PasswordResetService(private val httpClient: HttpClient) {
    private val baseURL = "https://your-api.com/api/v1/auth"

    suspend fun startReset(email: String) {
        val response = httpClient.post("$baseURL/password-reset/start") {
            contentType(ContentType.Application.Json)
            setBody(mapOf("email" to email))
        }
        require(response.status == HttpStatusCode.Created)
    }

    suspend fun verifyOTP(email: String, code: String): String {
        val response = httpClient.post("$baseURL/password-reset/verify-otp") {
            contentType(ContentType.Application.Json)
            setBody(mapOf("email" to email, "code" to code))
        }

        return when (response.status) {
            HttpStatusCode.Created -> {
                val result = response.body<VerifyOTPResponse>()
                result.resetToken
            }
            else -> {
                val error = response.body<APIError>()
                throw PasswordResetException(error.message)
            }
        }
    }

    suspend fun completeReset(
        resetToken: String,
        newPassword: String,
        confirm: String
    ) {
        val response = httpClient.post("$baseURL/password-reset/complete") {
            contentType(ContentType.Application.Json)
            bearerAuth(resetToken)
            setBody(mapOf(
                "newPassword" to newPassword,
                "newPasswordConfirm" to confirm
            ))
        }
        require(response.status == HttpStatusCode.Created)
    }
}

@Serializable
data class VerifyOTPResponse(
    val ok: Boolean,
    val resetToken: String,
    val expiresIn: Int
)
```

---

## Error Handling

### Generic Success Response

**Always show:** "If this email is registered, a verification code has been sent."

**Why?** Anti-enumeration - don't reveal if email exists

### OTP Error

**Show:** "Code is incorrect or expired. Please try again."

**Countdown:** After 5 failed attempts, disable retry and show:
"Too many attempts. Please request a new code."

### Rate Limit Error (429)

**Show:** "Too many requests. Please wait a few minutes and try again."

### Password Validation Errors

```
- "Password must be at least 10 characters"
- "Password must contain letters and numbers"
- "Passwords do not match"
```

### Token Expiry

**Show:** "Reset link expired. Please request a new code."

**Trigger:** After 15 minutes from verification

---

## UI/UX Best Practices

### 1. Start Reset Screen

```
┌─────────────────────────┐
│  Forgot Password?       │
│                         │
│  Email:                 │
│  [                    ] │
│                         │
│  [Send Reset Code]      │
│                         │
│  ← Back to Login        │
└─────────────────────────┘
```

**After send:**

- Show: "Code sent! Check your email."
- Navigate to OTP screen
- Auto-fill email

### 2. OTP Verification Screen

```
┌─────────────────────────┐
│  Enter Code             │
│                         │
│  user@example.com       │
│                         │
│  [_] [_] [_] [_] [_] [_]│
│                         │
│  Didn't receive code?   │
│  Resend in 57s          │
│                         │
│  [Verify]               │
└─────────────────────────┘
```

**Features:**

- 6 separate input boxes
- Auto-focus next box
- Auto-submit when complete
- 60-second countdown for resend
- Show attempts remaining: "2 attempts left"

### 3. New Password Screen

```
┌─────────────────────────┐
│  Set New Password       │
│                         │
│  New Password:          │
│  [                    ] │
│  ● Min 10 characters    │
│  ● Letters & numbers    │
│                         │
│  Confirm Password:      │
│  [                    ] │
│                         │
│  [Reset Password]       │
└─────────────────────────┘
```

**Validation:**

- Real-time feedback on requirements
- Show/hide password toggle
- Strength indicator
- Match indicator for confirm

### 4. Success Screen

```
┌─────────────────────────┐
│  ✓ Password Reset!      │
│                         │
│  Your password has been │
│  successfully reset.    │
│                         │
│  [Go to Login]          │
└─────────────────────────┘
```

---

## Testing

### Dev Mode (EMAIL_VERIFICATION=false)

```bash
# Fixed OTP code for testing
CODE = "123456"

# Test flow:
1. Start reset for ANY email → 201
2. Verify with code "123456" → resetToken
3. Complete reset → 201
```

### Production

- Real OTPs sent via email
- No fixed code
- All security checks enabled

---

## Security Notes for Mobile Devs

### ✅ DO:

- Store resetToken in memory only (never persist)
- Clear resetToken after 15 minutes
- Show generic success messages (anti-enumeration)
- Implement proper SSL pinning
- Use biometric auth after successful reset

### ❌ DON'T:

- Don't persist resetToken in UserDefaults/SharedPreferences
- Don't show "email not found" errors
- Don't reveal attempt counts to users
- Don't cache password in plain text
- Don't skip SSL certificate validation

---

## Known Issues

### ⚠️ BEFORE MOBILE INTEGRATION:

**Issue:** Rate limiter enumeration leak  
**Status:** Backend fix required  
**ETA:** 1 hour  
**Impact:** Email enumeration possible

**Wait for:** Backend team to confirm fix deployed

---

## Support

**API Docs:** `PASSWORD_RESET_IMPLEMENTATION_SUMMARY.md`  
**QA Report:** `PASSWORD_RESET_QA_REPORT.md`  
**Security Fix:** `PASSWORD_RESET_ENUMERATION_FIX.md`

**Questions?** Contact backend team

---

**Last Updated:** 2026-01-30  
**API Version:** v1.0  
**Status:** ⚠️ PENDING BACKEND FIX
