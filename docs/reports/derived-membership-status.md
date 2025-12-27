# Derived Membership Status Implementation Report

**Date:** December 27, 2025  
**Objective:** Fix data consistency bug where members show "Aktif" in detail page while "Süresi dolmuş" elsewhere

## Problem Statement

### The Inconsistency

A member could appear as:

- **"Aktif"** in Member Detail page (based on `Member.status` field)
- **"Süresi dolmuş"** in dashboard KPIs and other views (based on date calculations)

This created confusion and made the system unreliable.

### Root Cause

The system was using **two different sources of truth** for membership activity:

1. The persisted `Member.status` field (ACTIVE/PAUSED/INACTIVE/ARCHIVED)
2. Date-based calculations using `membershipEndDate`

The `status` field could become stale or inconsistent with actual membership validity based on dates.

## Solution: Single Source of Truth

### New Business Rule

**A member's membership is ACTIVE if and only if:**

```
membershipEndDate IS NOT NULL AND membershipEndDate >= today (start of day)
```

Otherwise, the membership is **EXPIRED/INACTIVE**.

**"Yakında Bitecek" (Expiring Soon)** means:

```
ACTIVE AND membershipEndDate <= today + 7 days
```

### Implementation Strategy

Instead of maintaining a cron job or background process to update status fields, we implement **derived/computed status** that is calculated on-the-fly from `membershipEndDate`.

## Changes Made

### 1. Backend - Core Utility (`backend/src/common/utils/membership-status.util.ts`)

Created a centralized utility module with:

- **`calculateMembershipStatus()`**: Computes all derived fields from `membershipEndDate`

  - `isMembershipActive: boolean`
  - `membershipState: 'ACTIVE' | 'EXPIRED'`
  - `daysRemaining: number | null`
  - `isExpiringSoon: boolean`

- **Prisma where clause helpers**:

  - `getActiveMembershipWhere()`: Filter for active members
  - `getExpiredMembershipWhere()`: Filter for expired members
  - `getExpiringSoonMembershipWhere()`: Filter for expiring soon members

- **Date utilities**:
  - `getTodayStart()`: Get today at 00:00:00 for consistent comparisons

### 2. Backend - Dashboard Service (`backend/src/dashboard/dashboard.service.ts`)

**Changes:**

- Removed all `status: 'ACTIVE'` checks from queries
- Now uses `getActiveMembershipWhere()` and `getExpiringSoonMembershipWhere()`
- Active members count: Based purely on `membershipEndDate >= today`
- Inactive members count: `totalMembers - activeMembers`
- Expiring soon count: Based purely on date range (today to today+7)

**Impact:**

- Dashboard KPIs (Active/Inactive/Expiring Soon) now consistent with actual membership validity
- No more discrepancies between different views

### 3. Backend - Members Service (`backend/src/members/members.service.ts`)

**Changes:**

- Added `enrichMemberWithComputedFields()` method
- All member endpoints now return computed fields:
  - `isMembershipActive`
  - `membershipState`
  - `daysRemaining`
  - `isExpiringSoon`
  - `remainingDays` (legacy field, kept for backwards compatibility)
- Updated: `create()`, `findOne()`, `list()`, `update()`, `changeStatus()`, `archive()`

**Preserved:**

- `Member.status` field remains in database (NOT removed)
- Status field still used for member workflow (PAUSED, ARCHIVED)
- Status transitions (ACTIVE ↔ PAUSED, ARCHIVED) still enforced
- But `status` is NO LONGER used to determine membership activity

### 4. Frontend - Types (`frontend/src/types/member.ts`)

**Changes:**

- Added computed fields to `Member` type:
  ```typescript
  isMembershipActive: boolean;
  membershipState: "ACTIVE" | "EXPIRED";
  daysRemaining: number | null;
  isExpiringSoon: boolean;
  ```

### 5. Frontend - MemberStatusBadge (`frontend/src/components/members/MemberStatusBadge.tsx`)

**Changes:**

- Now accepts `member` prop (preferred) or `status` prop (fallback)
- When `member` is provided, displays derived membership status:
  - "Aktif" (green) for active memberships
  - "Aktif (Yakında Bitecek)" (yellow) for expiring soon
  - "Süresi Dolmuş" (red) for expired memberships
- Shows color-coded visual indicators consistent with state

### 6. Frontend - Member Detail Page (`frontend/src/pages/MemberDetailPage.tsx`)

**Changes:**

- Now uses `<MemberStatusBadge member={member} />` instead of `status={member.status}`
- "Kalan Gün" display uses `member.isMembershipActive` and `member.daysRemaining`
- Color coding:
  - Green: Active with plenty of time
  - Yellow: Active but expiring soon (≤ 7 days)
  - Red: Expired

### 7. Frontend - Member List (`frontend/src/components/members/MemberList.tsx`)

**Changes:**

- Uses `<MemberStatusBadge member={member} />` for consistent display
- "Kalan Gün" column shows derived status with color coding

### 8. Tests

#### Unit Tests (`backend/src/common/utils/membership-status.util.spec.ts`)

- Comprehensive tests for `calculateMembershipStatus()`
- Tests for all edge cases:
  - Null dates
  - Past dates
  - Today
  - Within 7 days
  - Beyond 7 days
  - Date string parsing
  - Time portion handling

