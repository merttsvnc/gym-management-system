# Quickstart Guide: Member Management (Üye Yönetimi)

**Version:** 1.0.0  
**Date:** 2025-01-20  
**Audience:** Developers testing and verifying the Member Management module

---

## Overview

This guide provides test scenarios and verification steps for the Member Management API. Use this to manually verify main flows in Postman/HTTP client or via the frontend.

**Prerequisites:**
- Backend server running (`npm run start:dev` in `backend/`)
- Database migrations applied
- Valid JWT token for authentication
- At least one tenant and branch created

---

## Running Tests

### Backend Tests

```bash
# Run all tests
cd backend
npm test

# Run e2e tests only
npm run test:e2e

# Run specific test file
npm test -- members.e2e-spec.ts

# Run with coverage
npm test -- --coverage
```

---

## Test Scenarios

### 1. Basic CRUD Flow

#### 1.1 Create Member

**Request:**
```http
POST /api/v1/members
Authorization: Bearer <token>
Content-Type: application/json

{
  "branchId": "<branch-id>",
  "firstName": "Ahmet",
  "lastName": "Yılmaz",
  "phone": "+905551234567",
  "email": "ahmet@example.com",
  "gender": "MALE",
  "dateOfBirth": "1990-01-01",
  "membershipType": "Premium"
}
```

**Expected Response (201):**
- `id` present
- `status` = `ACTIVE`
- `remainingDays` calculated
- Default `membershipStartAt` and `membershipEndAt` if not provided

#### 1.2 List Members

**Request:**
```http
GET /api/v1/members?page=1&limit=20
Authorization: Bearer <token>
```

**Expected Response (200):**
- `data` array with members
- `pagination` object with `page`, `limit`, `total`, `totalPages`
- Each member includes `remainingDays`

#### 1.3 Get Member Detail

**Request:**
```http
GET /api/v1/members/<member-id>
Authorization: Bearer <token>
```

**Expected Response (200):**
- Member object with all fields
- `remainingDays` calculated

#### 1.4 Update Member

**Request:**
```http
PATCH /api/v1/members/<member-id>
Authorization: Bearer <token>
Content-Type: application/json

{
  "firstName": "Ahmet Updated",
  "phone": "+905559876543",
  "notes": "VIP member"
}
```

**Expected Response (200):**
- Updated fields reflected
- `remainingDays` recalculated

#### 1.5 Archive Member

**Request:**
```http
POST /api/v1/members/<member-id>/archive
Authorization: Bearer <token>
```

**Expected Response (200):**
- `status` = `ARCHIVED`
- `pausedAt` and `resumedAt` cleared
- Member excluded from default list (unless `includeArchived=true`)

---

### 2. Status Transitions

#### 2.1 Valid Transitions

**ACTIVE → PAUSED:**
```http
POST /api/v1/members/<member-id>/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "PAUSED"
}
```

**Expected:**
- `status` = `PAUSED`
- `pausedAt` timestamp set
- `resumedAt` = `null`
- `membershipEndAt` unchanged

**PAUSED → ACTIVE:**
```http
POST /api/v1/members/<member-id>/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "ACTIVE"
}
```

**Expected:**
- `status` = `ACTIVE`
- `resumedAt` timestamp set
- `pausedAt` = `null`
- `membershipEndAt` extended by pause duration

**ACTIVE → INACTIVE:**
```http
POST /api/v1/members/<member-id>/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "INACTIVE"
}
```

**Expected:**
- `status` = `INACTIVE`

**INACTIVE → ACTIVE:**
```http
POST /api/v1/members/<member-id>/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "ACTIVE"
}
```

**Expected:**
- `status` = `ACTIVE`

#### 2.2 Invalid Transitions

**ARCHIVED → ACTIVE (should fail):**
```http
POST /api/v1/members/<archived-member-id>/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "ACTIVE"
}
```

**Expected Response (400):**
- Turkish error: "Arşivlenmiş üyelerin durumu değiştirilemez"

