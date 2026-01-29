# Environment Variables

This document describes all environment variables used by the backend application.

## Required Variables

### Database

- `DATABASE_URL` - PostgreSQL connection string
  - Example: `postgresql://user:password@localhost:5432/gym_management_dev?schema=public`

### Authentication

- `JWT_ACCESS_SECRET` - Secret key for signing JWT access tokens
- `JWT_REFRESH_SECRET` - Secret key for signing JWT refresh tokens
- `JWT_ACCESS_EXPIRES_IN` - Access token expiration time (e.g., `900s` for 15 minutes)
- `JWT_REFRESH_EXPIRES_IN` - Refresh token expiration time (e.g., `30d` for 30 days)

## Optional Variables

### Cloudflare R2 Storage (Production)

When all R2 variables are set, the application uses Cloudflare R2 for file storage. If any are missing, it falls back to local disk storage (development mode).

- `R2_ACCOUNT_ID` - Cloudflare R2 account ID
  - Found in Cloudflare dashboard under R2 settings
  - Example: `abc123def456`

- `R2_ACCESS_KEY_ID` - R2 S3-compatible access key ID
  - Generated in Cloudflare dashboard under R2 > Manage R2 API Tokens
  - Example: `your-access-key-id`

- `R2_SECRET_ACCESS_KEY` - R2 S3-compatible secret access key
  - Generated alongside the access key ID
  - Keep this secret and never commit to version control
  - Example: `your-secret-access-key`

- `R2_BUCKET_NAME` - R2 bucket name for storing member photos
  - Default: `gym-members`
  - Example: `gym-members`

- `R2_PUBLIC_BASE_URL` - Public URL base for R2 bucket
  - Format: `https://<account-id>.r2.dev/<bucket-name>`
  - Default: Auto-generated from `R2_ACCOUNT_ID` and `R2_BUCKET_NAME`
  - Example: `https://abc123def456.r2.dev/gym-members`

### Local Disk Storage (Development)

Used when R2 credentials are not provided. Files are stored locally on disk.

- `LOCAL_UPLOAD_DIR` - Local directory for storing uploaded files
  - Default: `<project-root>/tmp/uploads`
  - Example: `/tmp/gym-uploads`

- `LOCAL_PUBLIC_BASE_URL` - Public URL base for local file serving
  - Default: `http://localhost:3000/uploads`
  - Example: `http://localhost:3000/uploads`
  - Note: You may need to configure a static file serving route if using a different base URL

## Environment Setup Examples

### Production (with R2)

```env
DATABASE_URL="postgresql://user:password@host:5432/gym_management?schema=public"
JWT_ACCESS_SECRET="your-production-secret-key"
JWT_REFRESH_SECRET="your-production-refresh-secret-key"
JWT_ACCESS_EXPIRES_IN="900s"
JWT_REFRESH_EXPIRES_IN="30d"

# R2 Configuration
R2_ACCOUNT_ID="abc123def456"
R2_ACCESS_KEY_ID="your-access-key-id"
R2_SECRET_ACCESS_KEY="your-secret-access-key"
R2_BUCKET_NAME="gym-members"
R2_PUBLIC_BASE_URL="https://abc123def456.r2.dev/gym-members"
```

### Development (Local Disk)

```env
DATABASE_URL="postgresql://user:password@localhost:5432/gym_management_dev?schema=public"
JWT_ACCESS_SECRET="your-dev-secret-key"
JWT_REFRESH_SECRET="your-dev-refresh-secret-key"
JWT_ACCESS_EXPIRES_IN="900s"
JWT_REFRESH_EXPIRES_IN="30d"

# R2 variables omitted - will use local disk storage
LOCAL_UPLOAD_DIR="/tmp/gym-uploads"
LOCAL_PUBLIC_BASE_URL="http://localhost:3000/uploads"
```

## Security Notes

1. **Never commit secrets to version control** - Use `.env` files (which should be in `.gitignore`)
2. **Use different secrets for each environment** - Dev, staging, and production should have different JWT secrets
3. **Rotate secrets regularly** - Especially in production
4. **Use environment-specific `.env` files** - `.env.development`, `.env.staging`, `.env.production`
5. **R2 credentials are sensitive** - Treat them like database passwords

## Storage Service Selection

The application automatically selects the storage service based on available environment variables:

1. **If all R2 variables are present** (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`):
   - Uses `R2StorageService` (Cloudflare R2)
   - Files are uploaded to R2 bucket
   - Public URLs use R2 public endpoint

2. **If any R2 variable is missing**:
   - Uses `LocalDiskStorageService` (local disk)
   - Files are saved to `LOCAL_UPLOAD_DIR` (default: `tmp/uploads`)
   - Public URLs use `LOCAL_PUBLIC_BASE_URL`

This allows seamless development without R2 credentials while automatically using R2 in production.
