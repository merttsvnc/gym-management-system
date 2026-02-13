# In-Gym Product Sales - Phase 2 Implementation Summary

**Date**: February 13, 2026  
**Phase**: 2 - Business Logic & Endpoints  
**Status**: ✅ Complete

---

## Overview

Phase 2 implements the complete business logic and REST API endpoints for the in-gym product sales system. This includes product catalog management, sales transactions with line items, and revenue month locking for financial control.

### Key Features Implemented

- ✅ Product CRUD operations with tenant/branch scoping
- ✅ Product sales with multiple line items (catalog + custom products)
- ✅ Revenue month lock enforcement for sales create/delete
- ✅ Automatic totals calculation (lineTotal, totalAmount)
- ✅ XOR validation for sale items (productId OR customName)
- ✅ JWT authentication with tenant/branch context
- ✅ Comprehensive validation with class-validator
- ✅ Unit tests for all services

---

## Modules Implemented

### 1. Products Module

**Base Path**: `/products`

#### Endpoints

| Method | Endpoint                      | Description                | Auth Required |
| ------ | ----------------------------- | -------------------------- | ------------- |
| GET    | `/products?branchId={id}`     | List products with filters | Yes           |
| GET    | `/products/:id?branchId={id}` | Get single product         | Yes           |
| POST   | `/products?branchId={id}`     | Create new product         | Yes           |
| PATCH  | `/products/:id?branchId={id}` | Update product             | Yes           |
| DELETE | `/products/:id?branchId={id}` | Soft delete (deactivate)   | Yes           |

#### Business Rules

1. **Tenant/Branch Scoping**: All operations are scoped by `tenantId` (from JWT) and `branchId` (from query param)
2. **Name Uniqueness**: Product names must be unique per tenant/branch (case-insensitive)
3. **Soft Delete**: DELETE sets `isActive=false` instead of hard deleting to preserve sales history
4. **Default Price**: Must be >= 0, stored as `Decimal(12,2)`
5. **Category**: Optional string field for grouping products

#### DTOs

**CreateProductDto**

```typescript
{
  name: string;           // Required, 2-100 chars, trimmed
  defaultPrice: number;   // Required, >= 0
  category?: string;      // Optional, max 100 chars
}
```

**UpdateProductDto**

```typescript
{
  name?: string;          // Optional, 2-100 chars, trimmed
  defaultPrice?: number;  // Optional, >= 0
  category?: string;      // Optional, max 100 chars
  isActive?: boolean;     // Optional, soft delete control
}
```

**ProductQueryDto**

```typescript
{
  isActive?: boolean;     // Default: true
  category?: string;      // Optional filter
  branchId: string;       // Required
}
```

---

### 2. Product Sales Module

**Base Path**: `/product-sales`

#### Endpoints

| Method | Endpoint                           | Description                       | Auth Required |
| ------ | ---------------------------------- | --------------------------------- | ------------- |
| GET    | `/product-sales?branchId={id}`     | List sales with filters           | Yes           |
| GET    | `/product-sales/:id?branchId={id}` | Get single sale with items        | Yes           |
| POST   | `/product-sales?branchId={id}`     | Create new sale                   | Yes           |
| DELETE | `/product-sales/:id?branchId={id}` | Delete sale (month lock enforced) | Yes           |

#### Business Rules

1. **Month Lock Enforcement**:
   - CREATE: Forbid if `soldAt` month is locked
   - DELETE: Forbid if sale's `soldAt` month is locked
   - Returns 403 Forbidden with month key in error message

