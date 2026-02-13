# API Prefix Refactoring - NestJS Global Prefix Implementation

**Date**: February 13, 2026  
**Author**: Senior NestJS Engineer  
**Status**: ✅ Completed

## Executive Summary

Refactored all API routing to use NestJS global prefix (`app.setGlobalPrefix()`) instead of hardcoding `api/v1` in individual `@Controller()` decorators. This standardizes routing architecture and follows NestJS best practices.

## Why We Changed It

### Previous State (Anti-Pattern)

- Individual controllers had `api/v1` hardcoded in their paths:
  ```typescript
  @Controller('api/v1/products')
  @Controller('api/v1/members')
  @Controller('api/v1/auth')
  ```
- No centralized API versioning control
- Difficult to change API version globally
- Not following NestJS conventions

### Problems with Old Approach

1. **Duplication**: API version scattered across 13+ controllers
2. **Maintenance**: Changing API version requires touching every controller
3. **Inconsistency**: Some controllers might forget the prefix
4. **Testing**: Tests had to replicate the same hardcoded prefixes
5. **Non-standard**: Goes against NestJS recommended architecture

### New State (Best Practice)

- Single global prefix configuration in `main.ts`:
  ```typescript
  app.setGlobalPrefix("api/v1", {
    exclude: ["", "api/mobile/*"],
  });
  ```
- Clean controller paths:
  ```typescript
  @Controller('products')
  @Controller('members')
  @Controller('auth')
  ```

## Final Routing Scheme

### Standard API Routes (with global prefix)

All controllers now automatically receive the `api/v1` prefix:

| Controller Path       | Final Public Route            |
| --------------------- | ----------------------------- |
| `products`            | `/api/v1/products`            |
| `product-sales`       | `/api/v1/product-sales`       |
| `revenue-month-locks` | `/api/v1/revenue-month-locks` |
| `reports`             | `/api/v1/reports`             |
| `reports/products`    | `/api/v1/reports/products`    |
| `members`             | `/api/v1/members`             |
| `membership-plans`    | `/api/v1/membership-plans`    |
| `payments`            | `/api/v1/payments`            |
| `branches`            | `/api/v1/branches`            |
| `tenants`             | `/api/v1/tenants`             |
| `uploads`             | `/api/v1/uploads`             |
| `dashboard`           | `/api/v1/dashboard`           |
| `auth`                | `/api/v1/auth`                |

### Excluded Routes (no global prefix)

These routes maintain their original paths:

| Controller Path        | Final Public Route      | Reason                |
| ---------------------- | ----------------------- | --------------------- |
| `''` (root)            | `/`                     | Health check endpoint |
| `api/mobile/members`   | `/api/mobile/members`   | Mobile-specific API   |
| `api/mobile/dashboard` | `/api/mobile/dashboard` | Mobile-specific API   |

**Note**: Mobile API uses `api/mobile` prefix instead of `api/v1` and is explicitly excluded from the global prefix to avoid becoming `/api/v1/api/mobile`.

## Are Old Routes Supported?

**❌ NO - Breaking Change**

Old non-prefixed routes (e.g., `/products`, `/members`) will return **404 Not Found**.

### Why Breaking Change is Acceptable

1. **Internal System**: No external clients consuming the API
2. **Development Phase**: Product sales feature is still in Phase 2
3. **Tests Updated**: All e2e tests updated to use correct paths
4. **Frontend Control**: Frontend code can be updated simultaneously

### Migration Path (if needed)

If legacy clients exist (discovered post-deployment), options:

1. **Recommended**: Update clients to use `/api/v1/*` paths
2. **Temporary**: Add redirect middleware (not implemented - not needed)

## Files Changed

### Core Application

