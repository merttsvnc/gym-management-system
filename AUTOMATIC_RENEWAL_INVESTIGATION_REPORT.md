# INVESTIGATION REPORT: Automatic Membership Renewal

## System: Gym Management Backend (NestJS)

## Date: January 31, 2026

---

## EXECUTIVE SUMMARY

**Finding:** **B) Automatic renewal DOES NOT exist**

The system has **NO automatic membership renewal** mechanism. The `autoRenew` field exists on `MembershipPlan` but is **not implemented** — it's a placeholder/future feature flag with no business logic wired to it.

---

## DETAILED FINDINGS

### 1. Search Results for Renewal Keywords

#### `autoRenew` field:

- ✅ **EXISTS** in database schema (`MembershipPlan.autoRenew`, default: `false`)
- ✅ **EXISTS** in DTOs (`CreatePlanDto`, `UpdatePlanDto`)
- ✅ **STORED** when creating/updating plans
- ❌ **NOT USED** anywhere in business logic
- ❌ **NO CODE** checks this field
- ❌ **NO JOBS** reference this field

**Evidence:**

```typescript
// backend/prisma/schema.prisma (line 191)
model MembershipPlan {
  autoRenew     Boolean      @default(false)
  // ... other fields
}
```

#### Other renewal keywords:

- ❌ `renewal` - Only mentioned in comments/docs, no implementation
- ❌ `recurring` - Not found
- ❌ `subscription` - Only in high-level docs, no recurring subscription logic
- ❌ `billingCycle` - Not found
- ❌ `nextBillingDate` - Not found
- ❌ `nextRenewalDate` - Not found

---

### 2. Database Schema Analysis

#### Member Model (`Member`)

```prisma
model Member {
  membershipPlanId          String
  membershipStartDate       DateTime
  membershipEndDate         DateTime    // NOT NULL - required field
  membershipPriceAtPurchase Decimal?

  // Pending plan change (for scheduled changes)
  pendingMembershipPlanId            String?
  pendingMembershipStartDate         DateTime?
  pendingMembershipEndDate           DateTime?
  pendingMembershipPriceAtPurchase   Decimal?
  pendingMembershipScheduledAt       DateTime?
  pendingMembershipScheduledByUserId String?

  status    MemberStatus @default(ACTIVE)
  // ... other fields
}
```

**Key observations:**

1. ✅ `membershipEndDate` is **NOT NULL** (required field)
2. ✅ Set **ONCE** at member creation
3. ❌ **NEVER extended** automatically
4. ❌ **NO logic** to recalculate based on payments

---

### 3. Payment Flow Analysis

**File:** `backend/src/payments/payments.service.ts`

#### `createPayment()` method:

```typescript
async createPayment(
  tenantId: string,
  userId: string,
  input: CreatePaymentInput,
  idempotencyKey?: string,
) {
  // Validates member, amount, date
  // Creates payment record
  // Logs event
  // ❌ DOES NOT modify membershipEndDate
  // ❌ DOES NOT extend membership
  return payment;
}
```

**Conclusion:**

- ✅ Payments are **recorded**
- ❌ Payments **DO NOT** extend membership
- ❌ Payments **DO NOT** trigger any renewal logic
- ❌ No webhooks or event handlers for payment success

---

### 4. Membership End Date Calculation

**File:** `backend/src/membership-plans/utils/duration-calculator.ts`

```typescript
export function calculateMembershipEndDate(
  startDate: Date,
  durationType: DurationType,
  durationValue: number,
): Date {
  // Calculates ONCE based on plan duration
  if (durationType === "DAYS") {
    return addDays(startDate, durationValue);
  } else if (durationType === "MONTHS") {
    return addMonths(startDate, durationValue);
  }
}
```

**Used in:**

1. ✅ Member creation (`members.service.ts:147`)
2. ✅ Scheduled plan changes (`members.service.ts:874`)
3. ❌ **NEVER** called after payment
4. ❌ **NEVER** called periodically

---

### 5. Scheduled Jobs / Cron Analysis

#### Only ONE scheduled job exists:

**File:** `backend/src/members/services/membership-plan-change-scheduler.service.ts`

```typescript
@Cron('0 2 * * *') // Every day at 02:00 AM
async applyScheduledMembershipPlanChanges() {
  // Finds members with pendingMembershipPlanId
  // Applies scheduled plan changes
  // ❌ DOES NOT renew memberships
  // ❌ DOES NOT extend membershipEndDate
  // ❌ DOES NOT handle expiration
}
```

