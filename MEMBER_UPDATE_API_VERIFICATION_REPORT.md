# Member Update API Verification Report

**Date:** January 30, 2026  
**Purpose:** Verify backend API support for editing existing members from mobile  
**Scope:** Multi-tenant Gym Management SaaS - Members Module  

---

## Executive Summary

✅ **Backend is READY** for mobile edit member feature with one important restriction:  
- ⚠️ **membershipPlanId cannot be updated** via PATCH endpoint (v1 spec restriction)

All other member fields (personal info, extended profile, photo, branch, membership dates) can be edited from mobile.

---

## 1. Update Endpoints Analysis

### 1.1 Primary Update Endpoint

**✅ PATCH `/api/v1/members/:id`**

**Location:** [backend/src/members/members.controller.ts](backend/src/members/members.controller.ts#L73-L82)

```typescript
@Patch(':id')
update(
  @CurrentUser('tenantId') tenantId: string,
  @Param('id') id: string,
  @Body() dto: UpdateMemberDto,
) {
  return this.membersService.update(tenantId, id, dto);
}
```

**Purpose:** Updates an existing member's details  
**Tenant Isolation:** ✅ Yes - enforced via `tenantId` from JWT token  
**Phone Uniqueness:** ✅ Yes - enforced with DB constraint (excluding current member)  
**Returns:** Updated member object with computed fields  

---

### 1.2 Status Management Endpoints

**✅ POST `/api/v1/members/:id/status`**

**Location:** [backend/src/members/members.controller.ts](backend/src/members/members.controller.ts#L95-L102)

**Purpose:** Changes member status (ACTIVE ↔ PAUSED ↔ INACTIVE) with transition validation  
**DTO:** `ChangeMemberStatusDto` (requires `status` field)  
**Business Rules:**
- Cannot transition FROM `ARCHIVED` (terminal status)
- Cannot set TO `ARCHIVED` via this endpoint
- Validates state transitions via state machine
- Manages `pausedAt` and `resumedAt` timestamps automatically

---

**✅ POST `/api/v1/members/:id/archive`**

**Location:** [backend/src/members/members.controller.ts](backend/src/members/members.controller.ts#L110-L114)

**Purpose:** Archives a member (terminal action - cannot be reversed)  
**Use Case:** Mobile should use this for permanent member archival, not the PATCH endpoint

---

## 2. UpdateMemberDto Analysis

**Location:** [backend/src/members/dto/update-member.dto.ts](backend/src/members/dto/update-member.dto.ts)

### 2.1 Allowed Fields for Update

All fields are **optional** in the DTO. Mobile should only send fields that need to be updated.

| Field                    | Type       | Validation                | Max Length | Empty String → Null |
| ------------------------ | ---------- | ------------------------- | ---------- | ------------------- |
| `branchId`               | string     | Must exist in tenant      | -          | No                  |
| `firstName`              | string     | Min 1, Max 50             | 50         | No (required)       |
| `lastName`               | string     | Min 1, Max 50             | 50         | No (required)       |
| `phone`                  | string     | E.164 regex, Min 10 Max 20| 20         | No (required)       |
| `gender`                 | enum       | MALE, FEMALE              | -          | -                   |
| `dateOfBirth`            | ISO 8601   | Valid date                | -          | ✅ Yes              |
| `email`                  | string     | Valid email               | -          | ✅ Yes              |
| `photoUrl`               | string     | Valid URL                 | -          | ✅ Yes              |
| `membershipStartDate`    | ISO 8601   | Valid date                | -          | No                  |
| `membershipEndDate`      | ISO 8601   | Valid date, must be > start| -         | No                  |
| `notes`                  | string     | Max 5000 chars            | 5000       | ✅ Yes              |
| `address`                | string     | Max 500 chars             | 500        | ✅ Yes              |
| `district`               | string     | Max 100 chars             | 100        | ✅ Yes              |
| `nationalId`             | string     | Max 20 chars              | 20         | ✅ Yes              |
| `maritalStatus`          | enum       | SINGLE, MARRIED, etc      | -          | -                   |
| `occupation`             | string     | Max 100 chars             | 100        | ✅ Yes              |
| `industry`               | string     | Max 100 chars             | 100        | ✅ Yes              |
| `bloodType`              | enum       | A_POS, B_NEG, etc         | -          | -                   |
| `emergencyContactName`   | string     | Max 100 chars             | 100        | ✅ Yes              |
| `emergencyContactPhone`  | string     | E.164 regex, Max 20       | 20         | ✅ Yes              |

### 2.2 Fields NOT Available in UpdateMemberDto

❌ **`membershipPlanId`** - NOT present in UpdateMemberDto  
- **Reason:** v1 spec restriction (explicitly noted in service code)
- **Mobile Impact:** Cannot change member's membership plan via edit
- **Workaround:** If plan change is needed in future, a separate endpoint would be required

❌ **`membershipPriceAtPurchase`** - NOT present in UpdateMemberDto  
- **Reason:** Business rule - price is locked at purchase time
- **Mobile Impact:** Cannot change the price paid

### 2.3 Empty String Normalization

**✅ Implemented** - All optional string fields that receive an empty string (`""`) are automatically:
1. Trimmed
2. Converted to `null` if empty after trimming

**Affected Fields:**
- `email`, `photoUrl`, `notes`, `address`, `district`, `nationalId`, `occupation`, `industry`, `emergencyContactName`, `emergencyContactPhone`, `dateOfBirth`

**Mobile Guidance:**
- To clear a field: Send `null` or `""` (both result in `null`)
- To set a value: Send the actual value
- Don't worry about trailing spaces - backend trims automatically

---

## 3. Service Logic Analysis

**Location:** [backend/src/members/members.service.ts](backend/src/members/members.service.ts#L335-L495)

### 3.1 Tenant Isolation ✅

**Line 337-338:** Calls `findOne(tenantId, id)` first
- This ensures the member belongs to the tenant
- Throws `404 Not Found` if member doesn't exist or belongs to different tenant

### 3.2 Branch Validation ✅

**Lines 340-357:** If `branchId` is being updated:
1. Validates new branch exists
2. Validates branch belongs to the tenant
3. Throws `404 Not Found` if validation fails

### 3.3 Phone Uniqueness Enforcement ✅

**Lines 359-378:** If `phone` is being updated:
1. Trims the phone number
2. Checks if another member in the same tenant has this phone
3. Excludes current member from check (`id: { not: id }`)
4. Throws `409 Conflict` with Turkish message if duplicate found

**Additional Protection:** DB-level constraint catch (lines 470-487)
- Catches Prisma `P2002` error (unique constraint violation)
- Re-throws as `409 Conflict` with user-friendly message

### 3.4 Membership Date Validation ✅

**Lines 380-393:**
- Validates `membershipEndDate > membershipStartDate`
- Preserves existing dates if not being updated
- Throws `400 Bad Request` if validation fails

### 3.5 String Trimming & Normalization ✅

**Lines 395-464:** All string fields are:
1. Checked if `!== undefined` (to distinguish between "not sent" vs "sent as null")
2. Trimmed via `.trim()`
3. Converted to `null` if empty string or explicitly null

**Example Pattern:**
```typescript
if (dto.firstName !== undefined)
  updateData.firstName = dto.firstName.trim();

if (dto.email !== undefined)
  updateData.email = dto.email ? dto.email.trim() : null;
```

### 3.6 Membership Plan Change Restriction ⚠️

**Lines 375 & 415:** Explicit comments:
```typescript
// Note: membershipPlanId changes are not allowed in v1 (spec restriction)
```

**Why:** Business/product decision for v1
**Impact:** Mobile cannot change a member's plan via edit

### 3.7 Response Enrichment ✅

**Line 470:** Returns enriched member object via `enrichMemberWithComputedFields()`

**Computed Fields Added:**
- `remainingDays` (legacy)
- `isMembershipActive` (boolean)
- `membershipState` (ACTIVE | EXPIRED)
- `daysRemaining` (number | null)
- `isExpiringSoon` (boolean - true if < 7 days)

---

## 4. Response Shape

### 4.1 Success Response (200 OK)

Returns the complete updated member object including:

**Base Fields:**
- All database fields (id, tenantId, branchId, firstName, lastName, etc.)
- Timestamps: createdAt, updatedAt
- Status fields: status, pausedAt, resumedAt

**Computed Fields (Added by Backend):**
- `remainingDays`: number
- `isMembershipActive`: boolean
- `membershipState`: "ACTIVE" | "EXPIRED"
- `daysRemaining`: number | null
- `isExpiringSoon`: boolean

**⚠️ Mobile Should NOT Send:** These computed fields in update requests. They are read-only.

### 4.2 Error Responses

| Status | Error Type           | Example Message                                                |
| ------ | -------------------- | -------------------------------------------------------------- |
| 400    | Bad Request          | "Üyelik bitiş tarihi başlangıç tarihinden sonra olmalıdır"    |
| 400    | Validation Error     | Array of field-level validation messages (e.g., "Ad en az 1 karakter olmalıdır") |
| 404    | Not Found            | "Üye bulunamadı" (member doesn't exist or wrong tenant)       |
| 404    | Not Found            | "Şube bulunamadı" (branch doesn't exist or wrong tenant)      |
| 409    | Conflict             | "Bu telefon numarası zaten kullanılıyor. Lütfen farklı bir telefon numarası giriniz." |

---

## 5. Documentation Status

### 5.1 Current Documentation

**File:** [docs/API_MEMBERS.md](docs/API_MEMBERS.md)

**Status:** ✅ **Well-Documented**

**Section 4 - Update Member (Lines 387-432):**
- ✅ Endpoint documented: `PATCH /api/v1/members/:id`
- ✅ States "All fields from Create Member are available as optional fields"
- ✅ Includes example request
- ✅ Documents success response (200 OK)
- ✅ Documents error responses (400, 404, 409)

**Field Reference Section (Lines 514-573):**
- ✅ Complete field table with validation rules
- ✅ System-managed fields clearly marked
- ✅ Max lengths documented
- ✅ Enum values documented

### 5.2 Documentation Gaps Identified

⚠️ **Missing Information:**

1. **membershipPlanId Update Restriction**
   - Not explicitly stated that `membershipPlanId` CANNOT be updated
   - Current doc says "All fields from Create Member are available" which is misleading
   - Should clarify this restriction

2. **Membership Date Update Behavior**
   - Not clear whether mobile SHOULD update these fields
   - No guidance on system-managed vs user-managed dates

3. **Example PATCH Request is Too Minimal**
   - Only shows updating address fields
   - Should include more fields to demonstrate capabilities

---

## 6. Required Documentation Updates

### Update #1: Clarify membershipPlanId Restriction

**Location:** Section 4 - Update Member

**Add after "All fields are optional" paragraph:**

```markdown
**Important Restrictions:**
- ⚠️ `membershipPlanId` cannot be updated via this endpoint (v1 spec restriction)
- ⚠️ `membershipPriceAtPurchase` cannot be updated (locked at purchase time)
- ⚠️ `membershipEndDate` should generally not be manually updated (auto-calculated from plan)
```

### Update #2: Enhance Example Request

**Location:** Section 4 - Example Request

**Replace existing minimal example with comprehensive example:**

```json
{
  "firstName": "Mehmet",
  "lastName": "Demir",
  "phone": "+905559998877",
  "email": "mehmet.demir@example.com",
  "photoUrl": "https://storage.example.com/photos/member-123.jpg",
  "gender": "MALE",
  "dateOfBirth": "1990-05-20",
  "address": "Yeni Mahalle Sok. No:45",
  "district": "Beşiktaş",
  "nationalId": "98765432109",
  "maritalStatus": "MARRIED",
  "occupation": "Mühendis",
  "industry": "İnşaat",
  "bloodType": "B_POS",
  "emergencyContactName": "Fatma Demir",
  "emergencyContactPhone": "+905551112233",
  "notes": "Diz ameliyatı geçirdi, ağır squat yapmamalı"
}
```

### Update #3: Add Clear Guidance on Dates

**Location:** Section 4 or "Notes for Mobile Developers"

**Add:**

```markdown
### Membership Dates on Update

- `membershipStartDate`: Can be updated, but generally should remain unchanged
- `membershipEndDate`: Can be updated, but this is typically system-managed
  - Auto-calculated on member creation based on plan duration
  - Manual updates should be rare (e.g., manual extensions by admin)
- **Mobile Recommendation:** Don't allow editing these fields in standard member edit flow
  - These are better suited for admin/tenant management interface
```

---

## 7. Mobile Implementation Checklist

### 7.1 What Mobile CAN Edit ✅

**Personal Information:**
- ✅ firstName, lastName
- ✅ phone (with uniqueness validation)
- ✅ email (optional, can be cleared)
- ✅ gender, dateOfBirth (optional)
- ✅ photoUrl (optional, can be cleared)

**Location/Identity:**
- ✅ address, district (optional)
- ✅ nationalId (optional)

**Profile Details:**
- ✅ maritalStatus, occupation, industry (optional)
- ✅ bloodType (optional)

**Emergency Contact:**
- ✅ emergencyContactName, emergencyContactPhone (optional)

**Membership:**
- ✅ branchId (with tenant validation)
- ✅ membershipStartDate, membershipEndDate (not recommended for standard edit)

**Notes:**
- ✅ notes (optional, max 5000 chars)

### 7.2 What Mobile CANNOT Edit ❌

- ❌ `membershipPlanId` (v1 restriction)
- ❌ `membershipPriceAtPurchase` (locked at purchase)
- ❌ `status` (use separate status endpoints)
- ❌ System fields: id, tenantId, createdAt, updatedAt, pausedAt, resumedAt
- ❌ Computed fields: remainingDays, isMembershipActive, membershipState, etc.

### 7.3 Recommended Mobile Edit Form

**Required Fields:**
- firstName, lastName, phone

**Optional Sections (Collapsible/Tabs):**
1. **Basic Info:** email, gender, dateOfBirth, photoUrl
2. **Location:** address, district
3. **Identity:** nationalId
4. **Profile:** maritalStatus, occupation, industry, bloodType
5. **Emergency Contact:** emergencyContactName, emergencyContactPhone
6. **Branch:** branchId (dropdown)
7. **Notes:** notes (text area)

**Hidden from Edit (Show as Read-Only if needed):**
- Membership Plan (locked)
- Membership Dates (locked)
- Status (separate action)

### 7.4 Error Handling

**409 Conflict (Phone Duplicate):**
```typescript
if (error.status === 409 && error.message.includes('telefon')) {
  showError('Bu telefon numarası zaten kullanılıyor. Lütfen farklı bir numara giriniz.');
  // Optionally: Offer to search for existing member
}
```

**400 Validation:**
```typescript
if (error.status === 400 && Array.isArray(error.message)) {
  // Display field-level validation errors
  error.message.forEach(msg => showFieldError(msg));
}
```

**404 Not Found:**
```typescript
if (error.status === 404) {
  showError('Üye bulunamadı veya erişim yetkiniz yok.');
  navigateBack();
}
```

---

## 8. Missing Backend Support

### 8.1 Feature Gaps

⚠️ **Membership Plan Change**
- **What's Missing:** Ability to update `membershipPlanId`
- **Why:** v1 spec restriction
- **Workaround:** None currently - if needed, would require new endpoint
- **Priority:** LOW (can be added in v2 if needed)

### 8.2 Potential Enhancements (Not Blocking)

**1. Partial Field Updates with Patch Semantics**
- Current: Works correctly (only updates sent fields)
- Enhancement: Could add explicit `null` vs `undefined` handling if needed

**2. Batch Member Updates**
- Current: One member at a time
- Enhancement: Bulk edit endpoint (e.g., update branch for multiple members)
- Priority: LOW

**3. Update Audit Trail**
- Current: Only `updatedAt` timestamp
- Enhancement: Track who made changes and what changed
- Priority: MEDIUM (good for compliance)

---

## 9. Testing Recommendations

### 9.1 Mobile Should Test

1. **Update all editable fields individually**
2. **Update multiple fields in one request**
3. **Phone uniqueness validation** (try to set another member's phone)
4. **Clear optional fields** (send empty string or null)
5. **Branch change validation** (try to set invalid branchId)
6. **Membership date validation** (try endDate before startDate)
7. **Field length limits** (exceed max lengths)
8. **Invalid enums** (send invalid gender, maritalStatus, bloodType)
9. **Empty required fields** (send empty firstName, lastName, phone)
10. **Computed fields in response** (verify all 5 computed fields are present)

### 9.2 Edge Cases

- Update member with no optional fields set (all nulls) to have values
- Update member with all optional fields set to clear them all (empty strings)
- Update phone to same phone (should succeed)
- Concurrent updates (two users editing same member)

---

## 10. Summary & Recommendations

### ✅ Backend is Ready for Mobile Edit Feature

**Strengths:**
- ✅ Robust tenant isolation
- ✅ Phone uniqueness enforced at DB level
- ✅ Comprehensive field validation
- ✅ Proper string trimming and normalization
- ✅ Clear error messages in Turkish
- ✅ Computed fields automatically added to responses
- ✅ All essential personal/profile fields editable

**Known Limitations:**
- ⚠️ Cannot change membership plan (v1 restriction - acceptable)
- ⚠️ Cannot change price (business rule - expected)

**Action Items:**

1. **Update API_MEMBERS.md** (3 documentation updates listed in Section 6)
2. **Implement mobile edit form** (use checklist in Section 7)
3. **Handle errors properly** (use error handling in Section 7.4)
4. **Test thoroughly** (use test cases in Section 9)

### Mobile Can Proceed with Implementation ✅

**No blocking backend changes required.**

---

**Report Generated:** January 30, 2026  
**Engineer:** GitHub Copilot  
**Next Steps:** Update API_MEMBERS.md and begin mobile implementation
