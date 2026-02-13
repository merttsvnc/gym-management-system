# In-Gym Product Sales - Phase 1: Data Model Implementation

## Overview

This document details the Phase 1 implementation of the **In-Gym Product Sales** feature for the Gym Management SaaS platform. This feature enables gym staff to record sales of ancillary products (tea, coffee, sports equipment, etc.) and track this revenue separately from membership subscriptions.

**Implementation Date:** February 13, 2026  
**Migration Name:** `20260213132924_add_in_gym_product_sales`  
**Status:** Phase 1 Complete (Data Model & Module Skeletons)

---

## Feature Scope

### In Scope (Phase 1)
- ✅ Database schema for products, sales, and month locking
- ✅ Multi-tenant data model (scoped by `tenantId` + `branchId`)
- ✅ Support for both catalog products and custom sale items
- ✅ Revenue month lock mechanism (schema only)
- ✅ NestJS module skeletons with placeholder endpoints

### Out of Scope (Future Phases)
- ❌ Business logic implementation
- ❌ Stock/inventory tracking
- ❌ Invoice generation or tax handling
- ❌ Refunds or returns
- ❌ Frontend UI components
- ❌ Revenue reporting dashboards

---

## Database Models

### 1. Product

**Purpose:** Catalog of products available for sale at each branch (tea, coffee, gloves, etc.)

```prisma
model Product {
  id           String   @id @default(cuid())
  tenantId     String
  branchId     String
  name         String
  defaultPrice Decimal  @db.Decimal(12,2)
  category     String?
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  // Relations
  tenant    Tenant            @relation(...)
  branch    Branch            @relation(...)
  saleItems ProductSaleItem[]

  @@index([tenantId, branchId])
  @@index([tenantId, branchId, isActive])
}
```

**Key Fields:**
- `defaultPrice`: Stored as `Decimal(12,2)` in TRY currency
- `category`: Optional categorization (e.g., "Beverages", "Equipment")
- `isActive`: Soft-delete mechanism (inactive products hidden from catalog)

**Design Decisions:**
- No unique constraint on `(tenantId, branchId, name)` at DB level → enforced in service layer if needed
- `defaultPrice` is required (must have a price to be sellable)
- Each branch maintains its own product catalog

---

### 2. ProductSale

**Purpose:** Represents a complete sales transaction (receipt/bill)

```prisma
model ProductSale {
  id              String        @id @default(cuid())
  tenantId        String
  branchId        String
  soldAt          DateTime      // Business timestamp (when sale occurred)
  paymentMethod   PaymentMethod // Reuses existing enum
  note            String?       @db.VarChar(500)
  totalAmount     Decimal       @db.Decimal(12,2)
  createdByUserId String?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  // Relations
  tenant Tenant            @relation(...)
  branch Branch            @relation(...)
  items  ProductSaleItem[]

  @@index([tenantId, branchId, soldAt])
  @@index([tenantId, branchId, createdAt])
  @@index([tenantId, soldAt])
}
```

**Key Fields:**
- `soldAt`: **Business date/time** when the sale occurred (critical for revenue reporting)
- `createdAt`: System timestamp (audit trail)
- `totalAmount`: Sum of all line items (calculated and stored for performance)
- `paymentMethod`: Reuses existing `PaymentMethod` enum (`CASH`, `CREDIT_CARD`, etc.)

**Design Decisions:**
- `soldAt` vs `createdAt`: Separates business time from system time (allows backdating if needed)
- `createdByUserId`: Optional tracking of which staff member recorded the sale
- `totalAmount`: Denormalized for query performance (validated against sum of items)

---

### 3. ProductSaleItem

**Purpose:** Line items for each sale (products sold in a transaction)

```prisma
model ProductSaleItem {
  id         String   @id @default(cuid())
  saleId     String
  tenantId   String
  branchId   String
  productId  String?  // FK to Product (nullable for custom items)
  customName String?  // Free-text name (nullable for catalog items)
  quantity   Int
  unitPrice  Decimal  @db.Decimal(12,2) // Snapshot at time of sale
  lineTotal  Decimal  @db.Decimal(12,2) // quantity * unitPrice
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  // Relations
  sale    ProductSale @relation(...)
  product Product?    @relation(...)

  @@index([tenantId, branchId])
  @@index([saleId])
  @@index([productId])
  @@index([tenantId, saleId])
}
```

