# Member Photo Upload Implementation

This document describes the implementation of member photo upload functionality using Cloudflare R2 Object Storage.

## Overview

The system provides a storage abstraction layer that supports:
- **Production**: Cloudflare R2 (S3-compatible API)
- **Development**: Local disk storage (fallback when R2 credentials are missing)

## Architecture

### Storage Abstraction

The `StorageService` interface abstracts storage operations:

```typescript
interface StorageService {
  upload(buffer: Buffer, key: string, contentType: string): Promise<string>;
}
```

### Implementations

1. **R2StorageService** - Uses AWS SDK v3 to upload to Cloudflare R2
2. **LocalDiskStorageService** - Saves files to local disk (development)

### Service Selection

The `StorageModule` uses a factory pattern to select the appropriate service:

- If all R2 credentials are present → `R2StorageService`
- Otherwise → `LocalDiskStorageService`

This allows seamless development without R2 credentials.

## API Endpoint

### POST /api/v1/uploads/member-photo

**Authentication**: Required (JWT + TenantGuard)

**Request**:
- Method: `POST`
- Content-Type: `multipart/form-data`
- Field name: `file`
- Optional body field: `memberId` (UUID)

**Validation**:
- File type: `image/jpeg`, `image/png`, `image/webp` only
- Max file size: 2MB
- If `memberId` provided: validates member exists and belongs to tenant

**Response**:
```json
{
  "url": "https://<account-id>.r2.dev/gym-members/tenants/{tenantId}/members/{memberId}/{uuid}.jpg"
}
```

**Object Key Format**:
```
tenants/{tenantId}/members/{memberId}/{uuid}.{ext}
```

**Decision on memberId**:
- If provided: validates member exists and belongs to tenant
- If not provided: generates temporary UUID (`temp-{uuid}`)
  - Allows mobile app to upload photos before member creation
  - Mobile can upload photo, get URL, then create member with `photoUrl`

## Security Features

1. **No direct R2 access from mobile** - All uploads go through backend
2. **Tenant isolation** - Object keys include `tenantId` prefix
3. **No original filename** - Uses UUID to prevent information leakage
4. **Metadata stripped** - No EXIF or metadata preserved
5. **Content-Type validation** - Only image types allowed
6. **Size limits** - 2MB maximum to prevent abuse

## File Organization

Files are organized by tenant and member:

```
tenants/
  {tenantId}/
    members/
      {memberId}/
        {uuid}.jpg
```

This structure:
- Enables easy cleanup per tenant
- Supports future migration to private bucket + Worker
- Maintains clear ownership

## Development Setup

### Without R2 (Local Development)

1. Omit R2 environment variables
2. Files saved to `tmp/uploads/` (or `LOCAL_UPLOAD_DIR`)
3. Public URLs: `http://localhost:3000/uploads/...`

### With R2 (Production)

1. Set all R2 environment variables (see `ENVIRONMENT_VARIABLES.md`)
2. Files uploaded to R2 bucket
3. Public URLs: `https://{account-id}.r2.dev/{bucket-name}/...`

## Future Enhancements

The implementation is designed to support:

1. **Private bucket + Worker**: Current structure supports migration
   - Object keys already include tenant/member structure
   - Can add Cloudflare Worker for signed URLs

2. **Image optimization**: Can add image processing before upload
   - Resize, compress, convert formats
   - Store optimized versions

3. **CDN integration**: R2 public URLs can be proxied through CDN
   - Better performance globally
   - Caching support

4. **Deletion**: Can add delete endpoint for cleanup
   - Remove old photos when member photo updated
   - Tenant data cleanup

## Testing

### Unit Tests

- `r2-storage.service.spec.ts` - Tests R2StorageService
- `local-disk-storage.service.spec.ts` - Tests LocalDiskStorageService

### E2E Tests

- `upload-member-photo.e2e-spec.ts` - Tests upload endpoint
  - Successful upload
  - File validation (type, size)
  - Member validation
  - Tenant isolation
  - Authentication

## Integration with Member Model

The `photoUrl` field in the `Member` model stores the public URL returned from the upload endpoint.

**Workflow**:
1. Mobile app uploads photo → `POST /api/v1/uploads/member-photo`
2. Backend returns `{ url: "https://..." }`
3. Mobile app creates/updates member with `photoUrl: response.url`

**No breaking changes**:
- Existing member APIs unchanged
- `photoUrl` remains optional
- Upload endpoint is separate from member CRUD