2. **Sale Items Validation**:
   - **XOR Rule**: Each item must have EXACTLY ONE of: `productId` OR `customName`
   - **Catalog Item** (`productId` provided):
     - Product must exist, belong to tenant/branch, and be active
     - `unitPrice` is optional (defaults to product's `defaultPrice`)
     - `unitPrice` can be provided to allow discounts
   - **Custom Item** (`customName` provided):
     - `unitPrice` is REQUIRED
     - Allows ad-hoc items not in catalog

3. **Totals Calculation**:
   - `lineTotal = unitPrice × quantity` (for each item)
   - `totalAmount = SUM(lineTotal)` (for entire sale)
   - Uses `Prisma.Decimal` for precision (no floating-point errors)

4. **Transaction Safety**:
   - Sale and all items created in a single Prisma transaction
   - Either all succeed or all fail (atomic operation)

5. **Date Handling**:
   - `soldAt` is optional in request (defaults to `now()`)
   - Accepts ISO 8601 date strings
   - Used for month lock checks and filtering

#### DTOs

**SaleItemDto**

```typescript
{
  productId?: string;     // Optional (XOR with customName)
  customName?: string;    // Optional (XOR with productId), max 200 chars
  quantity: number;       // Required, integer, >= 1
  unitPrice?: number;     // Optional for productId, required for customName, >= 0
}
```

**CreateProductSaleDto**

```typescript
{
  soldAt?: string;                  // Optional ISO date, defaults to now()
  paymentMethod: PaymentMethod;     // Required enum
  note?: string;                    // Optional, max 500 chars
  items: SaleItemDto[];            // Required, min 1 item
}
```

**ProductSaleQueryDto**

```typescript
{
  from?: string;         // Optional ISO date for range filter
  to?: string;           // Optional ISO date for range filter
  limit?: number;        // Default: 20, max: 100
  offset?: number;       // Default: 0
  branchId: string;      // Required
}
```

#### PaymentMethod Enum

```typescript
enum PaymentMethod {
  CASH
  CREDIT_CARD
  BANK_TRANSFER
  CHECK
  OTHER
}
```

---

### 3. Revenue Month Lock Module

**Base Path**: `/revenue-month-locks`

#### Endpoints

| Method | Endpoint                                          | Description       | Auth Required |
| ------ | ------------------------------------------------- | ----------------- | ------------- |
| GET    | `/revenue-month-locks?branchId={id}`              | List all locks    | Yes           |
| POST   | `/revenue-month-locks?branchId={id}`              | Lock a month      | Yes           |
| DELETE | `/revenue-month-locks/:month?branchId={id}`       | Unlock a month    | Yes           |
| GET    | `/revenue-month-locks/check/:month?branchId={id}` | Check lock status | Yes           |

#### Business Rules

1. **Month Format**: "YYYY-MM" (e.g., "2026-02")
   - Validated with regex: `^\d{4}-(0[1-9]|1[0-2])$`
   - Month must be zero-padded (02, not 2)

2. **Unique Constraint**: One lock per tenant/branch/month
   - Uses `upsert` to handle duplicates gracefully
   - Returns existing lock if already locked

3. **Lock Effects**:
   - Prevents CREATE of sales with `soldAt` in locked month
   - Prevents DELETE of sales with `soldAt` in locked month
   - Does NOT prevent product management operations

4. **User Tracking**: Records `lockedByUserId` from JWT for audit trail

#### DTOs

**CreateMonthLockDto**

```typescript
{
  month: string; // Required, format: YYYY-MM, validated
}
```

**MonthLockQueryDto**

```typescript
{
  branchId?: string;  // Optional
}
```

#### Check Response

```typescript
{
  locked: boolean; // true if month is locked
}
```

---

## Helper Utilities

### Date Helpers

**File**: `src/common/utils/date-helpers.ts`

```typescript
// Convert Date to month key string
getMonthKey(date: Date): string // Returns "YYYY-MM"

// Validate month key format
isValidMonthKey(monthKey: string): boolean
```

### Request Context Type

**File**: `src/common/types/request-context.type.ts`

```typescript
interface RequestContext {
  tenantId: string;
  branchId: string;
  userId?: string;
}
```

---

## Authentication Context

### JWT Payload Structure

```typescript
interface JwtPayload {
  sub: string; // User ID
  email: string; // User email
  tenantId: string; // Tenant ID (from JWT)
  role: string; // User role
}
```

### Auth Flow

1. **JWT Extraction**: `JwtAuthGuard` validates Bearer token
2. **User Context**: User object attached to `request.user`
3. **Tenant Scoping**: Controllers extract `tenantId` from `@CurrentUser('tenantId')`
4. **Branch Selection**: `branchId` passed as query parameter (required)

**Note**: `branchId` is NOT in JWT to allow branch switching. It must be provided in every request as a query parameter.

---

## Money Handling

### Currency: TRY (Turkish Lira)

- Stored as `Decimal(12,2)` in database
- Handled with `Prisma.Decimal` in code (no float precision issues)
- Example: 250.50 TRY stored as `new Prisma.Decimal("250.50")`

### Calculation Approach

```typescript
// Item line total
lineTotal = unitPrice.mul(quantity);

// Sale total amount
totalAmount = items.reduce(
  (sum, item) => sum.add(item.lineTotal),
  new Prisma.Decimal(0),
);
```

---

## Files Created/Modified

### New Files

#### DTOs

- `src/products/dto/create-product.dto.ts`
- `src/products/dto/update-product.dto.ts`
- `src/products/dto/product-query.dto.ts`
- `src/product-sales/dto/create-product-sale.dto.ts`
- `src/product-sales/dto/product-sale-query.dto.ts`
- `src/revenue-month-lock/dto/create-month-lock.dto.ts`
- `src/revenue-month-lock/dto/month-lock-query.dto.ts`

#### Utilities

- `src/common/utils/date-helpers.ts`
- `src/common/types/request-context.type.ts`

#### Tests

- `src/products/products.service.spec.ts`
- `src/product-sales/product-sales.service.spec.ts`
- `src/revenue-month-lock/revenue-month-lock.service.spec.ts`

### Modified Files

#### Services

- `src/products/products.service.ts` (implemented full CRUD)
- `src/product-sales/product-sales.service.ts` (implemented sales logic)
- `src/revenue-month-lock/revenue-month-lock.service.ts` (implemented lock management)

#### Controllers

- `src/products/products.controller.ts` (implemented all endpoints)
- `src/product-sales/product-sales.controller.ts` (implemented all endpoints)
- `src/revenue-month-lock/revenue-month-lock.controller.ts` (implemented all endpoints)

---

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suite
npm test products.service.spec.ts
npm test product-sales.service.spec.ts
npm test revenue-month-lock.service.spec.ts

# Run with coverage
npm test -- --coverage
```

### Test Coverage

#### Products Service

- ✅ Create product with uniqueness enforcement
- ✅ Find product by ID with scope validation
- ✅ Update product with name uniqueness check
- ✅ Soft delete (deactivate) product

#### Product Sales Service

- ✅ XOR validation for sale items
- ✅ Product defaultPrice fallback
- ✅ totalAmount calculation
- ✅ Month lock enforcement on create
- ✅ Month lock enforcement on delete

#### Revenue Month Lock Service

- ✅ Create lock with valid month format
- ✅ Reject invalid month format
- ✅ Check lock status
- ✅ Delete lock with existence validation

---

## Sample API Requests

### 1. Create a Product

```bash
curl -X POST "http://localhost:3000/products?branchId=branch-123" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Protein Powder",
    "defaultPrice": 250.00,
    "category": "Supplements"
  }'
