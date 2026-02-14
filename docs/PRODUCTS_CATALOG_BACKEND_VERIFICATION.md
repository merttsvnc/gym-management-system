# Products Catalog Backend Verification Report

**Date:** February 14, 2026  
**Feature:** Products CRUD API  
**Scope:** `/api/v1/products` endpoints for mobile Sales screen  
**Status:** ✅ FIXED

---

## Executive Summary

The Products CRUD backend was **already implemented** with full business logic, JWT auth, tenant/branch scoping, and DTOs. This verification identified and fixed **validation gaps** (branchId placeholder/invalid format) that could cause the mobile "Ürün bulunamadı" error when the client sends placeholder or invalid `branchId` values.

---

## A) Audit Results

### 1) Module Files Located

| File | Status |
|------|--------|
| `backend/src/products/products.controller.ts` | ✅ Exists, full implementation |
| `backend/src/products/products.service.ts` | ✅ Exists, full implementation |
| `backend/src/products/products.module.ts` | ✅ Exists, wired to AppModule |

### 2) Endpoints

| Method | Path | Status |
|--------|------|--------|
| GET | `/api/v1/products` | ✅ Implemented |
| GET | `/api/v1/products/:id` | ✅ Implemented |
| POST | `/api/v1/products` | ✅ Implemented |
| PATCH | `/api/v1/products/:id` | ✅ Implemented |
| DELETE | `/api/v1/products/:id` | ✅ Implemented |

### 3) Global Prefix

- `main.ts` uses `app.setGlobalPrefix('api/v1', { exclude: ['', 'api/mobile/*'] })`
- Products controller uses `@Controller('products')` → full path: `/api/v1/products` ✅

---

## B) Guard & Scoping Verification

### Guards

| Guard | Applied | Purpose |
|-------|---------|---------|
| `JwtAuthGuard` | ✅ | Validates JWT, populates `req.user` |
| `TenantGuard` | ✅ | Ensures `req.user.tenantId` exists |

### Scoping

Every DB query includes:
- `tenantId: req.user.tenantId` (from `@CurrentUser('tenantId')`)
- `branchId: query.branchId` (from query param)

### branchId Validation (FIXED)

| Case | Before | After |
|------|--------|-------|
| Missing branchId | 400 "branchId query parameter is required" | 400 "branchId query parameter is required." |
| Placeholder (e.g. `branch-id-placeholder`) | ❌ Allowed, returned empty list | 400 "Invalid branchId. Please select a real branch." |
| Invalid UUID / invalid format | ❌ Allowed | 400 "Invalid branchId format. Must be a valid branch identifier." |

**Placeholders rejected:** `branch-id-placeholder`, `placeholder`, `default`, `undefined`, `null`, `00000000-0000-0000-0000-000000000000`

**Valid formats:** cuid (25 chars, starts with `c`) or UUID v4

---

## C) Fixes Applied

### 1) Controller: `validateBranchId()` Helper

Added private method to `ProductsController` that:
- Rejects missing/empty branchId
- Rejects known placeholder values
- Validates format (cuid or UUID v4)

Applied to all 5 endpoints: `findAll`, `findOne`, `create`, `update`, `remove`.

### 2) Service: Conflict Message

Updated duplicate name error from:
- `"Product with name \"X\" already exists"`  
to:
- `"Product name already exists in this branch."`

### 3) Tests: `products.service.spec.ts`

- Fixed typo: `_prismaService` → `prismaService`
- Added `findAll` test: branch-scoped list
- Added `update` test: refuses cross-tenant/branch (NotFoundException)
- Added `remove` test: sets `isActive=false`

---

## D) DTOs (Existing, Verified)

### ProductQueryDto (GET)

- `branchId`: required, string
- `isActive`: optional boolean (transform from "true"/"false")
- `category`: optional string

### CreateProductDto (POST)

- `name`: required, trim, min 2, max 100
- `defaultPrice`: required, number ≥ 0
- `category`: optional, max 100

### UpdateProductDto (PATCH)

- `name`: optional, min 2, max 100
- `defaultPrice`: optional, ≥ 0
- `category`: optional
- `isActive`: optional boolean

