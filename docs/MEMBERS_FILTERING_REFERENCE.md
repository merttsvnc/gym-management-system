# Members Filtering Reference

## Overview

The backend provides member listing and filtering capabilities through two endpoints:
- `/api/mobile/members` - Mobile-optimized endpoint with special status mapping
- `/api/v1/members` - Standard API endpoint

Both endpoints share the same underlying service (`MembersService.findAll()`) but differ in how they handle query parameters. The mobile endpoint provides convenience mappings (e.g., `PASSIVE` → `INACTIVE + PAUSED`) while the v1 endpoint accepts raw Prisma enum values.

All queries are automatically scoped to the authenticated user's tenant (`tenantId` from JWT token). Archived members are excluded by default unless `includeArchived=true` is explicitly provided.

---

## Supported Query Parameters

| Parameter | Type | Description | Default | Applies To | Validation Rules |
|-----------|------|-------------|---------|------------|------------------|
| `page` | number | Page number (1-indexed) | `1` | both | Min: 1, Integer |
| `limit` | number | Items per page | `20` | both | Min: 1, Max: 100, Integer |
| `branchId` | string | Filter by branch ID | none | both | Optional string |
| `status` | enum | Filter by member status | none | both | `ACTIVE`, `PAUSED`, `INACTIVE`, `ARCHIVED` (v1 only) or `PASSIVE` (mobile only) |
| `search` | string | Search in firstName, lastName, phone | none | both | Case-insensitive substring match |
| `q` | string | Alias for `search` (mobile only) | none | mobile | Same as `search` |
| `expired` | boolean | Filter expired members | `false` | both | `true`/`false` or `"true"`/`"false"` |
| `expiringDays` | number | Filter members expiring within N days | none | both | Min: 1, Max: 60, Integer |
| `includeArchived` | boolean | Include archived members | `false` | both | `true`/`false` or `"true"`/`"false"` |

### Notes on Parameters

- **`status` parameter differences:**
  - **v1 endpoint (`/api/v1/members`)**: Accepts raw Prisma enum values: `ACTIVE`, `PAUSED`, `INACTIVE`, `ARCHIVED`
  - **Mobile endpoint (`/api/mobile/members`)**: Also accepts `PASSIVE` which maps to `INACTIVE + PAUSED` (see Filter Priority section)

- **`search` vs `q`:**
  - Both endpoints accept `search` parameter
  - Mobile endpoint also accepts `q` as an alias (for compatibility)
  - If both are provided, `q` takes precedence in mobile endpoint

- **Boolean parameters:**
  - Accept both boolean (`true`/`false`) and string (`"true"`/`"false"`) values
  - String values are automatically transformed to booleans

---

## Filter Semantics (Business Meaning)

### Aktif (Active)
**Backend Logic:** `status = ACTIVE AND membershipEndDate >= today`

A member is considered "Active" when:
- Their status is `ACTIVE` (not paused, inactive, or archived)
- Their membership end date is today or in the future

**Important:** Even if `status = ACTIVE`, members with `membershipEndDate < today` are NOT considered active. The date check is mandatory.

### Süresi Dolmuş (Expired)
**Backend Logic:** `membershipEndDate < today` (when `expired=true`)

A member is considered "Expired" when:
- Their membership end date is before today (start of day)
- This filter excludes ARCHIVED members by default (unless `includeArchived=true`)

**Note:** The `expired` filter takes highest precedence and overrides other status filters.

### Pasif (Passive)
**Backend Logic:** `status IN (INACTIVE, PAUSED)` (when `status=PASSIVE` on mobile endpoint)

A member is considered "Passive" when:
- Their status is `INACTIVE` (manually set to inactive)
- OR their status is `PAUSED` (membership is frozen)

**Mobile Endpoint Only:** The mobile endpoint accepts `status=PASSIVE` which automatically includes both `INACTIVE` and `PAUSED` members. The v1 endpoint requires explicitly filtering by `INACTIVE` or `PAUSED` separately.

### Yakında Bitecek (Expiring Soon)
**Backend Logic:** `status = ACTIVE AND membershipEndDate >= today AND membershipEndDate <= (today + expiringDays)`

A member is considered "Expiring Soon" when:
- Their status is `ACTIVE`
- Their membership end date is today or in the future
- Their membership end date is within the next N days (where N is the `expiringDays` parameter)

**Default behavior:** If `expiringDays` is not provided, this filter is not applied. Common values: `7` (next week), `30` (next month).

---

## Filter Priority

Filters are applied in the following priority order (higher priority overrides lower):

1. **`expired=true`** (Highest Priority)
   - Sets: `membershipEndDate < today`
   - Excludes ARCHIVED unless `includeArchived=true`
   - Overrides all other status filters
   - Can be combined with `search` and `branchId`

2. **`expiringDays`** (High Priority)
   - Sets: `status = ACTIVE AND membershipEndDate >= today AND membershipEndDate <= (today + expiringDays)`
   - Overrides `status` filter
   - Cannot be combined with `expired=true` (expired takes precedence)

