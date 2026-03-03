# Security Verification

## Canonical Security Rules

- Every business query must be tenant-scoped.
- Auth uses JWT access tokens; special-purpose tokens are required for signup-complete and password-reset-complete.
- Auth-sensitive endpoints must remain anti-enumeration safe.
- Throttling must be enabled for auth abuse control.

## Tenant Isolation Verification (IDOR)

Use two tenants (A/B) and confirm cross-tenant IDs are not accessible.

```bash
export BASE_URL="http://localhost:3000"

curl -s -w "\nHTTP:%{http_code}\n" "$BASE_URL/api/v1/branches/$BRANCH_B_ID" \
  -H "Authorization: Bearer $TOKEN_A"

curl -s -w "\nHTTP:%{http_code}\n" "$BASE_URL/api/v1/members/$MEMBER_B_ID" \
  -H "Authorization: Bearer $TOKEN_A"
```

Expected: tenant A cannot retrieve tenant B resources.

## Auth / OTP / Password Reset Regression Checks

```bash
# signup start must be anti-enumeration
curl -s -X POST "$BASE_URL/api/v1/auth/signup/start" \
  -H "Content-Type: application/json" \
  -d '{"email":"exists@example.com","password":"Secret12345","passwordConfirm":"Secret12345"}'

curl -s -X POST "$BASE_URL/api/v1/auth/signup/start" \
  -H "Content-Type: application/json" \
  -d '{"email":"missing@example.com","password":"Secret12345","passwordConfirm":"Secret12345"}'
```

```bash
# password reset start must be anti-enumeration
curl -s -X POST "$BASE_URL/api/v1/auth/password-reset/start" \
  -H "Content-Type: application/json" \
  -d '{"email":"exists@example.com"}'

curl -s -X POST "$BASE_URL/api/v1/auth/password-reset/start" \
  -H "Content-Type: application/json" \
  -d '{"email":"missing@example.com"}'
```

```bash
# signup token isolation: access token should not work on signup/complete
curl -s -w "\nHTTP:%{http_code}\n" -X POST "$BASE_URL/api/v1/auth/signup/complete" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tenantName":"X Gym","ownerName":"X Owner"}'
```

```bash
# reset token isolation: access token should not work on password-reset/complete
curl -s -w "\nHTTP:%{http_code}\n" -X POST "$BASE_URL/api/v1/auth/password-reset/complete" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"newPassword":"NewSecret12345","newPasswordConfirm":"NewSecret12345"}'
```

## Rate Limit / Brute Force Checks

```bash
# login brute-force probe
for i in {1..12}; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE_URL/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"attack@example.com","password":"wrong"}'
done

# OTP verify brute-force probe
for i in {1..12}; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE_URL/api/v1/auth/password-reset/verify-otp" \
    -H "Content-Type: application/json" \
    -d '{"email":"user@example.com","code":"000000"}'
done
```

## Release Security Checklist

- [ ] `NODE_ENV=production`
- [ ] `AUTH_EMAIL_VERIFICATION_ENABLED=true` in production
- [ ] `JWT_ACCESS_SECRET` set and strong (32+ chars)
- [ ] `JWT_SIGNUP_SECRET` set and strong
- [ ] `JWT_RESET_SECRET` set and strong
- [ ] CORS origins restricted (`CORS_ORIGINS` or `FRONTEND_URL`)
- [ ] No secrets committed in repository
- [ ] `GET /health` returns `db: "ok"`
- [ ] `X-Request-Id` present in responses
- [ ] Login response contains `accessToken` and does not include `refreshToken`
- [ ] Cross-tenant ID probes fail (members/branches)
- [ ] Auth anti-enumeration responses match for existing vs missing emails
- [ ] Signup-complete rejects access tokens
- [ ] Password-reset-complete rejects access tokens
- [ ] Auth endpoint throttling is observable under repeated requests
- [ ] Upload endpoint accepts only allowed image types and size bounds
