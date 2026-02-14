# Products Mobile Catalog

Implementation of Product Catalog management for the mobile app, allowing admins to create, edit, and deactivate products for use in sales transactions.

## Backend Product ID Format (Fixed)

`POST /api/v1/product-sales` now accepts `productId` in both **CUID** (25 chars) and **UUID** formats. See `docs/PRODUCT_ID_FORMAT_FIX.md` for details.

---

## Overview

This feature integrates with the backend Products CRUD API to provide a complete product catalog management system on mobile. Products can be managed through the Settings tab and are automatically available in the sales creation flow.

## Backend Reference

**Verification Document:** `docs/PRODUCTS_CATALOG_BACKEND_VERIFICATION.md`

**Endpoints Used:**

- `GET /api/v1/products?branchId=...&isActive=true` - List active products
- `POST /api/v1/products?branchId=...` - Create product
- `PATCH /api/v1/products/:id?branchId=...` - Update product
- `DELETE /api/v1/products/:id?branchId=...` - Soft deactivate (sets isActive=false)

**Important Backend Behavior:**

- All endpoints require `branchId` query parameter
- Missing branchId → 400 "branchId query parameter is required."
- Placeholder branchId → 400 "Invalid branchId. Please select a real branch."
- Duplicate product name → 409 "Product name already exists in this branch."

## Screen Flow

```
Settings Tab (Ayarlar)
  └── Ürünler (ProductsScreen)
      ├── View list of active products
      ├── + FAB → Create Product (ProductFormScreen - new mode)
      ├── Tap product → Edit Product (ProductFormScreen - edit mode)
      └── "Pasife Al" button → Soft delete product

CreateSaleScreen
  ├── Shows products picker (horizontal scroll)
  ├── Empty state: "Henüz ürün eklenmemiş..." + "Ürün Ekle" button
  └── Always allows custom product entry as fallback
```

## Screen Details

### ProductsScreen (List)

**Location:** `src/screens/settings/ProductsScreen.tsx`
**Route:** `app/(tabs)/settings/products.tsx`

**Features:**

- List all active products for the selected branch
- Display product name, price (₺), and optional category badge
- Refresh support (pull-to-refresh)
- Empty state with CTA to add first product
- FAB (+) button to create new product
- Tap product → navigate to edit form
- "Pasife Al" button on each product → deactivate

**API Calls:**

- `GET /products?branchId=...&isActive=true` (via `useProductsList` hook)
- `DELETE /products/:id?branchId=...` (via `useDeleteProduct` hook)

**Empty State:**

- Title: "Henüz ürün yok"
- Message: "Satış ekranında hızlı seçim için önce ürün ekleyin."
- Action: "+ Ürün Ekle" button

### ProductFormScreen (Create/Edit)

**Location:** `src/screens/settings/ProductFormScreen.tsx`
**Routes:**

- `app/(tabs)/settings/products/new.tsx` (create mode)
- `app/(tabs)/settings/products/[id].tsx` (edit mode)

**Form Fields:**

1. **Ürün Adı** (required, min 2 chars)
2. **Fiyat (₺)** (required, numeric, >= 0)
3. **Kategori** (optional)

**Validation:**

- Inline error messages in Turkish
- Submit button disabled until form is valid
- Price must be a valid number >= 0
- Product name min length: 2 characters

**Actions:**

- **Create Mode:**
  - "Kaydet" button → POST /products
  - Success → show alert, navigate back
- **Edit Mode:**
  - "Güncelle" button → PATCH /products/:id
  - "Pasife Al" button → DELETE /products/:id (with confirmation)
  - Success → show alert, navigate back

**API Calls:**

- `POST /products?branchId=...` (via `useCreateProduct` hook)
- `PATCH /products/:id?branchId=...` (via `useUpdateProduct` hook)
- `DELETE /products/:id?branchId=...` (via `useDeleteProduct` hook)

### CreateSaleScreen Integration

**Location:** `src/screens/sales/CreateSaleScreen.tsx`

**Updates:**

1. **Loading State:**
   - Shows "Ürünler yükleniyor..." with spinner while fetching products

2. **Empty State:**
   - Old: "Ürün bulunamadı. Aşağıdan özel ad girebilirsiniz."
   - New:
     - Message: "Henüz ürün eklenmemiş. Ayarlar > Ürünler bölümünden ürün ekleyebilirsiniz."
     - "Ürün Ekle" button → navigates to `/(tabs)/settings/products`

3. **Custom Product Entry:**
   - Label changed from "veya" to "veya özel ürün adı"
   - Still allows manual entry as fallback
   - Message no longer implies error state

**Data Invalidation:**

- After creating/updating/deactivating a product, React Query automatically invalidates the products query
- Sales screen products picker updates immediately on navigation back

## Navigation Wiring

**Settings Layout:** `app/(tabs)/settings/_layout.tsx`

- Added routes: `products`, `products/[id]`, `products/new`

**Settings Screen:** `src/screens/settings/SettingsScreen.tsx`

- Added menu item in "Salon Yönetimi" section:
  - Icon: `package-variant-closed`
  - Label: "Ürünler"
  - onPress: `router.push("/(tabs)/settings/products")`

## API Layer

### Types (`src/api/types.ts`)

```typescript
interface ApiProduct {
  id: string;
  name: string;
  category?: string;
  defaultPrice: string; // Money field (2 decimals)
  stockQuantity?: number;
  isActive: boolean;
  branchId: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

interface CreateProductRequest {
  name: string;
  category?: string;
  defaultPrice: string;
  stockQuantity?: number;
}

interface UpdateProductRequest {
  name?: string;
  category?: string;
  defaultPrice?: string;
  stockQuantity?: number;
}
```