3. **`isPassiveFilter`** (when `status=PASSIVE` on mobile) (Medium Priority)
   - Sets: `status IN (INACTIVE, PAUSED)`
   - Only available on mobile endpoint
   - Overrides direct `status` filter

4. **`status`** (Low Priority)
   - Direct status filter: `ACTIVE`, `PAUSED`, `INACTIVE`, `ARCHIVED`
   - Special handling for `status=ACTIVE`: Also requires `membershipEndDate >= today`
   - Only applied if `expired`, `expiringDays`, or `isPassiveFilter` are not set

5. **Default behavior** (Lowest Priority)
   - If no status-related filters are provided: Excludes ARCHIVED members (unless `includeArchived=true`)

### Filter Combination Rules

- **`expired=true`** cannot be combined with `expiringDays` or `status` (expired takes precedence)
- **`expiringDays`** cannot be combined with `status` (expiringDays takes precedence)
- **`status=PASSIVE`** (mobile) cannot be combined with direct `status` (PASSIVE takes precedence)
- **`search`** can be combined with any filter
- **`branchId`** can be combined with any filter
- **`includeArchived`** affects all queries (default: false)

---

## Examples

### List Active Members

**Mobile Endpoint:**
```
GET /api/mobile/members?status=ACTIVE
```

**v1 Endpoint:**
```
GET /api/v1/members?status=ACTIVE
```

**Result:** Returns members where `status = ACTIVE AND membershipEndDate >= today`

---

### List Expired Members

**Mobile Endpoint:**
```
GET /api/mobile/members?expired=true
```

**v1 Endpoint:**
```
GET /api/v1/members?expired=true
```

**Result:** Returns members where `membershipEndDate < today` (excluding ARCHIVED by default)

**With Archived Included:**
```
GET /api/mobile/members?expired=true&includeArchived=true
```

---

### List Passive Members

**Mobile Endpoint (using PASSIVE mapping):**
```
GET /api/mobile/members?status=PASSIVE
```

**v1 Endpoint (must filter separately):**
```
GET /api/v1/members?status=INACTIVE
# OR
GET /api/v1/members?status=PAUSED
```

**Result:** Returns members where `status IN (INACTIVE, PAUSED)`

---

### List Expiring Soon Members (Next 7 Days)

**Mobile Endpoint:**
```
GET /api/mobile/members?expiringDays=7
```

**v1 Endpoint:**
```
GET /api/v1/members?expiringDays=7
```

**Result:** Returns members where `status = ACTIVE AND membershipEndDate >= today AND membershipEndDate <= (today + 7 days)`

---

### List Expiring Soon Members (Next 30 Days)

```
GET /api/mobile/members?expiringDays=30
```

---

### Search Active Members

```
GET /api/mobile/members?status=ACTIVE&search=john
```

**Result:** Returns active members (status=ACTIVE, membershipEndDate >= today) whose firstName, lastName, or phone contains "john" (case-insensitive)

---

### Filter by Branch

```
GET /api/mobile/members?branchId=clx1234567890&status=ACTIVE
```

**Result:** Returns active members from the specified branch

---

### Pagination

```
GET /api/mobile/members?page=2&limit=50
```

**Result:** Returns page 2 with 50 items per page

---

### Complex Query: Expired Members in a Branch with Search

```
GET /api/mobile/members?expired=true&branchId=clx1234567890&search=smith&page=1&limit=20
```

**Result:** Returns expired members (membershipEndDate < today) from the specified branch whose name or phone contains "smith", paginated

---

## Implicit Rules

### 1. Tenant Isolation
- **All queries are automatically scoped to the authenticated user's tenant**
- The `tenantId` is extracted from the JWT token and added to every query
- Users cannot access members from other tenants

### 2. ARCHIVED Exclusion
- **Archived members are excluded by default** (unless `includeArchived=true`)
- This applies to all filters except when `includeArchived=true` is explicitly set
- When `expired=true`, ARCHIVED members are excluded unless `includeArchived=true`

### 3. Status + Date Combinations

**ACTIVE Status:**
- `status=ACTIVE` automatically requires `membershipEndDate >= today`
- This ensures that expired members with ACTIVE status are not returned

**Other Statuses:**
- `PAUSED`, `INACTIVE`, `ARCHIVED` do not have date requirements
- They filter purely by status field

### 4. Date Calculation

**"Today" Definition:**
- Calculated using `getTodayStart()` utility function
- Returns current date at 00:00:00 in **server local time**
- All date comparisons use start-of-day normalization

**Example:** If today is `2026-02-01`, "today" is `2026-02-01 00:00:00` (server local time).

### 5. Search Behavior

**Search Fields:**
- `firstName` (case-insensitive substring)
- `lastName` (case-insensitive substring)
- `phone` (case-insensitive substring)

**Search Logic:**
- Uses Prisma `contains` with `mode: 'insensitive'`
- Matches if ANY of the three fields contain the search term
- When combined with `expired=true`, search is applied using `AND` logic (both conditions must match)

### 6. NULL membershipEndDate Handling

**Schema Constraint:**
- `membershipEndDate` is `NOT NULL` in the Prisma schema
- All members must have a membership end date