```

**Response**:

```json
{
  "id": "clxxx123",
  "name": "Protein Powder",
  "defaultPrice": "250.00",
  "category": "Supplements",
  "isActive": true,
  "tenantId": "tenant-123",
  "branchId": "branch-123",
  "createdAt": "2026-02-13T10:00:00Z",
  "updatedAt": "2026-02-13T10:00:00Z"
}
```

---

### 2. List Products

```bash
curl -X GET "http://localhost:3000/products?branchId=branch-123&isActive=true" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response**:

```json
[
  {
    "id": "clxxx123",
    "name": "Protein Powder",
    "defaultPrice": "250.00",
    "category": "Supplements",
    "isActive": true,
    "tenantId": "tenant-123",
    "branchId": "branch-123",
    "createdAt": "2026-02-13T10:00:00Z",
    "updatedAt": "2026-02-13T10:00:00Z"
  }
]
```

---

### 3. Create a Product Sale

```bash
curl -X POST "http://localhost:3000/product-sales?branchId=branch-123" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "soldAt": "2026-02-13T14:30:00Z",
    "paymentMethod": "CASH",
    "note": "Walk-in customer",
    "items": [
      {
        "productId": "clxxx123",
        "quantity": 2,
        "unitPrice": 240.00
      },
      {
        "customName": "Custom Shaker Bottle",
        "quantity": 1,
        "unitPrice": 45.00
      }
    ]
  }'
```

**Response**:

```json
{
  "id": "sale-456",
  "tenantId": "tenant-123",
  "branchId": "branch-123",
  "soldAt": "2026-02-13T14:30:00Z",
  "paymentMethod": "CASH",
  "note": "Walk-in customer",
  "totalAmount": "525.00",
  "createdByUserId": "user-789",
  "items": [
    {
      "id": "item-111",
      "productId": "clxxx123",
      "customName": null,
      "quantity": 2,
      "unitPrice": "240.00",
      "lineTotal": "480.00",
      "product": {
        "id": "clxxx123",
        "name": "Protein Powder"
      }
    },
    {
      "id": "item-222",
      "productId": null,
      "customName": "Custom Shaker Bottle",
      "quantity": 1,
      "unitPrice": "45.00",
      "lineTotal": "45.00",
      "product": null
    }
  ],
  "createdAt": "2026-02-13T14:31:00Z",
  "updatedAt": "2026-02-13T14:31:00Z"
}
```

---

### 4. Lock a Month

```bash
curl -X POST "http://localhost:3000/revenue-month-locks?branchId=branch-123" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "month": "2026-01"
  }'
```

**Response**:

