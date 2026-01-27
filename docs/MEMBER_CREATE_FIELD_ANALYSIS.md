# Member Create Field Analysis

**Date:** 2026-01-20  
**Purpose:** Comprehensive analysis of all fields relevant for creating a new Member in the backend, classified for mobile form implementation  
**Audience:** Mobile development team

---

## 1. Summary

This document provides a complete breakdown of all fields required and optional when creating a new Member via `POST /api/v1/members`. The analysis is based on:

- **DTO:** `CreateMemberDto` (`backend/src/members/dto/create-member.dto.ts`)
- **Controller:** `MembersController.create()` (`backend/src/members/members.controller.ts`)
- **Service:** `MembersService.create()` (`backend/src/members/members.service.ts`)
- **Prisma Schema:** `Member` model (`backend/prisma/schema.prisma`)
- **Related Models:** `MembershipPlan`, `Branch`
- **Duration Calculator:** `calculateMembershipEndDate()` utility

### Key Findings:

1. **Required Fields:** 5 fields are required (branchId, firstName, lastName, phone, membershipPlanId)
2. **Optional Fields:** 7 fields are optional (gender, dateOfBirth, email, photoUrl, membershipStartDate, membershipPriceAtPurchase, notes)
3. **Server-Generated Fields:** 6 fields are automatically set by the server and should NOT be sent by the client
4. **Computed Fields:** `membershipEndDate` is automatically calculated from the membership plan's duration
5. **Business Rules:** Phone uniqueness within tenant, membership plan must be ACTIVE, branch must belong to tenant

---

## 2. Complete Field Table

| Field Name | Type | Required? | Default Value | Validation Rules | Notes |
|------------|------|-----------|---------------|------------------|-------|
| **branchId** | string | ✅ Yes | None | - Must be valid CUID<br>- Branch must exist<br>- Branch must belong to tenant | Validated in service layer |
| **firstName** | string | ✅ Yes | None | - Min length: 1<br>- Max length: 50<br>- Trimmed on save | Core profile field |
| **lastName** | string | ✅ Yes | None | - Min length: 1<br>- Max length: 50<br>- Trimmed on save | Core profile field |
| **phone** | string | ✅ Yes | None | - Min length: 10<br>- Max length: 20<br>- Pattern: `^\+?[1-9]\d{1,14}$` (E.164 format)<br>- Must be unique within tenant<br>- Trimmed on save | Unique constraint enforced |
| **membershipPlanId** | string | ✅ Yes | None | - Must be valid CUID<br>- Plan must exist<br>- Plan must belong to tenant<br>- Plan status must be ACTIVE | Validated in service layer |
| **gender** | enum (MALE\|FEMALE) | ❌ No | `null` | - Must be `MALE` or `FEMALE` if provided | Optional profile field |
| **dateOfBirth** | string (ISO 8601) | ❌ No | `null` | - Must be valid ISO 8601 date string if provided<br>- Converted to Date object on save | Optional profile field |
| **email** | string | ❌ No | `null` | - Must be valid email format if provided<br>- Trimmed on save | Optional profile field |
| **photoUrl** | string | ❌ No | `null` | - Must be valid URL if provided | Optional profile field |
| **membershipStartDate** | string (ISO 8601) | ❌ No | Current date/time (`now()`) | - Must be valid ISO 8601 date string if provided<br>- Defaults to current date/time if omitted | Used to calculate membershipEndDate |
| **membershipPriceAtPurchase** | number | ❌ No | Plan's current price | - Must be a number if provided<br>- Defaults to plan's `price` field if omitted | Historical price tracking |
| **notes** | string | ❌ No | `null` | - Max length: 5000 characters<br>- Trimmed on save | Free-form notes field |
| **membershipEndDate** | Date | ❌ No (computed) | Calculated from plan | - Automatically calculated from `membershipStartDate` + plan duration<br>- NOT accepted in payload | Server-generated (computed) |
| **tenantId** | string | ❌ No (server-set) | From JWT token | - Extracted from authenticated user's token<br>- NOT accepted in payload | Server-generated (from auth) |
| **status** | enum | ❌ No (server-set) | `ACTIVE` | - Always set to `ACTIVE` on creation<br>- NOT accepted in payload | Server-generated (default) |
| **id** | string (CUID) | ❌ No (server-set) | Generated | - Auto-generated CUID<br>- NOT accepted in payload | Server-generated (auto) |
| **createdAt** | DateTime | ❌ No (server-set) | `now()` | - Auto-set to current timestamp<br>- NOT accepted in payload | Server-generated (auto) |
| **updatedAt** | DateTime | ❌ No (server-set) | `now()` | - Auto-set to current timestamp<br>- Auto-updated on changes | Server-generated (auto) |
| **pausedAt** | DateTime | ❌ No (server-set) | `null` | - Set only when status changes to PAUSED<br>- NOT accepted in payload | Server-generated (status change) |
| **resumedAt** | DateTime | ❌ No (server-set) | `null` | - Set only when status changes from PAUSED to ACTIVE<br>- NOT accepted in payload | Server-generated (status change) |

