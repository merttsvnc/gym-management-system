# Member Create Fields - Complete Backend Analysis

**Date:** January 29, 2026  
**Scope:** Backend only (Prisma schema, DTOs, service layer)  
**Source of Truth:** Backend code and database schema

---

## Complete Backend-Supported Member Fields

### Table Format

| Field Key | Data Type | Required on Create | Nullable in DB | Default/Auto-generated | Validation Rules | Relations | Notes |
|-----------|-----------|-------------------|----------------|----------------------|-----------------|-----------|-------|
| `id` | string (cuid) | No | No | Auto-generated (@default(cuid())) | - | - | System-managed primary key |
| `tenantId` | string | No | No | Auto-injected by service from JWT context | - | FK to Tenant (onDelete: Cascade) | System-managed, tenant isolation |
| `branchId` | string | Yes | No | - | Must exist and belong to tenant | FK to Branch (onDelete: Restrict) | Validated in service layer |
| `firstName` | string | Yes | No | - | MinLength: 1, MaxLength: 50, trimmed | - | - |
| `lastName` | string | Yes | No | - | MinLength: 1, MaxLength: 50, trimmed | - | - |
| `gender` | enum (MemberGender) | No | Yes | null | Enum: MALE, FEMALE | - | Optional |
| `dateOfBirth` | DateTime | No | Yes | null | ISO 8601 date string | - | Optional |
| `phone` | string | Yes | No | - | MinLength: 10, MaxLength: 20, Regex: `^\+?[1-9]\d{1,14}$`, trimmed | - | Must be unique per tenant |
| `email` | string | No | Yes | null | Valid email format, trimmed | - | Optional |
| `photoUrl` | string | No | Yes | null | Valid URL format | - | Optional |
| `membershipPlanId` | string | Yes | No | - | Must exist, be ACTIVE, and belong to tenant | FK to MembershipPlan | Validated in service layer |
| `membershipStartDate` | DateTime | No | No | Current date/time if not provided | ISO 8601 date string | - | Defaults to `new Date()` in service |
| `membershipEndDate` | DateTime | No | No | Calculated from plan duration | - | - | Auto-calculated by service using plan's durationType and durationValue |
| `membershipPriceAtPurchase` | Decimal(10,2) | No | Yes | Plan price if not provided | Must be a number | - | Defaults to plan.price in service |
| `status` | enum (MemberStatus) | No | No | ACTIVE | Enum: ACTIVE, PAUSED, INACTIVE, ARCHIVED | - | Always set to ACTIVE on creation |
| `pausedAt` | DateTime | No | Yes | null | - | - | System-managed (set via changeStatus endpoint) |
| `resumedAt` | DateTime | No | Yes | null | - | - | System-managed (set via changeStatus endpoint) |
| `notes` | string | No | Yes | null | MaxLength: 5000, trimmed | - | Optional |
| `createdAt` | DateTime | No | No | Auto-generated (@default(now())) | - | - | System-managed timestamp |
| `updatedAt` | DateTime | No | No | Auto-updated (@updatedAt) | - | - | System-managed timestamp |

---

## JSON Array Format

