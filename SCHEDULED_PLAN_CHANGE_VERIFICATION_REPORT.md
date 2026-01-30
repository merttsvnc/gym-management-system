# Scheduled Membership Plan Change - Verification Report

**Date:** 2026-01-30  
**Feature:** Scheduled Membership Plan Change  
**Auditor:** Senior NestJS + Prisma Reviewer

---

## Executive Summary

The Scheduled Membership Plan Change feature has been implemented with **good overall structure** but contains **critical timezone-related risks** that must be addressed before production deployment. The cron job wiring is correct, security constraints are properly enforced, and transactions are used correctly. However, date-only comparisons lack timezone normalization, which could lead to off-by-one day errors in production.

**Overall Status:** ⚠️ **REQUIRES FIXES BEFORE PRODUCTION**

---

## 1. Cron Wiring Check ✅ PASSED

### Findings

- ✅ **@nestjs/schedule installed:** Version 6.1.0 present in `backend/package.json` (line 30)
- ✅ **ScheduleModule.forRoot() imported:** Correctly imported in `backend/src/app.module.ts` (line 25)
- ✅ **Scheduler service provided:** `MembershipPlanChangeSchedulerService` is provided in `MembersModule` (line 11 of `members.module.ts`)
- ✅ **Module loaded at runtime:** `MembersModule` is imported in `AppModule` (line 39 of `app.module.ts`)
- ✅ **Cron decorator configured:** `@Cron('0 2 * * *')` runs daily at 02:00 AM (line 19 of `membership-plan-change-scheduler.service.ts`)

### Conclusion

The cron job is properly wired and will run in production. No fixes required.

---

## 2. Date-Only Correctness ❌ CRITICAL ISSUES FOUND

### Findings

#### Schema Analysis
- **Field types:** All date fields (`membershipStartDate`, `membershipEndDate`, `pendingMembershipStartDate`, `pendingMembershipEndDate`) are stored as `DateTime` in Prisma schema (lines 236-243 of `schema.prisma`)
- **Storage:** PostgreSQL stores these as `TIMESTAMP` (with time component)

#### Schedule Logic Analysis (`members.service.ts`, lines 775-788)

```typescript
const currentEndDate = member.membershipEndDate || new Date();
const pendingStartDate = new Date(currentEndDate);
pendingStartDate.setDate(pendingStartDate.getDate() + 1);
pendingStartDate.setHours(0, 0, 0, 0); // ⚠️ LOCAL TIMEZONE, NOT UTC
```

**Issue:** `setHours(0,0,0,0)` normalizes to local timezone midnight, not UTC midnight. If the server runs in a timezone different from the tenant's business timezone, this creates inconsistency.

#### Apply Job Logic Analysis (`membership-plan-change-scheduler.service.ts`, lines 23-24, 32-34)

```typescript
const today = new Date();
today.setHours(0, 0, 0, 0); // ⚠️ LOCAL TIMEZONE, NOT UTC

// Query uses:
pendingMembershipStartDate: {
  lte: today, // ⚠️ COMPARISON MAY FAIL DUE TO TIMEZONE MISMATCH
}
```

**Critical Issue:** 
1. `today` is normalized to local server timezone midnight
2. `pendingMembershipStartDate` was stored with local timezone normalization in `schedulePlanChange()`
3. If server timezone changes or differs from tenant timezone, comparisons will be incorrect
4. **Off-by-one risk:** A date stored as "2026-01-31 00:00:00+03:00" (Turkey) vs "2026-01-31 00:00:00+00:00" (UTC) will compare differently

#### Duration Calculator Analysis (`duration-calculator.ts`)

- Uses `date-fns` `addDays()` and `addMonths()` which preserve time components
- No timezone normalization in calculator (acceptable, but requires consistent input)

### Required Fixes

#### Fix 1: Normalize all date-only operations to UTC midnight

**File:** `backend/src/members/members.service.ts`

**Location:** `schedulePlanChange()` method, lines 775-781

**Current Code:**
```typescript
const currentEndDate = member.membershipEndDate || new Date();
const pendingStartDate = new Date(currentEndDate);
pendingStartDate.setDate(pendingStartDate.getDate() + 1);
pendingStartDate.setHours(0, 0, 0, 0);
```

**Fixed Code:**
```typescript
const currentEndDate = member.membershipEndDate || new Date();
const pendingStartDate = new Date(currentEndDate);
pendingStartDate.setUTCDate(pendingStartDate.getUTCDate() + 1);
pendingStartDate.setUTCHours(0, 0, 0, 0);
```