**Purpose:** Apply **manual** plan changes scheduled by staff (e.g., upgrade/downgrade at period end)

**What it does NOT do:**

- ❌ Does NOT automatically renew memberships
- ❌ Does NOT charge payments
- ❌ Does NOT extend expiring memberships
- ❌ Does NOT move members to INACTIVE status

---

### 6. Membership Status Logic

**File:** `backend/src/common/utils/membership-status.util.ts`

```typescript
/**
 * BUSINESS RULE:
 * A member is ACTIVE iff:
 * - membershipEndDate >= today
 * Otherwise member is EXPIRED
 */
export function calculateMembershipStatus(
  membershipEndDate: Date | null,
): DerivedMembershipStatus {
  if (!membershipEndDate) {
    return { membershipState: 'EXPIRED', ... };
  }

  const isMembershipActive = endDate >= today;
  return {
    membershipState: isMembershipActive ? 'ACTIVE' : 'EXPIRED',
    daysRemaining: isMembershipActive ? daysDiff : 0,
    isExpiringSoon: isMembershipActive && daysDiff <= 7,
  };
}
```

**Key points:**

- ✅ Membership expiry is **derived** (calculated on-the-fly)
- ✅ No background job sets status to INACTIVE
- ✅ UI/API computes status dynamically from `membershipEndDate`
- ❌ No automatic status changes

---

### 7. `membershipEndDate = NULL` Analysis

**Database constraint:**

```prisma
membershipEndDate  DateTime  // NOT NULL
```

**Conclusion:**

- ✅ `membershipEndDate` is **NOT NULL** by design
- ✅ Required field — **MUST** be set at creation
- ❌ Cannot be NULL in current schema
- ⚠️ Legacy code has null-checks (defensive programming), but:
  - Schema enforces NOT NULL
  - Should never be null unless data corruption or manual DB edits

**Evidence from utility:**

```typescript
// membership-status.util.ts:56
if (!membershipEndDate) {
  // If no membership end date, consider expired
  return { membershipState: 'EXPIRED', ... };
}
```

This is a **defensive check** for edge cases, but the schema prevents NULL.

---

### 8. TODOs / Commented Code / Dead Logic

**Search results:** ❌ No TODOs, FIXMEs, or XXX comments related to renewal

**Findings:**

- No commented-out renewal logic
- No unfinished renewal implementation
- `autoRenew` field is simply stored but unused

---

## WHAT HAPPENS TODAY (Current Flow)

### Member Lifecycle:

1. **Creation:**
   - Staff creates member
   - `membershipStartDate` = today (or custom)
   - `membershipEndDate` = calculated from plan (e.g., start + 30 days)
   - `membershipPriceAtPurchase` = snapshotted price

2. **Active Period:**
   - Member uses gym
   - Payments recorded (no impact on membership duration)

3. **Before Expiry:**
   - System shows "expiring soon" warnings (7 days)
   - UI displays days remaining
   - ❌ **NO automatic action**

4. **After Expiry:**
   - `membershipEndDate < today` → Derived status = EXPIRED
   - Member still exists in database
   - Status field (`status`) remains ACTIVE (manual field, not auto-updated)
   - ❌ **NO automatic renewal**
   - ❌ **NO automatic status change to INACTIVE**
   - ⚠️ Staff must manually handle expired members

5. **Renewal (Manual):**
   - Staff must manually:
     - Schedule a plan change, OR
     - Create a new member record (not recommended), OR
     - Update `membershipEndDate` directly (not exposed in API)

---

## MANUAL PLAN CHANGE WORKFLOW

The system **does** have a scheduled plan change feature, but it's **manual**:

**Staff can:**

1. Call `POST /members/:id/plan-changes` with new plan
2. System schedules change for **end of current period** (`membershipEndDate + 1 day`)
3. Cron job applies change at 02:00 AM daily
4. New plan period starts

**But:**

- ❌ This requires **manual staff action**
- ❌ Not triggered by payment
- ❌ Not automatic based on `autoRenew`

---

## CONCLUSION

### Option B: Automatic renewal DOES NOT exist

**Summary:**

- `membershipEndDate` is set **once** at creation
- Payments do **not** extend membership
- No background jobs renew memberships
- `autoRenew` field exists but is **unused**
- Membership expiry is **derived** (calculated from `membershipEndDate`)
- No automatic status transitions to INACTIVE