**Critical Business Rules:**
1. **Exactly one of (`productId`, `customName`) must be provided**
   - `productId` → Sale from catalog
   - `customName` → One-off/custom item (e.g., "Special protein shake")
   - Validation enforced in service layer (not DB constraint)

2. **Price Snapshot:**
   - `unitPrice` captures the price at time of sale
   - Even if catalog `Product.defaultPrice` changes later, historical sales remain accurate

**Design Decisions:**
- Denormalized `tenantId`/`branchId` for efficient querying
- `lineTotal` stored for performance (avoids calculation in aggregations)
- Optional `productId` allows flexibility for non-catalog items

---

### 4. RevenueMonthLock

**Purpose:** Prevents modifications to sales in closed accounting periods

```prisma
model RevenueMonthLock {
  id             String   @id @default(cuid())
  tenantId       String
  branchId       String
  month          String   // Format: "YYYY-MM" (e.g., "2026-02")
  lockedAt       DateTime @default(now())
  lockedByUserId String?
  createdAt      DateTime @default(now())

  @@unique([tenantId, branchId, month])
  @@index([tenantId, branchId])
  @@index([tenantId, month])
}
```

**Key Fields:**
- `month`: String format `"YYYY-MM"` for simplicity and compatibility
- Unique constraint ensures a month can only be locked once per tenant/branch

**Design Decisions:**
- Month format chosen over date range for simplicity
- No cascade delete → locks remain even if sales are deleted (audit trail)
- `lockedByUserId`: Optional tracking of who locked the month

**Locking Logic (Future Implementation):**
```typescript
// Pseudocode for Phase 2
if (isMonthLocked(tenantId, branchId, soldAt)) {
  throw new ForbiddenException('Cannot modify sales in locked month');
}
```

---

## Data Model Relationships

```
Tenant (1) ──────┬──────► (N) Product
                 │
                 ├──────► (N) ProductSale
                 │
                 └──────► (N) RevenueMonthLock

Branch (1) ──────┬──────► (N) Product
                 │
                 ├──────► (N) ProductSale
                 │
                 └──────► (N) RevenueMonthLock

Product (1) ─────► (N) ProductSaleItem

ProductSale (1) ─► (N) ProductSaleItem
```

**Cascade Behaviors:**
- `Tenant` deleted → All products, sales, locks CASCADE deleted
- `Branch` deleted → Products, sales, locks RESTRICT (must reassign or cleanup first)
- `ProductSale` deleted → All `ProductSaleItem` CASCADE deleted
- `Product` deleted → `ProductSaleItem` RESTRICT (preserve historical sales)

---

## Multi-Tenant Architecture

Every model includes both `tenantId` AND `branchId` for robust multi-tenancy:

**Benefits:**
1. **Row-Level Security:** All queries automatically filtered by tenant/branch
2. **Data Isolation:** Prevents cross-tenant data leaks
3. **Performance:** Composite indexes enable efficient queries
4. **Flexibility:** Supports both tenant-wide and branch-specific operations

**Index Strategy:**
```sql
-- Example: Find all sales for a branch in a date range
WHERE tenantId = ? AND branchId = ? AND soldAt BETWEEN ? AND ?
-- Uses: ProductSale_tenantId_branchId_soldAt_idx
```

---

## Currency & Money Handling

- **Currency:** Fixed to **TRY** (Turkish Lira) for this system
- **Storage:** `Decimal(12,2)` for all monetary values
  - Max value: 9,999,999,999.99 TRY
  - Precision: 2 decimal places (kuruş)
- **Calculation:** Use `Prisma.Decimal` or `decimal.js` for arithmetic
- **Display:** Format with locale `tr-TR` in frontend

**Example:**
```typescript
import { Decimal } from '@prisma/client/runtime/library';

const unitPrice = new Decimal('15.50');
const quantity = 3;
const lineTotal = unitPrice.mul(quantity); // 46.50
```

---

## Migration Details

