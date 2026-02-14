# Staging Deployment Runbook

NestJS + Prisma backend deployment to STAGING on Ubuntu VPS. Use this runbook for step-by-step deployment, migration rehearsal, and verification.

---

## A) Pre-flight Checklist (STAGING)

Before deploying, confirm:

- [ ] **Staging domain/subdomain** (e.g. `api-staging.example.com`) points to VPS IP (A record or CNAME)
- [ ] **PostgreSQL staging DB** exists; `DATABASE_URL` is correct and reachable from VPS
- [ ] **NODE_ENV** set to `staging` (or `production` for production-like behavior)
- [ ] **APP_VERSION** set (optional; included in `/health` response)
- [ ] **CORS origins** – app uses `FRONTEND_URL` for single origin; ensure it includes staging frontend/mobile origins (e.g. `https://staging.example.com`, `capacitor://localhost`)
- [ ] **Server** has Node 20+ and npm **OR** Docker installed

---

## B) Environment Variables (STAGING)

### Required env vars (no fallbacks for secrets)

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `staging` or `production` |
| `PORT` | HTTP port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/dbname?schema=public` |
| `JWT_ACCESS_SECRET` | **Required** – no fallback | (32+ char secret) |
| `JWT_REFRESH_SECRET` | **Required** – no fallback | (32+ char secret) |
| `JWT_SIGNUP_SECRET` | **Required** for signup flow | (32+ char secret) |
| `JWT_RESET_SECRET` | **Required** for password reset | (32+ char secret) |
| `AUTH_EMAIL_VERIFICATION_ENABLED` | Must be `true` if `NODE_ENV=production` | `true` (staging can use `false` for dev OTP) |
| `FRONTEND_URL` | CORS origin | `https://staging.example.com` |

### Optional (feature-dependent)

| Variable | Description |
|----------|-------------|
| `APP_VERSION` | Shown in `/health` response |
| `RESEND_API_KEY` | Email (OTP, password reset) – required if `AUTH_EMAIL_VERIFICATION_ENABLED=true` |
| `RESEND_FROM_EMAIL` | Sender email for Resend |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_BASE_URL` | Cloudflare R2 storage |
| `UPLOAD_MAX_FILE_SIZE_MB`, `UPLOAD_ALLOWED_MIME_TYPES` | Upload limits |
| `RESET_START_IP_LIMIT`, `RESET_START_EMAIL_LIMIT` | Rate limiting |

### Example `.env.staging.template` (no secrets)

```bash
# === Core ===
NODE_ENV=staging
PORT=3000
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME?schema=public
APP_VERSION=1.0.0-staging

# === JWT (REQUIRED - set real secrets) ===
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_SIGNUP_SECRET=
JWT_RESET_SECRET=
JWT_ACCESS_EXPIRES_IN=900s
JWT_REFRESH_EXPIRES_IN=30d

# === Auth / Email ===
AUTH_EMAIL_VERIFICATION_ENABLED=true
# AUTH_OTP_DEV_FIXED_CODE=  # Only for dev/QA when verification disabled
RESEND_API_KEY=
RESEND_FROM_EMAIL=

# === CORS ===
FRONTEND_URL=https://staging.example.com

# === R2 (if using uploads) ===
# R2_ACCOUNT_ID=
# R2_ACCESS_KEY_ID=
# R2_SECRET_ACCESS_KEY=
# R2_BUCKET_NAME=
# R2_PUBLIC_BASE_URL=

# === Upload limits ===
UPLOAD_MAX_FILE_SIZE_MB=2
UPLOAD_ALLOWED_MIME_TYPES=image/jpeg,image/png,image/webp
```

### How to set env vars safely

- **Systemd:** `Environment=` and `EnvironmentFile=` in service unit (see Option 1 below)
- **Docker Compose:** `env_file: .env.staging` or `environment:` block; never commit `.env` to git
- **CI/CD:** Store secrets in CI secrets (GitHub Actions, GitLab CI, etc.); inject at deploy time
- **Never:** Print secrets in logs, commit `.env` with real values, or use fallbacks for JWT secrets

---

## C) Build & Deploy Options

### Option 1: Systemd (no Docker)

```bash
# 1. SSH to VPS
ssh user@api-staging.example.com

# 2. Navigate to app directory
cd /opt/gym-backend   # or your deploy path

# 3. Pull latest
git fetch origin
git checkout main     # or your staging branch
git pull origin main

# 4. Install deps (clean)
npm ci

# 5. Generate Prisma client
npx prisma generate

# 6. Build
npm run build

# 7. Run migrations (CRITICAL: use deploy, NOT dev)
npx prisma migrate deploy

# 8. Restart service
sudo systemctl restart gym-backend

# 9. Check status and logs
sudo systemctl status gym-backend
sudo journalctl -u gym-backend -f --no-pager
```

#### Systemd service file example

Create `/etc/systemd/system/gym-backend.service`:

```ini
[Unit]
Description=Gym Management Backend (NestJS)
After=network.target postgresql.service

[Service]
Type=simple
User=deploy
WorkingDirectory=/opt/gym-backend
EnvironmentFile=/opt/gym-backend/.env.staging
Environment=NODE_ENV=staging
ExecStart=/usr/bin/node dist/main.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable gym-backend
sudo systemctl start gym-backend
```

#### Health check (Option 1)

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health
# Expected: 200
```

---

### Option 2: Docker (Compose)

#### Dockerfile (create in `backend/` if missing)

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

#### docker-compose.staging.yml

```yaml
services:
  api:
    build: .
    ports:
      - "3000:3000"
    env_file: .env.staging
    environment:
      NODE_ENV: staging
    depends_on:
      - db
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: gym
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: gym_staging
    volumes:
      - pgdata:/var/lib/postgresql/data
    # Use external DB in production; this is for all-in-one staging

volumes:
  pgdata:
```

#### Deploy steps (Docker)

```bash
# 1. Build image
docker compose -f docker-compose.staging.yml build

# 2. Run migrations as one-off (before starting API)
docker compose -f docker-compose.staging.yml run --rm api npx prisma migrate deploy

# 3. Start API
docker compose -f docker-compose.staging.yml up -d api

# 4. Health check
curl -s http://localhost:3000/health | jq .

# 5. View logs
docker compose -f docker-compose.staging.yml logs -f api
```

---

## D) Migration Rehearsal (CRITICAL)

### Always use `prisma migrate deploy`

```bash
npx prisma migrate deploy
```

**Never** use `prisma migrate dev` in staging/production.

### Verify migration applied

```bash
npx prisma migrate status
```

Expected: `Database schema is up to date.`

### PR-2 migration risk (index build lock)

Migration `20260214134256_add_effective_date_day_and_unique_constraint` adds a partial unique index on `MemberPlanChangeHistory`. Index creation on a large table can hold locks. **Recommendation:** run during off-peak or maintenance window.

### DB size quick check (before migration)

```sql
SELECT relname, n_live_tup
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;
```

If `MemberPlanChangeHistory` has many rows (e.g. >100k), plan a maintenance window.

---

## E) Post-Deploy Verification

1. **Health:** `curl -s http://localhost:3000/health` → 200, `db: "ok"`
2. **RequestId:** `curl -i http://localhost:3000/health` → header `X-Request-Id` present
3. Run full smoke tests from `STAGING_SMOKE_TESTS.md`

---

## F) Observability Checklist

- [ ] Structured JSON log lines for requests (`requestId`, `method`, `path`, `statusCode`, `durationMs`)
- [ ] 5xx errors log stack trace server-side only (never to client)
- [ ] No `Authorization` header or token in logs
- [ ] `requestId` present in every response header and error payload