```json
{
  "id": "lock-789",
  "tenantId": "tenant-123",
  "branchId": "branch-123",
  "month": "2026-01",
  "lockedByUserId": "user-789",
  "lockedAt": "2026-02-13T15:00:00Z",
  "createdAt": "2026-02-13T15:00:00Z"
}
```

---

### 5. Check Month Lock Status

```bash
curl -X GET "http://localhost:3000/revenue-month-locks/check/2026-01?branchId=branch-123" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response**:

```json
{
  "locked": true
}
```

---

### 6. Attempt to Create Sale in Locked Month (Error)

```bash
curl -X POST "http://localhost:3000/product-sales?branchId=branch-123" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "soldAt": "2026-01-15T10:00:00Z",
    "paymentMethod": "CASH",
    "items": [
      {
        "productId": "clxxx123",
        "quantity": 1
      }
    ]
  }'
```

**Response** (403 Forbidden):

```json
{
  "statusCode": 403,
  "message": "Cannot create sale: month 2026-01 is locked",
  "error": "Forbidden"
}
```

---

## Error Handling

### Common HTTP Status Codes

| Code | Error        | Cause                                                                                                                     |
| ---- | ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| 400  | BadRequest   | - Missing branchId query param<br>- Invalid validation (empty items, XOR violation, etc.)<br>- Negative price or quantity |
| 401  | Unauthorized | - Missing or invalid JWT token                                                                                            |
| 403  | Forbidden    | - Month is locked (create/delete sale blocked)                                                                            |
| 404  | NotFound     | - Product/Sale/Lock not found<br>- Resource doesn't belong to tenant/branch                                               |
| 409  | Conflict     | - Product name already exists<br>- Invalid month format                                                                   |

### Example Error Responses

**Product name conflict**:

```json
{
  "statusCode": 409,
  "message": "Product with name \"Protein Powder\" already exists",
  "error": "Conflict"
}
```

**XOR violation**:

```json
{
  "statusCode": 400,
  "message": "Each item must have exactly one of: productId or customName",
  "error": "Bad Request"
}
```

---

## Assumptions & Design Decisions

### 1. Branch Selection

- `branchId` is NOT in JWT to allow users to switch branches dynamically
- Must be provided as query parameter in all requests
- Validated as required in all controllers

### 2. Soft Delete for Products

- DELETE sets `isActive=false` instead of hard deleting
- Preserves referential integrity with historical sales
- Inactive products still appear in past sales but not in catalog listings

### 3. Unit Price Flexibility

- For catalog items: `unitPrice` is optional (uses `defaultPrice`)
- Allows price overrides for discounts/promotions
- Snapshot stored on sale item (price changes don't affect past sales)

### 4. Month Lock Scope

- Locks are per tenant/branch/month
- Only affects sales create/delete operations
- Does NOT lock product management or other modules

### 5. Transaction Atomicity

- Sale + items created in single Prisma transaction
- Month lock check happens BEFORE transaction starts
- Either all succeed or all fail (no partial sales)

---

## Non-Goals (Phase 2)

The following features are explicitly OUT OF SCOPE for Phase 2:

- ❌ Stock/inventory tracking
- ❌ Invoices, receipts, or tax calculations
- ❌ Refunds or return processing
- ❌ Advanced reporting (Phase 3)
- ❌ Multi-currency support
- ❌ Product images or descriptions
- ❌ Barcode scanning
- ❌ Discount rules engine

---

## Next Steps (Phase 3)

Potential future enhancements:

1. **Reporting**
   - Daily/monthly sales summaries
   - Top-selling products
   - Revenue by payment method
   - Sales trends analysis

2. **Stock Management**
   - Inventory tracking
   - Low stock alerts
   - Stock adjustments

3. **Advanced Features**
   - Bulk sale import
   - Product bundles/packages
   - Loyalty points integration
   - Receipt printing

4. **Performance Optimization**
   - Pagination for large result sets
   - Caching for product catalog
   - Database indexes optimization

---

## Conclusion

Phase 2 successfully implements a complete, production-ready in-gym product sales system with:

- ✅ Full CRUD operations for products
- ✅ Robust sale transaction handling with line items
- ✅ Financial control through month locking
- ✅ Multi-tenant/multi-branch architecture
- ✅ Comprehensive validation and error handling
- ✅ Unit test coverage
- ✅ Type-safe DTOs and Decimal precision

The system is ready for integration testing and deployment to staging environment.

---

**Implementation Team**: Senior NestJS + Prisma Engineer  
**Review Date**: February 13, 2026  
**Next Milestone**: Phase 3 - Advanced Reporting & Analytics