**INACTIVE → PAUSED (should fail):**
```http
POST /api/v1/members/<inactive-member-id>/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "PAUSED"
}
```

**Expected Response (400):**
- Turkish error: "Geçersiz durum geçişi: INACTIVE → PAUSED"

---

### 3. Freeze/Resume Behavior

#### 3.1 Freeze (ACTIVE → PAUSED)

**Steps:**
1. Create member with `membershipEndAt` = `2025-12-31`
2. Note initial `remainingDays`
3. Change status to `PAUSED`
4. Wait 5 days (or simulate)
5. Check `remainingDays` again

**Expected:**
- `remainingDays` stays constant during freeze
- `pausedAt` timestamp set
- `membershipEndAt` unchanged

#### 3.2 Resume (PAUSED → ACTIVE)

**Steps:**
1. Member is PAUSED (from previous step)
2. Note `pausedAt` timestamp
3. Change status to `ACTIVE`
4. Check `membershipEndAt` and `remainingDays`

**Expected:**
- `membershipEndAt` extended by pause duration
- `resumedAt` timestamp set
- `pausedAt` cleared
- `remainingDays` reflects extended membership

**Example Calculation:**
- Original `membershipEndAt`: `2025-12-31`
- `pausedAt`: `2025-01-15`
- `resumedAt`: `2025-01-20` (5 days paused)
- New `membershipEndAt`: `2026-01-05` (extended by 5 days)

---

### 4. Phone Uniqueness Rules

#### 4.1 Duplicate Phone in Same Tenant

**Steps:**
1. Create member with phone `+905551234567`
2. Try to create another member with same phone

**Expected Response (409):**
- Turkish error: "Bu telefon numarası zaten kullanılıyor. Lütfen farklı bir telefon numarası giriniz."

#### 4.2 Same Phone Across Different Tenants

**Steps:**
1. Create member in Tenant A with phone `+905551234567`
2. Create member in Tenant B with same phone

**Expected:**
- Both creations succeed (phone uniqueness is per-tenant)

#### 4.3 Update to Duplicate Phone

**Steps:**
1. Create Member A with phone `+905551111111`
2. Create Member B with phone `+905552222222`
3. Try to update Member A's phone to `+905552222222`

**Expected Response (409):**
- Turkish error about phone already in use

---

### 5. Tenant Isolation

#### 5.1 Cross-Tenant Access Prevention

**Steps:**
1. Create member in Tenant A
2. Try to GET member using Tenant B's token

