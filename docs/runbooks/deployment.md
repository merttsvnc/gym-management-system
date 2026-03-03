# Deployment Runbook

## Scope

Backend deploy using repository `deploy.sh` and Docker Compose (`backend/docker-compose.prod.yml`).

## Preconditions

```bash
# from repo root
cd /Users/mertsevinc/Project/gym-management-system

# required files
test -f backend/.env
test -f backend/docker-compose.prod.yml
```

Required env keys (from code + deploy process):

- `NODE_ENV`, `PORT`, `DATABASE_URL`
- `JWT_ACCESS_SECRET` (startup validation)
- `JWT_SIGNUP_SECRET`, `JWT_RESET_SECRET` (signup/reset flows)
- `AUTH_EMAIL_VERIFICATION_ENABLED` (`true` in production)
- For email-enabled OTP: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- For R2 uploads: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_BASE_URL`

## Deploy Commands

### Normal deploy (only if remote changed)

```bash
./deploy.sh once
```

### Force deploy now

```bash
./deploy.sh force
```

### Watch mode

```bash
./deploy.sh watch
```

What `deploy.sh` does (code-verified): fetch/pull `main`, rebuild containers, run `npx prisma migrate deploy`, run health check at `https://gym-api.quuilo.com/health`.

## Migration / Rebaseline Operations

### Standard migration apply

```bash
# inside running API container (already in deploy.sh)
sudo docker exec -i gym-api sh -lc "npx prisma migrate deploy --schema=prisma/schema.prisma"
```

### Fix migration history mismatch (rebaseline helper)

```bash
./deploy.sh fix-migrations
```

### First install / destructive reset (deletes DB data)

```bash
./deploy.sh reset-db
```

## Rollback

### Fast app rollback (previous commit)

```bash
git fetch origin
git checkout <previous-good-commit>
./deploy.sh force
```

### If deploy fails after migration attempt

```bash
# keep containers/logs available for diagnosis
sudo docker logs --tail 200 gym-api
sudo docker logs --tail 200 gym_api_db
```

### Last-resort schema rollback snippet (manual SQL)

```sql
DROP INDEX IF EXISTS "MemberPlanChangeHistory_memberId_effectiveDateDay_APPLIED_key";
ALTER TABLE "MemberPlanChangeHistory" DROP COLUMN IF EXISTS "effectiveDateDay";
```

Use only with explicit approval and backup.

## Post-Deploy Smoke

```bash
export BASE_URL="https://gym-api.quuilo.com"

curl -s -w "\nHTTP:%{http_code}\n" "$BASE_URL/health"
curl -s -i "$BASE_URL/health" | grep -i x-request-id
```

```bash
# auth smoke
curl -s -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Secret12345"}'
```