```json
[
  {
    "fieldKey": "id",
    "dataType": "string (cuid)",
    "requiredOnCreate": false,
    "nullableInDB": false,
    "defaultValue": "Auto-generated (@default(cuid()))",
    "validationRules": null,
    "relations": null,
    "notes": "System-managed primary key"
  },
  {
    "fieldKey": "tenantId",
    "dataType": "string",
    "requiredOnCreate": false,
    "nullableInDB": false,
    "defaultValue": "Auto-injected by service from JWT context",
    "validationRules": null,
    "relations": "FK to Tenant (onDelete: Cascade)",
    "notes": "System-managed, tenant isolation"
  },
  {
    "fieldKey": "branchId",
    "dataType": "string",
    "requiredOnCreate": true,
    "nullableInDB": false,
    "defaultValue": null,
    "validationRules": "Must exist and belong to tenant",
    "relations": "FK to Branch (onDelete: Restrict)",
    "notes": "Validated in service layer"
  },
  {
    "fieldKey": "firstName",
    "dataType": "string",
    "requiredOnCreate": true,
    "nullableInDB": false,
    "defaultValue": null,
    "validationRules": "MinLength: 1, MaxLength: 50, trimmed",
    "relations": null,
    "notes": null
  },
  {
    "fieldKey": "lastName",
    "dataType": "string",
    "requiredOnCreate": true,
    "nullableInDB": false,
    "defaultValue": null,
    "validationRules": "MinLength: 1, MaxLength: 50, trimmed",
    "relations": null,
    "notes": null
  },
  {
    "fieldKey": "gender",
    "dataType": "enum (MemberGender)",
    "requiredOnCreate": false,
    "nullableInDB": true,
    "defaultValue": "null",
    "validationRules": "Enum values: MALE, FEMALE",
    "relations": null,
    "notes": "Optional"
  },
  {
    "fieldKey": "dateOfBirth",
    "dataType": "DateTime",
    "requiredOnCreate": false,
    "nullableInDB": true,
    "defaultValue": "null",
    "validationRules": "ISO 8601 date string",
    "relations": null,
    "notes": "Optional"
  },
  {
    "fieldKey": "phone",
    "dataType": "string",
    "requiredOnCreate": true,
    "nullableInDB": false,
    "defaultValue": null,
    "validationRules": "MinLength: 10, MaxLength: 20, Regex: ^\\+?[1-9]\\d{1,14}$, trimmed",
    "relations": null,
    "notes": "Must be unique per tenant"
  },
  {
    "fieldKey": "email",
    "dataType": "string",
    "requiredOnCreate": false,
    "nullableInDB": true,
    "defaultValue": "null",
    "validationRules": "Valid email format, trimmed",
    "relations": null,
    "notes": "Optional"
  },
  {
    "fieldKey": "photoUrl",
    "dataType": "string",
    "requiredOnCreate": false,
    "nullableInDB": true,
    "defaultValue": "null",
    "validationRules": "Valid URL format",
    "relations": null,
    "notes": "Optional"
  },
  {
    "fieldKey": "membershipPlanId",
    "dataType": "string",
    "requiredOnCreate": true,
    "nullableInDB": false,
    "defaultValue": null,
    "validationRules": "Must exist, be ACTIVE, and belong to tenant",
    "relations": "FK to MembershipPlan",
    "notes": "Validated in service layer"
  },
  {
    "fieldKey": "membershipStartDate",
    "dataType": "DateTime",
    "requiredOnCreate": false,
    "nullableInDB": false,
    "defaultValue": "Current date/time if not provided",
    "validationRules": "ISO 8601 date string",
    "relations": null,
    "notes": "Defaults to new Date() in service"
  },
  {
    "fieldKey": "membershipEndDate",
    "dataType": "DateTime",
    "requiredOnCreate": false,
    "nullableInDB": false,
    "defaultValue": "Calculated from plan duration",
    "validationRules": null,
    "relations": null,
    "notes": "Auto-calculated by service using plan's durationType and durationValue"
  },
  {
    "fieldKey": "membershipPriceAtPurchase",
    "dataType": "Decimal(10,2)",
    "requiredOnCreate": false,
    "nullableInDB": true,
    "defaultValue": "Plan price if not provided",
    "validationRules": "Must be a number",
    "relations": null,
    "notes": "Defaults to plan.price in service"
  },
  {
    "fieldKey": "status",
    "dataType": "enum (MemberStatus)",
    "requiredOnCreate": false,
    "nullableInDB": false,
    "defaultValue": "ACTIVE",
    "validationRules": "Enum values: ACTIVE, PAUSED, INACTIVE, ARCHIVED",
    "relations": null,
    "notes": "Always set to ACTIVE on creation"
  },
  {
    "fieldKey": "pausedAt",
    "dataType": "DateTime",
    "requiredOnCreate": false,
    "nullableInDB": true,
    "defaultValue": "null",
    "validationRules": null,
    "relations": null,
    "notes": "System-managed (set via changeStatus endpoint)"
  },
  {
    "fieldKey": "resumedAt",
    "dataType": "DateTime",
    "requiredOnCreate": false,
    "nullableInDB": true,
    "defaultValue": "null",
    "validationRules": null,
    "relations": null,
    "notes": "System-managed (set via changeStatus endpoint)"
  },
  {
    "fieldKey": "notes",
    "dataType": "string",
    "requiredOnCreate": false,
    "nullableInDB": true,
    "defaultValue": "null",
    "validationRules": "MaxLength: 5000, trimmed",
    "relations": null,
    "notes": "Optional"
  },
  {
    "fieldKey": "createdAt",
    "dataType": "DateTime",
    "requiredOnCreate": false,
    "nullableInDB": false,
    "defaultValue": "Auto-generated (@default(now()))",
    "validationRules": null,
    "relations": null,
    "notes": "System-managed timestamp"
  },
  {
    "fieldKey": "updatedAt",
    "dataType": "DateTime",
    "requiredOnCreate": false,
    "nullableInDB": false,
    "defaultValue": "Auto-updated (@updatedAt)",
    "validationRules": null,
    "relations": null,
    "notes": "System-managed timestamp"
  }
]
```

---