### API Functions (`src/api/products.ts`)

- `listProducts(params)` - List active products
- `createProduct(data)` - Create new product
- `updateProduct(id, data)` - Update existing product
- `deleteProduct(id)` - Soft delete (deactivate) product

All functions use `secureClient` helpers that automatically:

- Validate auth token
- Inject and validate branchId
- Map errors to Turkish messages

### React Query Hooks (`src/hooks/sales/useProducts.ts`)

- `useProductsList(isActive)` - Query hook for fetching products
- `useCreateProduct()` - Mutation hook for creating product
- `useUpdateProduct()` - Mutation hook for updating product
- `useDeleteProduct()` - Mutation hook for deleting product

All mutation hooks automatically invalidate products queries on success.

## Error Handling

### Backend Error Mapping (`src/api/secureClient.ts`)

Errors are mapped to user-friendly Turkish messages:

| Backend Error                | Status | Turkish Message                                             |
| ---------------------------- | ------ | ----------------------------------------------------------- |
| Missing branchId             | 400    | "Lütfen geçerli bir şube seçin."                            |
| Invalid/placeholder branchId | 400    | "Lütfen geçerli bir şube seçin."                            |
| Duplicate product name       | 409    | "Bu şubede aynı isimde ürün zaten var."                     |
| Unauthorized/token expired   | 401    | "Oturum süresi dolmuş olabilir. Lütfen tekrar giriş yapın." |

### UI Error Handling

- **Form Validation:** Inline error messages with red border
- **API Errors:** Alert dialogs with mapped Turkish error message
- **Network Errors:** Handled by React Query with error state

## Edge Cases

1. **Product ID Format:** Fixed. Sales endpoint accepts CUID and UUID. See `docs/PRODUCT_ID_FORMAT_FIX.md`.

2. **No Branch Selected:**
   - secureClient validates branchId before API call
   - Shows: "Lütfen geçerli bir şube seçin."

3. **Placeholder Branch ID:**
   - Backend rejects with 400
   - Mapped to: "Lütfen geçerli bir şube seçin."

4. **Duplicate Product Name:**
   - Backend returns 409
   - Mapped to: "Bu şubede aynı isimde ürün zaten var."

5. **Empty Products List:**
   - ProductsScreen: Shows empty state with CTA
   - CreateSaleScreen: Shows helpful message + navigation button

6. **Product Deleted While Editing:**
   - Form loads with loading spinner if product not found
   - User can navigate back

7. **Invalid Price Input:**
   - Form validation: "Geçerli bir fiyat girin"
   - Must be numeric and >= 0

8. **Network Issues:**
   - React Query handles retry logic
   - Pull-to-refresh available on list screen

## Testing Checklist

### ProductsScreen

- [ ] Empty state displays correctly when no products
- [ ] "Ürün Ekle" button navigates to create form
- [ ] Products list displays with name, price, category
- [ ] Pull-to-refresh works
- [ ] FAB navigates to create form
- [ ] Tapping product navigates to edit form
- [ ] "Pasife Al" shows confirmation and deactivates product

### ProductFormScreen (Create)

- [ ] Form validates required fields
- [ ] Name min length (2 chars) enforced
- [ ] Price must be numeric and >= 0
- [ ] Category is optional
- [ ] Submit button disabled until valid
- [ ] Success creates product and navigates back
- [ ] Duplicate name shows 409 error
- [ ] Invalid branch shows branch error

### ProductFormScreen (Edit)

- [ ] Form pre-fills with existing product data
- [ ] Updates save correctly
- [ ] "Pasife Al" shows confirmation
- [ ] "Pasife Al" deactivates product and navigates back
- [ ] Product no longer appears in list after deactivation

### CreateSaleScreen Integration

- [ ] Loading state shows "Ürünler yükleniyor..."
- [ ] Empty state shows helpful message + "Ürün Ekle" button
- [ ] "Ürün Ekle" button navigates to products settings
- [ ] Products picker shows horizontally scrollable list
- [ ] Products list updates after creating/editing product
- [ ] Custom product entry still works as fallback

### Error Scenarios

- [ ] 400 branch error shows correct Turkish message
- [ ] 409 duplicate error shows correct Turkish message
- [ ] 401 auth error shows correct Turkish message
- [ ] Network errors handled gracefully

## Future Enhancements

1. **Search/Filter:** Add search by name or filter by category
2. **Stock Management:** Track and display stockQuantity
3. **Bulk Operations:** Select multiple products to deactivate
4. **Product Images:** Add image upload support
5. **Sort Options:** Sort by name, price, or date created
6. **Archive View:** Show deactivated products with restore option
7. **Product History:** Track price changes and sales history

## Implementation Summary

**Added:**

- 2 new screens (ProductsScreen, ProductFormScreen)
- 3 route files (products.tsx, products/[id].tsx, products/new.tsx)
- API functions for CRUD operations
- React Query hooks for data management
- Navigation menu item in Settings
- Enhanced CreateSaleScreen empty state

**Modified:**

- `src/api/types.ts` - Added CreateProductRequest, UpdateProductRequest
- `src/api/products.ts` - Added create, update, delete functions
- `src/api/secureClient.ts` - Added apiPatchWithBranch, error mapping for 409
- `src/hooks/sales/useProducts.ts` - Added mutation hooks
- `src/screens/sales/CreateSaleScreen.tsx` - Updated empty state messaging
- `src/screens/settings/SettingsScreen.tsx` - Added "Ürünler" menu item
- `app/(tabs)/settings/_layout.tsx` - Added products routes

**Total Files:** 13 new/modified files
