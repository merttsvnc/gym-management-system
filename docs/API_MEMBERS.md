# Members API Reference (Mobile)

## Purpose

This document is the definitive API reference for the Members module of the Gym Management SaaS backend. **Swagger is not available** for this project—this document serves as the source of truth for mobile and frontend developers.

## Base URL & Authentication

### Base URL

```
{API_BASE_URL}/api/v1/members
```

### Authentication

All endpoints require authentication via JWT Bearer token:

```
Authorization: Bearer <your-jwt-token>
```

### Tenant Isolation

The `tenantId` is automatically derived from the JWT token context. **Do not send `tenantId` in request bodies or query parameters.** All operations are scoped to the authenticated user's tenant.

---

## Endpoints

### 1. Create Member

**POST** `/api/v1/members`

Creates a new member for the authenticated tenant.

#### Request Headers

```
Authorization: Bearer <token>
Content-Type: application/json
```

#### Request Body

| Field                       | Type   | Required | Validation                 | Description                                       |
| --------------------------- | ------ | -------- | -------------------------- | ------------------------------------------------- |
| `branchId`                  | string | Yes      | Valid branch ID            | Branch where member will be registered            |
| `firstName`                 | string | Yes      | 1-50 chars                 | Member's first name                               |
| `lastName`                  | string | Yes      | 1-50 chars                 | Member's last name                                |
| `phone`                     | string | Yes      | E.164 format, 10-20 chars  | Member's phone number (must be unique per tenant) |
| `membershipPlanId`          | string | Yes      | Valid plan ID              | Selected membership plan                          |
| `gender`                    | enum   | No       | `MALE`, `FEMALE`           | Member's gender                                   |
| `dateOfBirth`               | string | No       | ISO 8601 date              | Member's birth date                               |
| `email`                     | string | No       | Valid email                | Member's email address                            |
| `photoUrl`                  | string | No       | Valid URL                  | URL to member's photo                             |
| `membershipStartDate`       | string | No       | ISO 8601 date              | Start date (defaults to today)                    |
| `membershipPriceAtPurchase` | number | No       | Decimal                    | Price paid (defaults to plan price)               |
| `notes`                     | string | No       | Max 5000 chars             | Additional notes                                  |
| `address`                   | string | No       | Max 500 chars              | Member's address                                  |
| `district`                  | string | No       | Max 100 chars              | District/neighborhood                             |
| `nationalId`                | string | No       | Max 20 chars               | National ID / TC number                           |
| `maritalStatus`             | enum   | No       | See enum values            | Marital status                                    |
| `occupation`                | string | No       | Max 100 chars              | Member's occupation                               |
| `industry`                  | string | No       | Max 100 chars              | Industry/sector                                   |
| `bloodType`                 | enum   | No       | See enum values            | Blood type                                        |
| `emergencyContactName`      | string | No       | Max 100 chars              | Emergency contact person name                     |
| `emergencyContactPhone`     | string | No       | E.164 format, max 20 chars | Emergency contact phone                           |

#### Enum Values

**`maritalStatus`:**

- `SINGLE`
- `MARRIED`
- `DIVORCED`
- `WIDOWED`
- `OTHER`

**`bloodType`:**

- `A_POS` (A+)
- `A_NEG` (A-)
- `B_POS` (B+)
- `B_NEG` (B-)
- `AB_POS` (AB+)
- `AB_NEG` (AB-)
- `O_POS` (O+)
- `O_NEG` (O-)
- `UNKNOWN`

#### Phone Format

Phone numbers must match E.164 format: `/^\+?[1-9]\d{1,14}$/`

Examples:

- `+905551234567` (Turkey)
- `+14155552671` (USA)
- `+441234567890` (UK)

#### Example Request

```json
{
  "branchId": "clxy123456789",
  "firstName": "Ahmet",
  "lastName": "Yılmaz",
  "phone": "+905551234567",
  "membershipPlanId": "clxy987654321",
  "gender": "MALE",
  "dateOfBirth": "1995-03-15",
  "email": "ahmet.yilmaz@example.com",
  "address": "Atatürk Cad. No:123 Daire:4",
  "district": "Kadıköy",
  "nationalId": "12345678901",
  "maritalStatus": "SINGLE",
  "occupation": "Yazılım Geliştirici",
  "industry": "Teknoloji",
  "bloodType": "A_POS",
  "emergencyContactName": "Ayşe Yılmaz",
  "emergencyContactPhone": "+905559876543",
  "notes": "Kalp rahatsızlığı var, yoğun egzersiz yapmamalı"
}
```