**Migration Name:** `20260213132924_add_in_gym_product_sales`

**Generated SQL Highlights:**
```sql
-- Product catalog table
CREATE TABLE "Product" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "defaultPrice" DECIMAL(12,2) NOT NULL,
  -- ... other fields
);

-- Sales transaction table
CREATE TABLE "ProductSale" (
  "soldAt" TIMESTAMP(3) NOT NULL,
  "paymentMethod" "PaymentMethod" NOT NULL,
  "totalAmount" DECIMAL(12,2) NOT NULL,
  -- ... other fields
);

-- Line items table
CREATE TABLE "ProductSaleItem" (
  "productId" TEXT,        -- Nullable for custom items
  "customName" TEXT,       -- Nullable for catalog items
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "lineTotal" DECIMAL(12,2) NOT NULL,
  -- ... other fields
);

-- Month locking table
CREATE TABLE "RevenueMonthLock" (
  "month" TEXT NOT NULL,  -- Format: "YYYY-MM"
  UNIQUE ("tenantId", "branchId", "month")
);
```

**Index Summary:**
- 11 indexes created for optimal query performance
- Focus on tenant/branch filtering and date range queries
- Composite indexes for common access patterns

---

## NestJS Module Structure

Three new modules created with placeholder implementations:

### 1. Products Module
**Location:** `src/products/`

**Files Created:**
- `products.module.ts` - Module definition
- `products.controller.ts` - HTTP endpoints (GET, POST, PATCH, DELETE)
- `products.service.ts` - Business logic placeholder

**Endpoints (Planned):**
- `GET /products` - List products (with filters)
- `GET /products/:id` - Get single product
- `POST /products` - Create product
- `PATCH /products/:id` - Update product
- `DELETE /products/:id` - Delete/deactivate product

---

### 2. Product Sales Module
**Location:** `src/product-sales/`

**Files Created:**
- `product-sales.module.ts` - Module definition
- `product-sales.controller.ts` - HTTP endpoints
- `product-sales.service.ts` - Business logic placeholder

**Endpoints (Planned):**
- `GET /product-sales` - List sales (with date filters)
- `GET /product-sales/:id` - Get single sale with items
- `POST /product-sales` - Create sale transaction
- `PATCH /product-sales/:id` - Update sale (limited fields)
- `DELETE /product-sales/:id` - Delete sale
- `GET /product-sales/reports/summary` - Sales summary report

**Key Logic (Phase 2):**
- Validate `productId` XOR `customName` for each item
- Calculate `lineTotal` and `totalAmount`
- Check month lock before create/update/delete
- Use Prisma transaction for atomicity

---

### 3. Revenue Month Lock Module
**Location:** `src/revenue-month-lock/`

**Files Created:**
- `revenue-month-lock.module.ts` - Module definition
- `revenue-month-lock.controller.ts` - HTTP endpoints
- `revenue-month-lock.service.ts` - Business logic placeholder

**Endpoints (Planned):**
- `GET /revenue-month-locks` - List locked months
- `POST /revenue-month-locks` - Lock a month
- `DELETE /revenue-month-locks/:month` - Unlock a month
- `GET /revenue-month-locks/check/:month` - Check lock status

**Integration (Phase 2):**
- `ProductSalesService` will call `isDateLocked()` before operations
- Frontend will show lock status on revenue reports

---

## Design Decisions & Rationale

### 1. Why Two Types of Sale Items?
**Problem:** Some gyms sell one-off items not in their regular catalog.

**Solution:** Allow both:
- `productId` → Catalog item (price from `Product.defaultPrice`)
- `customName` → Ad-hoc item (price entered manually)

**Trade-off:** Adds validation complexity, but provides flexibility.

---

### 2. Why Store `unitPrice` in Sale Items?
**Problem:** If `Product.defaultPrice` changes, historical sales would show wrong prices.

**Solution:** Snapshot the price at time of sale.

**Benefit:** Accurate historical reporting and audit trail.

---

### 3. Why Separate `soldAt` and `createdAt`?
**Problem:** Staff may record a sale after it occurred (e.g., end-of-day entry).

**Solution:**
- `soldAt` → When the sale actually happened (business time)
- `createdAt` → When the record was entered (system time)

