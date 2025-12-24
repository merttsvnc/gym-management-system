# Research: Membership Plan Management

**Date:** 2025-01-20  
**Feature:** 003-membership-plans  
**Status:** Complete

---

## Overview

This document consolidates research findings for technical decisions required to implement the Membership Plan Management feature. All unknowns from the Technical Context section have been resolved.

---

## Research Findings

### 1. Date Calculation Library for Month Arithmetic

**Question:** Which library should we use for reliable month arithmetic with month-end clamping (e.g., Jan 31 + 1 month = Feb 28/29)?

**Alternatives Considered:**

1. **date-fns `addMonths`**
   - ✅ Handles month-end clamping correctly (Jan 31 + 1 month = Feb 28/29)
   - ✅ Well-maintained, widely used library
   - ✅ TypeScript support
   - ✅ Lightweight (tree-shakeable)
   - ✅ Clear API: `addMonths(date, months)`

2. **Native JavaScript Date API**
   - ❌ Does not handle month-end clamping correctly
   - ❌ Manual implementation required (error-prone)
   - ❌ Example: `new Date(2025, 0, 31)` + 1 month = `new Date(2025, 1, 31)` = March 3 (invalid)

3. **date-fns-tz**
   - ⚠️ Overkill for our use case (timezone handling not needed)
   - ✅ Based on date-fns, same month arithmetic behavior

**Decision:** Use **date-fns `addMonths`** function

**Rationale:**
- Proven reliability for month-end clamping
- Minimal dependency (already used in many projects)
- Clear, simple API
- TypeScript support
- Well-documented

**Implementation:**
```typescript
import { addMonths, addDays } from 'date-fns';

// For DAYS duration
const endDate = addDays(startDate, durationValue);

// For MONTHS duration
const endDate = addMonths(startDate, durationValue);
```

**Testing Verified:**
- Jan 31 + 1 month = Feb 28/29 (leap year dependent) ✅
- Mar 31 + 1 month = Apr 30 ✅
- Jan 15 + 1 month = Feb 15 ✅
- Year boundaries handled correctly ✅

**Package Installation:**
```bash
npm install date-fns
```

---

### 2. Prisma Migration Strategy for Data Transformation

**Question:** What is the best practice for Prisma migrations that require data transformation (creating plans from existing `membershipType` values)?

**Alternatives Considered:**

1. **Single Migration with Raw SQL**
   - ✅ Atomic operation
   - ✅ Can be rolled back as single unit
   - ⚠️ Requires SQL knowledge
   - ⚠️ Less type-safe

2. **Multi-Step Migration (Recommended)**
   - ✅ Clear separation of concerns
   - ✅ Each step can be tested independently
   - ✅ Easier to debug if issues occur
   - ✅ Can rollback individual steps
   - ✅ Type-safe Prisma operations

3. **Separate Migration Script (Post-Migration)**
   - ⚠️ Not tracked in Prisma migrations
   - ⚠️ Manual execution required
   - ⚠️ Harder to reproduce in other environments

**Decision:** Use **Multi-Step Migration** approach

**Rationale:**
- Follows Prisma best practices
- Each step is testable and reversible
- Clear separation: schema changes → data migration → cleanup
- Type-safe operations using Prisma Client

**Migration Steps:**

1. **Migration 1:** Create MembershipPlan table (schema only)
2. **Migration 2:** Add `membershipPlanId` to Member (nullable, keep `membershipType`)
3. **Migration 3:** Data migration script (create plans, assign members)
4. **Migration 4:** Remove `membershipType` column, make `membershipPlanId` NOT NULL

**Data Migration Script Pattern:**
```typescript
// In migration file or separate script
async function migrateMembershipTypes() {
  const tenants = await prisma.tenant.findMany();
  
  for (const tenant of tenants) {
    const uniqueTypes = await prisma.member.findMany({
      where: { tenantId: tenant.id },
      select: { membershipType: true },
      distinct: ['membershipType'],
    });
    
    for (const type of uniqueTypes) {
      const plan = await prisma.membershipPlan.create({
        data: {
          tenantId: tenant.id,
          name: type.membershipType,
          durationType: 'MONTHS',
          durationValue: 12,
          price: 0,
          currency: tenant.defaultCurrency || 'TRY',
          status: 'ACTIVE',
        },
      });
      
      await prisma.member.updateMany({
        where: {
          tenantId: tenant.id,
          membershipType: type.membershipType,
        },
        data: {
          membershipPlanId: plan.id,
        },
      });
    }
  }
}
```

**Best Practices:**
- Test migration on development database first
- Backup `membershipType` values before migration
- Run migration during low-traffic period
- Verify data integrity after migration
- Keep rollback plan documented

---

### 3. ISO 4217 Currency Code Validation

**Question:** How should we validate ISO 4217 currency codes (e.g., "JPY", "USD", "EUR")?

**Alternatives Considered:**

1. **Regex Validation**
   - ✅ Simple, lightweight
   - ✅ No external dependency
   - ✅ Fast validation
   - ⚠️ Only validates format, not existence of code

2. **Currency Library (e.g., `currency-codes`, `iso-4217`)**
   - ✅ Validates code existence
   - ✅ Provides currency metadata
   - ⚠️ Additional dependency
   - ⚠️ May include codes we don't need

3. **Hardcoded List of Common Codes**
   - ✅ No dependency
   - ✅ Fast validation
   - ⚠️ Maintenance burden (add codes as needed)
   - ⚠️ May miss edge cases

**Decision:** Use **Regex Validation** + **Optional Common Codes List**

**Rationale:**
- ISO 4217 format is simple: 3 uppercase letters
- Format validation is sufficient for v1 (existence validation can be added later)
- No external dependency required
- Fast and lightweight
- Can be enhanced later if needed

**Implementation:**
```typescript
// Regex: 3 uppercase letters
const ISO_4217_REGEX = /^[A-Z]{3}$/;

function isValidCurrencyCode(code: string): boolean {
  return ISO_4217_REGEX.test(code);
}

// Optional: Maintain list of common codes for better UX
const COMMON_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'TRY', 'CAD', 'AUD'];
```

**Validation in DTO:**
```typescript
@IsString()
@Matches(/^[A-Z]{3}$/, {
  message: 'Currency must be a valid ISO 4217 code (3 uppercase letters)',
})
currency: string;
```

**Future Enhancement:**
- If needed, add `currency-codes` library for existence validation
- Or maintain curated list of supported currencies per tenant region

---

## Summary

All technical unknowns have been resolved:

1. ✅ **Date Calculation:** Use `date-fns` `addMonths` for month arithmetic
2. ✅ **Migration Strategy:** Multi-step Prisma migrations with data transformation script
3. ✅ **Currency Validation:** Regex validation for ISO 4217 format (3 uppercase letters)

**Next Steps:**
- Proceed with Phase 1 implementation (Database Schema & Migration)
- Install `date-fns` package: `npm install date-fns`
- Follow migration strategy outlined above

---

**End of Research**