### Current Product Behavior:

- **One-time membership model:** Pay once, use until `membershipEndDate`
- **Manual renewal:** Staff must intervene after expiry
- **Payments track revenue:** Independent of membership duration

---

## RECOMMENDATIONS

### 1. Database Schema: Enforce NOT NULL

**Status:** ✅ Already enforced

`membershipEndDate` is already NOT NULL in schema. The defensive null-checks in code are fine (defensive programming), but the schema prevents NULL values.

**Recommendation:** Keep as-is. No changes needed.

---

### 2. Remove or Implement `autoRenew`

**Option A: Remove field (if not planned)**

- Drop column from database
- Remove from DTOs
- Simplify codebase

**Option B: Implement auto-renewal (if needed)**
Would require:

1. Payment success handler that:
   - Checks `plan.autoRenew === true`
   - Extends `membershipEndDate` by plan duration
   - Logs renewal event

2. Expiry handler cron job that:
   - Finds members with `membershipEndDate < today`
   - If `plan.autoRenew === true` → attempts payment + extends period
   - If `plan.autoRenew === false` → sets `status = INACTIVE`

3. Failed payment handling:
   - Grace period logic
   - Retry attempts
   - Status updates (e.g., PAST_DUE)

---

### 3. Clarify Product Model

**Current model:** One-time membership (gym membership pre-paid for fixed period)

**Decision needed:**

- Keep one-time model? (simpler, current behavior)
- Add recurring subscriptions? (complex, requires payment integration)

**If staying one-time:**

- ✅ Remove `autoRenew` field (unused complexity)
- ✅ Document manual renewal process
- ✅ Consider UI workflow for staff to renew members

**If adding recurring:**

- Implement Option B above
- Add payment integration (Stripe, etc.)
- Add grace periods, retry logic
- Update data model (billing cycles, next charge date)

---

### 4. Automatic Status Management

**Current:** `status` field is manual (not automatically updated on expiry)

**Recommendation:** Add cron job to:

```typescript
@Cron('0 3 * * *') // Daily at 03:00 AM
async updateExpiredMembersStatus() {
  // Find members where:
  // - status = ACTIVE
  // - membershipEndDate < today
  // Update to status = INACTIVE
}
```

**Why:** Keeps `status` field in sync with derived membership state

---

### 5. Document Existing Behavior

Add to system docs:

- Membership is **not** auto-renewed
- Payments are **independent** of membership duration
- Staff must manually handle expirations
- `autoRenew` field is unused (future feature or should be removed)

---

## FILES ANALYZED

### Key Files:

1. ✅ `backend/prisma/schema.prisma` - Database models
2. ✅ `backend/src/members/members.service.ts` - Member business logic
3. ✅ `backend/src/payments/payments.service.ts` - Payment handling
4. ✅ `backend/src/membership-plans/membership-plans.service.ts` - Plan management
5. ✅ `backend/src/members/services/membership-plan-change-scheduler.service.ts` - Scheduled plan changes
6. ✅ `backend/src/membership-plans/utils/duration-calculator.ts` - End date calculation
7. ✅ `backend/src/common/utils/membership-status.util.ts` - Status derivation

### Modules Checked:

- ✅ Members module
- ✅ Payments module
- ✅ Membership Plans module
- ✅ Scheduler module
- ✅ Dashboard module

---

## APPENDIX: Code Evidence

### A. Member Creation (sets end date once)

`members.service.ts:147`

```typescript
const membershipEndDate = calculateMembershipEndDate(
  membershipStartDate,
  plan.durationType,
  plan.durationValue,
);
```

### B. Payment Creation (no membership extension)

`payments.service.ts:115`

```typescript
payment = await this.prisma.payment.create({
  data: {
    tenantId,
    branchId: member.branchId,
    memberId: input.memberId,
    amount: new Decimal(input.amount),
    paidOn: paidOnDate,
    paymentMethod: input.paymentMethod,
    note: input.note,
    createdBy: userId,
  },
  // ❌ No membership extension logic
});
```

### C. Only Cron Job (scheduled plan changes, not renewal)

`membership-plan-change-scheduler.service.ts:19`

```typescript
@Cron('0 2 * * *') // Every day at 02:00 AM
async applyScheduledMembershipPlanChanges() {
  // Applies MANUAL plan changes scheduled by staff
  // ❌ NOT automatic renewal
}
```

---

**END OF REPORT**