**Benefit:** Accurate revenue attribution to correct dates.

---

### 4. Why Month Lock Instead of Full Close?
**Problem:** Accounting periods need to be finalized for reporting.

**Solution:** Simple month-level lock prevents modifications.

**Trade-off:** Less granular than daily locks, but simpler to implement and understand.

---

### 5. Why No Stock Tracking?
**Scope Decision:** Phase 1 focuses on revenue tracking only.

**Future:** Stock tracking would require:
- `Product.currentStock` field
- `StockMovement` transaction log
- Inventory reconciliation flows

**Current:** Staff responsible for managing inventory externally.

---

### 6. Why Allow Deleting Sales?
**Business Requirement:** Mistakes happen (wrong item entered, duplicate entry).

**Safeguard:** Month lock prevents deleting finalized periods.

**Alternative Considered:** Soft delete with `deletedAt` flag (may add in Phase 2).

---

## Payment Method Reuse

The system reuses the existing `PaymentMethod` enum:

```prisma
enum PaymentMethod {
  CASH
  CREDIT_CARD
  BANK_TRANSFER
  CHECK
  OTHER
}
```

**Benefits:**
- Consistent payment tracking across memberships and products
- Unified reporting (total cash revenue = membership + products)
- No additional enum maintenance

**Usage:**
```typescript
// Example sale
{
  paymentMethod: PaymentMethod.CASH,
  items: [...]
}
```

---

## Future Implementation Phases

### Phase 2: Business Logic (Priority)
- [ ] Implement service methods in all three modules
- [ ] Add DTO validation with `class-validator`
- [ ] Implement authentication & authorization guards
- [ ] Add month lock enforcement in sales operations
- [ ] Write unit tests (Jest) and integration tests
- [ ] Validate business rules (productId XOR customName)

### Phase 3: Reporting & Analytics
- [ ] Revenue summary reports (daily/monthly/yearly)
- [ ] Top-selling products analytics
- [ ] Payment method breakdown
- [ ] Compare product revenue vs membership revenue
- [ ] Export to CSV/Excel

### Phase 4: Advanced Features (Optional)
- [ ] Stock tracking and low-stock alerts
- [ ] Product categories with filtering
- [ ] Bulk product import/export
- [ ] Sale receipt PDF generation
- [ ] Barcode scanning integration
- [ ] Discount and promotion support

---

## Files Modified/Created

### Prisma Schema
- **Modified:** `backend/prisma/schema.prisma`
  - Added 4 models: `Product`, `ProductSale`, `ProductSaleItem`, `RevenueMonthLock`
  - Updated `Tenant` and `Branch` relations

### Migration
- **Created:** `backend/prisma/migrations/20260213132924_add_in_gym_product_sales/migration.sql`
  - 4 tables created
  - 11 indexes created
  - Foreign key constraints added

### NestJS Modules
- **Created:** `backend/src/products/`
  - `products.module.ts`
  - `products.controller.ts`
  - `products.service.ts`

- **Created:** `backend/src/product-sales/`
  - `product-sales.module.ts`
  - `product-sales.controller.ts`
  - `product-sales.service.ts`

- **Created:** `backend/src/revenue-month-lock/`
  - `revenue-month-lock.module.ts`
  - `revenue-month-lock.controller.ts`
  - `revenue-month-lock.service.ts`

### Documentation
- **Created:** `docs/IN_GYM_PRODUCT_SALES_PHASE_1.md` (this file)

---

## Integration Checklist

Before moving to Phase 2, ensure:

- [x] Migration applied successfully
- [x] Prisma Client regenerated (`npx prisma generate`)
- [ ] Modules registered in `app.module.ts`
- [ ] Routes tested with API client (Postman/Insomnia)
- [ ] Guards applied to controllers (auth required)
- [ ] DTOs created with validation rules
- [ ] Service methods implemented with proper error handling
- [ ] Unit tests written (minimum 80% coverage)

---

## Example Usage (Phase 2 Preview)