**Edge Case Handling:**
- Utility functions (`getExpiredMembershipWhere`) handle NULL as a defensive measure, but in practice, NULL should never occur due to schema constraints
- If NULL somehow exists, it would be treated as expired

### 7. Sorting

**Default Sort Order:**
- All queries are sorted by `createdAt DESC` (newest first)
- This is hardcoded in the service and cannot be changed via query parameters

### 8. Pagination Limits

**Maximum Limit:**
- `limit` parameter has a maximum value of `100`
- Requests with `limit > 100` will return validation error: "Limit en fazla 100 olabilir"

**Response Format:**
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

---

## Known Limitations / Notes

### 1. No Custom Sorting
- Sorting is fixed to `createdAt DESC`
- Cannot sort by name, status, expiration date, etc.
- **Workaround:** Frontend must sort results client-side if needed

### 2. No Date Range Filters
- Cannot filter by `membershipStartDate` range
- Cannot filter by custom `membershipEndDate` range (only `expired` and `expiringDays` are supported)
- **Workaround:** Use `expiringDays` with a large value or filter client-side

### 3. Mobile vs v1 Endpoint Differences
- Mobile endpoint has `PASSIVE` mapping, v1 does not
- Mobile endpoint accepts `q` parameter alias, v1 does not
- **Recommendation:** Use mobile endpoint for mobile apps, v1 endpoint for web/admin interfaces

### 4. Search Limitations
- Search only matches `firstName`, `lastName`, and `phone`
- Does not search in `email`, `notes`, or other fields
- **Workaround:** Use multiple queries or implement client-side filtering

### 5. Branch Filtering
- `branchId` is optional (not required)
- If not provided, returns members from all branches in the tenant
- No validation that `branchId` belongs to tenant (handled at service level, returns empty result if invalid)

### 6. Date Timezone Handling
- "Today" is calculated in server local time, not UTC
- This may cause inconsistencies if server timezone changes
- **Recommendation:** Consider migrating to UTC-based date calculations

### 7. Status Filter Edge Cases
- `status=ACTIVE` with `expired=true` will return empty results (expired takes precedence)
- `status=ARCHIVED` is excluded by default even if explicitly requested (unless `includeArchived=true`)
- **Recommendation:** Always use `includeArchived=true` when explicitly filtering by `ARCHIVED` status

### 8. No Filter for "Recently Added"
- Cannot filter members by creation date range
- **Workaround:** Use pagination (newest first) or filter client-side

### 9. No Filter for "Recently Updated"
- Cannot filter members by last update timestamp
- **Workaround:** Filter client-side

### 10. expiringDays Maximum
- Maximum value is `60` days
- Requests with `expiringDays > 60` will return validation error: "expiringDays en fazla 60 olabilir"
- **Workaround:** Use multiple queries or filter client-side for longer ranges

---

## Implementation Details

### Controller Layer

**Mobile Endpoint (`mobile-members.controller.ts`):**
- Maps `status=PASSIVE` to `isPassiveFilter=true`
- Maps `q` parameter to `search`
- Logs query parameters for debugging (no PII)

**v1 Endpoint (`members.controller.ts`):**
- Passes query parameters directly to service
- No special mappings or transformations

### Service Layer (`members.service.ts`)

**Filter Application Order:**
1. Tenant isolation (`tenantId` from parameter)
2. Branch filter (`branchId` if provided)
3. Date calculation (`getTodayStart()`)
4. Status/date filters (priority: expired > expiringDays > isPassiveFilter > status > default)
5. Search filter (if not already handled by expired filter)
6. Pagination (`skip`, `take`)
7. Sorting (`orderBy: { createdAt: 'desc' }`)

**Query Building:**
- Uses Prisma `where` clause composition
- Handles complex combinations using `AND`/`OR` logic
- Special handling for `expired=true` + `search` combination (uses `AND` array)

### DTO Layer (`member-list-query.dto.ts`)

**Validation:**
- Uses `class-validator` decorators
- Automatic type transformation (`@Type(() => Number)`, `@Transform`)
- Turkish error messages for validation failures

**Default Values:**
- `page = 1`
- `limit = 20`
- `includeArchived = false`

---

## Summary

The backend provides comprehensive member filtering capabilities with the following key features:

- **Two endpoints:** Mobile-optimized (`/api/mobile/members`) and standard (`/api/v1/members`)
- **Status filters:** ACTIVE, PAUSED, INACTIVE, ARCHIVED, PASSIVE (mobile only)
- **Date filters:** Expired (`expired=true`), Expiring Soon (`expiringDays=N`)
- **Search:** Case-insensitive search across firstName, lastName, phone
- **Branch filtering:** Optional branchId filter
- **Pagination:** Page-based with configurable limit (max 100)
- **Tenant isolation:** Automatic scoping to authenticated user's tenant
- **Archived exclusion:** ARCHIVED members excluded by default

Filters follow a clear priority order, with `expired` taking highest precedence, followed by `expiringDays`, then status filters. All queries are sorted by creation date (newest first) and include pagination metadata in the response.
