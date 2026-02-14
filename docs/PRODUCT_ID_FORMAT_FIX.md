# Product ID Format Fix

**Date:** February 14, 2026  
**Scope:** `POST /api/v1/product-sales` – productId validation  
**Status:** ✅ FIXED

---

## Root Cause

Backend ID format mismatch between Products and Product Sales endpoints:

| Endpoint | ID Format | Example |
|----------|-----------|---------|
| `GET /api/v1/products` | **CUID** (25 chars) | `cmllx1luq0002a6jm2lxohg78` |
| `POST /api/v1/product-sales` (before fix) | **UUID only** | Validation rejected CUIDs |

**Impact:** Mobile app could not create sales with catalog products. Error: `"productId must be a valid UUID"`

Prisma uses CUID for Product IDs. The Product Sales DTO incorrectly validated `productId` as UUID v4 only.

---

## Chosen Fix

### 1) DTO Validation

**File:** `backend/src/product-sales/dto/create-product-sale.dto.ts`

Replaced `@IsUUID('4')` with a custom validator that accepts both CUID and UUID:

```typescript
// BEFORE (incorrect):
@IsOptional()
@IsUUID('4', { message: 'productId must be a valid UUID' })
productId?: string;

// AFTER (correct):
@IsOptional()
@IsString()
@IsProductIdOrUuid({ message: 'productId must be either CUID or UUID format' })
productId?: string;
```

### 2) Reusable Validator

**File:** `backend/src/common/validators/is-product-id.validator.ts`

- `IsProductIdOrUuid()` – custom class-validator decorator
- Regex: `^(c[a-z0-9]{24}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i`
- Accepts: CUID (25 chars, starts with `c`) or UUID v4

### 3) Service Scope Check (unchanged)

Security is enforced by DB scope, not by ID format:

- `findFirst({ where: { id: productId, tenantId, branchId, isActive: true } })`
- If not found → `BadRequestException('Invalid productId for this branch.')`

### 4) XOR Rule (unchanged)

- Exactly one of `productId` or `customName` must be provided per item
- Enforced in `ProductSalesService.validateAndProcessItems()`

---

## Test Evidence

### DTO Validation (`create-product-sale.dto.spec.ts`)

| Test | Result |
|------|--------|
| Accept CUID `cmllx1luq0002a6jm2lxohg78` | ✅ Pass |
| Accept UUID `550e8400-e29b-41d4-a716-446655440000` | ✅ Pass |
| Reject invalid `product-1` | ✅ Pass |
| Reject empty string | ✅ Pass |
| Reject too-short `c123` | ✅ Pass |
| Accept customName without productId | ✅ Pass |

### Service (`product-sales.service.spec.ts`)

| Test | Result |
|------|--------|
| Create sale with CUID productId | ✅ Pass |
| Product not found → BadRequestException | ✅ Pass |
| Error message: "Invalid productId for this branch." | ✅ Pass |
| Scoped lookup: `id`, `tenantId`, `branchId`, `isActive: true` | ✅ Pass |

---

## Files Changed

| File | Changes |
|------|---------|
| `backend/src/common/validators/is-product-id.validator.ts` | **New** – reusable CUID/UUID validator |
| `backend/src/product-sales/dto/create-product-sale.dto.ts` | Replace @IsUUID with @IsProductIdOrUuid |
| `backend/src/product-sales/product-sales.service.ts` | NotFoundException → BadRequestException, message "Invalid productId for this branch." |
| `backend/src/product-sales/product-sales.service.spec.ts` | Use valid CUID in mocks; assert error message |
| `backend/src/product-sales/dto/create-product-sale.dto.spec.ts` | **New** – DTO validation tests |

---

## Related Docs

- `PRODUCTS_MOBILE_CATALOG.md` – CRITICAL section removed (fix applied)
- `docs/PRODUCTS_CATALOG_BACKEND_VERIFICATION.md` – Products API verification

---

**ProductId format fix complete.**
