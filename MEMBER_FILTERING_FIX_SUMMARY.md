# Member Filtering Semantic Fix - Implementation Summary

**Date:** 2026-01-31  
**Status:** ✅ Complete

## Problem Statement

Critical semantic mismatch in member filtering was discovered:
- Automatic renewal does NOT exist
- `membershipEndDate` is NOT NULL and set once at member creation
- Membership "active/expired/expiringSoon" is derived from `membershipEndDate`
- The `Member.status` enum (ACTIVE, PAUSED, INACTIVE, ARCHIVED) is NOT automatically updated on expiry

This caused mobile filtering bugs: "Aktif" and "Tümü" could look identical because expired members may still have `status=ACTIVE`.

## Solution Overview

Fixed mobile filters to reflect REAL membership state based on `membershipEndDate`, and added optional daily status sync cron job to keep the manual status field aligned.

---

## Part 1: Fixed Filtering Semantics for `/api/mobile/members`

### Changes Made

#### 1. **MembersService.findAll() - Critical Filter Fixes**

**File:** `backend/src/members/members.service.ts`

**Key Changes:**
- **status=ACTIVE filter:** Now requires BOTH `status=ACTIVE` AND `membershipEndDate >= today`
  - **Before:** Only checked `status=ACTIVE`
  - **After:** `status=ACTIVE AND membershipEndDate >= today`
  - **Impact:** Expired members with status=ACTIVE no longer appear in "Aktif" filter

- **expired filter:** Simplified to `membershipEndDate < today` (excludes ARCHIVED unless `includeArchived=true`)
  - **Before:** Used `getExpiredMembershipWhere()` which included `membershipEndDate IS NULL` check
  - **After:** Direct `membershipEndDate < today` filter (schema guarantees NOT NULL)
  - **Impact:** Cleaner query, matches actual schema constraints

- **expiringDays filter:** Already correct - requires `status=ACTIVE AND membershipEndDate in [today, today+expiringDays]`
  - **No changes needed**

- **isPassiveFilter:** Already correct - `status IN (INACTIVE, PAUSED)`
  - **No changes needed**

**Filter Priority (maintained):**
1. `expired=true` (highest precedence)
2. `expiringDays` 
3. `isPassiveFilter`
4. `status` (with ACTIVE requiring date check)
5. Default (exclude ARCHIVED)

#### 2. **DashboardService.getSummary() - Consistency Fix**

**File:** `backend/src/dashboard/dashboard.service.ts`

**Key Changes:**
- **activeMembers count:** Now uses `status=ACTIVE AND membershipEndDate >= today`
  - **Before:** Only `status=ACTIVE`
  - **After:** `status=ACTIVE AND membershipEndDate >= today`
  - **Impact:** Dashboard counts now match mobile filter semantics

- **passiveMembers count:** Now uses `status IN (INACTIVE, PAUSED)`
  - **Before:** Only `status=INACTIVE`
  - **After:** `status IN (INACTIVE, PAUSED)`
  - **Impact:** Includes both INACTIVE and PAUSED members

- **totalMembers count:** Now excludes ARCHIVED by default
  - **Before:** Included all members
  - **After:** `status != ARCHIVED`
  - **Impact:** Consistent with mobile "Tümü" filter

- **expiringSoonMembers count:** Already correct - `status=ACTIVE AND membershipEndDate in range`
  - **No changes needed**

#### 3. **Regression Tests Added**

**File:** `backend/test/members/members.service.spec.ts`

**New Tests:**
1. **Test:** `should NOT return members with status=ACTIVE but expired membershipEndDate when filtering by status=ACTIVE`
   - Verifies the critical fix: expired members don't appear in ACTIVE filter
   - Validates query includes both `status=ACTIVE` AND `membershipEndDate >= today`

2. **Test:** `should return expired members (status=ACTIVE but endDate < today) when expired=true`
   - Verifies expired filter correctly finds expired members
   - Validates query filters by `membershipEndDate < today` and excludes ARCHIVED

---

## Part 2: Daily Status Sync Cron Job (Optional)

### Changes Made

#### 1. **MemberStatusSyncService - New Service**

**File:** `backend/src/members/member-status-sync.service.ts`

**Purpose:**
- Syncs manual `status` field with derived membership state
- Finds members where `status=ACTIVE` but `membershipEndDate < today`
- Updates them to `status=INACTIVE`

**Features:**
- **Cron Schedule:** Runs daily at 03:00 AM UTC (`@Cron('0 3 * * *')`)
- **Tenant-scoped:** Processes all tenants independently
- **Error Handling:** Continues processing other tenants if one fails
- **Logging:** Logs counts per tenant (no PII)
- **Testable:** `syncExpiredMemberStatuses()` method can be called directly for testing

