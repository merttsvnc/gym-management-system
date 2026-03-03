# Revenue Month Locks API

## Purpose

Lock/unlock accounting months to prevent edits in locked months.

## Auth / Scope

- Guards: `JwtAuthGuard`, `TenantGuard`.
- Tenant scope from JWT `tenantId`.
- Branch scope required through `branchId` query parameter.

## Endpoints

- `GET /api/v1/revenue-month-locks?branchId=<uuid>`
- `POST /api/v1/revenue-month-locks?branchId=<uuid>`
- `DELETE /api/v1/revenue-month-locks/:month?branchId=<uuid>`
- `GET /api/v1/revenue-month-locks/check/:month?branchId=<uuid>`

## Request / Response

### `GET /revenue-month-locks`

Returns locked months for tenant + branch.

### `POST /revenue-month-locks`

Request:

```json
{ "month": "2026-02" }
```

Response shape is service-derived lock entity (tenant/branch/month metadata).

### `DELETE /revenue-month-locks/:month`

Response:

```json
{ "message": "Month unlocked successfully" }
```

### `GET /revenue-month-locks/check/:month`

Response shape depends on service `checkMonth` result (lock status + metadata).

## Examples

```bash
curl -s "$BASE_URL/api/v1/revenue-month-locks?branchId=$BRANCH_ID" \
  -H "Authorization: Bearer $TOKEN"
```

```bash
curl -s -X POST "$BASE_URL/api/v1/revenue-month-locks?branchId=$BRANCH_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"month":"2026-02"}'
```