#### Success Response (201 Created)

```json
{
  "id": "clxy456789012",
  "tenantId": "clxy111222333",
  "branchId": "clxy123456789",
  "firstName": "Ahmet",
  "lastName": "Yılmaz",
  "phone": "+905551234567",
  "gender": "MALE",
  "dateOfBirth": "1995-03-15T00:00:00.000Z",
  "email": "ahmet.yilmaz@example.com",
  "photoUrl": null,
  "address": "Atatürk Cad. No:123 Daire:4",
  "district": "Kadıköy",
  "nationalId": "12345678901",
  "maritalStatus": "SINGLE",
  "occupation": "Yazılım Geliştirici",
  "industry": "Teknoloji",
  "bloodType": "A_POS",
  "emergencyContactName": "Ayşe Yılmaz",
  "emergencyContactPhone": "+905559876543",
  "membershipPlanId": "clxy987654321",
  "membershipStartDate": "2026-01-29T00:00:00.000Z",
  "membershipEndDate": "2026-02-28T00:00:00.000Z",
  "membershipPriceAtPurchase": "150.00",
  "status": "ACTIVE",
  "pausedAt": null,
  "resumedAt": null,
  "notes": "Kalp rahatsızlığı var, yoğun egzersiz yapmamalı",
  "createdAt": "2026-01-29T10:30:00.000Z",
  "updatedAt": "2026-01-29T10:30:00.000Z",
  "remainingDays": 30,
  "isMembershipActive": true,
  "membershipState": "ACTIVE",
  "daysRemaining": 30,
  "isExpiringSoon": false
}
```

#### Error Responses

**400 Bad Request** - Validation errors

```json
{
  "statusCode": 400,
  "message": [
    "Ad en az 1 karakter olmalıdır",
    "Telefon numarası gereklidir",
    "Geçerli bir telefon numarası formatı giriniz (uluslararası format desteklenir)"
  ],
  "error": "Bad Request"
}
```

**401 Unauthorized** - Missing or invalid token

