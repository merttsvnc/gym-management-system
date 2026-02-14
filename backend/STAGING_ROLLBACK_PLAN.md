# Staging Rollback Plan

Fast rollback steps for the NestJS + Prisma backend. Use when a deployment causes critical issues.

---

## 1) Code Rollback

### Option A: Checkout previous tag/commit

```bash
# SSH to VPS
ssh user@api-staging.example.com
cd /opt/gym-backend

# Identify last known good commit/tag
git log --oneline -5
# or: git tag -l

# Checkout and deploy
git fetch origin
git checkout <previous-tag-or-commit>
# e.g. git checkout v1.2.3
# or:  git checkout abc1234

# Rebuild and restart
npm ci
npx prisma generate
npm run build
sudo systemctl restart gym-backend
# or: docker compose -f docker-compose.staging.yml up -d --build api
```

### Option B: Revert specific commit

```bash
git revert <bad-commit> --no-edit
git push origin main
# Then redeploy per runbook
```

---

## 2) Database Rollback

### Important

**Prisma `migrate deploy` does not auto-down migrations.** There is no built-in "rollback last migration" command.

### Safe mitigations (no schema rollback)

1. **Scale to 1 instance** – Reduces cron races if multiple instances are causing issues.
2. **Disable cron** – If you have a `CRON_ENABLED` env flag, set `CRON_ENABLED=false` and restart.  
   **Current state:** The codebase does not have `CRON_ENABLED`. As a follow-up PR, add a minimal guard:
   ```ts
   // In membership-plan-change-scheduler.service.ts
   @Cron('0 2 * * *')
   async applyScheduledMembershipPlanChanges() {
     if (process.env.CRON_ENABLED === 'false') return;
     // ... existing logic
   }
   ```
   Then set `CRON_ENABLED=false` in env to pause cron without code rollback.

### PR-2 index/column rollback (only if absolutely necessary)

**Use only when:** The `effectiveDateDay` column or partial unique index causes production issues and you must revert.

Run manually against the database:

```sql
-- Drop partial unique index
DROP INDEX IF EXISTS "MemberPlanChangeHistory_memberId_effectiveDateDay_APPLIED_key";

-- Drop column (only if you must fully revert)
ALTER TABLE "MemberPlanChangeHistory" DROP COLUMN IF EXISTS "effectiveDateDay";
```

**Warning:** After dropping, Prisma migration history will be out of sync. You would need a new migration that matches the reverted state, or to mark the original migration as rolled back in `_prisma_migrations` (advanced, not recommended unless necessary).

---

## 3) Rollback Checklist

- [ ] Identify last known good commit/tag
- [ ] Checkout and rebuild
- [ ] Restart service (systemd or Docker)
- [ ] Verify `/health` returns 200
- [ ] Run smoke tests 1–4 from `STAGING_SMOKE_TESTS.md`
- [ ] If cron-related: scale to 1 instance or disable via `CRON_ENABLED=false` (when implemented)
- [ ] If DB migration caused issues: consider index/column rollback SQL only as last resort

---

## 4) Post-Rollback

- Document root cause
- Fix in a new branch/PR
- Re-deploy to staging and re-run smoke tests before promoting
