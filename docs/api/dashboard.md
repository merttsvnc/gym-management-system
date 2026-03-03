# Dashboard API

## Purpose

Dashboard summary and chart aggregates for members.

## Auth / Scope

- Guards: `JwtAuthGuard`, `TenantGuard`.
- Tenant scope: authenticated user `tenantId`.
- Optional branch scoping via `branchId` query.

## Endpoints

- `GET /api/v1/dashboard/summary`
- `GET /api/v1/dashboard/membership-distribution`
- `GET /api/v1/dashboard/monthly-members`
- `GET /api/mobile/dashboard/summary` (mobile-prefixed controller)

## Request / Response

### `GET /dashboard/summary`

Query: `branchId?`, `expiringDays?`.

Response:

```json
{
  "counts": {
    "totalMembers": 120,
    "activeMembers": 90,
    "passiveMembers": 30,
    "expiringSoonMembers": 12
  },
  "meta": {
    "expiringDays": 7,
    "branchId": "uuid"
  }
}
```

### `GET /dashboard/membership-distribution`

Query: `branchId?`

Response:

```json
[
  { "planId": "uuid", "planName": "Monthly", "activeMemberCount": 40 }
]
```

### `GET /dashboard/monthly-members`

Query: `branchId?`, `months?` (1-12)

Response:

```json
[
  { "month": "2026-01", "newMembers": 18 }
]
```

## Examples

```bash
curl -s "$BASE_URL/api/v1/dashboard/summary?expiringDays=14" \
  -H "Authorization: Bearer $TOKEN"
```

```bash
curl -s "$BASE_URL/api/v1/dashboard/monthly-members?months=6&branchId=$BRANCH_ID" \
  -H "Authorization: Bearer $TOKEN"
```