```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

**404 Not Found** - Branch or plan not found

```json
{
  "statusCode": 404,
  "message": "Şube bulunamadı",
  "error": "Not Found"
}
```

**409 Conflict** - Phone number already exists

```json
{
  "statusCode": 409,
  "message": "Bu telefon numarası zaten kullanılıyor. Lütfen farklı bir telefon numarası giriniz.",
  "error": "Conflict"
}
```

---

### 2. List Members

**GET** `/api/v1/members`

Retrieves a paginated list of members with optional filters and search.

#### Request Headers

```
Authorization: Bearer <token>
```

#### Query Parameters

| Parameter         | Type    | Default | Validation                                 | Description                                             |
| ----------------- | ------- | ------- | ------------------------------------------ | ------------------------------------------------------- |
| `page`            | number  | 1       | Min: 1                                     | Page number for pagination                              |
| `limit`           | number  | 20      | Min: 1, Max: 100                           | Results per page                                        |
| `branchId`        | string  | -       | Valid branch ID                            | Filter by branch                                        |
| `status`          | enum    | -       | `ACTIVE`, `PAUSED`, `INACTIVE`, `ARCHIVED` | Filter by member status                                 |
| `search`          | string  | -       | -                                          | Search in firstName, lastName, phone (case-insensitive) |
| `includeArchived` | boolean | false   | -                                          | Include archived members in results                     |

#### Example Request

```
GET /api/v1/members?page=1&limit=20&branchId=clxy123456789&status=ACTIVE&search=ahmet
```

#### Success Response (200 OK)

```json
{
  "data": [
    {
      "id": "clxy456789012",
      "tenantId": "clxy111222333",
      "branchId": "clxy123456789",
      "firstName": "Ahmet",
      "lastName": "Yılmaz",
      "phone": "+905551234567",
      "gender": "MALE",
      "dateOfBirth": "1995-03-15T00:00:00.000Z",
      "email": "ahmet.yilmaz@example.com",
      "photoUrl": null,
      "address": "Atatürk Cad. No:123 Daire:4",
      "district": "Kadıköy",
      "nationalId": "12345678901",
      "maritalStatus": "SINGLE",
      "occupation": "Yazılım Geliştirici",
      "industry": "Teknoloji",
      "bloodType": "A_POS",
      "emergencyContactName": "Ayşe Yılmaz",
      "emergencyContactPhone": "+905559876543",
      "membershipPlanId": "clxy987654321",
      "membershipStartDate": "2026-01-29T00:00:00.000Z",
      "membershipEndDate": "2026-02-28T00:00:00.000Z",
      "membershipPriceAtPurchase": "150.00",
      "status": "ACTIVE",
      "pausedAt": null,
      "resumedAt": null,
      "notes": null,
      "createdAt": "2026-01-29T10:30:00.000Z",
      "updatedAt": "2026-01-29T10:30:00.000Z",
      "remainingDays": 30,
      "isMembershipActive": true,
      "membershipState": "ACTIVE",
      "daysRemaining": 30,
      "isExpiringSoon": false
    }
  ],
  "pagination": {
    "total": 145,
    "page": 1,
    "limit": 20,
    "totalPages": 8
  }
}
```

---

### 3. Get Member Details

**GET** `/api/v1/members/:id`

Retrieves a single member's details by ID.

#### Request Headers

```
Authorization: Bearer <token>
```

#### Query Parameters

| Parameter     | Type    | Default | Description                                                |
| ------------- | ------- | ------- | ---------------------------------------------------------- |
| `includePlan` | boolean | false   | If `true`, includes full membershipPlan object in response |

#### Example Request

```
GET /api/v1/members/clxy456789012?includePlan=true
```

#### Success Response (200 OK)

```json
{
  "id": "clxy456789012",
  "tenantId": "clxy111222333",
  "branchId": "clxy123456789",
  "firstName": "Ahmet",
  "lastName": "Yılmaz",
  "phone": "+905551234567",
  "gender": "MALE",
  "dateOfBirth": "1995-03-15T00:00:00.000Z",
  "email": "ahmet.yilmaz@example.com",
  "photoUrl": null,
  "address": "Atatürk Cad. No:123 Daire:4",
  "district": "Kadıköy",
  "nationalId": "12345678901",
  "maritalStatus": "SINGLE",
  "occupation": "Yazılım Geliştirici",
  "industry": "Teknoloji",
  "bloodType": "A_POS",
  "emergencyContactName": "Ayşe Yılmaz",
  "emergencyContactPhone": "+905559876543",
  "membershipPlanId": "clxy987654321",
  "membershipStartDate": "2026-01-29T00:00:00.000Z",
  "membershipEndDate": "2026-02-28T00:00:00.000Z",
  "membershipPriceAtPurchase": "150.00",
  "status": "ACTIVE",
  "pausedAt": null,
  "resumedAt": null,
  "notes": "Kalp rahatsızlığı var",
  "createdAt": "2026-01-29T10:30:00.000Z",
  "updatedAt": "2026-01-29T10:30:00.000Z",
  "remainingDays": 30,
  "isMembershipActive": true,
  "membershipState": "ACTIVE",
  "daysRemaining": 30,
  "isExpiringSoon": false,
  "membershipPlan": {
    "id": "clxy987654321",
    "name": "1 Aylık Üyelik",
    "durationType": "MONTHS",
    "durationValue": 1,
    "price": "150.00",
    "currency": "TRY",
    "status": "ACTIVE"
  }
}
```

#### Error Responses

**404 Not Found** - Member doesn't exist or doesn't belong to tenant

```json
{
  "statusCode": 404,
  "message": "Üye bulunamadı",
  "error": "Not Found"
}
```

---

### 4. Update Member

**PATCH** `/api/v1/members/:id`

Updates an existing member. All fields are optional—only send fields that need to be updated.

#### Request Headers

```
Authorization: Bearer <token>
Content-Type: application/json
```

#### Request Body

All fields from Create Member are available as optional fields for update. See **Field Reference** below for complete list.

#### Example Request

```json
{
  "address": "Yeni Mahalle Sok. No:45",
  "district": "Beşiktaş",
  "maritalStatus": "MARRIED",
  "emergencyContactPhone": "+905551112233",
  "notes": "Adres güncellendi"
}
```

#### Success Response (200 OK)

Returns the updated member object (same structure as Get Member Details).

#### Error Responses

Same as Create Member, plus:

**404 Not Found** - Member doesn't exist or doesn't belong to tenant

```json
{
  "statusCode": 404,
  "message": "Üye bulunamadı",
  "error": "Not Found"
}
```

---

### 5. Change Member Status

**POST** `/api/v1/members/:id/status`

Changes a member's status with transition validation.

#### Request Headers

```
Authorization: Bearer <token>
Content-Type: application/json
```

#### Request Body

| Field    | Type | Required | Validation                                 | Description |
| -------- | ---- | -------- | ------------------------------------------ | ----------- |
| `status` | enum | Yes      | `ACTIVE`, `PAUSED`, `INACTIVE`, `ARCHIVED` | New status  |

#### Status Transition Rules

- Cannot transition **from** `ARCHIVED` (terminal status)
- Cannot set status to `ARCHIVED` via this endpoint (use Archive endpoint instead)
- Valid transitions:
  - `ACTIVE` → `PAUSED`, `INACTIVE`
  - `PAUSED` → `ACTIVE`, `INACTIVE`
  - `INACTIVE` → `ACTIVE`, `PAUSED`

#### Example Request

```json
{
  "status": "PAUSED"
}
```

#### Success Response (200 OK)

Returns the updated member object.

#### Error Responses

**400 Bad Request** - Invalid status transition

```json
{
  "statusCode": 400,
  "message": "Arşivlenmiş üyeler için durum değiştirilemez",
  "error": "Bad Request"
}
```

---

### 6. Archive Member

**POST** `/api/v1/members/:id/archive`

Archives a member (sets status to `ARCHIVED`). This is a terminal action—archived members cannot be reactivated.

#### Request Headers

```
Authorization: Bearer <token>
```

#### Success Response (200 OK)

Returns the archived member object with `status: "ARCHIVED"`.

#### Error Responses

**404 Not Found** - Member doesn't exist or doesn't belong to tenant

---

## Field Reference

### Complete Member Field Table

| Field                       | Type               | Required on Create | System-Managed | Max Length | Validation                                 | Notes                        |
| --------------------------- | ------------------ | ------------------ | -------------- | ---------- | ------------------------------------------ | ---------------------------- |
| `id`                        | string (cuid)      | -                  | ✅ Yes         | -          | -                                          | Auto-generated               |
| `tenantId`                  | string             | -                  | ✅ Yes         | -          | -                                          | From JWT context             |
| `branchId`                  | string             | ✅ Yes             | No             | -          | Must exist                                 | Valid branch in tenant       |
| `firstName`                 | string             | ✅ Yes             | No             | 50         | Min 1 char                                 | Trimmed                      |
| `lastName`                  | string             | ✅ Yes             | No             | 50         | Min 1 char                                 | Trimmed                      |
| `phone`                     | string             | ✅ Yes             | No             | 20         | E.164 regex                                | Unique per tenant, trimmed   |
| `gender`                    | enum               | No                 | No             | -          | `MALE`, `FEMALE`                           | Optional                     |
| `dateOfBirth`               | ISO 8601 date      | No                 | No             | -          | Valid date                                 | Optional                     |
| `email`                     | string             | No                 | No             | -          | Valid email                                | Optional, trimmed            |
| `photoUrl`                  | string             | No                 | No             | -          | Valid URL                                  | Optional                     |
| `address`                   | string             | No                 | No             | 500        | -                                          | Optional, trimmed            |
| `district`                  | string             | No                 | No             | 100        | -                                          | Optional, trimmed            |
| `nationalId`                | string             | No                 | No             | 20         | -                                          | Optional, trimmed            |
| `maritalStatus`             | enum               | No                 | No             | -          | See enum values                            | Optional                     |
| `occupation`                | string             | No                 | No             | 100        | -                                          | Optional, trimmed            |
| `industry`                  | string             | No                 | No             | 100        | -                                          | Optional, trimmed            |
| `bloodType`                 | enum               | No                 | No             | -          | See enum values                            | Optional                     |
| `emergencyContactName`      | string             | No                 | No             | 100        | -                                          | Optional, trimmed            |
| `emergencyContactPhone`     | string             | No                 | No             | 20         | E.164 regex                                | Optional, trimmed            |
| `membershipPlanId`          | string             | ✅ Yes             | No             | -          | Must exist                                 | Valid active plan            |
| `membershipStartDate`       | ISO 8601 date      | No                 | Partial        | -          | Valid date                                 | Defaults to today            |
| `membershipEndDate`         | ISO 8601 date      | No                 | ✅ Yes         | -          | Valid date                                 | Auto-calculated from plan    |
| `membershipPriceAtPurchase` | decimal            | No                 | Partial        | -          | Positive number                            | Defaults to plan price       |
| `status`                    | enum               | No                 | Partial        | -          | `ACTIVE`, `PAUSED`, `INACTIVE`, `ARCHIVED` | Defaults to `ACTIVE`         |
| `pausedAt`                  | ISO 8601 timestamp | No                 | ✅ Yes         | -          | -                                          | Set when status → `PAUSED`   |
| `resumedAt`                 | ISO 8601 timestamp | No                 | ✅ Yes         | -          | -                                          | Set when `PAUSED` → `ACTIVE` |
| `notes`                     | string             | No                 | No             | 5000       | -                                          | Optional, trimmed            |
| `createdAt`                 | ISO 8601 timestamp | -                  | ✅ Yes         | -          | -                                          | Auto-generated               |
| `updatedAt`                 | ISO 8601 timestamp | -                  | ✅ Yes         | -          | -                                          | Auto-updated                 |
| `remainingDays`             | number             | -                  | ✅ Computed    | -          | -                                          | Legacy field (computed)      |
| `isMembershipActive`        | boolean            | -                  | ✅ Computed    | -          | -                                          | Derived from endDate         |
| `membershipState`           | enum               | -                  | ✅ Computed    | -          | `ACTIVE`, `EXPIRED`                        | Derived field                |
| `daysRemaining`             | number/null        | -                  | ✅ Computed    | -          | -                                          | Null if expired              |
| `isExpiringSoon`            | boolean            | -                  | ✅ Computed    | -          | -                                          | True if < 7 days remaining   |

### Enum Reference

#### MemberStatus

- `ACTIVE` - Active member
- `PAUSED` - Membership temporarily paused
- `INACTIVE` - Inactive member
- `ARCHIVED` - Archived (terminal status)

#### MemberGender

- `MALE`
- `FEMALE`

#### MaritalStatus

- `SINGLE`
- `MARRIED`
- `DIVORCED`
- `WIDOWED`
- `OTHER`

#### BloodType

- `A_POS` (A+)
- `A_NEG` (A-)
- `B_POS` (B+)
- `B_NEG` (B-)
- `AB_POS` (AB+)
- `AB_NEG` (AB-)
- `O_POS` (O+)
- `O_NEG` (O-)
- `UNKNOWN`

---

## Notes for Mobile Developers

### Minimal Payload for Fast Member Creation

For quick registration, only these fields are required:

```json
{
  "branchId": "clxy123456789",
  "firstName": "Ahmet",
  "lastName": "Yılmaz",
  "phone": "+905551234567",
  "membershipPlanId": "clxy987654321"
}
```

Extended profile fields can be added later via the Update endpoint.

### Handling Optional Fields

- All extended profile fields are optional
- Send `null` or omit fields you don't want to set
- Empty strings are converted to `null` on the backend
- To clear a field on update, send `null` or empty string

### Phone Uniqueness

- Phone numbers must be unique **per tenant**
- The same phone can exist in different tenants
- On conflict (409), display user-friendly message:
  ```
  "Bu telefon numarası zaten kullanılıyor. Lütfen farklı bir telefon numarası giriniz."
  ```
- Suggest user to search for existing member or use a different phone number

### Field Trimming

All string fields are automatically trimmed on the backend. Leading/trailing whitespace is removed.

### Computed Fields

Fields like `remainingDays`, `isMembershipActive`, `membershipState`, `daysRemaining`, and `isExpiringSoon` are computed by the backend. Do not send these in create/update requests.

### Membership Date Calculation

- `membershipEndDate` is automatically calculated based on the selected plan's duration
- You can optionally provide `membershipStartDate` (defaults to today)
- On create, `membershipEndDate` = `membershipStartDate` + plan duration

### Status Management

- New members are created with `status: "ACTIVE"` by default
- Use the Change Status endpoint for status transitions
- To archive, use the dedicated Archive endpoint
- Archived members cannot be reactivated

### Validation Error Handling

Validation errors return a 400 status with an array of error messages. Display these to the user:

```json
{
  "statusCode": 400,
  "message": [
    "Ad en az 1 karakter olmalıdır",
    "Geçerli bir telefon numarası formatı giriniz"
  ],
  "error": "Bad Request"
}
```

### Pagination Best Practices

- Default page size is 20
- Maximum page size is 100
- Use `includeArchived=false` (default) to hide archived members
- Combine `search` with `branchId` and `status` filters for precise results

---

## Version

**API Version:** v1  
**Last Updated:** January 29, 2026  
**Changelog:**

- Added extended member profile fields: address, district, nationalId, maritalStatus, occupation, industry, bloodType, emergencyContactName, emergencyContactPhone
- Added MaritalStatus and BloodType enums