**File:** `backend/src/members/services/membership-plan-change-scheduler.service.ts`

**Location:** `applyScheduledMembershipPlanChanges()` method, lines 23-24

**Current Code:**
```typescript
const today = new Date();
today.setHours(0, 0, 0, 0);
```

**Fixed Code:**
```typescript
const today = new Date();
today.setUTCHours(0, 0, 0, 0);
```

#### Fix 2: Add helper function for date-only normalization (Recommended)

**File:** `backend/src/common/utils/date-utils.ts` (create new file)

**Code:**
```typescript
/**
 * Normalize a date to UTC midnight (date-only, no time component)
 * Use this for all date-only business logic to avoid timezone issues
 * 
 * @param date - Date to normalize (can be Date object or null/undefined)
 * @returns Date normalized to UTC midnight, or null if input is null/undefined
 */
export function toDateOnlyUTC(date: Date | null | undefined): Date | null {
  if (!date) return null;
  const normalized = new Date(date);
  normalized.setUTCHours(0, 0, 0, 0);
  return normalized;
}

/**
 * Add days to a date-only value (UTC normalized)
 * Returns a new date normalized to UTC midnight
 * 
 * @param date - Base date (will be normalized to UTC midnight)
 * @param days - Number of days to add (can be negative)
 * @returns New date normalized to UTC midnight
 */
export function addDaysDateOnlyUTC(date: Date, days: number): Date {
  const normalized = toDateOnlyUTC(date)!;
  normalized.setUTCDate(normalized.getUTCDate() + days);
  return normalized;
}
```

**Update `members.service.ts` to use helper:**
```typescript
import { addDaysDateOnlyUTC, toDateOnlyUTC } from '../common/utils/date-utils';

// In schedulePlanChange():
const currentEndDate = member.membershipEndDate || new Date();
const pendingStartDate = addDaysDateOnlyUTC(
  toDateOnlyUTC(currentEndDate)!,
  1
);
```

**Update `membership-plan-change-scheduler.service.ts` to use helper:**
```typescript
import { toDateOnlyUTC } from '../../common/utils/date-utils';

// In applyScheduledMembershipPlanChanges():
const today = toDateOnlyUTC(new Date())!;
```

### Risk Assessment

- **Severity:** HIGH
- **Impact:** Off-by-one day errors in plan change application
- **Likelihood:** HIGH (if server timezone differs from tenant timezone or changes)
- **Mitigation:** Use UTC normalization for all date-only operations

---

## 3. History Correctness ✅ MOSTLY CORRECT

### Findings

- ✅ **SCHEDULED history written:** Correctly created in `schedulePlanChange()` transaction (lines 812-830 of `members.service.ts`)
- ✅ **CANCELLED history written:** Correctly created in `cancelPendingPlanChange()` transaction (lines 870-890)
- ✅ **APPLIED history written:** Correctly created in `applyPendingChange()` transaction (lines 116-136 of scheduler service)
- ✅ **changedByUserId for SCHEDULED:** Correctly set to authenticated user ID (line 828)
- ✅ **changedByUserId for CANCELLED:** Correctly set to original scheduler user ID (line 888)
- ⚠️ **changedByUserId for APPLIED:** Uses `member.pendingMembershipScheduledByUserId` (line 134 of scheduler service)
  - **Risk:** This field could be `null` if:
    1. Member was scheduled before `pendingMembershipScheduledByUserId` field existed
    2. Data migration didn't populate historical records
  - **Impact:** Low (audit trail incomplete but not breaking)
- ✅ **tenantId always set:** Correctly set in all history records
- ✅ **Plan IDs correct:** `oldPlanId` and `newPlanId` correctly captured
- ✅ **Dates correct:** All date fields correctly captured in history

### Recommended Improvement (Optional)

**File:** `backend/src/members/services/membership-plan-change-scheduler.service.ts`

**Location:** Line 134

**Current Code:**
```typescript
changedByUserId: member.pendingMembershipScheduledByUserId,
```

**Improved Code:**
```typescript
changedByUserId: member.pendingMembershipScheduledByUserId || null,
// Note: null indicates system-applied change where original scheduler is unknown
```

**Status:** This is acceptable as-is, but explicit null handling improves clarity.

---

## 4. Security & Constraints ✅ PASSED

### Findings