#### Integration Tests (`backend/src/dashboard/dashboard.service.spec.ts`)

- Updated to remove `status: 'ACTIVE'` expectations
- Tests now verify date-based filtering only

#### E2E Tests (`backend/test/derived-membership-status.e2e-spec.ts`)

- **NEW comprehensive test suite**
- Tests the bug scenario: member with `status=ACTIVE` but `membershipEndDate` expired
- Verifies dashboard KPIs calculate correctly
- Verifies member endpoints return computed fields
- Tests edge cases and inconsistent data scenarios

## Files Changed

### Backend

- **New:**

  - `backend/src/common/utils/membership-status.util.ts` (utility)
  - `backend/src/common/utils/membership-status.util.spec.ts` (unit tests)
  - `backend/test/derived-membership-status.e2e-spec.ts` (e2e tests)

- **Modified:**
  - `backend/src/dashboard/dashboard.service.ts`
  - `backend/src/dashboard/dashboard.service.spec.ts`
  - `backend/src/members/members.service.ts`

### Frontend

- **Modified:**
  - `frontend/src/types/member.ts`
  - `frontend/src/components/members/MemberStatusBadge.tsx`
  - `frontend/src/pages/MemberDetailPage.tsx`
  - `frontend/src/components/members/MemberList.tsx`

## Testing

### Run Unit Tests

```bash
cd backend
npm test -- membership-status.util.spec
```

### Run Dashboard Service Tests

```bash
npm test -- dashboard.service.spec
```

### Run E2E Tests (Derived Status)

```bash
npm run test:e2e -- derived-membership-status.e2e-spec
```

### Run All E2E Tests

```bash
npm run test:e2e
```

## Verification Steps

### 1. Create Test Data with Inconsistent Status

```bash
cd backend
npx ts-node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Create member with status=ACTIVE but expired date
  const member = await prisma.member.create({
    data: {
      tenantId: '<your-tenant-id>',
      branchId: '<your-branch-id>',
      membershipPlanId: '<your-plan-id>',
      firstName: 'Test',
      lastName: 'Inconsistent',
      phone: '555-TEST',
      membershipStartDate: yesterday,
      membershipEndDate: yesterday,
      status: 'ACTIVE', // Says active but expired
    },
  });
  console.log('Created member:', member.id);
}

test();
"
```

### 2. Verify Dashboard Shows Correctly

- Go to Dashboard
- Check "Aktif Üyeler" count - should NOT include the inconsistent member
- Check "Pasif/Süresi Dolmuş Üyeler" - should INCLUDE the inconsistent member

### 3. Verify Member Detail Shows Correctly

- Go to Member Detail page for the test member
- Should show "Süresi Dolmuş" badge (red)
- "Kalan Gün" should show "Süresi dolmuş" (red)
- Should be consistent everywhere

### 4. Verify Member List

- Go to Members list
- Test member should show "Süresi Dolmuş" status
- No "Aktif" badge despite `status=ACTIVE` in database

## Migration Notes

### No Database Migration Required

- No schema changes
- `Member.status` field remains unchanged
- Existing data works as-is

### Backwards Compatibility

- `remainingDays` field still computed (legacy support)
- API responses now include additional computed fields
- Frontend gradually updated to use new fields
- Old `status` field still available if needed for other purposes

### Rollback Plan

If issues arise:

1. Revert backend service changes
2. Revert frontend component changes
3. System returns to using `status` field (pre-fix behavior)
4. No data loss or corruption risk

## Benefits

### ✅ Consistency

- Single source of truth for membership activity
- No more discrepancies between views
- Dashboard and detail pages always agree

### ✅ Correctness

- Membership validity always accurate
- Real-time calculation, never stale
- Date-based logic is deterministic

### ✅ Maintainability

- Centralized logic in utility module
- Easy to test and verify
- No background jobs to maintain
- No race conditions or timing issues

### ✅ User Experience

- Clear, consistent status display
- Color-coded indicators (green/yellow/red)
- "Yakında Bitecek" warning when appropriate
- No confusing mixed signals

## Future Enhancements (Optional)

### 1. Status Field Usage

Consider updating the `Member.status` field to reflect membership activity:

- Keep using derived calculation for display
- Optionally sync `status` field via trigger or service
- Or deprecate `status` for membership activity entirely

### 2. Archived vs Expired

Current implementation:

- ARCHIVED is a separate workflow state
- EXPIRED is derived from dates
- Both can coexist (archived member can also be expired)

Consider clarifying:

- Should ARCHIVED members be counted as inactive?
- Should expired members auto-archive?
- Keep them separate for different business purposes?

### 3. Performance

Current approach calculates on every request:

- Acceptable for most workloads
- If needed, add database view or materialized view
- Or add indexed computed column (PostgreSQL generated column)

## Conclusion

The derived membership status implementation successfully resolves the data consistency bug. Members now display the same status across all views, based solely on `membershipEndDate`. The solution is:

- ✅ **Correct**: Single source of truth
- ✅ **Tested**: Comprehensive unit and E2E tests
- ✅ **Backwards compatible**: No breaking changes
- ✅ **Maintainable**: Centralized logic
- ✅ **User-friendly**: Clear, consistent display

The bug where a member could be "Aktif" in one place and "Süresi dolmuş" in another is now fixed.