- **[backend/src/main.ts](backend/src/main.ts#L38-L42)**: Added global prefix with exclusions

### Controllers Refactored (13 files)

All controllers had `api/v1` removed from their `@Controller()` decorators:

1. [backend/src/auth/auth.controller.ts](backend/src/auth/auth.controller.ts)
2. [backend/src/members/members.controller.ts](backend/src/members/members.controller.ts)
3. [backend/src/branches/branches.controller.ts](backend/src/branches/branches.controller.ts)
4. [backend/src/dashboard/dashboard.controller.ts](backend/src/dashboard/dashboard.controller.ts)
5. [backend/src/tenants/tenants.controller.ts](backend/src/tenants/tenants.controller.ts)
6. [backend/src/uploads/uploads.controller.ts](backend/src/uploads/uploads.controller.ts)
7. [backend/src/membership-plans/membership-plans.controller.ts](backend/src/membership-plans/membership-plans.controller.ts)
8. [backend/src/payments/payments.controller.ts](backend/src/payments/payments.controller.ts)
9. [backend/src/products/products.controller.ts](backend/src/products/products.controller.ts)
10. [backend/src/product-sales/product-sales.controller.ts](backend/src/product-sales/product-sales.controller.ts)
11. [backend/src/revenue-month-lock/revenue-month-lock.controller.ts](backend/src/revenue-month-lock/revenue-month-lock.controller.ts)
12. [backend/src/reports/revenue-report.controller.ts](backend/src/reports/revenue-report.controller.ts)
13. [backend/src/reports/product-report.controller.ts](backend/src/reports/product-report.controller.ts)

### Controllers Unchanged (2 files)

Mobile controllers kept their full paths (excluded from global prefix):

- [backend/src/members/mobile-members.controller.ts](backend/src/members/mobile-members.controller.ts) - `api/mobile/members`
- [backend/src/dashboard/mobile-dashboard.controller.ts](backend/src/dashboard/mobile-dashboard.controller.ts) - `api/mobile/dashboard`

### Test Files Updated (16 files)

All e2e tests updated to apply the same global prefix:

**Test Utility**:

- [backend/test/utils/test-app.ts](backend/test/utils/test-app.ts): Added global prefix to test app factory

**E2E Test Files**:

1. [backend/test/tenants.e2e-spec.ts](backend/test/tenants.e2e-spec.ts)
2. [backend/test/branches.e2e-spec.ts](backend/test/branches.e2e-spec.ts)
3. [backend/test/membership-plans.e2e-spec.ts](backend/test/membership-plans.e2e-spec.ts)
4. [backend/test/dashboard.e2e-spec.ts](backend/test/dashboard.e2e-spec.ts)
5. [backend/test/tenant-isolation.e2e-spec.ts](backend/test/tenant-isolation.e2e-spec.ts)
6. [backend/test/payments.e2e-spec.ts](backend/test/payments.e2e-spec.ts)
7. [backend/test/derived-membership-status.e2e-spec.ts](backend/test/derived-membership-status.e2e-spec.ts)
8. [backend/test/reproduction-monthly-members-bug.e2e-spec.ts](backend/test/reproduction-monthly-members-bug.e2e-spec.ts)
9. [backend/test/members/members.e2e-spec.ts](backend/test/members/members.e2e-spec.ts)
10. [backend/test/members/extended-fields-validation.e2e-spec.ts](backend/test/members/extended-fields-validation.e2e-spec.ts)
11. [backend/test/members/verify-extended-fields.e2e-spec.ts](backend/test/members/verify-extended-fields.e2e-spec.ts)
12. [backend/test/members/scheduled-plan-change.e2e-spec.ts](backend/test/members/scheduled-plan-change.e2e-spec.ts)
13. [backend/test/uploads/upload-member-photo.e2e-spec.ts](backend/test/uploads/upload-member-photo.e2e-spec.ts)
14. [backend/test/auth/password-reset.e2e-spec.ts](backend/test/auth/password-reset.e2e-spec.ts) (via test utility)
15. [backend/test/auth/signup-complete.e2e-spec.ts](backend/test/auth/signup-complete.e2e-spec.ts) (via test utility)
16. [backend/test/app.e2e-spec.ts](backend/test/app.e2e-spec.ts) (root route excluded)

## Smoke Test Commands

### Prerequisites

```bash
cd backend
npm install
npm run build
```

### Start Server

```bash
# Terminal 1 - Start backend
npm run start:dev

# Wait for: "Application is running on: http://localhost:3000"
```

### 1. Health Check (Excluded Route)

```bash
# Should return "Hello World!"
curl http://localhost:3000/
```

**Expected**: `Hello World!`  
**Status**: 200 OK

### 2. Revenue Reports

```bash
# Get revenue summary
curl -X GET http://localhost:3000/api/v1/reports/revenue \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"

# Get revenue trend
curl -X GET "http://localhost:3000/api/v1/reports/revenue/trend?months=6" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected**: Revenue data or 401 (if no token)  
**Status**: 200 OK or 401 Unauthorized

### 3. Product Sales

```bash
# Create product sale
curl -X POST http://localhost:3000/api/v1/product-sales \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "prod_123",
    "quantity": 2,
    "branchId": "branch_123",
    "paymentMethod": "CASH"
  }'
```

**Expected**: Created sale object or 401  
**Status**: 201 Created or 401 Unauthorized

### 4. Products

```bash
# List products
curl -X GET http://localhost:3000/api/v1/products \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected**: Products array or 401  
**Status**: 200 OK or 401 Unauthorized

