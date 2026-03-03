# Uploads API

## Purpose

Upload member photos to configured storage (R2 or local disk service implementation).

## Auth / Scope

- Guards: `JwtAuthGuard`, `TenantGuard`.
- Tenant scope: object key is tenant-scoped (`tenants/{tenantId}/...`).
- File constraints in controller: MIME `image/jpeg|image/png|image/webp`, max `2MB`.

## Endpoints

- `POST /api/v1/uploads/member-photo`

## Request / Response

### `POST /uploads/member-photo`

Content-Type: `multipart/form-data`

Form fields:
- `file` (required)
- `memberId` (optional UUID)

Response:

```json
{ "url": "https://cdn.example.com/tenants/<tenantId>/members/<memberId>/<file>.jpg" }
```

## Examples

```bash
curl -s -X POST "$BASE_URL/api/v1/uploads/member-photo" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./avatar.jpg" \
  -F "memberId=$MEMBER_ID"
```

```bash
curl -s -X POST "$BASE_URL/api/v1/uploads/member-photo" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./avatar.jpg"
```