**Business Logic:**
```typescript
// Find members with status=ACTIVE but membershipEndDate < today
const expiredActiveMembers = await prisma.member.findMany({
  where: {
    tenantId: tenant.id,
    status: 'ACTIVE',
    membershipEndDate: { lt: today },
  },
});

// Update to INACTIVE
await prisma.member.updateMany({
  where: { /* same conditions */ },
  data: { status: 'INACTIVE' },
});
```

#### 2. **Module Registration**

**File:** `backend/src/members/members.module.ts`

- Added `MemberStatusSyncService` to providers array
- Service automatically starts cron job when app starts (via `@Cron` decorator)

---

## Final Query Mapping for Mobile Filters

### Mobile Chip → Backend Query Semantics

| Mobile Chip | Query Parameters | Backend Logic |
|------------|------------------|---------------|
| **Tümü** (All) | No filters | `status != ARCHIVED` (all members except archived) |
| **Aktif** (Active) | `status=ACTIVE` | `status=ACTIVE AND membershipEndDate >= today` ⚠️ **CRITICAL FIX** |
| **Süresi Dolmuş** (Expired) | `expired=true` | `membershipEndDate < today AND status != ARCHIVED` |
| **Pasif** (Passive) | `status=PASSIVE` → `isPassiveFilter=true` | `status IN (INACTIVE, PAUSED)` |
| **Yakında Bitecek** (Expiring Soon) | `expiringDays=7` | `status=ACTIVE AND membershipEndDate IN [today, today+7]` |

### Filter Priority (Enforced)

1. **expired=true** (highest precedence)
2. **expiringDays** (if not expired)
3. **isPassiveFilter** (if not expired/expiring)
4. **status** (if none above, with ACTIVE requiring date check)
5. **Default** (exclude ARCHIVED)

---

## Testing

### Unit Tests
- ✅ Added regression test for status=ACTIVE filter fix
- ✅ Added test for expired filter behavior
- ✅ Existing tests continue to pass

### Manual Testing Checklist
- [ ] Test "Aktif" filter: Should NOT show members with status=ACTIVE but expired endDate
- [ ] Test "Süresi Dolmuş" filter: Should show expired members regardless of status
- [ ] Test "Pasif" filter: Should show both INACTIVE and PAUSED members
- [ ] Test "Yakında Bitecek" filter: Should show only ACTIVE members expiring soon
- [ ] Test dashboard counts: Should match mobile filter semantics
- [ ] Test cron job: Should sync expired ACTIVE members to INACTIVE (can be tested manually)

---

## Files Modified

1. `backend/src/members/members.service.ts` - Fixed filtering logic
2. `backend/src/dashboard/dashboard.service.ts` - Updated counts to match semantics
3. `backend/test/members/members.service.spec.ts` - Added regression tests
4. `backend/src/members/member-status-sync.service.ts` - **NEW** - Cron job service
5. `backend/src/members/members.module.ts` - Registered cron service

---

## Migration Notes

### Breaking Changes
- **None** - This is a bug fix, not a breaking change
- Mobile apps will now see correct filtering behavior

### Backward Compatibility
- ✅ Existing API contracts unchanged
- ✅ Query parameters unchanged
- ✅ Only internal filtering logic changed

### Deployment Notes
1. Deploy backend changes
2. Cron job will start automatically on next app restart
3. First sync will run at 03:00 AM UTC next day
4. Monitor logs for sync job execution

---

## Future Enhancements

1. **Add e2e test** for cron job with time mocking
2. **Add metrics** for sync job (counts, duration, errors)
3. **Add admin endpoint** to manually trigger sync (for testing/debugging)
4. **Consider** adding index on `(status, membershipEndDate)` for better query performance

---

## Summary

✅ **Part 1 Complete:** Mobile filtering now correctly reflects real membership state  
✅ **Part 2 Complete:** Daily cron job syncs status field with derived state  
✅ **Tests Added:** Regression tests prevent future bugs  
✅ **Dashboard Fixed:** Counts match mobile filter semantics  

The critical semantic mismatch has been resolved. Mobile filters now correctly distinguish between:
- **Aktif:** Members with valid membership (status=ACTIVE AND endDate >= today)
- **Süresi Dolmuş:** Members with expired membership (endDate < today)
- **Pasif:** Operationally passive members (status INACTIVE/PAUSED)

The daily cron job ensures the manual status field stays aligned with derived membership state, preventing future inconsistencies.