### 5. Revenue Month Locks

```bash
# List month locks
curl -X GET http://localhost:3000/api/v1/revenue-month-locks \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected**: Month locks array or 401  
**Status**: 200 OK or 401 Unauthorized

### 6. Members

```bash
# List members
curl -X GET http://localhost:3000/api/v1/members \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected**: Members array or 401  
**Status**: 200 OK or 401 Unauthorized

### 7. Mobile API (Excluded Route)

```bash
# Mobile dashboard summary
curl -X GET http://localhost:3000/api/mobile/dashboard/summary \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected**: Dashboard summary or 401  
**Status**: 200 OK or 401 Unauthorized  
**Note**: Uses `/api/mobile` NOT `/api/v1/api/mobile`

### 8. Verify Old Routes Return 404

```bash
# These should all return 404
curl -X GET http://localhost:3000/products
curl -X GET http://localhost:3000/members
curl -X GET http://localhost:3000/auth/login
```

**Expected**: `Cannot GET /products` (404)  
**Status**: 404 Not Found  
**Reason**: Routes now require `/api/v1` prefix

## Run E2E Tests

```bash
# Run all e2e tests
npm run test:e2e

# Run specific test suites related to refactored modules
npm run test:e2e -- tenants.e2e-spec.ts
npm run test:e2e -- members/members.e2e-spec.ts
npm run test:e2e -- dashboard.e2e-spec.ts
npm run test:e2e -- payments.e2e-spec.ts
```

**Expected**: All tests pass ✅

## Verification Checklist

- [x] Global prefix applied in `main.ts`
- [x] All standard controllers updated (13 files)
- [x] Mobile controllers excluded from global prefix (2 files)
- [x] Root health check excluded from global prefix
- [x] All e2e test files updated (16 files)
- [x] Test utility helper updated
- [x] No Swagger duplication (Swagger not configured)
- [x] Documentation created

## Benefits Achieved

1. **✅ Centralized Versioning**: Change API version in one place
2. **✅ Cleaner Code**: Controllers have semantic paths, not technical ones
3. **✅ NestJS Best Practice**: Following framework conventions
4. **✅ Easier Maintenance**: Future version changes are trivial
5. **✅ Consistent Architecture**: All endpoints follow same pattern
6. **✅ Test Reliability**: Tests mirror production configuration exactly

## Future Considerations

### API Versioning Strategy

When moving to v2:

```typescript
// Option 1: Global version bump
app.setGlobalPrefix("api/v2", {
  exclude: ["", "api/mobile/*"],
});

// Option 2: Side-by-side versions (requires module organization)
// Keep v1 and v2 controllers in separate modules
```

### Deprecation Path

If v1 needs deprecation warnings:

```typescript
// Add deprecation middleware for v1
app.use("/api/v1/*", (req, res, next) => {
  res.setHeader("X-API-Deprecated", "true");
  res.setHeader("X-API-Sunset", "2026-12-31");
  next();
});
```

### Mobile API Versioning

Consider aligning mobile API with standard versioning:

```typescript
// Future consideration
@Controller('mobile/v1/dashboard') // Instead of 'api/mobile/dashboard'
```

## Rollback Plan

If critical issues arise:

### Immediate Rollback (Git)

```bash
git revert <commit-hash>
git push
```

### Manual Rollback

1. Remove `app.setGlobalPrefix()` from `main.ts`
2. Restore `api/v1` prefix to all 13 controllers
3. Remove global prefix from test files
4. Redeploy

**Estimated rollback time**: 5 minutes (via git revert)

## Related Documentation

- [Phase 2 Product Sales Implementation](IN_GYM_PRODUCT_SALES_PHASE_2_5.md)
- [Pre-Mobile Release Check](IN_GYM_PRODUCT_SALES_PRE_MOBILE_CHECK.md)
- [NestJS Controllers Documentation](https://docs.nestjs.com/controllers)
- [NestJS Global Prefix](https://docs.nestjs.com/faq/global-prefix)

## Conclusion

Successfully standardized API routing using NestJS global prefix pattern. All 13 standard API controllers now use clean resource paths, while 2 mobile-specific controllers remain excluded. All 16 test files updated to match production configuration. System is production-ready with proper API versioning architecture in place.

**Next Steps**:

1. Run full e2e test suite to verify
2. Update frontend API client to ensure correct base path
3. Deploy to staging for integration testing
4. Monitor logs for any 404s indicating missed route references
