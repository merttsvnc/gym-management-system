# Production Environment Variables (PR-4)

This document explains each environment variable used by the backend, with focus on production safety and fail-fast validation.

## Required Variables (App fails to start if missing)

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode. Must be one of: `development`, `test`, `staging`, `production` | `production` |
| `PORT` | HTTP port (1-65535). Default: 3000 | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db?schema=public` |
| `JWT_ACCESS_SECRET` | Secret for signing JWT access tokens. **Minimum 32 characters.** No fallback. | (use strong random string) |

## Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `APP_VERSION` | Application version (shown in /health) | (from package.json) |
| `CORS_ORIGINS` | Comma-separated allowed origins (if used) | - |
| `CRON_ENABLED` | Set to `false` to disable all cron jobs | `true` |
| `FRONTEND_URL` | CORS origin for frontend (used when CORS_ORIGINS not set) | `http://localhost:5173` |

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

- [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md) - Full list including storage, email, etc.
- [.env.example](../.env.example) - Template with no secrets