---

## 3. Mobile MVP Field Sets

### A) Minimal Required Set (Must be in Form)

These 5 fields **MUST** be included in the mobile form and are required for member creation:

1. **branchId** (string)
   - **UI:** Dropdown/select of available branches
   - **Validation:** Must select a branch
   - **Source:** Fetch from `GET /api/v1/branches` (filter by tenant)

2. **firstName** (string)
   - **UI:** Text input
   - **Validation:** 1-50 characters, required
   - **Placeholder:** "Ad"

3. **lastName** (string)
   - **UI:** Text input
   - **Validation:** 1-50 characters, required
   - **Placeholder:** "Soyad"

4. **phone** (string)
   - **UI:** Text input with phone keyboard
   - **Validation:** 10-20 characters, E.164 format (`^\+?[1-9]\d{1,14}$`), required, unique within tenant
   - **Placeholder:** "Telefon"
   - **Error Handling:** If duplicate phone (409 Conflict), show error: "Bu telefon numarası zaten kullanılıyor. Lütfen farklı bir telefon numarası giriniz."

5. **membershipPlanId** (string)
   - **UI:** Dropdown/select of active membership plans
   - **Validation:** Must select a plan
   - **Source:** Fetch from `GET /api/v1/membership-plans/active` (filter by tenant/branch scope)

### B) Recommended Optional Fields (Other Info Section)

These 7 fields are optional but recommended for a complete member profile. Group them in an "Other Information (Optional)" collapsible section:

1. **gender** (enum: MALE | FEMALE)
   - **UI:** Radio buttons or dropdown
   - **Validation:** Optional, must be MALE or FEMALE if provided
   - **Label:** "Cinsiyet"

2. **dateOfBirth** (string, ISO 8601)
   - **UI:** Date picker
   - **Validation:** Optional, must be valid ISO 8601 date if provided
   - **Label:** "Doğum Tarihi"
   - **Format:** Send as ISO 8601 string (e.g., "1990-01-15T00:00:00.000Z")

3. **email** (string)
   - **UI:** Email input with email keyboard
   - **Validation:** Optional, must be valid email format if provided
   - **Placeholder:** "E-posta"

4. **photoUrl** (string)
   - **UI:** Image picker + upload (if backend supports) OR URL input
   - **Validation:** Optional, must be valid URL if provided
   - **Label:** "Fotoğraf URL"
   - **Note:** If implementing image upload, upload first, then use returned URL

5. **membershipStartDate** (string, ISO 8601)
   - **UI:** Date picker (defaults to today)
   - **Validation:** Optional, defaults to current date/time if omitted
   - **Label:** "Üyelik Başlangıç Tarihi"
   - **Default:** Today's date
   - **Format:** Send as ISO 8601 string (e.g., "2026-01-20T00:00:00.000Z")
   - **Note:** If omitted, backend uses current date/time

6. **membershipPriceAtPurchase** (number)
   - **UI:** Number input (decimal)
   - **Validation:** Optional, defaults to plan's current price if omitted
   - **Label:** "Satın Alma Fiyatı"
   - **Placeholder:** "Plan fiyatından farklıysa giriniz"
   - **Note:** Only show if plan price can be customized (business rule dependent)

7. **notes** (string)
   - **UI:** Multi-line text area
   - **Validation:** Optional, max 5000 characters
   - **Label:** "Notlar"
   - **Placeholder:** "Üye hakkında notlar..."

### C) Fields That Should NOT Be Set by Client (Server-Generated)

These fields are **automatically set by the server** and should **NOT** be included in the request payload:

1. **id** - Auto-generated CUID
2. **tenantId** - Extracted from JWT token
3. **membershipEndDate** - Computed from `membershipStartDate` + plan duration
4. **status** - Always set to `ACTIVE` on creation
5. **createdAt** - Auto-set to current timestamp
6. **updatedAt** - Auto-set to current timestamp
7. **pausedAt** - Set only on status change to PAUSED
8. **resumedAt** - Set only on status change from PAUSED to ACTIVE

**Important:** The backend uses `ValidationPipe` with `forbidNonWhitelisted: true`, so sending these fields will result in a 400 Bad Request error.