## Summary

### Strictly Required Fields (User Must Provide)

To create a Member, the following 5 fields are **mandatory**:

1. **`branchId`** (string)
   - Must exist in database
   - Must belong to the tenant
   - Validated in service layer

2. **`firstName`** (string)
   - 1-50 characters
   - Automatically trimmed

3. **`lastName`** (string)
   - 1-50 characters
   - Automatically trimmed

4. **`phone`** (string)
   - 10-20 characters
   - Must match regex: `^\+?[1-9]\d{1,14}$` (international format)
   - **Must be unique per tenant**
   - Automatically trimmed

5. **`membershipPlanId`** (string)
   - Must exist in database
   - Must be ACTIVE status (archived plans rejected)
   - Must belong to the tenant or be tenant-scoped
   - Validated in service layer

### Optional Fields (Safe to Add Later or Omit)

These 7 fields can be provided during creation or added later via update:

1. **`gender`** - Enum: MALE or FEMALE
2. **`dateOfBirth`** - ISO 8601 date string
3. **`email`** - Valid email format, automatically trimmed
4. **`photoUrl`** - Valid URL format
5. **`membershipStartDate`** - ISO 8601 date string (defaults to current date if omitted)
6. **`membershipPriceAtPurchase`** - Number (defaults to plan's price if omitted)
7. **`notes`** - Free text up to 5000 characters, automatically trimmed

### System-Managed Fields (Auto-Generated/Computed)

These 8 fields are **automatically handled** by the backend:

1. **`id`** - Auto-generated CUID (Prisma default)
2. **`tenantId`** - Injected from JWT context (tenant isolation)
3. **`membershipEndDate`** - Calculated from `membershipStartDate` + plan's `durationType` and `durationValue`
4. **`status`** - Always set to `ACTIVE` on creation
5. **`pausedAt`** - Initially null, managed via status change endpoint
6. **`resumedAt`** - Initially null, managed via status change endpoint
7. **`createdAt`** - Prisma timestamp
8. **`updatedAt`** - Prisma timestamp

### Inconsistencies & Validation Status

✅ **No inconsistencies found**

The implementation is fully consistent:

- All `CreateMemberDto` validation rules align perfectly with Prisma schema constraints
- Service layer properly enforces business rules:
  - Tenant isolation (auto-injected `tenantId`)
  - Phone uniqueness per tenant
  - Branch ownership validation
  - Plan existence and ACTIVE status validation
- No conflicting nullable/required specifications between DTO and schema
- Trimming is consistently applied to string fields
- Default values are properly handled in service layer

---

## Files Analyzed

1. **Schema:** `/backend/prisma/schema.prisma` - Member model (lines 183-230)
2. **DTO:** `/backend/src/members/dto/create-member.dto.ts` - CreateMemberDto validation
3. **DTO:** `/backend/src/members/dto/update-member.dto.ts` - UpdateMemberDto validation
4. **Service:** `/backend/src/members/members.service.ts` - Business logic and defaults
5. **Controller:** `/backend/src/members/members.controller.ts` - API endpoint definition

---

## Business Rules Enforced

1. **Tenant Isolation:** All members are scoped to a tenant; `tenantId` is auto-injected from JWT
2. **Phone Uniqueness:** Phone numbers must be unique within a tenant (enforced in service)
3. **Branch Validation:** Branch must exist and belong to the tenant
4. **Plan Validation:** 
   - Plan must exist
   - Plan must be ACTIVE (archived plans rejected for new members)
   - Plan must belong to tenant or be tenant-scoped
5. **Membership Dates:**
   - Start date defaults to current date if not provided
   - End date is auto-calculated based on plan duration
6. **Price Capture:** Price at purchase is captured (defaults to plan price) for historical accuracy
7. **Status Management:** New members always start with ACTIVE status

---

## Usage Example

**Minimal Request (Required Fields Only):**

```json
{
  "branchId": "clx123abc",
  "firstName": "Ahmet",
  "lastName": "Yılmaz",
  "phone": "+905551234567",
  "membershipPlanId": "clx456def"
}
```

**Full Request (With Optional Fields):**

```json
{
  "branchId": "clx123abc",
  "firstName": "Ahmet",
  "lastName": "Yılmaz",
  "phone": "+905551234567",
  "email": "ahmet.yilmaz@example.com",
  "gender": "MALE",
  "dateOfBirth": "1995-06-15",
  "photoUrl": "https://example.com/photo.jpg",
  "membershipPlanId": "clx456def",
  "membershipStartDate": "2026-02-01T00:00:00Z",
  "membershipPriceAtPurchase": 299.99,
  "notes": "Referred by existing member"
}
```