#### Tenant Isolation
- ✅ **Member lookup:** `findOne()` method validates `member.tenantId === tenantId` (lines 322-324 of `members.service.ts`)
- ✅ **Plan lookup:** Uses `membershipPlansService.getPlanByIdForTenant()` which enforces tenant isolation (line 747)
- ✅ **Scheduler service:** Validates `member.tenantId !== tenantId` throws error (lines 89-93)

#### Branch Constraints
- ✅ **Branch validation:** Plan scope checked - if `plan.scope === 'BRANCH'`, validates `plan.branchId === member.branchId` (lines 758-762)
- ✅ **Error message:** Turkish error message returned (line 760)

#### Forbidden Fields
- ✅ **UpdateMemberDto:** `membershipPlanId` and `membershipPriceAtPurchase` are marked with `@IsForbidden()` decorator (lines 18-28 of `update-member.dto.ts`)
- ✅ **Validation:** Custom validator `IsForbidden` prevents these fields from being updated via PATCH endpoint
- ✅ **Error messages:** Turkish error messages provided

### Conclusion

All security constraints are properly enforced. No fixes required.

---

## 5. Transaction & Idempotency ✅ PASSED

### Findings

#### Transactions
- ✅ **Schedule:** Uses `prisma.$transaction()` (line 797 of `members.service.ts`)
- ✅ **Cancel:** Uses `prisma.$transaction()` (line 855)
- ✅ **Apply:** Uses `prisma.$transaction()` (line 96 of scheduler service)

#### Idempotency
- ✅ **Apply job idempotent:** Checks `if (!member.pendingMembershipPlanId) return;` before applying (lines 84-87 of scheduler service)
- ✅ **No double-apply:** Running twice on same member with no pending change is safe (returns early)
- ✅ **Overwrite behavior:** Scheduling again replaces pending fields cleanly (lines 799-808)
- ✅ **No-op behavior:** Same plan selected and no pending returns early with message (lines 765-773)

### Conclusion

All transaction and idempotency requirements are met. No fixes required.

---

## 6. Tests & Coverage ⚠️ GOOD BUT INCOMPLETE

### Findings

#### Existing Tests (`scheduled-plan-change.e2e-spec.ts`)

- ✅ **Schedule new plan:** Tests pending fields set, active unchanged (lines 123-156)
- ✅ **Overwrite pending:** Tests second schedule overwrites first (lines 158-194)
- ✅ **Cancel pending:** Tests cancellation clears fields and creates CANCELLED history (lines 302-336)
- ✅ **No-op behavior:** Tests same plan + no pending returns message (lines 196-215)
- ✅ **Error cases:** Tests 404 for member not found, plan not found (lines 217-239)
- ✅ **Validation:** Tests inactive plan rejected, branch mismatch rejected (lines 241-298)
- ✅ **Apply job:** Tests pending change applied when start date is today/past (lines 353-419)
- ✅ **Idempotency:** Tests apply job is idempotent (lines 421-437)
- ✅ **Turkish messages:** Tests assert Turkish error messages (line 212, etc.)

#### Missing Edge Cases

1. ❌ **pendingStartDate exactly today:** Not explicitly tested
   - Current test uses `addDays(today, 1)` (line 364), should test `pendingStartDate === today`

2. ❌ **Member with null membershipEndDate:** Edge case handled in code (line 777: `member.membershipEndDate || new Date()`) but not tested
   - Should test: member created without `membershipEndDate` (if possible) or with `null`

3. ❌ **Plan duration months across month boundaries:** Not tested
   - Example: Jan 31 + 1 month = Feb 28/29
   - Example: Mar 31 + 1 month = Apr 30
   - Should verify `calculateMembershipEndDate()` handles these correctly in context of plan changes

4. ⚠️ **Timezone normalization:** Not tested
   - Should test: dates stored in different timezones compare correctly
   - Should test: UTC normalization works as expected

### Recommended Additional Tests

**File:** `backend/test/members/scheduled-plan-change.e2e-spec.ts`

**Add these test cases:**