**Expected Response (404):**
- Turkish error: "Üye bulunamadı"
- Not 403 (security: don't reveal member exists)

#### 5.2 List Only Own Tenant Members

**Steps:**
1. Create members in Tenant A and Tenant B
2. List members with Tenant A's token

**Expected:**
- Only Tenant A's members returned
- Tenant B's members not visible

#### 5.3 Prevent Cross-Tenant Updates

**Steps:**
1. Create member in Tenant B
2. Try to UPDATE member using Tenant A's token

**Expected Response (404):**
- Member not found (tenant isolation enforced)

---

### 6. Search Behavior

#### 6.1 Substring Search

**Setup:**
- Create members: "Ahmet Yılmaz", "Mehmet Yıldız", "Ayşe Demir"

**Search by firstName:**
```http
GET /api/v1/members?search=meh
Authorization: Bearer <token>
```

**Expected:**
- Returns "Mehmet Yıldız"

**Search by lastName:**
```http
GET /api/v1/members?search=Yıl
Authorization: Bearer <token>
```

**Expected:**
- Returns "Ahmet Yılmaz" and "Mehmet Yıldız"

**Search by phone:**
```http
GET /api/v1/members?search=1234
Authorization: Bearer <token>
```

**Expected:**
- Returns members with phone containing "1234"

#### 6.2 Case-Insensitive Search

**Steps:**
1. Create member with firstName "Ahmet"
2. Search with "ahmet" (lowercase)
3. Search with "AHMET" (uppercase)

**Expected:**
- Both searches return same results
- Case doesn't matter

---

### 7. Filtering

#### 7.1 Filter by Branch

```http
GET /api/v1/members?branchId=<branch-id>
Authorization: Bearer <token>
```

**Expected:**
- Only members from specified branch

#### 7.2 Filter by Status

```http
GET /api/v1/members?status=PAUSED
Authorization: Bearer <token>
```

**Expected:**
- Only members with PAUSED status

#### 7.3 Include Archived Members

```http
GET /api/v1/members?includeArchived=true
Authorization: Bearer <token>
```

**Expected:**
- Includes ARCHIVED members in results
- Without flag, ARCHIVED members excluded by default

#### 7.4 Combined Filters

```http
GET /api/v1/members?branchId=<branch-id>&status=ACTIVE&search=ahmet&page=1&limit=10
Authorization: Bearer <token>
```

**Expected:**
- All filters applied together
- Pagination works correctly

---

### 8. Pagination

#### 8.1 Basic Pagination

```http
GET /api/v1/members?page=1&limit=5
Authorization: Bearer <token>
```

**Expected:**
- Returns max 5 members
- `pagination.total` shows total count
- `pagination.totalPages` calculated correctly

#### 8.2 Empty Page

```http
GET /api/v1/members?page=999&limit=10
Authorization: Bearer <token>
```

**Expected:**
- Empty `data` array
- `pagination` still present with correct totals

---

## Error Scenarios

### Invalid Branch ID

**Request:**
```http
POST /api/v1/members
Authorization: Bearer <token>
Content-Type: application/json

{
  "branchId": "invalid-branch-id",
  "firstName": "Test",
  "lastName": "Member",
  "phone": "+905551234567"
}
```

**Expected Response (404):**
- Turkish error: "Şube bulunamadı"

### Invalid Membership Dates

**Request:**
```http
POST /api/v1/members
Authorization: Bearer <token>
Content-Type: application/json

{
  "branchId": "<branch-id>",
  "firstName": "Test",
  "lastName": "Member",
  "phone": "+905551234567",
  "membershipStartAt": "2024-12-31",
  "membershipEndAt": "2024-01-01"
}
```

**Expected Response (400):**
- Turkish error: "Üyelik bitiş tarihi başlangıç tarihinden sonra olmalıdır"

### Missing Required Fields

**Request:**
```http
POST /api/v1/members
Authorization: Bearer <token>
Content-Type: application/json

{
  "branchId": "<branch-id>"
}
```

**Expected Response (400):**
- Validation errors for missing `firstName`, `lastName`, `phone`

---

## Verification Checklist

Before marking Member Management as complete:

- [ ] All CRUD operations work correctly
- [ ] Status transitions follow business rules
- [ ] Freeze/resume logic works (remaining days frozen, membership extended)
- [ ] Phone uniqueness enforced per tenant
- [ ] Tenant isolation prevents cross-tenant access
- [ ] Search works (substring, case-insensitive)
- [ ] Filters work (branch, status, archived)
- [ ] Pagination works correctly
- [ ] All error messages in Turkish
- [ ] `remainingDays` calculated correctly in all scenarios
- [ ] Backend e2e tests passing
- [ ] Unit tests for service logic passing

---

## Manual Testing Tips

1. **Use Postman/Insomnia Collections:**
   - Create a collection with all endpoints
   - Set up environment variables for `token`, `tenantId`, `branchId`
   - Use collection runner for regression testing

2. **Test Edge Cases:**
   - Member with past `membershipEndAt`
   - Member paused for very long duration
   - Member with no pause history
   - Member archived while paused

3. **Verify Remaining Days:**
   - Check calculation for ACTIVE members
   - Verify freeze behavior (days don't decrease)
   - Verify resume extends membership correctly

4. **Test Concurrent Operations:**
   - Multiple users updating same member
   - Rapid status changes
   - Search while creating members

---

## Next Steps

After Member Management is verified:

1. **Payment Module:** Link members to payment plans
2. **Check-In Module:** Track member visits at branches
3. **Reports Module:** Generate membership analytics
4. **Notifications Module:** Send membership expiry reminders

---

**End of Quickstart Guide**