---

## E) Manual Verification (curl)

### Prerequisites

```bash
# Obtain JWT token (login)
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"your-password"}' \
  | jq -r '.accessToken')

# Use a real branch ID from your tenant (cuid format, e.g. from GET /api/v1/branches)
BRANCH_ID="clxxxxxxxxxxxxxxxxxxxxx"
```

### 1) Missing token → 401

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -X GET "http://localhost:3000/api/v1/products?branchId=${BRANCH_ID}"
# Expected: 401
```

### 2) Missing branchId → 400

```bash
curl -s -X GET "http://localhost:3000/api/v1/products" \
  -H "Authorization: Bearer ${TOKEN}"
# Expected: 400 "branchId query parameter is required."
```

### 3) Placeholder branchId → 400

```bash
curl -s -X GET "http://localhost:3000/api/v1/products?branchId=branch-id-placeholder" \
  -H "Authorization: Bearer ${TOKEN}"
# Expected: 400 "Invalid branchId. Please select a real branch."
```

### 4) Valid GET → 200

```bash
curl -s -X GET "http://localhost:3000/api/v1/products?branchId=${BRANCH_ID}&isActive=true" \
  -H "Authorization: Bearer ${TOKEN}"
# Expected: 200, JSON array of products
```

### 5) Create → 201

```bash
curl -s -X POST "http://localhost:3000/api/v1/products?branchId=${BRANCH_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Ürün","defaultPrice":29.99,"category":"İçecek"}'
# Expected: 201, created product with defaultPrice as "29.99"
```

### 6) Update → 200

```bash
# Replace PRODUCT_ID with id from create response
curl -s -X PATCH "http://localhost:3000/api/v1/products/${PRODUCT_ID}?branchId=${BRANCH_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"name":"Updated Ürün","defaultPrice":39.99}'
# Expected: 200, updated product
```

### 7) Delete → 200, product disappears from isActive=true list

```bash
curl -s -X DELETE "http://localhost:3000/api/v1/products/${PRODUCT_ID}?branchId=${BRANCH_ID}" \
  -H "Authorization: Bearer ${TOKEN}"
# Expected: 200 {"message":"Product deactivated successfully"}

# Verify product no longer in active list
curl -s -X GET "http://localhost:3000/api/v1/products?branchId=${BRANCH_ID}&isActive=true" \
  -H "Authorization: Bearer ${TOKEN}"
# Expected: 200, product not in array
```

---

## F) Files Changed

| File | Changes |
|------|---------|
| `backend/src/products/products.controller.ts` | Added `validateBranchId()` helper; applied to all endpoints |
| `backend/src/products/products.service.ts` | Updated conflict message to "Product name already exists in this branch." |
| `backend/src/products/products.service.spec.ts` | Fixed `_prismaService` typo; added findAll, update cross-tenant, remove tests |

---

## Schema Reference

- **Product model:** `tenantId`, `branchId`, `name`, `defaultPrice` (Decimal 12,2), `category`, `isActive`
- **Currency:** TRY (stored as Decimal, no currency field)
- **Stock:** Not tracked
- **IDs:** Prisma uses cuid for Product, Branch (25 chars, starts with `c`)

---

## Root Cause of "Ürün bulunamadı"

The mobile Sales screen may show "Ürün bulunamadı" when:

1. **Placeholder branchId:** Client sends `branchId=branch-id-placeholder` or similar → backend previously returned empty list; now returns 400 with clear message.
2. **No products in branch:** Legitimate empty state → mobile should show empty state UI, not error.
3. **Wrong API path:** Ensure mobile calls `/api/v1/products?branchId=...&isActive=true`, not `/products` or `/api/mobile/products`.

---

**Products Catalog backend verified (or fixed).**

---

## Related: Product Sales productId Format

`POST /api/v1/product-sales` previously validated `productId` as UUID only, while Products return CUID. This caused "productId must be a valid UUID" when creating sales with catalog products. **Fixed.** See `docs/PRODUCT_ID_FORMAT_FIX.md`.
