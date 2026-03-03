# Member Create Flow: Optional Fields Investigation

**Date:** 2026-02-28  
**Purpose:** Clarify `photoUrl` and `purchasePrice` (membershipPriceAtPurchase) in the Member Create flow  
**Note:** The field is named `membershipPriceAtPurchase` in the codebase, not `purchasePrice`.

---

## 1. Executive Summary

| Field | Entity | Intended Purpose | Required? | Used in Backend Logic? | Safe to Remove from Create UI? |
|-------|--------|------------------|-----------|------------------------|--------------------------------|
| **photoUrl** | Member | Member profile photo URL | No | Yes (create/update only) | Yes – optional, no downstream dependencies |
| **membershipPriceAtPurchase** | Member | Historical price at purchase time | No | Yes (create, plan changes, audit) | No – used for audit trail and plan change history |

---

## 2. Field Definitions

### 2.1 Where Are They Defined?

| Location | photoUrl | membershipPriceAtPurchase |
|----------|----------|---------------------------|
| **Prisma schema** | `backend/prisma/schema.prisma` line 246: `photoUrl String?` | Line 263: `membershipPriceAtPurchase Decimal? @db.Decimal(10, 2)` |
| **CreateMemberDto** | `backend/src/members/dto/create-member.dto.ts` line 58 | Line 75 |
| **UpdateMemberDto** | `backend/src/members/dto/update-member.dto.ts` line 74 | Forbidden via `@IsForbidden()` (line 23-28) |
| **Migration** | `backend/prisma/migrations/20251205000000_baseline/migration.sql` line 122 | Line 135 |
| **Frontend types** | `frontend/src/types/member.ts` lines 36, 72, 92 | Lines 40, 75 |

Both fields belong to the **Member** model. There is no `purchasePrice` field; the correct name is `membershipPriceAtPurchase`.

---

## 3. Business Meaning

### 3.1 photoUrl

**Intended meaning (from codebase):**
- Stores the URL of the member’s profile photo.
- Workflow: upload photo via `POST /api/v1/uploads/member-photo` → receive URL → create/update member with `photoUrl`.
- Documented as “Profile picture URL” in specs and “Optional profile field” in `MEMBER_CREATE_FIELD_ANALYSIS.md`.

**If it is not the member’s profile photo:**
- The codebase treats it as the member’s profile photo.
- If the product intent differs, the field’s purpose should be clarified and documented.

**Current usage:**
- Create: optional, stored if provided.
- Update: optional, can be set or cleared.
- Display: not rendered anywhere in the frontend (only in types).
- Upload: supported via `/api/v1/uploads/member-photo`.

### 3.2 membershipPriceAtPurchase

**Intended meaning:**
- Price paid for the membership at purchase time.
- Used for historical reporting when plan prices change.
- Allows discounts/promotions (e.g. member pays 250 when plan price is 300).

**Behavior:**
- **Membership price:** Yes – price paid for the membership.
- **Plan cost:** Mirrors plan price when not overridden.
- **One-time override:** Yes – optional override at creation.
- **Internal accounting:** No – `Payment.amount` is used for revenue; this is for historical tracking.

**Defaults:**
- If omitted: set to `plan.price`.
- If provided: used as-is (e.g. discounted price).

---

## 4. Current Usage in the System

### 4.1 photoUrl

| Usage | Location | Notes |
|------|----------|-------|
| Create member | `members.service.ts` line 166 | `photoUrl: dto.photoUrl \|\| null` |
| Update member | `members.service.ts` lines 504-505 | Optional update |
| API response | Returned in member payload | Part of Member model |
| Dashboard/Reports | None | Not used |
| Revenue calculations | None | Not used |
| Frontend display | None | Not rendered |

### 4.2 membershipPriceAtPurchase

