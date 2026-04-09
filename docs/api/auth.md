# Auth API

## Purpose

Authentication, tenant bootstrap, OTP-based signup, password reset, and current-user context.

## Auth Model

- Access model: JWT Bearer token (`accessToken`).
- No refresh token is returned by `login` / `register` in current service logic.
- `/auth/signup/complete` accepts only signup tokens (`SignupTokenGuard`).
- `/auth/password-reset/complete` accepts only reset tokens (`ResetTokenGuard`).
- Auth controller is marked with `@SkipBillingStatusCheck()`.

## Base Path

- Controller base: `auth`
- Effective base URL: `/api/v1/auth`

## Endpoints

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/register`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/signup/start`
- `POST /api/v1/auth/signup/verify-otp`
- `POST /api/v1/auth/signup/complete`
- `POST /api/v1/auth/signup/resend-otp`
- `POST /api/v1/auth/password-reset/start`
- `POST /api/v1/auth/password-reset/verify-otp`
- `POST /api/v1/auth/password-reset/complete`

## Request/Response (DTO and service-derived)

### `POST /auth/login`

Request:

```json
{
  "email": "admin@example.com",
  "password": "Secret12345"
}
```

Response:

```json
{
  "accessToken": "<jwt>",
  "user": {
    "id": "uuid",
    "email": "admin@example.com",
    "role": "ADMIN",
    "tenantId": "uuid"
  },
  "tenant": {
    "id": "uuid",
    "name": "Gym",
    "billingStatus": "TRIAL"
  }
}
```

`billingStatus` is legacy tenant metadata. Premium authorization follows RevenueCat entitlements (see [Billing](./billing.md)); an optional legacy fallback exists only when `BILLING_LEGACY_FALLBACK_ENABLED=true`.

### `POST /auth/register`

Request fields: `tenantName`, `email`, `password`, `firstName`, `lastName`, optional `branchName`, optional `branchAddress`.

Response: same shape as login + `branch`:

```json
{
  "accessToken": "<jwt>",
  "user": { "id": "uuid", "email": "owner@example.com", "role": "ADMIN", "tenantId": "uuid" },
  "tenant": { "id": "uuid", "name": "My Gym", "billingStatus": "TRIAL" },
  "branch": { "id": "uuid", "name": "Ana Şube", "isDefault": true }
}
```

### `GET /auth/me`

Response (when authenticated):

```json
{
  "user": { "id": "uuid", "email": "owner@example.com", "firstName": "Jane", "lastName": "Doe", "role": "ADMIN", "tenantId": "uuid" },
  "tenant": { "id": "uuid", "name": "My Gym", "billingStatus": "ACTIVE", "billingStatusUpdatedAt": "2026-03-01T00:00:00.000Z", "planKey": "SINGLE" },
  "branch": { "id": "uuid", "name": "Ana Şube", "isDefault": true },
  "planLimits": {}
}
```

TODO: route does not declare `@UseGuards(JwtAuthGuard)` in controller; if auth behavior changes, update this doc.

### `POST /auth/signup/start`

Request fields: `email`, `password`, `passwordConfirm`.

Response:

```json
{ "ok": true, "message": "Eğer bu e-posta adresi uygunsa doğrulama kodu gönderildi." }
```

### `POST /auth/signup/verify-otp`

Request fields: `email`, `code` (6 digits).

Response:

```json
{ "ok": true, "signupToken": "<signup-jwt>", "expiresIn": 900 }
```

### `POST /auth/signup/complete`

Headers: `Authorization: Bearer <signupToken>`

Request fields: `tenantName` or `gymName`, `ownerName`, optional `branchName`, optional `branchAddress`.

Response: same access payload as `register`.

### `POST /auth/signup/resend-otp`

Request fields: `email`

Response:

```json
{ "ok": true, "message": "Eğer mümkünse yeni doğrulama kodu gönderildi." }
```

### `POST /auth/password-reset/start`

Request fields: `email`

Response:

```json
{ "ok": true, "message": "Eğer bu e-posta kayıtlıysa doğrulama kodu gönderildi." }
```

### `POST /auth/password-reset/verify-otp`

Request fields: `email`, `code` (6 digits)

Response:

```json
{ "ok": true, "resetToken": "<reset-jwt>", "expiresIn": 900 }
```

### `POST /auth/password-reset/complete`

Headers: `Authorization: Bearer <resetToken>`

Request fields: `newPassword`, `newPasswordConfirm`.

Response:

```json
{ "ok": true }
```

## cURL examples

### Login

```bash
curl -s -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Secret12345"}'
```

### Signup flow

```bash
# 1) Start
curl -s -X POST "$BASE_URL/api/v1/auth/signup/start" \
  -H "Content-Type: application/json" \
  -d '{"email":"new@example.com","password":"Secret12345","passwordConfirm":"Secret12345"}'

# 2) Verify OTP (dev example code)
curl -s -X POST "$BASE_URL/api/v1/auth/signup/verify-otp" \
  -H "Content-Type: application/json" \
  -d '{"email":"new@example.com","code":"123456"}'

# 3) Complete (replace SIGNUP_TOKEN)
curl -s -X POST "$BASE_URL/api/v1/auth/signup/complete" \
  -H "Authorization: Bearer $SIGNUP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tenantName":"My Gym","ownerName":"Jane Owner","branchName":"HQ"}'
```

### Password reset flow

```bash
# 1) Start
curl -s -X POST "$BASE_URL/api/v1/auth/password-reset/start" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com"}'

# 2) Verify OTP
curl -s -X POST "$BASE_URL/api/v1/auth/password-reset/verify-otp" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","code":"123456"}'

# 3) Complete (replace RESET_TOKEN)
curl -s -X POST "$BASE_URL/api/v1/auth/password-reset/complete" \
  -H "Authorization: Bearer $RESET_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"newPassword":"NewSecret12345","newPasswordConfirm":"NewSecret12345"}'
```
