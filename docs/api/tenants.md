# Tenants API

## Purpose

Read and update the current authenticated tenant profile.

## Auth / Scope

- Guards: `JwtAuthGuard`, `TenantGuard`.
- Tenant scope: resolved from authenticated user `tenantId`.
- Billing behavior: `GET /current` is marked `@SkipBillingStatusCheck()`.
- Role enforcement: no `@Roles(...)` on controller; code comment says admin-only is TODO.

## Endpoints

- `GET /api/v1/tenants/current`
- `PATCH /api/v1/tenants/current`

## Request / Response

### `GET /tenants/current`

Response: full `Tenant` record from Prisma (includes fields like `id`, `name`, `slug`, `billingStatus`, `defaultCurrency`, timestamps).

### `PATCH /tenants/current`

Request fields (at least one required):

```json
{
  "name": "My Gym",
  "defaultCurrency": "USD"
}
```

Response: updated `Tenant` record.

## Examples

```bash
curl -s "$BASE_URL/api/v1/tenants/current" \
  -H "Authorization: Bearer $TOKEN"
```

```bash
curl -s -X PATCH "$BASE_URL/api/v1/tenants/current" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"defaultCurrency":"EUR"}'
```
