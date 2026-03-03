# Product Sales API

## Scope

- Product catalog management
- Product sale creation and itemization
- Branch-scoped sales behavior
- Month lock constraints for accounting integrity

## Endpoints

- `GET /products`
- `POST /products`
- `PATCH /products/:id`
- `DELETE /products/:id` (soft lifecycle where implemented)
- `POST /product-sales`
- `GET /product-sales`
- Month lock endpoints where implemented

## Validation Highlights

- `branchId` is required on branch-scoped operations.
- Sale items follow XOR rule (`productId` or custom item identity).
- Price and amount fields must be validated as monetary values.
- Product ID format must match backend validator policy.