| Usage | Location | Notes |
|------|----------|-------|
| Create member | `members.service.ts` lines 149-170 | Defaults to plan price if omitted |
| Update member | Forbidden | `@IsForbidden()` in UpdateMemberDto |
| Plan change scheduler | `membership-plan-change-scheduler.service.ts` lines 150, 178-179 | Applied when scheduled plan change takes effect |
| Plan change history | `members.service.ts` lines 939-940, 997-998 | `oldPriceAtPurchase`, `newPriceAtPurchase` in `MemberPlanChangeHistory` |
| Frontend display | `MemberDetailPage.tsx` lines 216-228 | Shown as “Satın Alma Fiyatı” if not null |
| Dashboard/Reports | None | Not used in dashboard |
| Revenue calculations | None | `Payment.amount` used instead |

---

## 5. Impact of Removing from Member Creation Flow

### 5.1 photoUrl

| Question | Answer |
|----------|--------|
| Will backend logic break? | No – optional, no required validation |
| Required by validation? | No – `@IsOptional()` |
| Legacy field? | No – used in upload workflow |
| Safe to remove from Create UI? | Yes – backend will store `null` if omitted |

**Recommendation:** Safe to remove from the Create Member form. The field can remain in the API for future use or for updates after creation.

### 5.2 membershipPriceAtPurchase

| Question | Answer |
|----------|--------|
| Will backend logic break? | No – defaults to plan price when omitted |
| Required by validation? | No – `@IsOptional()` |
| Legacy field? | No – used for audit and plan changes |
| Safe to remove from Create UI? | Yes – backend defaults to plan price |

**Recommendation:** Safe to remove from the Create Member form. The backend will use the plan’s current price. The field should stay in the model and API for:
- Historical reporting
- Plan change audit trail (`MemberPlanChangeHistory`)
- Scheduled plan change logic
- Optional override when a custom price is needed (e.g. discounts)

---

## 6. Conclusions and Recommendations

### A) Should remain and be properly defined

**membershipPriceAtPurchase:** Yes.
- Keep on Member model and in CreateMemberDto.
- Purpose: historical price tracking and audit trail.
- Optional in Create UI; backend defaults to plan price.

**photoUrl:** Depends on product intent.
- If it is the member’s profile photo: keep and document.
- If it is something else: clarify and document the intended use.

### B) Should be moved to another entity

**membershipPriceAtPurchase:** No.
- Belongs on Member because it is the price paid for that member’s membership.
- `MembershipPlan.price` is the current plan price; `membershipPriceAtPurchase` is the snapshot at purchase.

**photoUrl:** No.
- Belongs on Member as a profile attribute.

### C) Should be removed completely

**membershipPriceAtPurchase:** No.
- Used in plan change scheduler and `MemberPlanChangeHistory`.
- Removing would break audit trail and scheduled plan change logic.

**photoUrl:** Only if the product no longer needs member photos.
- No critical backend dependencies.
- Upload flow would become unused.

---

## 7. Summary Table

| Field | Keep in Model? | Keep in Create API? | Show in Create UI? | Notes |
|-------|----------------|---------------------|--------------------|-------|
| **photoUrl** | Yes (if photos needed) | Yes | Optional | No display in frontend today; clarify product intent |
| **membershipPriceAtPurchase** | Yes | Yes | Optional | Defaults to plan price; required for audit trail |

---

## 8. References

- Prisma schema: `backend/prisma/schema.prisma` (Member model)
- CreateMemberDto: `backend/src/members/dto/create-member.dto.ts`
- MembersService: `backend/src/members/members.service.ts`
- Plan change scheduler: `backend/src/members/services/membership-plan-change-scheduler.service.ts`
- Storage/upload: `backend/docs/STORAGE_IMPLEMENTATION.md`, `backend/docs/UPLOAD_FEATURE_SUMMARY.md`
- Specs: `specs/002-athlete-management/spec.md`, `specs/003-membership-plans/spec.md`
- Field analysis: `docs/MEMBER_CREATE_FIELD_ANALYSIS.md`