---

## 4. Membership Date Rules Explanation

### membershipStartDate

- **Required?** No (optional)
- **Default:** Current date/time (`now()`) if omitted
- **Client Behavior:** 
  - If provided: Must be valid ISO 8601 date string
  - If omitted: Backend uses current date/time
- **Use Case:** Allows backdating membership start (e.g., member signed up yesterday but registering today)

### membershipEndDate

- **Required?** No (computed, NOT accepted in payload)
- **How It's Calculated:** Automatically computed from:
  - `membershipStartDate` (or current date if omitted)
  - Plan's `durationType` (DAYS or MONTHS)
  - Plan's `durationValue` (1-730 for DAYS, 1-24 for MONTHS)
- **Calculation Logic:**
  - **DAYS:** Simple addition: `membershipStartDate + durationValue days`
  - **MONTHS:** Calendar month addition with month-end clamping:
    - Jan 31 + 1 month = Feb 28/29 (leap year dependent)
    - Mar 31 + 1 month = Apr 30
    - Jan 15 + 1 month = Feb 15 (day exists, no clamping)
- **Client Behavior:** 
  - **DO NOT** send `membershipEndDate` in the request
  - Backend calculates it automatically
  - Response includes the calculated `membershipEndDate`

**Example:**
- Plan: 30 DAYS duration
- membershipStartDate: "2026-01-20T00:00:00.000Z" (or omitted, defaults to now)
- Result: membershipEndDate = "2026-02-19T00:00:00.000Z" (30 days later)

**Example:**
- Plan: 1 MONTH duration
- membershipStartDate: "2026-01-31T00:00:00.000Z"
- Result: membershipEndDate = "2026-02-28T00:00:00.000Z" (Feb 29 in leap year)

---

## 5. Cross-Check with API Documentation

### Current API Docs Status (API_DOCS_v1.1.md)

**Finding:** The API documentation does **NOT** include a detailed section for `POST /api/v1/members` endpoint. It only lists the endpoint in the summary table (line 794) without request/response format, validation rules, or field descriptions.

### Documentation Gaps Identified

1. **Missing Endpoint Documentation:**
   - No request body format documented
   - No field descriptions
   - No validation rules
   - No response format
   - No error scenarios (409 Conflict for duplicate phone)

2. **Missing Business Rules:**
   - Phone uniqueness within tenant
   - Membership plan must be ACTIVE
   - Branch must belong to tenant
   - membershipEndDate computation logic

3. **Missing Examples:**
   - Request example
   - Response example
   - Error response examples (400, 404, 409)

### Recommended Documentation Updates

Add a new section to `API_DOCS_v1.1.md`:

```markdown
## X. Create Member Endpoint

**POST** `/api/v1/members`

**Purpose:** Create a new member for the current tenant

**Authorization:** Requires JWT token (tenantId extracted from token)

**Request Body:**

```json
{
  "branchId": "clxxx",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+905551234567",
  "membershipPlanId": "clyyy",
  "gender": "MALE",
  "dateOfBirth": "1990-01-15T00:00:00.000Z",
  "email": "john.doe@example.com",
  "photoUrl": "https://example.com/photo.jpg",
  "membershipStartDate": "2026-01-20T00:00:00.000Z",
  "membershipPriceAtPurchase": 500.00,
  "notes": "VIP member"
}
```

**Required Fields:**
- `branchId` (string): Branch ID (CUID)
- `firstName` (string): 1-50 characters
- `lastName` (string): 1-50 characters
- `phone` (string): 10-20 characters, E.164 format, unique within tenant
- `membershipPlanId` (string): Membership plan ID (CUID)

**Optional Fields:**
- `gender` (enum): MALE | FEMALE
- `dateOfBirth` (string): ISO 8601 date string
- `email` (string): Valid email format
- `photoUrl` (string): Valid URL
- `membershipStartDate` (string): ISO 8601 date string (defaults to current date/time)
- `membershipPriceAtPurchase` (number): Defaults to plan's current price
- `notes` (string): Max 5000 characters

**Validation Rules:**
- `phone`: Must match pattern `^\+?[1-9]\d{1,14}$` (E.164 format)
- `phone`: Must be unique within tenant (409 Conflict if duplicate)
- `membershipPlanId`: Plan must exist, belong to tenant, and be ACTIVE
- `branchId`: Branch must exist and belong to tenant

**Business Rules:**
- `membershipEndDate` is automatically calculated from `membershipStartDate` + plan duration
- `status` is automatically set to `ACTIVE`
- `tenantId` is extracted from JWT token
- Phone is trimmed and checked for uniqueness

**Response:** Returns created `Member` object (201 Created) with computed fields:
- `membershipState`: ACTIVE | EXPIRED (derived from membershipEndDate)
- `isMembershipActive`: boolean
- `daysRemaining`: number | null
- `isExpiringSoon`: boolean

**Status Codes:**
- 201: Created successfully
- 400: Validation error (invalid format, missing required fields)
- 401: Unauthorized (missing/invalid JWT token)
- 404: Branch or membership plan not found
- 409: Conflict (duplicate phone number within tenant)
- 500: Internal server error

**Example Response:**

```json
{
  "id": "clzzz",
  "tenantId": "claaa",
  "branchId": "clxxx",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+905551234567",
  "email": "john.doe@example.com",
  "gender": "MALE",
  "dateOfBirth": "1990-01-15T00:00:00.000Z",
  "photoUrl": "https://example.com/photo.jpg",
  "membershipPlanId": "clyyy",
  "membershipStartDate": "2026-01-20T00:00:00.000Z",
  "membershipEndDate": "2026-02-19T00:00:00.000Z",
  "membershipPriceAtPurchase": 500.00,
  "status": "ACTIVE",
  "membershipState": "ACTIVE",
  "isMembershipActive": true,
  "daysRemaining": 30,
  "isExpiringSoon": false,
  "notes": "VIP member",
  "createdAt": "2026-01-20T10:30:00.000Z",
  "updatedAt": "2026-01-20T10:30:00.000Z",
  "pausedAt": null,
  "resumedAt": null
}
```

**Error Example (409 Conflict - Duplicate Phone):**

```json
{
  "statusCode": 409,
  "message": "Bu telefon numarası zaten kullanılıyor. Lütfen farklı bir telefon numarası giriniz.",
  "code": null,
  "errors": null,
  "timestamp": "2026-01-20T10:30:00.000Z",
  "path": "/api/v1/members"
}
```
```