### Creating a Sale (Future API Call)
```typescript
POST /product-sales
Authorization: Bearer <jwt>

{
  "soldAt": "2026-02-13T14:30:00Z",
  "paymentMethod": "CASH",
  "note": "Customer bought tea and gloves",
  "items": [
    {
      "productId": "prod_abc123",  // Catalog item
      "quantity": 2,
      "unitPrice": 15.00
    },
    {
      "customName": "Special protein shake",  // Custom item
      "quantity": 1,
      "unitPrice": 35.00
    }
  ]
}

Response:
{
  "id": "sale_xyz789",
  "totalAmount": 65.00,
  "soldAt": "2026-02-13T14:30:00Z",
  "items": [...]
}
```

### Locking a Month
```typescript
POST /revenue-month-locks
Authorization: Bearer <jwt>

{
  "month": "2026-01"
}

Response:
{
  "id": "lock_123",
  "month": "2026-01",
  "lockedAt": "2026-02-13T10:00:00Z"
}

// Now all sales with soldAt in January 2026 cannot be modified
```

---

## Security Considerations

### Row-Level Security
All queries MUST filter by:
- `tenantId` from authenticated user's JWT
- `branchId` from user's assigned branch

### Authorization
- **Products:** Branch managers can CRUD products for their branch
- **Sales:** Staff can create sales, managers can edit/delete
- **Month Lock:** Admin/accountant only

### Audit Trail
- `createdByUserId` tracks who created sales
- `lockedByUserId` tracks who locked months
- `createdAt` / `updatedAt` for all modifications

---

## Performance Considerations

### Indexes
Optimized for common queries:
```sql
-- Fast: Get products for a branch
SELECT * FROM "Product" 
WHERE "tenantId" = ? AND "branchId" = ? AND "isActive" = true;
-- Uses: Product_tenantId_branchId_isActive_idx

-- Fast: Get sales for a date range
SELECT * FROM "ProductSale"
WHERE "tenantId" = ? AND "branchId" = ? 
  AND "soldAt" BETWEEN ? AND ?
ORDER BY "soldAt" DESC;
-- Uses: ProductSale_tenantId_branchId_soldAt_idx
```

### Denormalization
- `totalAmount` stored in `ProductSale` (avoids SUM on items)
- `lineTotal` stored in `ProductSaleItem` (avoids multiplication in queries)
- `tenantId`/`branchId` duplicated in items (avoids JOIN for filtering)

### Query Optimization Tips
- Always include `tenantId` in WHERE clause (uses indexes)
- Use `select` to limit fields (don't fetch `note` if not needed)
- Use pagination (`skip`/`take`) for large result sets
- Consider caching for product catalog (changes infrequently)

---

## Testing Strategy (Phase 2)

### Unit Tests
- Service methods with mocked `PrismaService`
- Validation logic (productId XOR customName)
- Calculation logic (lineTotal, totalAmount)
- Month lock checks

### Integration Tests
- API endpoints with test database
- Transaction rollback scenarios
- Concurrent sale creation
- Month lock enforcement

### E2E Tests
- Complete sale flow (create product → record sale → generate report)
- Month lock workflow (lock → attempt edit → unlock)

---

## Rollback Plan

If issues arise, revert migration:

```bash
# Rollback single migration
npx prisma migrate resolve --rolled-back 20260213132924_add_in_gym_product_sales

# Drop tables manually (if needed)
DROP TABLE "ProductSaleItem";
DROP TABLE "ProductSale";
DROP TABLE "Product";
DROP TABLE "RevenueMonthLock";

# Revert schema.prisma changes
git checkout HEAD -- prisma/schema.prisma
```

**Note:** Only safe before production data exists.

---

## Conclusion

Phase 1 successfully implements the foundational data model for in-gym product sales. The schema is:

- ✅ Multi-tenant secure
- ✅ Flexible (catalog + custom items)
- ✅ Auditable (price snapshots, timestamps)
- ✅ Scalable (indexed for performance)
- ✅ Future-proof (month lock mechanism)

**Next Steps:** Proceed to Phase 2 to implement business logic and integrate with the application.

---

**Document Version:** 1.0  
**Last Updated:** February 13, 2026  
**Author:** GitHub Copilot (Senior NestJS Engineer)  
**Status:** ✅ Phase 1 Complete
