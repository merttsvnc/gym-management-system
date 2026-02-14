# Production Environment Variables (PR-4)

This document explains each environment variable used by the backend, with focus on production safety and fail-fast validation.

## Single Template

**Use `backend/.env.example` as the single source of truth.** Copy it to `.env` and fill in values for your environment (development, staging, or production). There is no separate staging template.

## Required Variables (App fails to start if missing)

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode. Must be one of: `development`, `test`, `staging`, `production` | `production` |
| `PORT` | HTTP port (1-65535). Default: 3000 | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db?schema=public` |
| `JWT_ACCESS_SECRET` | Secret for signing JWT access tokens. **Minimum 32 characters.** No fallback. | (use strong random string) |

## Optional Variables

### Core / Feature Flags

| Variable | Description | Default |
|----------|-------------|---------|
| `APP_VERSION` | Application version (shown in /health) | (from package.json) |
| `CRON_ENABLED` | Set to `false` to disable all cron jobs | `true` |

### CORS

| Variable | Description | Default |
|----------|-------------|---------|
| `CORS_ORIGINS` | Comma-separated allowed origins (e.g. web + mobile) | - |
| `FRONTEND_URL` | Single-origin CORS fallback. **Currently used by main.ts** when `CORS_ORIGINS` is not set. | `http://localhost:5173` |

### Auth / Email (Resend)

| Variable | Description | Default |
|----------|-------------|---------|
| `AUTH_EMAIL_VERIFICATION_ENABLED` | Enable email OTP verification | - |
| `RESEND_API_KEY` | Resend API key for sending emails | - |
| `RESEND_FROM_EMAIL` | From address for transactional emails | - |
| `AUTH_OTP_DEV_FIXED_CODE` | Dev/QA only: fixed OTP when verification disabled | - |

### Upload Limits

| Variable | Description | Default |
|----------|-------------|---------|
| `UPLOAD_MAX_FILE_SIZE_MB` | Max file size in MB | - |
| `UPLOAD_ALLOWED_MIME_TYPES` | Comma-separated MIME types | - |

### Storage (R2)

| Variable | Description |
|----------|-------------|
| `R2_ACCOUNT_ID` | Cloudflare R2 account ID |
| `R2_ACCESS_KEY_ID` | R2 S3-compatible access key |
| `R2_SECRET_ACCESS_KEY` | R2 S3-compatible secret key |
| `R2_BUCKET_NAME` | R2 bucket name (default: gym-members) |
| `R2_PUBLIC_BASE_URL` | Public URL base for R2 bucket |

Omit all R2 variables to use local disk storage (development).

### Rate Limiting (optional)

| Variable | Description | Default |
|----------|-------------|---------|
| `RESET_START_IP_LIMIT` | Password reset requests per IP per window | 20 |
| `RESET_START_IP_WINDOW_MS` | IP limit window (ms) | 900000 (15 min) |
| `RESET_START_EMAIL_LIMIT` | Password reset requests per email per window | 5 |
| `RESET_START_EMAIL_WINDOW_MS` | Email limit window (ms) | 900000 (15 min) |

## Production-Only Rules

- **`AUTH_EMAIL_VERIFICATION_ENABLED`** must be `true` when `NODE_ENV=production`. The app will fail to start otherwise.

## Additional JWT Secrets (for full auth)

These are used by auth flows but not validated at startup. Set them for production:

- `JWT_REFRESH_SECRET`
- `JWT_SIGNUP_SECRET`
- `JWT_RESET_SECRET`
- `JWT_ACCESS_EXPIRES_IN` (default: 900s)
- `JWT_REFRESH_EXPIRES_IN` (default: 30d)

## Validation

Environment variables are validated at startup using Zod. On failure:

- The app **does not start**
- Error messages are clear (e.g., "JWT_ACCESS_SECRET must be at least 32 characters")
- **Secrets are never logged**

## See Also

- [.env.example](../.env.example) - **Single master template** (copy to .env, fill values)
- [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md) - Full list including storage, email, etc.