---

## 6. Additional Notes

### Phone Number Format

The phone validation uses E.164 format pattern: `^\+?[1-9]\d{1,14}$`

**Valid Examples:**
- `+905551234567` (with country code)
- `905551234567` (without + prefix)
- `+1234567890` (US format)

**Invalid Examples:**
- `05551234567` (starts with 0)
- `+123` (too short)
- `abc123` (contains letters)

### Membership Plan Selection

When fetching membership plans for the dropdown:
- Use `GET /api/v1/membership-plans/active` to get only ACTIVE plans
- Filter by `scope` (TENANT or BRANCH) if needed
- Filter by `branchId` if plan scope is BRANCH

### Branch Selection

When fetching branches for the dropdown:
- Use `GET /api/v1/branches` to get all branches for the tenant
- Filter by `isActive: true` if needed (archived branches excluded by default)

### Error Handling Recommendations

1. **409 Conflict (Duplicate Phone):**
   - Show error message: "Bu telefon numarası zaten kullanılıyor. Lütfen farklı bir telefon numarası giriniz."
   - Highlight phone input field
   - Suggest checking existing members

2. **404 Not Found (Branch/Plan):**
   - Refresh branch/plan lists
   - Show error: "Seçilen şube veya plan bulunamadı"

3. **400 Validation Error:**
   - Display field-level errors from `errors` array
   - Highlight invalid fields
   - Show validation messages in Turkish

---

## 7. Summary Checklist for Mobile Team

### Required Form Fields (5)
- [ ] branchId (dropdown)
- [ ] firstName (text input)
- [ ] lastName (text input)
- [ ] phone (text input, E.164 format)
- [ ] membershipPlanId (dropdown)

### Optional Form Fields (7)
- [ ] gender (radio/dropdown)
- [ ] dateOfBirth (date picker)
- [ ] email (email input)
- [ ] photoUrl (URL input or image upload)
- [ ] membershipStartDate (date picker, defaults to today)
- [ ] membershipPriceAtPurchase (number input, optional)
- [ ] notes (textarea)

### Server-Generated Fields (DO NOT SEND)
- [ ] id
- [ ] tenantId
- [ ] membershipEndDate
- [ ] status
- [ ] createdAt
- [ ] updatedAt
- [ ] pausedAt
- [ ] resumedAt

### Pre-Fetch Data
- [ ] Branches: `GET /api/v1/branches`
- [ ] Active Plans: `GET /api/v1/membership-plans/active`

### Error Handling
- [ ] Handle 409 Conflict (duplicate phone)
- [ ] Handle 400 Validation errors (field-level)
- [ ] Handle 404 Not Found (branch/plan)
- [ ] Display Turkish error messages

---

**Document End**