```typescript
describe('Edge Cases', () => {
  it('should apply pending change when pendingStartDate is exactly today', async () => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const member = await createTestMember(prisma, tenant1.id, branch1.id, {
      membershipPlanId: plan1Month.id,
      membershipStartDate: addDays(today, -30),
      membershipEndDate: today,
    });

    // Schedule change with start date = today (UTC normalized)
    const pendingStartDate = new Date(today);
    pendingStartDate.setUTCHours(0, 0, 0, 0);
    const pendingEndDate = addMonths(pendingStartDate, 3);

    await prisma.member.update({
      where: { id: member.id },
      data: {
        pendingMembershipPlanId: plan3Months.id,
        pendingMembershipStartDate: pendingStartDate,
        pendingMembershipEndDate: pendingEndDate,
        pendingMembershipPriceAtPurchase: 250,
        pendingMembershipScheduledAt: new Date(),
        pendingMembershipScheduledByUserId: user1.id,
      },
    });

    // Apply should work
    await schedulerService.applyPendingChange(member.id, tenant1.id);

    const updatedMember = await prisma.member.findUnique({
      where: { id: member.id },
    });
    expect(updatedMember?.membershipPlanId).toBe(plan3Months.id);
    expect(updatedMember?.pendingMembershipPlanId).toBeNull();
  });

  it('should handle member with null membershipEndDate gracefully', async () => {
    // Create member without explicit endDate (should use calculated)
    const member = await createTestMember(prisma, tenant1.id, branch1.id, {
      membershipPlanId: plan1Month.id,
      membershipStartDate: new Date(),
      // membershipEndDate not provided - should be calculated
    });

    // Schedule change should work
    const response = await request(app.getHttpServer())
      .post(`/api/v1/members/${member.id}/schedule-membership-plan-change`)
      .set('Authorization', `Bearer ${token1}`)
      .send({
        membershipPlanId: plan3Months.id,
      })
      .expect(200);

    expect(response.body.pendingMembershipPlanId).toBe(plan3Months.id);
    expect(response.body.pendingMembershipStartDate).toBeDefined();
  });

  it('should handle month boundary dates correctly (Jan 31 + 1 month)', async () => {
    const jan31 = new Date('2026-01-31T00:00:00Z');
    jan31.setUTCHours(0, 0, 0, 0);

    const member = await createTestMember(prisma, tenant1.id, branch1.id, {
      membershipPlanId: plan1Month.id,
      membershipStartDate: addDays(jan31, -30),
      membershipEndDate: jan31,
    });

    // Schedule change - start date should be Feb 1 (or Feb 28/29 if using month arithmetic)
    const response = await request(app.getHttpServer())
      .post(`/api/v1/members/${member.id}/schedule-membership-plan-change`)
      .set('Authorization', `Bearer ${token1}`)
      .send({
        membershipPlanId: plan1Month.id, // 1 month plan
      })
      .expect(200);

    const pendingStartDate = new Date(response.body.pendingMembershipStartDate);
    const pendingEndDate = new Date(response.body.pendingMembershipEndDate);

    // pendingStartDate should be Feb 1 (Jan 31 + 1 day)
    expect(pendingStartDate.getUTCDate()).toBe(1);
    expect(pendingStartDate.getUTCMonth()).toBe(1); // February (0-indexed)

    // pendingEndDate should be valid (Feb 28/29 or Mar 1 depending on calculation)
    expect(pendingEndDate.getTime()).toBeGreaterThan(pendingStartDate.getTime());
  });
});
```

### Conclusion

Test coverage is good but missing critical edge cases. Recommended to add tests before production.

---

## Summary of Required Fixes

### ❌ Critical (Must Fix Before Production)

1. **Date-only timezone normalization** (Section 2)
   - Fix `schedulePlanChange()` to use UTC normalization
   - Fix `applyScheduledMembershipPlanChanges()` to use UTC normalization
   - **Files:** `members.service.ts`, `membership-plan-change-scheduler.service.ts`

### ⚠️ Recommended (Should Fix)

2. **Add date utility helpers** (Section 2)
   - Create `date-utils.ts` with `toDateOnlyUTC()` and `addDaysDateOnlyUTC()`
   - Refactor code to use helpers for consistency

3. **Add missing edge case tests** (Section 6)
   - Test `pendingStartDate === today`
   - Test member with null `membershipEndDate`
   - Test month boundary dates
   - Test timezone normalization

### ✅ Optional Improvements

4. **Explicit null handling in APPLIED history** (Section 3)
   - Make `changedByUserId: null` explicit when scheduler user unknown

---

## Verification Checklist

- [x] Cron wiring verified
- [x] Date-only correctness audited (issues found)
- [x] History correctness verified
- [x] Security & constraints verified
- [x] Transaction & idempotency verified
- [x] Tests reviewed (coverage gaps identified)

---

## Next Steps

1. **Immediate:** Apply critical timezone fixes (Section 2)
2. **Before production:** Add missing edge case tests (Section 6)
3. **Optional:** Refactor to use date utility helpers for maintainability

---

**Report Generated:** 2026-01-30  
**Status:** ⚠️ **REQUIRES FIXES BEFORE PRODUCTION**
